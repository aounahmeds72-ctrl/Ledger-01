// ═══════════════════════════════════════════════════════
// app.js — Ledger Main Application (Supabase)
// ═══════════════════════════════════════════════════════

let currentTab = 'dashboard';
let editingAccountId = null;
let editingVoucherId = null;
let viewingVoucherId = null;
let confirmCb = null;
let curr = '$';

const PINNED_KEY = 'ledger_pinned_accounts';
const CURRENCY_KEY = 'ledger_currency';
const THEME_KEY = 'ledger_theme';

// ── Boot ──────────────────────────────────────────────────
async function onAppStart() {
  curr = localStorage.getItem(CURRENCY_KEY) || '$';
  _applyTheme();
  _setupNav();
  _setupModals();
  _setupAccounts();
  _setupTransactions();
  _setupReports();
  _setupSettings();
  _setupConfirm();
  _setupRefreshButtons();
  switchTab('dashboard');
  document.getElementById('today-date').textContent = _fmtDate(new Date().toISOString().split('T')[0]);
  
  // Update user info in top bar
  const user = currentUser;
  const userEmail = document.getElementById('user-email');
  if (userEmail) userEmail.textContent = user?.email || 'User';
}

// ── Theme ─────────────────────────────────────────────────
function _applyTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement[t === 'light' ? 'setAttribute' : 'removeAttribute']('data-theme', 'light');
  const tog = document.getElementById('dark-mode-toggle');
  if (tog) tog.checked = (t !== 'light');
}

// ── Navigation ────────────────────────────────────────────
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
  if (tab === 'settings')     document.getElementById('currency-symbol').value = curr;
}

// ── Refresh buttons ───────────────────────────────────────
function _setupRefreshButtons() {
  document.querySelectorAll('[data-refresh]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.refresh;
      const icon = btn.querySelector('svg');
      if (icon) { icon.classList.add('spin'); setTimeout(() => icon.classList.remove('spin'), 600); }
      if (tab === 'dashboard')    { renderDashboard(); showToast('Dashboard refreshed', 'success'); }
      if (tab === 'accounts')     { renderAccounts();  showToast('Accounts refreshed',  'success'); }
      if (tab === 'transactions') { renderVouchers();  showToast('Transactions refreshed', 'success'); }
      if (tab === 'reports')      { _populateReportAccounts(); showToast('Report accounts refreshed', 'success'); }
      if (tab === 'backup')       { renderAuditLog();  showToast('Audit log refreshed', 'success'); }
    });
  });
}

// ── Modals ────────────────────────────────────────────────
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
  if (m) m.style.display = 'flex';
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

// ── Toast ─────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── Formatters ────────────────────────────────────────────
const _n2 = n => (parseFloat(n)||0).toFixed(2);
function _fmt(n) { return curr + ' ' + Math.abs(parseFloat(n)||0).toFixed(2); }
function _fmtSigned(n) {
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
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════
// PINNED ACCOUNTS
// ═══════════════════════════════════════════════════════
function _getPinnedIds() {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); }
  catch { return []; }
}
function _setPinnedIds(ids) { localStorage.setItem(PINNED_KEY, JSON.stringify(ids)); }
function _togglePin(accId) {
  const ids = _getPinnedIds();
  const idx = ids.indexOf(accId);
  if (idx === -1) ids.push(accId);
  else ids.splice(idx, 1);
  _setPinnedIds(ids);
}
function _isPinned(accId) { return _getPinnedIds().includes(accId); }

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
async function renderDashboard() {
  try {
    const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);

    document.getElementById('dash-accounts').textContent = accounts.length;
    document.getElementById('dash-vouchers').textContent = vouchers.length;

    // Pinned accounts
    const pinnedIds  = _getPinnedIds();
    const pinnedEl   = document.getElementById('dash-pinned');
    const pinnedSect = document.getElementById('dash-pinned-section');
    pinnedEl.innerHTML = '';

    const pinnedAccounts = accounts.filter(a => pinnedIds.includes(a.id));
    if (!pinnedAccounts.length) {
      pinnedSect.style.display = 'none';
    } else {
      pinnedSect.style.display = '';
      for (const a of pinnedAccounts) {
        const bal  = await computeBalance(a.id, vouchers);
        const card = document.createElement('div');
        card.className = 'pinned-card';
        card.innerHTML = `
          <div class="pinned-name">${_esc(a.name)}</div>
          <div class="pinned-bal ${bal < 0 ? 'neg' : ''}">${_fmtSigned(bal)}</div>`;
        card.addEventListener('click', () => switchTab('accounts'));
        pinnedEl.appendChild(card);
      }
    }

    // Recent vouchers (up to 10)
    const accMap  = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    const recent  = [...vouchers].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10);
    const container = document.getElementById('dash-recent');
    container.innerHTML = '';
    if (!recent.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>No transactions yet</p></div>`;
      return;
    }
    recent.forEach((v, idx) => {
      const dr   = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
      const narr = (v.entries||[]).find(e => e.narration)?.narration || '';
      const names = [...new Set((v.entries||[]).map(e => accMap[e.accountId] || e.accountId))].slice(0,2).join(', ');
      const el = document.createElement('div');
      el.className = 'recent-row';
      el.innerHTML = `
        <div class="recent-left">
          <div class="recent-sn">${idx + 1}</div>
          <div class="recent-mid">
            <div class="recent-id">${v.id}</div>
            <div class="recent-narr">${_esc(narr || names)}</div>
            <div class="recent-date">${_fmtDate(v.date)}</div>
          </div>
        </div>
        <div class="recent-amt">${_fmt(dr)}</div>`;
      el.addEventListener('click', () => openVoucherView(v.id));
      container.appendChild(el);
    });
  } catch(e) { console.error('Dashboard error:', e); }
}

// ═══════════════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════════════
function _setupAccounts() {
  document.getElementById('btn-new-account').addEventListener('click', () => _openAccountModal());
  document.getElementById('btn-save-account').addEventListener('click', _saveAccountHandler);
}

async function renderAccounts() {
  try {
    const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);
    const container = document.getElementById('accounts-list');
    container.innerHTML = '';
    if (!accounts.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>No accounts yet — create one to start</p></div>`;
      return;
    }
    const sorted = [...accounts].sort((a,b) => a.name.localeCompare(b.name));
    let serial = 1;
    for (const acc of sorted) {
      const bal    = await computeBalance(acc.id, vouchers);
      const pinned = _isPinned(acc.id);
      const el = document.createElement('div');
      el.className = 'acc-row';
      el.innerHTML = `
        <div class="acc-sn">${serial++}</div>
        <div class="acc-left">
          <div class="acc-name">${_esc(acc.name)}</div>
          <div class="acc-date">Since ${_fmtDate(acc.createdAt?.split('T')[0])}</div>
        </div>
        <div class="acc-right">
          <div class="acc-bal-wrap">
            <div class="acc-bal-lbl">Balance</div>
            <div class="acc-bal ${bal < 0 ? 'neg' : ''}">${_fmtSigned(bal)}</div>
          </div>
          <div class="acc-actions">
            <button class="ic-btn pin-btn ${pinned ? 'pinned' : ''}" data-pin="${_esc(acc.id)}" title="${pinned ? 'Unpin' : 'Pin to Dashboard'}">
              <svg width="13" height="13"><use href="#ic-pin"/></svg>
            </button>
            <button class="ic-btn" data-edit="${_esc(acc.id)}" title="Edit">
              <svg width="13" height="13"><use href="#ic-edit"/></svg>
            </button>
            <button class="ic-btn del" data-del="${_esc(acc.id)}" title="Delete">
              <svg width="13" height="13"><use href="#ic-trash"/></svg>
            </button>
          </div>
        </div>`;
      container.appendChild(el);
    }
    container.querySelectorAll('[data-pin]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const id = b.dataset.pin;
      _togglePin(id);
      const now = _isPinned(id);
      b.classList.toggle('pinned', now);
      b.title = now ? 'Unpin' : 'Pin to Dashboard';
      showToast(now ? 'Pinned to dashboard' : 'Unpinned', 'success');
    }));
    container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => _openAccountModal(b.dataset.edit)));
    container.querySelectorAll('[data-del]').forEach(b  => b.addEventListener('click', () => _deleteAccountHandler(b.dataset.del)));
  } catch(e) { console.error('renderAccounts error:', e); showToast('Failed to load accounts', 'error'); }
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
  try {
    const accounts = await getAccounts();
    const dupe = accounts.find(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingAccountId);
    if (dupe) { showToast('An account with this name already exists', 'error'); return; }
    const acc = {
      id: editingAccountId || null,
      name,
      openingBalance: parseFloat(document.getElementById('acc-opening').value) || 0
    };
    await saveAccount(acc);
    _closeModal('modal-account');
    showToast(editingAccountId ? 'Account updated' : 'Account created', 'success');
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
      _setPinnedIds(_getPinnedIds().filter(x => x !== id));
      showToast('Account deleted', 'success');
      renderAccounts();
      if (currentTab === 'dashboard') renderDashboard();
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
    _confirm('Reverse Voucher', 'This creates a counter-entry to cancel this voucher.', async () => {
      try {
        const rev = await reverseVoucher(viewingVoucherId);
        showToast(`Reversal voucher ${rev.id} created`, 'success');
        _closeModal('modal-voucher-view');
        renderVouchers();
        renderAccounts();
        if (currentTab === 'dashboard') renderDashboard();
      } catch(e) { showToast(e.message, 'error'); }
    });
  });
}

async function renderVouchers(search = '') {
  try {
    let vouchers = await getVouchers();
    vouchers = [...vouchers].sort((a,b) => b.date.localeCompare(a.date));
    if (search) {
      const s = search.toLowerCase();
      vouchers = vouchers.filter(v =>
        v.id.toLowerCase().includes(s) ||
        v.date.includes(s) ||
        (v.entries||[]).some(e => (e.narration||'').toLowerCase().includes(s)) ||
        (v.entries||[]).some(e => (e.accountId||'').toLowerCase().includes(s))
      );
    }
    const accounts = await getAccounts();
    const accMap   = Object.fromEntries(accounts.map(a => [a.id, a.name]));
    const container = document.getElementById('vouchers-list');
    container.innerHTML = '';
    if (!vouchers.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">◻</div><p>${search ? 'No results found' : 'No vouchers yet'}</p></div>`;
      return;
    }
    vouchers.forEach((v, idx) => {
      const dr    = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
      const names = [...new Set((v.entries||[]).map(e => accMap[e.accountId] || e.accountId))].slice(0,3).join(', ');
      const narr  = (v.entries||[]).find(e => e.narration)?.narration || '';
      let badge = '';
      if (v.reversed)               badge = `<span class="vou-badge badge-reversed">Reversed</span>`;
      else if (v.isReversal)        badge = `<span class="vou-badge badge-reversal">Reversal</span>`;
      else if (v.locked)            badge = `<span class="vou-badge badge-locked">Locked</span>`;
      const el = document.createElement('div');
      el.className = 'vou-row';
      el.innerHTML = `
        <div class="vou-sn">${idx + 1}</div>
        <div class="vou-left">
          <div class="vou-id">${_esc(v.id)}</div>
          <div class="vou-summary">${_esc(names)}</div>
          ${narr ? `<div class="vou-narr">${_esc(narr)}</div>` : ''}
          <div class="vou-date">${_fmtDate(v.date)}</div>
        </div>
        <div class="vou-right">${badge}<span class="vou-amt">${_fmt(dr)}</span></div>`;
      el.addEventListener('click', () => openVoucherView(v.id));
      container.appendChild(el);
    });
  } catch(e) { console.error('renderVouchers error:', e); showToast('Failed to load transactions', 'error'); }
}

async function openVoucherModal(id = null) {
  editingVoucherId = id;
  document.getElementById('modal-voucher-title').textContent = id ? 'Edit Voucher' : 'New Voucher';
  document.getElementById('voucher-entries').innerHTML = '';

  const dateEl = document.getElementById('v-date');
  const idEl   = document.getElementById('v-id');
  dateEl.value = new Date().toISOString().split('T')[0];
  idEl.value   = '';
  idEl.readOnly = !!id;  // lock ID when editing existing voucher

  if (id) {
    const v = await getVoucher(id);
    if (v) {
      idEl.value   = v.id;
      dateEl.value = v.date;
      for (const e of (v.entries||[])) await _addEntryRow(e);
    }
  } else {
    await _addEntryRow();
    await _addEntryRow();
  }
  _updateTotals();
  _openModal('modal-voucher');
}

// ── Account combo: type name OR pick from datalist ────────
async function _addEntryRow(prefill = null) {
  const accounts = await getAccounts();
  const container = document.getElementById('voucher-entries');
  const row = document.createElement('div');
  row.className = 'entry-row';

  const dlId   = 'dl-' + Math.random().toString(36).slice(2, 9);
  const dlOpts = [...accounts].sort((a,b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${_esc(a.name)}"></option>`).join('');

  row.innerHTML = `
    <div class="acc-combo">
      <input class="e-acc-text" type="text" placeholder="Account…" autocomplete="off" list="${dlId}" />
      <datalist id="${dlId}">${dlOpts}</datalist>
      <input class="e-acc" type="hidden" value="" />
    </div>
    <input class="e-narr" type="text" placeholder="Narration" autocomplete="off" />
    <input class="e-dr"   type="number" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <input class="e-cr"   type="number" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <button class="del-row" type="button" title="Remove row">
      <svg width="13" height="13"><use href="#ic-x"/></svg>
    </button>`;
  container.appendChild(row);

  const textInput = row.querySelector('.e-acc-text');
  const hiddenAcc = row.querySelector('.e-acc');

  function _resolveAcc() {
    const typed = textInput.value.trim().toLowerCase();
    const match = accounts.find(a => a.name.toLowerCase() === typed);
    hiddenAcc.value = match ? match.id : '';
    textInput.classList.toggle('acc-nomatch', typed.length > 0 && !match);
    _updateTotals();
  }
  textInput.addEventListener('input',  _resolveAcc);
  textInput.addEventListener('change', _resolveAcc);

  if (prefill) {
    const acc = accounts.find(a => a.id === (prefill.accountId || prefill.account));
    if (acc) { textInput.value = acc.name; hiddenAcc.value = acc.id; }
    row.querySelector('.e-narr').value = prefill.narration || '';
    if (prefill.debit)  row.querySelector('.e-dr').value = prefill.debit;
    if (prefill.credit) row.querySelector('.e-cr').value = prefill.credit;
  }

  const fields = [textInput, row.querySelector('.e-narr'), row.querySelector('.e-dr'), row.querySelector('.e-cr')];
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
    f.addEventListener('input',  _updateTotals);
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
  document.getElementById('balance-check').textContent = balanced ? '✓ Balanced' : `✗ Diff: ${_n2(bal)}`;
  document.getElementById('balance-check-row').className = 'tot-row tot-status ' + (balanced ? 'ok' : 'err');
}

async function _saveVoucherHandler() {
  const date     = document.getElementById('v-date').value;
  const customId = document.getElementById('v-id').value.trim();
  if (!date) { showToast('Date is required', 'error'); return; }

  const entries = [];
  let hasAcc = false;
  const rows = document.querySelectorAll('#voucher-entries .entry-row');

  for (const r of rows) {
    const accountId = r.querySelector('.e-acc').value;
    const narration = r.querySelector('.e-narr').value.trim();
    const debit     = parseFloat(r.querySelector('.e-dr').value) || 0;
    const credit    = parseFloat(r.querySelector('.e-cr').value) || 0;

    if (accountId) hasAcc = true;
    if (!accountId && (debit !== 0 || credit !== 0)) {
      showToast('Every entry with amount must have an account', 'error');
      return;
    }

    if (accountId || debit !== 0 || credit !== 0) {
      entries.push({ accountId, narration, debit, credit });
    }
  }

  if (!hasAcc || entries.length < 2) {
    showToast('At least 2 entries with accounts required', 'error');
    return;
  }

  const { dr, cr } = _getTotals();
  if (Math.abs(dr - cr) > 0.001) {
    showToast('Voucher must be balanced (Debit = Credit)', 'error');
    return;
  }

  if (!editingVoucherId && customId) {
    const existing = await getVoucher(customId);
    if (existing) {
      showToast('Voucher ID already exists', 'error');
      return;
    }
  }

  try {
    const v = {
      id: editingVoucherId || (customId || null),
      date, entries, locked: true
    };
    const saved = await saveVoucher(v);
    _closeModal('modal-voucher');
    showToast(editingVoucherId ? 'Voucher updated' : `${saved.id} saved`, 'success');
    renderVouchers();
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
  const accMap   = Object.fromEntries(accounts.map(a => [a.id, a.name]));

  document.getElementById('modal-vview-title').textContent = `Voucher ${v.id}`;

  let statusTxt = 'Locked';
  if (v.reversed)   statusTxt = `Reversed → ${v.reversedBy}`;
  if (v.isReversal) statusTxt = `Reversal of ${v.reversalOf}`;

  const tBodyRows = (v.entries||[]).map(e => `
    <tr>
      <td>${_esc(accMap[e.accountId] || e.accountId)}</td>
      <td>${_esc(e.narration || '—')}</td>
      <td class="vv-num">${e.debit  ? _fmt(e.debit)  : ''}</td>
      <td class="vv-num">${e.credit ? _fmt(e.credit) : ''}</td>
    </tr>`).join('');

  const dr = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.debit)||0), 0);
  const cr = (v.entries||[]).reduce((s,e) => s + (parseFloat(e.credit)||0), 0);

  document.getElementById('modal-vview-body').innerHTML = `
    <div class="vv-meta">
      <div class="vv-field"><span>Voucher ID</span><strong class="vv-id">${_esc(v.id)}</strong></div>
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

  document.getElementById('btn-vview-edit').style.display    = (v.reversed || v.isReversal) ? 'none' : '';
  document.getElementById('btn-vview-reverse').style.display = v.reversed ? 'none' : '';
  _openModal('modal-voucher-view');
}

// ═══════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════
function _setupReports() {
  document.getElementById('btn-generate-report').addEventListener('click', _generateReport);
  document.getElementById('btn-print-report').addEventListener('click', _printReport);

  // Report account combo: resolve typed name → ID
  const textEl   = document.getElementById('report-account-text');
  const hiddenEl = document.getElementById('report-account');
  if (textEl && hiddenEl) {
    textEl.addEventListener('input',  _resolveReportAccount);
    textEl.addEventListener('change', _resolveReportAccount);
  }

  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('report-from').value = `${y}-${m}-01`;
  document.getElementById('report-to').value   = now.toISOString().split('T')[0];
}

let _reportAccounts = [];
async function _populateReportAccounts() {
  _reportAccounts = await getAccounts();
  const dl = document.getElementById('report-account-dl');
  if (!dl) return;
  dl.innerHTML = _reportAccounts
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(a => `<option value="${_esc(a.name)}"></option>`)
    .join('');
  // Restore previous selection if any
  const hiddenEl = document.getElementById('report-account');
  const textEl   = document.getElementById('report-account-text');
  if (hiddenEl.value && textEl) {
    const acc = _reportAccounts.find(a => a.id === hiddenEl.value);
    if (acc) textEl.value = acc.name;
  }
}

function _resolveReportAccount() {
  const textEl   = document.getElementById('report-account-text');
  const hiddenEl = document.getElementById('report-account');
  const typed = textEl.value.trim().toLowerCase();
  const match = _reportAccounts.find(a => a.name.toLowerCase() === typed);
  hiddenEl.value = match ? match.id : '';
  textEl.classList.toggle('acc-nomatch', typed.length > 0 && !match);
}

async function _generateReport() {
  _resolveReportAccount();
  const accountId = document.getElementById('report-account').value;
  const from      = document.getElementById('report-from').value;
  const to        = document.getElementById('report-to').value;
  if (!accountId) { showToast('Select or type an account name', 'error'); return; }

  try {
    const data = await getAccountLedger(accountId, from, to);
    if (!data) { showToast('Account not found', 'error'); return; }

    const tRows = data.rows.map((r, i) => `
      <tr>
        <td class="sn-col">${i + 1}</td>
        <td>${_fmtDate(r.date)}</td>
        <td class="vid">${_esc(r.voucherId)}</td>
        <td>${_esc(r.narration)}</td>
        <td class="num dr">${r.debit  ? _fmt(r.debit)  : ''}</td>
        <td class="num cr">${r.credit ? _fmt(r.credit) : ''}</td>
        <td class="num bl">${_fmtSigned(r.balance)}</td>
      </tr>`).join('');

    document.getElementById('report-output').innerHTML = `
      <div id="printable-report">
        <div class="report-meta">
          <div class="report-meta-item"><span>Account</span><strong>${_esc(data.account.name)}</strong></div>
          <div class="report-meta-item"><span>Period</span><strong>${from ? _fmtDate(from) : 'All'} — ${to ? _fmtDate(to) : 'All'}</strong></div>
          <div class="report-meta-item"><span>Opening Balance</span><strong>${_fmtSigned(data.openingBalance)}</strong></div>
          <div class="report-meta-item"><span>Closing Balance</span><strong>${_fmtSigned(data.closingBalance)}</strong></div>
        </div>
        <div class="card report-table-wrap" style="padding:0;overflow:hidden">
          <table class="rtable">
            <thead><tr>
              <th class="sn-col">#</th>
              <th>Date</th><th>Voucher</th><th>Narration</th>
              <th style="text-align:right">Debit</th>
              <th style="text-align:right">Credit</th>
              <th style="text-align:right">Balance</th>
            </tr></thead>
            <tbody>
              <tr class="opening-row">
                <td></td>
                <td colspan="5" style="color:var(--t2);font-style:italic">Opening Balance</td>
                <td class="num bl">${_fmtSigned(data.openingBalance)}</td>
              </tr>
              ${tRows || '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--t3)">No transactions in this period</td></tr>'}
            </tbody>
            <tfoot><tr>
              <td colspan="4">Totals</td>
              <td class="num dr">${_fmt(data.totalDebit)}</td>
              <td class="num cr">${_fmt(data.totalCredit)}</td>
              <td class="num bl">${_fmtSigned(data.closingBalance)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>`;
  } catch(e) { showToast('Error generating report: ' + e.message, 'error'); }
}

function _printReport() {
  const el = document.getElementById('printable-report');
  if (!el) { showToast('Generate a report first', 'error'); return; }
  if (typeof html2pdf !== 'undefined') {
    const accName = document.getElementById('report-account-text')?.value || 'Ledger';
    html2pdf().set({
      margin: [10,10,10,10],
      filename: `Ledger_${accName}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  } else {
    window.print();
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
  document.getElementById('btn-logout').addEventListener('click', () => {
    _confirm('Sign Out', 'Sign out of your account?', logout);
  });
}

// ── DOM ready ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { initAuth(); });
