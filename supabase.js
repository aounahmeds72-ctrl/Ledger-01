// ═══════════════════════════════════════════════════════
// supabase.js — Supabase Integration
// ═══════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://bipgtkyyovuwdejxeunx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcGd0a3l5b3Z1d2RlanhldW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjUwOTMsImV4cCI6MjA5MDEwMTA5M30.3UjjO5-K06nsw6gybZjqr9elQarMrame_iE6de94XT4';

let supabaseClient = null;

async function initSupabase() {
  const { createClient } = window.supabase;
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

// ── Auth State ───────────────────────────────────────────
let currentUser = null;

async function onAuthChange(callback) {
  const { data } = await supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    if (typeof callback === 'function') callback(event, session);
  });
  return data;
}

async function getCurrentUser() {
  const { data } = await supabaseClient.auth.getUser();
  currentUser = data.user || null;
  return currentUser;
}

// ── Auth Methods ─────────────────────────────────────────
async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw new Error(error.message);
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

async function resetPassword(email) {
  const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}?mode=update_password`
  });
  if (error) throw new Error(error.message);
  return data;
}

async function updatePassword(newPassword) {
  const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  return data;
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw new Error(error.message);
  currentUser = null;
}

// ── Counter helper ──────────────────────────────────────
async function getNextVoucherId() {
  if (!currentUser) throw new Error('Not authenticated');
  
  // Get or initialize counter
  let { data: counter, error: fetchErr } = await supabaseClient
    .from('counters')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('counter_type', 'voucher')
    .single();
  
  if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);
  
  let nextNum = 1;
  if (counter) {
    nextNum = (counter.counter_value || 0) + 1;
    const { error: updateErr } = await supabaseClient
      .from('counters')
      .update({ counter_value: nextNum })
      .eq('user_id', currentUser.id)
      .eq('counter_type', 'voucher');
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { error: insertErr } = await supabaseClient
      .from('counters')
      .insert([{ user_id: currentUser.id, counter_type: 'voucher', counter_value: 1 }]);
    if (insertErr) throw new Error(insertErr.message);
  }
  
  return 'V-' + String(nextNum).padStart(4, '0');
}

async function getNextAccountId() {
  if (!currentUser) throw new Error('Not authenticated');

  let { data: counter, error: fetchErr } = await supabaseClient
    .from('counters')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('counter_type', 'account')
    .single();

  if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);

  let nextNum = 1;
  if (counter) {
    nextNum = (counter.counter_value || 0) + 1;
    const { error: updateErr } = await supabaseClient
      .from('counters')
      .update({ counter_value: nextNum })
      .eq('user_id', currentUser.id)
      .eq('counter_type', 'account');
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { error: insertErr } = await supabaseClient
      .from('counters')
      .insert([{ user_id: currentUser.id, counter_type: 'account', counter_value: 1 }]);
    if (insertErr) throw new Error(insertErr.message);
  }

  return 'A-' + String(nextNum).padStart(4, '0');
}

// ── Database: Accounts ───────────────────────────────────
async function getAccounts() {
  if (!currentUser) return [];
  const { data, error } = await supabaseClient
    .from('accounts')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

async function getAccount(id) {
  if (!currentUser) return null;
  const { data, error } = await supabaseClient
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', currentUser.id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function saveAccount(acc) {
  if (!currentUser) throw new Error('Not authenticated');
  const isNew = !acc.id;

  const payload = {
    id: acc.id || await getNextAccountId(),
    user_id: currentUser.id,
    name: acc.name,
    opening_balance: parseFloat(acc.openingBalance) || 0,
    created_at: acc.created_at || new Date().toISOString(),
    updated_at: acc.updated_at || null
  };

  if (isNew) {
    const { error } = await supabaseClient.from('accounts').insert([payload]);
    if (error) throw new Error(error.message);
  } else {
    payload.updated_at = new Date().toISOString();
    const { error } = await supabaseClient
      .from('accounts')
      .update(payload)
      .eq('id', acc.id)
      .eq('user_id', currentUser.id);
    if (error) throw new Error(error.message);
  }

  await addAudit(isNew ? `Account created: ${acc.name} (${acc.id})` : `Account updated: ${acc.name}`);
  return acc;
}

async function deleteAccount(id) {
  if (!currentUser) throw new Error('Not authenticated');
  const vouchers = await getVouchers();
  const inUse = vouchers.some(v => (v.entries||[]).some(e => e.account_id === id));
  if (inUse) throw new Error('Account is used in transactions and cannot be deleted.');

  const { error } = await supabaseClient
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);
  if (error) throw new Error(error.message);
  await addAudit(`Account deleted: ${id}`);
}

// ── Database: Vouchers ───────────────────────────────────
async function getVouchers() {
  if (!currentUser) return [];
  const { data, error } = await supabaseClient
    .from('vouchers')
    .select('*, entries:voucher_entries(*)')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(v => ({
    ...v,
    entries: v.entries || []
  }));
}

async function getVoucher(id) {
  if (!currentUser) return null;
  const { data, error } = await supabaseClient
    .from('vouchers')
    .select('*, entries:voucher_entries(*)')
    .eq('id', id)
    .eq('user_id', currentUser.id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

async function saveVoucher(voucher) {
  if (!currentUser) throw new Error('Not authenticated');
  const forceNew = voucher._forceNew === true;
  let isNew = forceNew || !voucher.id;

  const payload = {
    id: voucher.id || null,
    user_id: currentUser.id,
    date: voucher.date,
    created_at: voucher.created_at || new Date().toISOString(),
    updated_at: voucher.updated_at || null,
    locked: voucher.locked !== undefined ? voucher.locked : true
  };

  if (!isNew && voucher.id) {
    const existing = await getVoucher(voucher.id);
    if (!existing) {
      isNew = true;
    }
  }

  let prevLocked = true;

  if (isNew) {
    payload.id = payload.id || await getNextVoucherId();
    if (!payload.id) throw new Error('Voucher id is required');

    const exists = await getVoucher(payload.id);
    if (exists) throw new Error(`Voucher ID ${payload.id} already exists`);

    const { error } = await supabaseClient.from('vouchers').insert([payload]);
    if (error) throw new Error(error.message);
    voucher.id = payload.id;
  } else {
    const existing = await getVoucher(voucher.id);
    if (!existing) throw new Error('Voucher not found for update');
    prevLocked = existing.locked !== undefined ? existing.locked : true;

    // temporarily unlock to safely replace entries without trigger conflict
    const { error: unlockErr } = await supabaseClient
      .from('vouchers')
      .update({ locked: false, updated_at: new Date().toISOString() })
      .eq('id', voucher.id)
      .eq('user_id', currentUser.id);
    if (unlockErr) throw new Error(unlockErr.message);

    const { error: updateErr } = await supabaseClient
      .from('vouchers')
      .update({ date: voucher.date, updated_at: new Date().toISOString() })
      .eq('id', voucher.id)
      .eq('user_id', currentUser.id);
    if (updateErr) throw new Error(updateErr.message);
  }

  // Balance check in application layer
  const entries = (voucher.entries || []).map(e => ({
    account_id: e.accountId || e.account_id || '',
    narration: e.narration || '',
    debit: parseFloat(e.debit) || 0,
    credit: parseFloat(e.credit) || 0
  }));

  const totalDr = entries.reduce((s, e) => s + e.debit, 0);
  const totalCr = entries.reduce((s, e) => s + e.credit, 0);
  if (Math.abs(totalDr - totalCr) > 0.001) throw new Error('Voucher is not balanced (debit must equal credit)');

  if (entries.length > 0) {
    if (!isNew) {
      const { error: delErr } = await supabaseClient.from('voucher_entries').delete().eq('voucher_id', voucher.id);
      if (delErr) throw new Error(delErr.message);
    }

    const { error: insertErr } = await supabaseClient.from('voucher_entries').insert(
      entries.map(e => ({ ...e, voucher_id: voucher.id, user_id: currentUser.id }))
    );
    if (insertErr) throw new Error(insertErr.message);
  } else if (!isNew) {
    const { error: delErr } = await supabaseClient.from('voucher_entries').delete().eq('voucher_id', voucher.id);
    if (delErr) throw new Error(delErr.message);
  }

  if (!isNew) {
    const { error: lockErr } = await supabaseClient
      .from('vouchers')
      .update({ locked: prevLocked, updated_at: new Date().toISOString() })
      .eq('id', voucher.id)
      .eq('user_id', currentUser.id);
    if (lockErr) throw new Error(lockErr.message);
  }

  await addAudit(`Voucher ${isNew ? 'created' : 'updated'}: ${voucher.id}`);
  return voucher;
}

async function reverseVoucher(originalId) {
  throw new Error('Voucher reversal is disabled in this build');
}


// ── Compute Balance ──────────────────────────────────────
async function computeBalance(accountId, vouchers = null) {
  if (!currentUser) return 0;
  const acc = await getAccount(accountId);
  if (!acc) return 0;
  if (!vouchers) vouchers = await getVouchers();

  let bal = acc.opening_balance || 0;
  for (const v of vouchers) {
    for (const e of (v.entries || [])) {
      if (e.account_id !== accountId) continue;
      bal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
    }
  }
  return bal;
}

// ── Ledger Report ────────────────────────────────────────
async function getAccountLedger(accountId, fromDate, toDate) {
  if (!currentUser) return null;
  const acc = await getAccount(accountId);
  if (!acc) return null;

  const vouchers = (await getVouchers()).sort((a, b) => a.date.localeCompare(b.date));
  const openingBal = acc.opening_balance || 0;

  let runBal = openingBal;
  for (const v of vouchers) {
    if (fromDate && v.date < fromDate) {
      for (const e of (v.entries || [])) {
        if (e.account_id !== accountId) continue;
        runBal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
      }
    }
  }

  const openingForRange = runBal;
  const rows = [];

  for (const v of vouchers) {
    const inRange = (!fromDate || v.date >= fromDate) && (!toDate || v.date <= toDate);
    if (!inRange) continue;
    const entries = (v.entries || []).filter(e => e.account_id === accountId);
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
    account: acc,
    openingBalance: openingForRange,
    rows,
    closingBalance: runBal,
    totalDebit: rows.reduce((s, r) => s + (r.debit || 0), 0),
    totalCredit: rows.reduce((s, r) => s + (r.credit || 0), 0)
  };
}

// ── Audit Log ────────────────────────────────────────────
async function addAudit(message) {
  if (!currentUser) return;
  const { error } = await supabaseClient.from('audit_logs').insert([{
    user_id: currentUser.id,
    message,
    created_at: new Date().toISOString()
  }]);
  if (error) console.error('Audit log error:', error);
}

async function getAuditLog() {
  if (!currentUser) return [];
  const { data, error } = await supabaseClient
    .from('audit_logs')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

