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
    id: acc.id || 'A-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
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
  const isNew = !voucher.id;

  if (isNew) {
    voucher.id = 'V-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    voucher.user_id = currentUser.id;
    voucher.created_at = new Date().toISOString();

    const { error } = await supabaseClient.from('vouchers').insert([voucher]);
    if (error) throw new Error(error.message);
  } else {
    voucher.updated_at = new Date().toISOString();
    const { error } = await supabaseClient
      .from('vouchers')
      .update(voucher)
      .eq('id', voucher.id)
      .eq('user_id', currentUser.id);
    if (error) throw new Error(error.message);
  }

  // Save entries
  if (voucher.entries && voucher.entries.length > 0) {
    const entries = (voucher.entries || []).map(e => ({
      voucher_id: voucher.id,
      user_id: currentUser.id,
      account_id: e.accountId || e.account_id || '',
      narration: e.narration || '',
      debit: parseFloat(e.debit) || 0,
      credit: parseFloat(e.credit) || 0
    }));

    if (isNew) {
      const { error } = await supabaseClient.from('voucher_entries').insert(entries);
      if (error) throw new Error(error.message);
    } else {
      await supabaseClient.from('voucher_entries').delete().eq('voucher_id', voucher.id);
      const { error } = await supabaseClient.from('voucher_entries').insert(entries);
      if (error) throw new Error(error.message);
    }
  }

  await addAudit(`Voucher ${isNew ? 'created' : 'updated'}: ${voucher.id}`);
  return voucher;
}

async function reverseVoucher(originalId) {
  if (!currentUser) throw new Error('Not authenticated');
  const orig = await getVoucher(originalId);
  if (!orig) throw new Error('Voucher not found');
  if (orig.reversed) throw new Error('Voucher already reversed');

  const revId = 'V-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const rev = {
    id: revId,
    user_id: currentUser.id,
    date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    is_reversal: true,
    reversal_of: originalId,
    locked: true,
    entries: (orig.entries || []).map(e => ({
      account_id: e.account_id,
      narration: ('[Reversal] ' + (e.narration || '')).trim(),
      debit: e.credit,
      credit: e.debit
    }))
  };

  const { error: vError } = await supabaseClient.from('vouchers').insert([rev]);
  if (vError) throw new Error(vError.message);

  const { error: eError } = await supabaseClient.from('voucher_entries').insert(
    rev.entries.map(e => ({ ...e, voucher_id: revId, user_id: currentUser.id }))
  );
  if (eError) throw new Error(eError.message);

  await supabaseClient
    .from('vouchers')
    .update({ reversed: true, reversed_by: revId })
    .eq('id', originalId);

  await addAudit(`Voucher ${originalId} reversed to ${revId}`);
  return rev;
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

