// =====================================================
// db.js — IndexedDB Layer for Ledger Finance App
// =====================================================

const DB_NAME = 'LedgerDB';
const DB_VERSION = 1;
let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('metadata')) {
        d.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (!d.objectStoreNames.contains('accounts')) {
        const acc = d.createObjectStore('accounts', { keyPath: 'id' });
        acc.createIndex('name', 'name', { unique: false });
      }
      if (!d.objectStoreNames.contains('vouchers')) {
        const vou = d.createObjectStore('vouchers', { keyPath: 'id' });
        vou.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('audit')) {
        d.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}

function storeGet(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store).objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function storeGetAll(store) {
  return new Promise((res, rej) => {
    const r = tx(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function storePut(store, obj) {
  return new Promise((res, rej) => {
    const t = tx(store, 'readwrite');
    const r = t.objectStore(store).put(obj);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function storeDelete(store, key) {
  return new Promise((res, rej) => {
    const t = tx(store, 'readwrite');
    const r = t.objectStore(store).delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function storeClear(store) {
  return new Promise((res, rej) => {
    const t = tx(store, 'readwrite');
    const r = t.objectStore(store).clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// =====================================================
// METADATA
// =====================================================
async function getMeta(key) {
  const rec = await storeGet('metadata', key);
  return rec ? rec.value : null;
}

async function setMeta(key, value) {
  await storePut('metadata', { key, value });
}

async function getNextAccountId() {
  let c = await getMeta('accountCounter') || 0;
  c++;
  await setMeta('accountCounter', c);
  return 'A-' + String(c).padStart(4, '0');
}

async function getNextVoucherId() {
  let c = await getMeta('voucherCounter') || 0;
  c++;
  await setMeta('voucherCounter', c);
  return 'V-' + String(c).padStart(4, '0');
}

// =====================================================
// ACCOUNTS
// =====================================================
async function getAccounts() { return storeGetAll('accounts'); }

async function getAccount(id) { return storeGet('accounts', id); }

async function saveAccount(acc) {
  if (!acc.id) {
    acc.id = await getNextAccountId();
    acc.createdAt = new Date().toISOString();
  }
  await storePut('accounts', acc);
  await addAudit(`Account saved: ${acc.name} (${acc.id})`);
  return acc;
}

async function deleteAccount(id) {
  // Check if used in any voucher
  const vouchers = await getVouchers();
  const inUse = vouchers.some(v => v.entries && v.entries.some(e => e.accountId === id));
  if (inUse) throw new Error('Account is used in transactions and cannot be deleted.');
  await storeDelete('accounts', id);
  await addAudit(`Account deleted: ${id}`);
}

// =====================================================
// VOUCHERS
// =====================================================
async function getVouchers() { return storeGetAll('vouchers'); }

async function getVoucher(id) { return storeGet('vouchers', id); }

async function saveVoucher(voucher) {
  if (!voucher.id) {
    voucher.id = await getNextVoucherId();
    voucher.createdAt = new Date().toISOString();
  }
  // Validate balance
  const totalDebit = voucher.entries.reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCredit = voucher.entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error('Voucher is not balanced. Debit and credit must be equal.');
  }
  await storePut('vouchers', voucher);
  await addAudit(`Voucher saved: ${voucher.id}`);
  return voucher;
}

async function deleteVoucher(id) {
  const v = await getVoucher(id);
  if (v && v.locked) throw new Error('Cannot delete a locked voucher. Reverse it instead.');
  await storeDelete('vouchers', id);
  await addAudit(`Voucher deleted: ${id}`);
}

async function reverseVoucher(originalId) {
  const original = await getVoucher(originalId);
  if (!original) throw new Error('Voucher not found.');
  if (original.reversed) throw new Error('Voucher has already been reversed.');
  const revId = await getNextVoucherId();
  const reversalVoucher = {
    id: revId,
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    isReversal: true,
    reversalOf: originalId,
    locked: true,
    entries: original.entries.map(e => ({
      accountId: e.accountId,
      narration: `[REVERSAL] ${e.narration || ''}`,
      debit: e.credit,
      credit: e.debit
    }))
  };
  await storePut('vouchers', reversalVoucher);
  // Mark original as reversed
  original.reversed = true;
  original.reversedBy = revId;
  await storePut('vouchers', original);
  await addAudit(`Voucher ${originalId} reversed → ${revId}`);
  return reversalVoucher;
}

// =====================================================
// ACCOUNT LEDGER (running balance)
// =====================================================
async function getAccountLedger(accountId, fromDate, toDate) {
  const account = await getAccount(accountId);
  if (!account) return null;
  const vouchers = await getVouchers();
  // Sort by date
  const sorted = vouchers.sort((a, b) => a.date.localeCompare(b.date));

  // Opening balance
  let openingBalance = parseFloat(account.openingBalance) || 0;
  // Opening balance sign: debit = positive asset, credit = negative
  if (account.openingType === 'credit') openingBalance = -openingBalance;

  // Compute entries before fromDate for carried-forward balance
  let runningBal = openingBalance;
  const inRange = [];

  for (const v of sorted) {
    const entries = (v.entries || []).filter(e => e.accountId === accountId);
    if (!entries.length) continue;
    if (fromDate && v.date < fromDate) {
      for (const e of entries) {
        runningBal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
      }
    } else if ((!fromDate || v.date >= fromDate) && (!toDate || v.date <= toDate)) {
      inRange.push({ voucher: v, entries });
    }
  }

  const openingForRange = runningBal;
  runningBal = openingForRange;

  const rows = [];
  for (const { voucher, entries } of inRange) {
    for (const e of entries) {
      const debit = parseFloat(e.debit) || 0;
      const credit = parseFloat(e.credit) || 0;
      runningBal += debit - credit;
      rows.push({
        date: voucher.date,
        voucherId: voucher.id,
        narration: e.narration || '',
        debit: debit || null,
        credit: credit || null,
        balance: runningBal
      });
    }
  }

  return {
    account,
    openingBalance: openingForRange,
    rows,
    closingBalance: runningBal,
    totalDebit: rows.reduce((s, r) => s + (r.debit || 0), 0),
    totalCredit: rows.reduce((s, r) => s + (r.credit || 0), 0)
  };
}

// =====================================================
// ACCOUNT BALANCE HELPER
// =====================================================
async function getAccountBalance(accountId) {
  const account = await getAccount(accountId);
  if (!account) return 0;
  const vouchers = await getVouchers();
  let bal = parseFloat(account.openingBalance) || 0;
  if (account.openingType === 'credit') bal = -bal;
  for (const v of vouchers) {
    for (const e of (v.entries || [])) {
      if (e.accountId === accountId) {
        bal += (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
      }
    }
  }
  return bal;
}

// =====================================================
// AUDIT LOG
// =====================================================
async function addAudit(message) {
  await storePut('audit', { timestamp: new Date().toISOString(), message });
}

async function getAuditLog() {
  return new Promise((res, rej) => {
    const t = tx('audit');
    const store = t.objectStore('audit');
    const r = store.getAll();
    r.onsuccess = () => res((r.result || []).reverse().slice(0, 100));
    r.onerror = () => rej(r.error);
  });
}

// =====================================================
// BACKUP / RESTORE
// =====================================================
async function exportData() {
  const [metadata, accounts, vouchers, audit] = await Promise.all([
    storeGetAll('metadata'),
    storeGetAll('accounts'),
    storeGetAll('vouchers'),
    storeGetAll('audit')
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata,
    accounts,
    vouchers,
    audit
  };
}

async function importData(data, mode = 'replace') {
  if (!data || data.version !== 1) throw new Error('Invalid or incompatible backup file.');
  if (!Array.isArray(data.accounts) || !Array.isArray(data.vouchers)) {
    throw new Error('Backup file is missing required data.');
  }

  if (mode === 'replace') {
    await storeClear('metadata');
    await storeClear('accounts');
    await storeClear('vouchers');
    await storeClear('audit');
  }

  // Restore metadata
  for (const m of (data.metadata || [])) await storePut('metadata', m);

  // Reconcile counters to avoid ID collision on merge
  if (mode === 'merge') {
    const accounts = await storeGetAll('accounts');
    const vouchers = await storeGetAll('vouchers');
    const allAccIds = [...accounts.map(a => a.id), ...data.accounts.map(a => a.id)];
    const allVouIds = [...vouchers.map(v => v.id), ...data.vouchers.map(v => v.id)];
    const maxAcc = Math.max(0, ...allAccIds.map(id => parseInt(id.split('-')[1]) || 0));
    const maxVou = Math.max(0, ...allVouIds.map(id => parseInt(id.split('-')[1]) || 0));
    await setMeta('accountCounter', maxAcc);
    await setMeta('voucherCounter', maxVou);
  }

  for (const a of data.accounts) await storePut('accounts', a);
  for (const v of data.vouchers) await storePut('vouchers', v);

  // Sync counters after import
  const allAccounts = await storeGetAll('accounts');
  const allVouchers = await storeGetAll('vouchers');
  const maxAcc = Math.max(0, ...allAccounts.map(a => parseInt(a.id.split('-')[1]) || 0));
  const maxVou = Math.max(0, ...allVouchers.map(v => parseInt(v.id.split('-')[1]) || 0));
  await setMeta('accountCounter', maxAcc);
  await setMeta('voucherCounter', maxVou);

  await addAudit(`Data imported (mode: ${mode}), ${data.accounts.length} accounts, ${data.vouchers.length} vouchers`);
}
