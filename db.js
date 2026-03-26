// ═══════════════════════════════════════════════════════
// db.js — IndexedDB Layer
// Balance is always COMPUTED from vouchers, never stored.
// Opening balance is a simple number (always debit-positive).
// ═══════════════════════════════════════════════════════

const DB_NAME = 'LedgerDB';
const DB_VER  = 2;
let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('metadata'))
        d.createObjectStore('metadata', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('accounts'))
        d.createObjectStore('accounts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('vouchers'))
        d.createObjectStore('vouchers', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('audit'))
        d.createObjectStore('audit', { keyPath: 'ts' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Core helpers ────────────────────────────────────────
function _tx(stores, mode = 'readonly') {
  return db.transaction(Array.isArray(stores) ? stores : [stores], mode);
}
function _get(store, key) {
  return new Promise((res, rej) => {
    const r = _tx(store).objectStore(store).get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror   = () => rej(r.error);
  });
}
function _getAll(store) {
  return new Promise((res, rej) => {
    const r = _tx(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result ?? []);
    r.onerror   = () => rej(r.error);
  });
}
function _put(store, obj) {
  return new Promise((res, rej) => {
    const r = _tx(store, 'readwrite').objectStore(store).put(obj);
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
function _del(store, key) {
  return new Promise((res, rej) => {
    const r = _tx(store, 'readwrite').objectStore(store).delete(key);
    r.onsuccess = () => res();
    r.onerror   = () => rej(r.error);
  });
}
function _clear(store) {
  return new Promise((res, rej) => {
    const r = _tx(store, 'readwrite').objectStore(store).clear();
    r.onsuccess = () => res();
    r.onerror   = () => rej(r.error);
  });
}

// ── Metadata / Counters ──────────────────────────────────
async function getMeta(key) {
  const r = await _get('metadata', key);
  return r ? r.value : null;
}
async function setMeta(key, value) {
  await _put('metadata', { key, value });
}
async function nextAccountId() {
  let c = (await getMeta('accountCounter')) || 0;
  c++;
  await setMeta('accountCounter', c);
  return 'A-' + String(c).padStart(4, '0');
}
async function nextVoucherId() {
  let c = (await getMeta('voucherCounter')) || 0;
  c++;
  await setMeta('voucherCounter', c);
  return 'V-' + String(c).padStart(4, '0');
}

// ── ACCOUNTS ────────────────────────────────────────────
async function getAccounts()    { return _getAll('accounts'); }
async function getAccount(id)   { return _get('accounts', id); }

async function saveAccount(acc) {
  const isNew = !acc.id;
  if (isNew) {
    acc.id        = await nextAccountId();
    acc.createdAt = new Date().toISOString();
  }
  // Always clean: remove openingType, just keep openingBalance as number
  acc.openingBalance = parseFloat(acc.openingBalance) || 0;
  delete acc.openingType; // remove legacy field

  await _put('accounts', acc);
  await addAudit(isNew ? `Account created: ${acc.name} (${acc.id})` : `Account updated: ${acc.name} (${acc.id})`);
  return acc;
}

async function deleteAccount(id) {
  const vouchers = await getVouchers();
  const inUse = vouchers.some(v => (v.entries||[]).some(e => e.accountId === id));
  if (inUse) throw new Error('Account is linked to transactions and cannot be deleted.');
  await _del('accounts', id);
  await addAudit(`Account deleted: ${id}`);
}

// ── BALANCE COMPUTATION ─────────────────────────────────
// Balance = openingBalance + (all debits) - (all credits) for this account
// Opening balance is a plain positive number (treat as debit-side opening)
async function computeBalance(accountId, vouchers = null) {
  const acc = await getAccount(accountId);
  if (!acc) return 0;
  if (!vouchers) vouchers = await getVouchers();
  let bal = parseFloat(acc.openingBalance) || 0;
  for (const v of vouchers) {
    for (const e of (v.entries || [])) {
      if (e.accountId !== accountId) continue;
      bal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
    }
  }
  return bal;
}

// ── VOUCHERS ────────────────────────────────────────────
async function getVouchers()   { return _getAll('vouchers'); }
async function getVoucher(id)  { return _get('vouchers', id); }

async function saveVoucher(voucher) {
  const isNew = !voucher.id;
  if (isNew) {
    voucher.id        = await nextVoucherId();
    voucher.createdAt = new Date().toISOString();
  } else {
    voucher.updatedAt = new Date().toISOString();
  }
  // Validate balance
  const dr = voucher.entries.reduce((s, e) => s + (parseFloat(e.debit)  || 0), 0);
  const cr = voucher.entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  if (Math.abs(dr - cr) > 0.001) throw new Error('Voucher is not balanced (Debit ≠ Credit).');
  await _put('vouchers', voucher);
  await addAudit(`Voucher ${isNew ? 'created' : 'updated'}: ${voucher.id}`);
  return voucher;
}

async function deleteVoucher(id) {
  const v = await getVoucher(id);
  if (v?.locked) throw new Error('Cannot delete a locked voucher. Use Reverse instead.');
  await _del('vouchers', id);
  await addAudit(`Voucher deleted: ${id}`);
}

async function reverseVoucher(originalId) {
  const orig = await getVoucher(originalId);
  if (!orig) throw new Error('Voucher not found.');
  if (orig.reversed) throw new Error('This voucher has already been reversed.');
  const revId = await nextVoucherId();
  const rev = {
    id: revId,
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    isReversal: true,
    reversalOf: originalId,
    locked: true,
    entries: (orig.entries || []).map(e => ({
      accountId: e.accountId,
      narration: `[Reversal] ${e.narration || ''}`.trim(),
      debit:  e.credit,
      credit: e.debit
    }))
  };
  await _put('vouchers', rev);
  orig.reversed   = true;
  orig.reversedBy = revId;
  await _put('vouchers', orig);
  await addAudit(`Voucher ${originalId} reversed → ${revId}`);
  return rev;
}

// ── LEDGER REPORT ───────────────────────────────────────
async function getAccountLedger(accountId, fromDate, toDate) {
  const acc = await getAccount(accountId);
  if (!acc) return null;

  const vouchers = (await getVouchers()).sort((a, b) => a.date.localeCompare(b.date));
  const openingBal = parseFloat(acc.openingBalance) || 0;

  // Compute running balance BEFORE fromDate
  let runBal = openingBal;
  for (const v of vouchers) {
    if (fromDate && v.date < fromDate) {
      for (const e of (v.entries || [])) {
        if (e.accountId !== accountId) continue;
        runBal += (parseFloat(e.debit)||0) - (parseFloat(e.credit)||0);
      }
    }
  }

  const openingForRange = runBal;
  const rows = [];

  for (const v of vouchers) {
    const inRange = (!fromDate || v.date >= fromDate) && (!toDate || v.date <= toDate);
    if (!inRange) continue;
    const entries = (v.entries||[]).filter(e => e.accountId === accountId);
    for (const e of entries) {
      const dr = parseFloat(e.debit)  || 0;
      const cr = parseFloat(e.credit) || 0;
      runBal += dr - cr;
      rows.push({
        date: v.date, voucherId: v.id,
        narration: e.narration || '',
        debit: dr || null, credit: cr || null,
        balance: runBal
      });
    }
  }

  return {
    account: acc,
    openingBalance: openingForRange,
    rows,
    closingBalance: runBal,
    totalDebit:  rows.reduce((s, r) => s + (r.debit  || 0), 0),
    totalCredit: rows.reduce((s, r) => s + (r.credit || 0), 0)
  };
}

// ── AUDIT ────────────────────────────────────────────────
async function addAudit(message) {
  await _put('audit', { ts: new Date().toISOString() + Math.random(), message, time: new Date().toISOString() });
}
async function getAuditLog() {
  const all = await _getAll('audit');
  return all.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 120);
}

// ── BACKUP / RESTORE ────────────────────────────────────
async function exportData() {
  const [meta, accounts, vouchers] = await Promise.all([
    _getAll('metadata'), _getAll('accounts'), _getAll('vouchers')
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), metadata: meta, accounts, vouchers };
}

async function importData(data, mode = 'replace') {
  if (!data || ![1,2].includes(data.version)) throw new Error('Invalid or incompatible backup file.');
  if (!Array.isArray(data.accounts) || !Array.isArray(data.vouchers))
    throw new Error('Backup file is missing required data.');

  if (mode === 'replace') {
    await _clear('metadata');
    await _clear('accounts');
    await _clear('vouchers');
    await _clear('audit');
  }

  for (const m of (data.metadata||[])) await _put('metadata', m);
  for (const a of data.accounts) {
    delete a.openingType; // clean legacy
    a.openingBalance = parseFloat(a.openingBalance) || 0;
    await _put('accounts', a);
  }
  for (const v of data.vouchers) await _put('vouchers', v);

  // Re-sync counters
  const allAcc = await _getAll('accounts');
  const allVou = await _getAll('vouchers');
  const maxA = Math.max(0, ...allAcc.map(a => parseInt(a.id?.split('-')[1])||0));
  const maxV = Math.max(0, ...allVou.map(v => parseInt(v.id?.split('-')[1])||0));
  await setMeta('accountCounter', maxA);
  await setMeta('voucherCounter', maxV);

  await addAudit(`Import (${mode}): ${data.accounts.length} accounts, ${data.vouchers.length} vouchers`);
}

// ── CLEAR ALL ───────────────────────────────────────────
async function clearAllData() {
  await _clear('metadata');
  await _clear('accounts');
  await _clear('vouchers');
  await _clear('audit');
}
