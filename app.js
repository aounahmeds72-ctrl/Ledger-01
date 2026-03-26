// ═══════════════════════════════════════════════════════
// app.js — Ledger Main Application
// Balances are always computed live from vouchers.
// Saving a voucher triggers account balance refresh.
// ═══════════════════════════════════════════════════════

let currentTab = 'dashboard';
let editingAccountId = null;
let editingVoucherId = null;
let viewingVoucherId = null;
let confirmCb = null;
let curr = '$';

// ── Boot ─────────────────────────────────────────────────
async function onAppStart() {
  await initDB();
  curr = localStorage.getItem(CURRENCY_KEY) || '$';
  _applyTheme();
  _setupNav();
  _setupModals();
  _setupAccounts();
  _setupTransactions();
  _setupReports();
  _setupBackup();
  _setupSettings();
  _setupConfirm();
  switchTab('dashboard');
  document.getElementById('today-date').textContent = _fmtDate(new Date().toISOString().split('T')[0]);
}

// ── Theme ────────────────────────────────────────────────
function _applyTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement[t === 'light' ? 'setAttribute' : 'removeAttribute']('data-theme', 'light');
  const tog = document.getElementById('dark-mode-toggle');
  if (tog) tog.checked = (t !== 'light');
}

// ── Navigation ───────────────────────────────────────────
function _setupNav() {
  document.querySelectorAll('.nav-item, .bn-item').forEach(b => {
    b.addEventListener('click', () => { if (b.dataset.tab) switchTab(b.dataset.tab); });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bn-item').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));

  if (tab === 'dashboard')    renderDashboard();
  if (tab === 'accounts')     renderAccounts();
  if (tab === 'transactions') renderVouchers();
  if (tab === 'reports')      _populateReportAccounts();
  if (tab === 'backup')       renderAuditLog();
  if (tab === 'settings') {
    document.getElementById('currency-symbol').value = curr;
  }
}

// ── Modals ───────────────────────────────────────────────
function _setupModals() {
  document.querySelectorAll('.modal-x, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.modal;
      if (id) _closeModal(id);
    });
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) _closeAllModals();
  });
}

function _openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  const m = document.getElementById(id);
  if (m) { m.style.display = 'flex'; }
}
function _closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
  const any = [...document.querySelectorAll('.modal')].some(m => m.style.display === 'flex');
  if (!any) document.getElementById('modal-overlay').classList.add('hidden');
}
function _closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById('modal-overlay').classList.add('hidden');
}

function _setupConfirm() {
  document.getElementById('confirm-ok').addEventListener('click', () => {
    _closeModal('modal-confirm');
    if (confirmCb) { confirmCb(); confirmCb = null; }
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => _closeModal('modal-confirm'));
}

function _confirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  confirmCb = onOk;
  _openModal('modal-confirm');
}

// ── Toast ────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── Formatters ───────────────────────────────────────────
const _n2 = n => (parseFloat(n)||0).toFixed(2);
function _fmt(n)        { return curr + ' ' + Math.abs(parseFloat(n)||0).toFixed(2); }
function _fmtSigned(n)  {
  const v = parseFloat(n)||0;
  return (v < 0 ? '− ' : '') + curr + ' ' + Math.abs(v).toFixed(2);
}
function _fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}
function _esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  try {
    const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);

    // Net balance = sum of all computed balances
    let net = 0;
    for (const a of accounts) net += await computeBalance(a.id, vouchers);
    document.getElementById('dash-net-balance').textContent = _fmtSigned(net);
    document.getElementById('dash-accounts').textContent    = accounts.length;
    document.getElementById('dash-vouchers').textContent    = vouchers.length;

    // Recent vouchers
    const recent = [...vouchers].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);
    const container = document.getElementById('dash-recent');
    container.innerHTML = '';
    if (!recent.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>No transactions yet</p></div>`;
      return;
    }
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    for (const v of recent) {
      const dr    = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
      const narr  = (v.entries||[]).find(e => e.narration)?.narration || '';
      const names = [...new Set((v.entries||[]).map(e => accMap[e.accountId]||e.accountId))].slice(0,2).join(', ');
      const el = document.createElement('div');
      el.className = 'recent-row';
      el.innerHTML = `
        <div class="recent-left">
          <div class="recent-id">${v.id}</div>
          <div class="recent-narr">${_esc(narr || names)}</div>
          <div class="recent-date">${_fmtDate(v.date)}</div>
        </div>
        <div class="recent-amt">${_fmt(dr)}</div>`;
      el.addEventListener('click', () => openVoucherView(v.id));
      container.appendChild(el);
    }
  } catch(e) { console.error(e); }
}

// ═══════════════════════════════════════════════════════
// ACCOUNTS
// Balance is COMPUTED every render — not stored.
// ═══════════════════════════════════════════════════════
function _setupAccounts() {
  document.getElementById('btn-new-account').addEventListener('click', () => _openAccountModal());
  document.getElementById('btn-save-account').addEventListener('click', _saveAccountHandler);
}

async function renderAccounts() {
  const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);
  const container = document.getElementById('accounts-list');
  container.innerHTML = '';
  if (!accounts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>No accounts yet — create one to start</p></div>`;
    return;
  }
  const sorted = [...accounts].sort((a,b) => a.name.localeCompare(b.name));
  for (const acc of sorted) {
    const bal = await computeBalance(acc.id, vouchers);
    const el = document.createElement('div');
    el.className = 'acc-row';
    el.innerHTML = `
      <div class="acc-left">
        <div class="acc-id">${acc.id}</div>
        <div class="acc-name">${_esc(acc.name)}</div>
        <div class="acc-date">Since ${_fmtDate(acc.createdAt?.split('T')[0])}</div>
      </div>
      <div class="acc-right">
        <div class="acc-bal-wrap">
          <div class="acc-bal-lbl">Balance</div>
          <div class="acc-bal">${_fmtSigned(bal)}</div>
        </div>
        <div class="acc-actions">
          <button class="ic-btn" data-edit="${acc.id}" title="Edit"><svg width="13" height="13"><use href="#ic-edit"/></svg></button>
          <button class="ic-btn del" data-del="${acc.id}" title="Delete"><svg width="13" height="13"><use href="#ic-trash"/></svg></button>
        </div>
      </div>`;
    container.appendChild(el);
  }
  container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => _openAccountModal(b.dataset.edit)));
  container.querySelectorAll('[data-del]').forEach(b  => b.addEventListener('click', () => _deleteAccountHandler(b.dataset.del)));
}

function _openAccountModal(id = null) {
  editingAccountId = id;
  document.getElementById('modal-account-title').textContent = id ? 'Edit Account' : 'New Account';
  document.getElementById('acc-name').value    = '';
  document.getElementById('acc-opening').value = '';
  if (id) {
    getAccount(id).then(acc => {
      if (!acc) return;
      document.getElementById('acc-name').value    = acc.name;
      document.getElementById('acc-opening').value = acc.openingBalance || '';
    });
  }
  _openModal('modal-account');
  setTimeout(() => document.getElementById('acc-name').focus(), 120);
}

async function _saveAccountHandler() {
  const name = document.getElementById('acc-name').value.trim();
  if (!name) { showToast('Account name is required', 'error'); return; }

  const accounts = await getAccounts();
  const dupe = accounts.find(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingAccountId);
  if (dupe) { showToast('An account with this name already exists', 'error'); return; }

  try {
    const acc = {
      id: editingAccountId || null,
      name,
      openingBalance: parseFloat(document.getElementById('acc-opening').value) || 0
    };
    await saveAccount(acc);
    _closeModal('modal-account');
    showToast(editingAccountId ? 'Account updated' : 'Account created', 'success');
    // Refresh accounts AND dashboard so balances update immediately
    renderAccounts();
    if (currentTab === 'dashboard') renderDashboard();
    editingAccountId = null;
  } catch(e) { showToast(e.message, 'error'); }
}

async function _deleteAccountHandler(id) {
  const acc = await getAccount(id);
  _confirm('Delete Account', `Delete "${acc?.name}"? This cannot be undone.`, async () => {
    try {
      await deleteAccount(id);
      showToast('Account deleted', 'success');
      renderAccounts();
    } catch(e) { showToast(e.message, 'error'); }
  });
}

// ═══════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════
function _setupTransactions() {
  document.getElementById('btn-new-voucher').addEventListener('click', () => openVoucherModal());
  document.getElementById('btn-save-voucher').addEventListener('click', _saveVoucherHandler);
  document.getElementById('btn-add-row').addEventListener('click', () => _addEntryRow());
  document.getElementById('voucher-search').addEventListener('input', e => renderVouchers(e.target.value));
  document.getElementById('btn-vview-edit').addEventListener('click', () => {
    _closeModal('modal-voucher-view');
    if (viewingVoucherId) openVoucherModal(viewingVoucherId);
  });
  document.getElementById('btn-vview-reverse').addEventListener('click', () => {
    if (!viewingVoucherId) return;
    _confirm('Reverse Voucher', 'This will create a counter-entry to cancel this voucher.', async () => {
      try {
        const rev = await reverseVoucher(viewingVoucherId);
        showToast(`Reversal voucher ${rev.id} created`, 'success');
        _closeModal('modal-voucher-view');
        renderVouchers();
        // Update accounts tab + dashboard balances live
        if (currentTab === 'accounts')  renderAccounts();
        if (currentTab === 'dashboard') renderDashboard();
      } catch(e) { showToast(e.message, 'error'); }
    });
  });
}

async function renderVouchers(search = '') {
  let vouchers = await getVouchers();
  vouchers = [...vouchers].sort((a,b) => b.date.localeCompare(a.date));
  if (search) {
    const s = search.toLowerCase();
    vouchers = vouchers.filter(v =>
      v.id.toLowerCase().includes(s) ||
      v.date.includes(s) ||
      (v.entries||[]).some(e => (e.narration||'').toLowerCase().includes(s))
    );
  }
  const accounts = await getAccounts();
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const container = document.getElementById('vouchers-list');
  container.innerHTML = '';
  if (!vouchers.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>${search ? 'No results found' : 'No vouchers yet'}</p></div>`;
    return;
  }
  for (const v of vouchers) {
    const dr    = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
    const names = [...new Set((v.entries||[]).map(e => accMap[e.accountId]||e.accountId))].slice(0,3).join(', ');
    let badge = '';
    if (v.reversed)   badge = `<span class="vou-badge badge-reversed">Reversed</span>`;
    if (v.isReversal) badge = `<span class="vou-badge badge-reversal">Reversal</span>`;
    else if (v.locked && !v.reversed) badge = `<span class="vou-badge badge-locked">Locked</span>`;
    const el = document.createElement('div');
    el.className = 'vou-row';
    el.innerHTML = `
      <div class="vou-left">
        <div class="vou-id">${v.id}</div>
        <div class="vou-summary">${_esc(names)}</div>
        <div class="vou-date">${_fmtDate(v.date)}</div>
      </div>
      <div class="vou-right">${badge}<span class="vou-amt">${_fmt(dr)}</span></div>`;
    el.addEventListener('click', () => openVoucherView(v.id));
    container.appendChild(el);
  }
}

async function openVoucherModal(id = null) {
  editingVoucherId = id;
  document.getElementById('modal-voucher-title').textContent = id ? 'Edit Voucher' : 'New Voucher';
  document.getElementById('voucher-entries').innerHTML = '';
  document.getElementById('v-date').value  = new Date().toISOString().split('T')[0];
  document.getElementById('v-id').value    = '';

  if (id) {
    const v = await getVoucher(id);
    if (v) {
      document.getElementById('v-id').value   = v.id;
      document.getElementById('v-date').value = v.date;
      for (const e of (v.entries||[])) await _addEntryRow(e);
    }
  } else {
    await _addEntryRow();
    await _addEntryRow();
  }
  _updateTotals();
  _openModal('modal-voucher');
}

async function _addEntryRow(prefill = null) {
  const accounts = await getAccounts();
  const container = document.getElementById('voucher-entries');
  const row = document.createElement('div');
  row.className = 'entry-row';

  const opts = accounts.map(a => `<option value="${a.id}">${_esc(a.name)}</option>`).join('');
  row.innerHTML = `
    <select class="e-acc"><option value="">— Account —</option>${opts}</select>
    <input class="e-narr" type="text" placeholder="Narration" autocomplete="off" />
    <input class="e-dr" type="number" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <input class="e-cr" type="number" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <button class="del-row" type="button" title="Remove row">
      <svg width="13" height="13"><use href="#ic-x"/></svg>
    </button>`;
  container.appendChild(row);

  if (prefill) {
    row.querySelector('.e-acc').value  = prefill.accountId || '';
    row.querySelector('.e-narr').value = prefill.narration || '';
    if (prefill.debit)  row.querySelector('.e-dr').value = prefill.debit;
    if (prefill.credit) row.querySelector('.e-cr').value = prefill.credit;
  }

  // Enter-key navigation
  const fields = row.querySelectorAll('select, input:not([type="button"])');
  fields.forEach((f, i) => {
    f.addEventListener('keydown', async ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const next = fields[i + 1];
        if (next) { next.focus(); }
        else {
          const { dr, cr } = _getTotals();
          if (Math.abs(dr - cr) > 0.001) await _addEntryRow();
          else document.getElementById('btn-save-voucher').focus();
        }
      }
    });
    f.addEventListener('input', _updateTotals);
    f.addEventListener('change', _updateTotals);
  });

  row.querySelector('.del-row').addEventListener('click', () => {
    if (container.children.length > 1) { row.remove(); _updateTotals(); }
  });
}

function _getTotals() {
  let dr = 0, cr = 0;
  document.querySelectorAll('#voucher-entries .entry-row').forEach(r => {
    dr += parseFloat(r.querySelector('.e-dr').value) || 0;
    cr += parseFloat(r.querySelector('.e-cr').value) || 0;
  });
  return { dr, cr };
}

function _updateTotals() {
  const { dr, cr } = _getTotals();
  document.getElementById('total-debit').textContent  = _n2(dr);
  document.getElementById('total-credit').textContent = _n2(cr);
  const bal     = Math.abs(dr - cr);
  const balanced = bal < 0.001;
  const checkEl  = document.getElementById('balance-check');
  const rowEl    = document.getElementById('balance-check-row');
  checkEl.textContent = balanced ? '✓ Balanced' : `✗ Diff: ${_n2(bal)}`;
  rowEl.className = 'tot-row tot-status ' + (balanced ? 'ok' : 'err');
}

async function _saveVoucherHandler() {
  const date = document.getElementById('v-date').value;
  if (!date) { showToast('Date is required', 'error'); return; }

  const entries = [];
  let hasAcc = false;
  document.querySelectorAll('#voucher-entries .entry-row').forEach(r => {
    const accountId  = r.querySelector('.e-acc').value;
    const narration  = r.querySelector('.e-narr').value.trim();
    const debit      = parseFloat(r.querySelector('.e-dr').value) || 0;
    const credit     = parseFloat(r.querySelector('.e-cr').value) || 0;
    if (accountId) hasAcc = true;
    if (accountId || debit || credit) entries.push({ accountId, narration, debit, credit });
  });

  if (!hasAcc || entries.length < 2) {
    showToast('At least 2 entries with accounts required', 'error'); return;
  }
  const { dr, cr } = _getTotals();
  if (Math.abs(dr - cr) > 0.001) {
    showToast('Voucher must be balanced (Debit = Credit)', 'error'); return;
  }

  try {
    const v = { id: editingVoucherId || null, date, entries, locked: true };
    const saved = await saveVoucher(v);
    _closeModal('modal-voucher');
    showToast(editingVoucherId ? 'Voucher updated' : `${saved.id} saved`, 'success');
    renderVouchers();
    // Live balance update across tabs
    renderAccounts();
    if (currentTab === 'dashboard') renderDashboard();
    editingVoucherId = null;
  } catch(e) { showToast(e.message, 'error'); }
}

async function openVoucherView(id) {
  viewingVoucherId = id;
  const v = await getVoucher(id);
  if (!v) return;
  const accounts = await getAccounts();
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));

  document.getElementById('modal-vview-title').textContent = `Voucher ${v.id}`;

  let statusTxt = 'Locked';
  if (v.reversed)   statusTxt = `Reversed → ${v.reversedBy}`;
  if (v.isReversal) statusTxt = `Reversal of ${v.reversalOf}`;

  const tBodyRows = (v.entries||[]).map(e => `
    <tr>
      <td>${_esc(accMap[e.accountId]||e.accountId)}</td>
      <td>${_esc(e.narration||'—')}</td>
      <td class="vv-num">${e.debit  ? _fmt(e.debit)  : ''}</td>
      <td class="vv-num">${e.credit ? _fmt(e.credit) : ''}</td>
    </tr>`).join('');

  const dr = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
  const cr = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.credit)||0), 0);

  document.getElementById('modal-vview-body').innerHTML = `
    <div class="vv-meta">
      <div class="vv-field"><span>Voucher ID</span><strong class="vv-id">${v.id}</strong></div>
      <div class="vv-field"><span>Date</span><strong>${_fmtDate(v.date)}</strong></div>
      <div class="vv-field"><span>Status</span><strong>${statusTxt}</strong></div>
    </div>
    <div style="overflow-x:auto">
      <table class="vv-table">
        <thead><tr><th>Account</th><th>Narration</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead>
        <tbody>${tBodyRows}</tbody>
        <tfoot><tr>
          <td colspan="2" style="font-weight:700">Total</td>
          <td class="vv-num" style="font-weight:700">${_fmt(dr)}</td>
          <td class="vv-num" style="font-weight:700">${_fmt(cr)}</td>
        </tr></tfoot>
      </table>
    </div>`;

  // Hide edit/reverse buttons appropriately
  document.getElementById('btn-vview-edit').style.display    = (v.reversed||v.isReversal) ? 'none' : '';
  document.getElementById('btn-vview-reverse').style.display = v.reversed ? 'none' : '';
  _openModal('modal-voucher-view');
}

// ═══════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════
function _setupReports() {
  document.getElementById('btn-generate-report').addEventListener('click', _generateReport);
  document.getElementById('btn-print-report').addEventListener('click', _printReport);
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('report-from').value = `${y}-${m}-01`;
  document.getElementById('report-to').value   = now.toISOString().split('T')[0];
}

async function _populateReportAccounts() {
  const accounts = await getAccounts();
  const sel = document.getElementById('report-account');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select Account —</option>';
  accounts.sort((a,b) => a.name.localeCompare(b.name)).forEach(a => {
    sel.innerHTML += `<option value="${a.id}">${_esc(a.name)} (${a.id})</option>`;
  });
  if (cur) sel.value = cur;
}

async function _generateReport() {
  const accountId = document.getElementById('report-account').value;
  const from      = document.getElementById('report-from').value;
  const to        = document.getElementById('report-to').value;
  if (!accountId) { showToast('Select an account', 'error'); return; }

  const data = await getAccountLedger(accountId, from, to);
  if (!data) { showToast('Account not found', 'error'); return; }

  const tRows = data.rows.map(r => `
    <tr>
      <td>${_fmtDate(r.date)}</td>
      <td class="vid">${r.voucherId}</td>
      <td>${_esc(r.narration)}</td>
      <td class="num dr">${r.debit  ? _fmt(r.debit)  : ''}</td>
      <td class="num cr">${r.credit ? _fmt(r.credit) : ''}</td>
      <td class="num bl">${_fmtSigned(r.balance)}</td>
    </tr>`).join('');

  document.getElementById('report-output').innerHTML = `
    <div id="printable-report">
      <div class="report-meta">
        <div class="report-meta-item"><span>Account</span><strong>${_esc(data.account.name)} (${data.account.id})</strong></div>
        <div class="report-meta-item"><span>Period</span><strong>${from ? _fmtDate(from) : 'All'} — ${to ? _fmtDate(to) : 'All'}</strong></div>
        <div class="report-meta-item"><span>Opening Balance</span><strong>${_fmtSigned(data.openingBalance)}</strong></div>
        <div class="report-meta-item"><span>Closing Balance</span><strong>${_fmtSigned(data.closingBalance)}</strong></div>
      </div>
      <div class="card report-table-wrap" style="padding:0;overflow:hidden">
        <table class="rtable">
          <thead><tr>
            <th>Date</th><th>Voucher</th><th>Narration</th>
            <th style="text-align:right">Debit</th>
            <th style="text-align:right">Credit</th>
            <th style="text-align:right">Balance</th>
          </tr></thead>
          <tbody>
            <tr class="opening-row">
              <td colspan="5" style="color:var(--t2);font-style:italic">Opening Balance</td>
              <td class="num bl">${_fmtSigned(data.openingBalance)}</td>
            </tr>
            ${tRows || '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--t3)">No transactions in this period</td></tr>'}
          </tbody>
          <tfoot><tr>
            <td colspan="3">Totals</td>
            <td class="num dr">${_fmt(data.totalDebit)}</td>
            <td class="num cr">${_fmt(data.totalCredit)}</td>
            <td class="num bl">${_fmtSigned(data.closingBalance)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

function _printReport() {
  const el = document.getElementById('printable-report');
  if (!el) { showToast('Generate a report first', 'error'); return; }
  if (typeof html2pdf !== 'undefined') {
    const sel  = document.getElementById('report-account');
    const name = sel.options[sel.selectedIndex]?.text || 'Ledger';
    html2pdf().set({
      margin: [10,10,10,10],
      filename: `Ledger_${name}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  } else {
    window.print();
  }
}

// ═══════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════
function _setupBackup() {
  document.getElementById('btn-export').addEventListener('click', _exportBackup);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', _importBackup);
  _renderLastBackup();
}
function _renderLastBackup() {
  const last = localStorage.getItem(BACKUP_KEY);
  const el   = document.getElementById('last-backup-info');
  if (el) el.textContent = last ? `Last backup: ${_fmtDate(last.split('T')[0])}` : 'Last backup: Never';
}
async function _exportBackup() {
  try {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `Ledger_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    _renderLastBackup();
    showToast('Backup exported', 'success');
  } catch(e) { showToast('Export failed: ' + e.message, 'error'); }
}
async function _importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const mode = document.querySelector('input[name="import-mode"]:checked').value;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    _confirm('Import Data',
      `${mode === 'replace' ? 'Replace ALL data' : 'Merge'} with ${data.accounts?.length||0} accounts and ${data.vouchers?.length||0} vouchers?`,
      async () => {
        try {
          await importData(data, mode);
          showToast('Data imported', 'success');
          renderAuditLog();
          renderDashboard();
          renderAccounts();
        } catch(err) { showToast('Import failed: ' + err.message, 'error'); }
      });
  } catch(err) { showToast('Invalid JSON file', 'error'); }
  e.target.value = '';
}

async function renderAuditLog() {
  const log = await getAuditLog();
  const el  = document.getElementById('audit-log-list');
  el.innerHTML = '';
  if (!log.length) {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:8px 0">No entries yet</div>';
    return;
  }
  for (const entry of log) {
    const d = new Date(entry.time || entry.ts);
    const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    const row = document.createElement('div');
    row.className = 'audit-entry';
    row.innerHTML = `<span class="audit-ts">${timeStr}</span><span class="audit-msg">${_esc(entry.message)}</span>`;
    el.appendChild(row);
  }
}

// ═══════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════
function _setupSettings() {
  document.getElementById('dark-mode-toggle').addEventListener('change', e => {
    const theme = e.target.checked ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement[theme === 'light' ? 'setAttribute' : 'removeAttribute']('data-theme', 'light');
  });
  document.getElementById('btn-save-currency').addEventListener('click', () => {
    const sym = document.getElementById('currency-symbol').value.trim() || '$';
    curr = sym;
    localStorage.setItem(CURRENCY_KEY, sym);
    showToast('Currency symbol saved', 'success');
  });
  document.getElementById('btn-change-pin').addEventListener('click', () => {
    lockApp();
    _mode = 'change';
    _setSubtitle('Enter current PIN');
  });
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    _confirm('Clear All Data', 'This will permanently delete ALL accounts, vouchers, and data.', async () => {
      await clearAllData();
      localStorage.removeItem(BACKUP_KEY);
      showToast('All data cleared', 'success');
      renderDashboard();
      renderAccounts();
      renderVouchers();
    });
  });
}

// ── DOM ready ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
