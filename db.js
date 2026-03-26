// db.js – Supabase Data Operations

let supabase = null;
let currentUserId = null;

// Helper to get supabase instance
function getSupabase() {
  if (!supabase) supabase = window.supabaseClient();
  return supabase;
}

// Set current user after login
function setCurrentUser(userId) {
  currentUserId = userId;
}

// ── ACCOUNTS ─────────────────────────────────────────────
async function getAccounts() {
  const { data, error } = await getSupabase()
    .from('accounts')
    .select('*')
    .eq('user_id', currentUserId)
    .order('name');
  if (error) throw error;
  return data;
}

async function getAccount(id) {
  const { data, error } = await getSupabase()
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', currentUserId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function saveAccount(acc) {
  const isNew = !acc.id;
  if (isNew) {
    // Get next sequential ID from server
    const { data, error } = await getSupabase()
      .rpc('get_next_account_id', { p_user_id: currentUserId });
    if (error) throw error;
    acc.id = data;
    acc.user_id = currentUserId;
    acc.created_at = new Date().toISOString();
    const { error: insertError } = await getSupabase()
      .from('accounts')
      .insert(acc);
    if (insertError) throw insertError;
    await addAudit(`Account created: ${acc.name} (${acc.id})`);
    return acc;
  } else {
    // Update existing
    acc.updated_at = new Date().toISOString();
    const { error } = await getSupabase()
      .from('accounts')
      .update(acc)
      .eq('id', acc.id)
      .eq('user_id', currentUserId);
    if (error) throw error;
    await addAudit(`Account updated: ${acc.name} (${acc.id})`);
    return acc;
  }
}

async function deleteAccount(id) {
  // Check if account is used in any voucher
  const vouchers = await getVouchers();
  const inUse = vouchers.some(v => v.entries.some(e => e.accountId === id));
  if (inUse) throw new Error('Account is used in transactions and cannot be deleted.');

  const { error } = await getSupabase()
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUserId);
  if (error) throw error;
  await addAudit(`Account deleted: ${id}`);
}

// ── BALANCE COMPUTATION ──────────────────────────────────
async function computeBalance(accountId, vouchers = null) {
  const acc = await getAccount(accountId);
  if (!acc) return 0;
  if (!vouchers) vouchers = await getVouchers();
  let bal = parseFloat(acc.opening_balance) || 0;
  for (const v of vouchers) {
    for (const e of v.entries) {
      if (e.accountId !== accountId) continue;
      bal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
    }
  }
  return bal;
}

// ── VOUCHERS ─────────────────────────────────────────────
async function getVouchers() {
  const { data, error } = await getSupabase()
    .from('vouchers')
    .select('*')
    .eq('user_id', currentUserId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

async function getVoucher(id) {
  const { data, error } = await getSupabase()
    .from('vouchers')
    .select('*')
    .eq('id', id)
    .eq('user_id', currentUserId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function saveVoucher(voucher) {
  const forceNew = voucher._forceNew === true;
  delete voucher._forceNew;
  const isNew = forceNew || !voucher.id;

  if (isNew) {
    if (voucher.id) {
      // Custom ID provided – check uniqueness
      const existing = await getVoucher(voucher.id);
      if (existing) throw new Error(`Voucher ID "${voucher.id}" already exists.`);
    } else {
      // Auto‑generate
      const { data, error } = await getSupabase()
        .rpc('get_next_voucher_id', { p_user_id: currentUserId });
      if (error) throw error;
      voucher.id = data;
    }
    voucher.user_id = currentUserId;
    voucher.created_at = new Date().toISOString();
  } else {
    voucher.updated_at = new Date().toISOString();
  }

  // Validate balance
  const dr = voucher.entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const cr = voucher.entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  if (Math.abs(dr - cr) > 0.001) throw new Error('Voucher is not balanced (Debit ≠ Credit).');

  // Insert or update
  if (isNew) {
    const { error } = await getSupabase()
      .from('vouchers')
      .insert(voucher);
    if (error) throw error;
  } else {
    const { error } = await getSupabase()
      .from('vouchers')
      .update(voucher)
      .eq('id', voucher.id)
      .eq('user_id', currentUserId);
    if (error) throw error;
  }

  await addAudit(`Voucher ${isNew ? 'created' : 'updated'}: ${voucher.id}`);
  return voucher;
}

async function reverseVoucher(originalId) {
  const orig = await getVoucher(originalId);
  if (!orig) throw new Error('Voucher not found.');
  if (orig.reversed) throw new Error('This voucher has already been reversed.');

  // Create reversal voucher
  const { data: revIdData, error: idError } = await getSupabase()
    .rpc('get_next_voucher_id', { p_user_id: currentUserId });
  if (idError) throw idError;
  const revId = revIdData;
  const rev = {
    id: revId,
    user_id: currentUserId,
    date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    is_reversal: true,
    reversal_of: originalId,
    locked: true,
    entries: orig.entries.map(e => ({
      accountId: e.accountId,
      narration: ('[Reversal] ' + (e.narration || '')).trim(),
      debit: e.credit,
      credit: e.debit
    }))
  };
  await saveVoucher(rev);

  // Mark original as reversed
  orig.reversed = true;
  orig.reversed_by = rev.id;
  await saveVoucher(orig);

  await addAudit(`Voucher ${originalId} reversed to ${rev.id}`);
  return rev;
}

// ── LEDGER REPORT ────────────────────────────────────────
async function getAccountLedger(accountId, fromDate, toDate) {
  const acc = await getAccount(accountId);
  if (!acc) return null;

  const vouchers = (await getVouchers()).sort((a, b) => a.date.localeCompare(b.date));
  const openingBal = parseFloat(acc.opening_balance) || 0;

  let runBal = openingBal;
  // Compute balance before fromDate
  for (const v of vouchers) {
    if (fromDate && v.date < fromDate) {
      for (const e of v.entries) {
        if (e.accountId !== accountId) continue;
        runBal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
      }
    }
  }

  const openingForRange = runBal;
  const rows = [];

  for (const v of vouchers) {
    const inRange = (!fromDate || v.date >= fromDate) && (!toDate || v.date <= toDate);
    if (!inRange) continue;
    const entries = v.entries.filter(e => e.accountId === accountId);
    for (const e of entries) {
      const dr = parseFloat(e.debit) || 0;
      const cr = parseFloat(e.credit) || 0;
      runBal += dr - cr;
      rows.push({
        date: v.date,
        voucherId: v.id,
        narration: e.narration || '',
        debit: dr || null,
        credit: cr || null,
        balance: runBal
      });
    }
  }

  return {
    account: { name: acc.name, id: acc.id },
    openingBalance: openingForRange,
    rows,
    closingBalance: runBal,
    totalDebit: rows.reduce((s, r) => s + (r.debit || 0), 0),
    totalCredit: rows.reduce((s, r) => s + (r.credit || 0), 0)
  };
}

// ── AUDIT ─────────────────────────────────────────────────
async function addAudit(message) {
  const { error } = await getSupabase()
    .from('audit')
    .insert({ user_id: currentUserId, message, created_at: new Date().toISOString() });
  if (error) console.error('Audit error:', error);
}

async function getAuditLog() {
  const { data, error } = await getSupabase()
    .from('audit')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

// ── BACKUP / RESTORE ──────────────────────────────────────
async function exportData() {
  const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);
  return { version: 2, exportedAt: new Date().toISOString(), accounts, vouchers };
}

async function importData(data, mode = 'replace') {
  if (!data || ![1,2].includes(data.version)) throw new Error('Invalid or incompatible backup file.');
  if (!Array.isArray(data.accounts) || !Array.isArray(data.vouchers))
    throw new Error('Backup file is missing required data.');

  if (mode === 'replace') {
    // Delete all existing user data
    await getSupabase().from('accounts').delete().eq('user_id', currentUserId);
    await getSupabase().from('vouchers').delete().eq('user_id', currentUserId);
    await getSupabase().from('audit').delete().eq('user_id', currentUserId);
    // Reset counters
    await getSupabase().from('user_counters').delete().eq('user_id', currentUserId);
  }

  // Insert imported accounts (preserve IDs)
  for (const a of data.accounts) {
    a.user_id = currentUserId;
    a.opening_balance = parseFloat(a.opening_balance) || 0;
    await getSupabase().from('accounts').upsert(a, { onConflict: 'id' });
  }

  // Insert imported vouchers
  for (const v of data.vouchers) {
    v.user_id = currentUserId;
    await getSupabase().from('vouchers').upsert(v, { onConflict: 'id' });
  }

  // Re‑sync counters
  const allAcc = await getAccounts();
  const allVou = await getVouchers();
  const maxA = Math.max(0, ...allAcc.map(a => parseInt((a.id || '').split('-')[1]) || 0));
  const maxV = Math.max(0, ...allVou.map(v => parseInt((v.id || '').split('-')[1]) || 0));
  await getSupabase()
    .from('user_counters')
    .upsert({ user_id: currentUserId, account_counter: maxA, voucher_counter: maxV });

  await addAudit(`Import (${mode}): ${data.accounts.length} accounts, ${data.vouchers.length} vouchers`);
}

// ── CLEAR ALL ─────────────────────────────────────────────
async function clearAllData() {
  await getSupabase().from('accounts').delete().eq('user_id', currentUserId);
  await getSupabase().from('vouchers').delete().eq('user_id', currentUserId);
  await getSupabase().from('audit').delete().eq('user_id', currentUserId);
  await getSupabase().from('user_counters').delete().eq('user_id', currentUserId);
  await addAudit('All data cleared');
}