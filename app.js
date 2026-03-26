// =====================================================
// app.js — Main Application Logic for Ledger
// =====================================================

let currentTab = 'dashboard';
let editingAccountId = null;
let editingVoucherId = null;
let viewingVoucherId = null;
let confirmCallback = null;
let currency = '$';

// =====================================================
// INIT
// =====================================================
async function onAppStart() {
  await initDB();
  currency = localStorage.getItem(CURRENCY_KEY) || '$';
  applyTheme();
  setupNavigation();
  setupModals();
  setupDashboard();
  setupAccounts();
  setupTransactions();
  setupReports();
  setupBackup();
  setupSettings();
  switchTab('dashboard');
  // Update today's date
  document.getElementById('today-date').textContent = formatDate(new Date().toISOString().split('T')[0]);
}

// =====================================================
// THEME
// =====================================================
function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) toggle.checked = (saved === 'dark');
}

// =====================================================
// NAVIGATION
// =====================================================
function setupNavigation() {
  document.querySelectorAll('.nav-item, .bnav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('tab-' + tab);
  if (pane) pane.classList.add('active');
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
  // Refresh data on tab switch
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'accounts') renderAccounts();
  if (tab === 'transactions') renderVouchers();
  if (tab === 'reports') populateReportAccounts();
  if (tab === 'backup') renderAuditLog();
  if (tab === 'settings') {
    document.getElementById('currency-symbol').value = currency;
  }
}

// =====================================================
// MODALS
// =====================================================
function setupModals() {
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    if (btn.classList.contains('modal-close') || btn.dataset.modal) {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        if (modalId) closeModal(modalId);
      });
    }
  });
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeAllModals();
  });
}

function openModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  const anyVisible = Array.from(document.querySelectorAll('.modal'))
    .some(m => m.style.display === 'flex');
  if (!anyVisible) document.getElementById('modal-overlay').classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCallback = onOk;
  openModal('modal-confirm');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirm-ok').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (confirmCallback) confirmCallback();
  });
  document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('modal-confirm'));
});

// =====================================================
// TOAST
// =====================================================
let toastTimer = null;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// =====================================================
// FORMATTERS
// =====================================================
function fmt(n) {
  const num = parseFloat(n) || 0;
  return currency + ' ' + Math.abs(num).toFixed(2);
}

function fmtSigned(n) {
  const num = parseFloat(n) || 0;
  const prefix = num < 0 ? '-' : '';
  return prefix + currency + ' ' + Math.abs(num).toFixed(2);
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

// =====================================================
// DASHBOARD
// =====================================================
function setupDashboard() {
  renderDashboard();
}

async function renderDashboard() {
  try {
    const [accounts, vouchers] = await Promise.all([getAccounts(), getVouchers()]);
    // Net balance = sum of all account balances
    let netBal = 0;
    for (const a of accounts) {
      netBal += await getAccountBalance(a.id);
    }
    document.getElementById('dash-net-balance').textContent = fmtSigned(netBal);
    document.getElementById('dash-accounts').textContent = accounts.length;
    document.getElementById('dash-vouchers').textContent = vouchers.length;

    // Recent vouchers (last 8)
    const sorted = [...vouchers].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const container = document.getElementById('dash-recent');
    container.innerHTML = '';
    if (!sorted.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">◫</div><p>No transactions yet</p></div>`;
      return;
    }
    for (const v of sorted) {
      const totalDebit = (v.entries || []).reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
      const firstNarr = (v.entries || []).find(e => e.narration)?.narration || '';
      const el = document.createElement('div');
      el.className = 'recent-item';
      el.innerHTML = `
        <div class="recent-meta">
          <span class="recent-id">${v.id}</span>
          <span class="recent-narr">${firstNarr || '—'}</span>
          <span class="recent-date">${formatDate(v.date)}</span>
        </div>
        <span class="recent-amount">${fmt(totalDebit)}</span>
      `;
      el.addEventListener('click', () => openVoucherView(v.id));
      container.appendChild(el);
    }
  } catch (e) { console.error(e); }
}

// =====================================================
// ACCOUNTS
// =====================================================
function setupAccounts() {
  document.getElementById('btn-new-account').addEventListener('click', () => openAccountModal());
  document.getElementById('btn-save-account').addEventListener('click', saveAccountHandler);
}

async function renderAccounts() {
  const accounts = await getAccounts();
  const container = document.getElementById('accounts-list');
  container.innerHTML = '';
  if (!accounts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">◉</div><p>No accounts yet. Create one to get started.</p></div>`;
    return;
  }
  const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name));
  for (const acc of sorted) {
    const bal = await getAccountBalance(acc.id);
    const el = document.createElement('div');
    el.className = 'account-item';
    el.innerHTML = `
      <div class="account-info">
        <span class="account-id">${acc.id}</span>
        <span class="account-name">${escHtml(acc.name)}</span>
        <span class="account-created">${formatDate(acc.createdAt?.split('T')[0])}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="account-balance">
          <div class="bal-label">Balance</div>
          <div>${fmtSigned(bal)}</div>
        </div>
        <div class="account-actions">
          <button class="btn-icon" data-edit="${acc.id}" title="Edit">✎</button>
          <button class="btn-icon danger" data-del="${acc.id}" title="Delete">✕</button>
        </div>
      </div>
    `;
    container.appendChild(el);
  }
  container.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openAccountModal(btn.dataset.edit));
  });
  container.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteAccountHandler(btn.dataset.del));
  });
}

function openAccountModal(id = null) {
  editingAccountId = id;
  document.getElementById('modal-account-title').textContent = id ? 'Edit Account' : 'New Account';
  document.getElementById('acc-name').value = '';
  document.getElementById('acc-opening').value = '';
  document.getElementById('acc-opening-type').value = 'debit';
  if (id) {
    getAccount(id).then(acc => {
      if (!acc) return;
      document.getElementById('acc-name').value = acc.name;
      document.getElementById('acc-opening').value = acc.openingBalance || '';
      document.getElementById('acc-opening-type').value = acc.openingType || 'debit';
    });
  }
  openModal('modal-account');
  setTimeout(() => document.getElementById('acc-name').focus(), 100);
}

async function saveAccountHandler() {
  const name = document.getElementById('acc-name').value.trim();
  if (!name) { showToast('Account name is required', 'error'); return; }
  // Check duplicate
  const accounts = await getAccounts();
  const dupe = accounts.find(a => a.name.toLowerCase() === name.toLowerCase() && a.id !== editingAccountId);
  if (dupe) { showToast('Account name already exists', 'error'); return; }

  const acc = {
    id: editingAccountId || null,
    name,
    openingBalance: parseFloat(document.getElementById('acc-opening').value) || 0,
    openingType: document.getElementById('acc-opening-type').value
  };
  try {
    await saveAccount(acc);
    closeModal('modal-account');
    showToast(editingAccountId ? 'Account updated' : 'Account created', 'success');
    renderAccounts();
    editingAccountId = null;
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteAccountHandler(id) {
  const acc = await getAccount(id);
  showConfirm('Delete Account', `Delete "${acc?.name}"? This cannot be undone.`, async () => {
    try {
      await deleteAccount(id);
      showToast('Account deleted', 'success');
      renderAccounts();
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// =====================================================
// TRANSACTIONS / VOUCHERS
// =====================================================
function setupTransactions() {
  document.getElementById('btn-new-voucher').addEventListener('click', () => openVoucherModal());
  document.getElementById('btn-save-voucher').addEventListener('click', saveVoucherHandler);
  document.getElementById('btn-add-row').addEventListener('click', addVoucherRow);
  document.getElementById('voucher-search').addEventListener('input', (e) => renderVouchers(e.target.value));
  document.getElementById('btn-vview-edit').addEventListener('click', () => {
    closeModal('modal-voucher-view');
    if (viewingVoucherId) openVoucherModal(viewingVoucherId);
  });
  document.getElementById('btn-vview-reverse').addEventListener('click', async () => {
    if (!viewingVoucherId) return;
    showConfirm('Reverse Voucher', 'Create a reversal entry for this voucher?', async () => {
      try {
        const rev = await reverseVoucher(viewingVoucherId);
        showToast(`Reversal voucher ${rev.id} created`, 'success');
        closeModal('modal-voucher-view');
        renderVouchers();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

async function renderVouchers(search = '') {
  let vouchers = await getVouchers();
  vouchers = [...vouchers].sort((a, b) => b.date.localeCompare(a.date));
  if (search) {
    const s = search.toLowerCase();
    vouchers = vouchers.filter(v =>
      v.id.toLowerCase().includes(s) ||
      v.date.includes(s) ||
      (v.entries || []).some(e => (e.narration || '').toLowerCase().includes(s))
    );
  }
  const container = document.getElementById('vouchers-list');
  container.innerHTML = '';
  if (!vouchers.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">◧</div><p>${search ? 'No results found' : 'No vouchers yet'}</p></div>`;
    return;
  }
  const accounts = await getAccounts();
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  for (const v of vouchers) {
    const total = (v.entries || []).reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
    const names = [...new Set((v.entries || []).map(e => accMap[e.accountId] || e.accountId))].join(', ');
    let badge = '';
    if (v.locked && !v.reversed && !v.isReversal) badge = `<span class="voucher-badge badge-locked">locked</span>`;
    if (v.reversed) badge = `<span class="voucher-badge badge-reversed">reversed</span>`;
    if (v.isReversal) badge = `<span class="voucher-badge badge-reversal">reversal</span>`;
    const el = document.createElement('div');
    el.className = `voucher-item${v.locked ? ' locked' : ''}`;
    el.innerHTML = `
      <div class="voucher-info">
        <div class="voucher-id-badge">${v.id}</div>
        <div class="voucher-summary">${escHtml(names)}</div>
        <div class="voucher-date">${formatDate(v.date)}</div>
      </div>
      <div class="voucher-right">
        ${badge}
        <span class="voucher-total">${fmt(total)}</span>
      </div>
    `;
    el.addEventListener('click', () => openVoucherView(v.id));
    container.appendChild(el);
  }
}

async function openVoucherModal(id = null) {
  editingVoucherId = id;
  document.getElementById('modal-voucher-title').textContent = id ? 'Edit Voucher' : 'New Voucher';
  document.getElementById('voucher-entries').innerHTML = '';
  // Set defaults
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('v-date').value = today;
  document.getElementById('v-id').value = '';

  if (id) {
    const v = await getVoucher(id);
    if (v) {
      document.getElementById('v-id').value = v.id;
      document.getElementById('v-date').value = v.date;
      for (const e of (v.entries || [])) {
        await addVoucherRow(null, e);
      }
    }
  } else {
    // Start with 2 empty rows
    await addVoucherRow();
    await addVoucherRow();
  }
  updateVoucherTotals();
  openModal('modal-voucher');
  document.getElementById('voucher-entries').querySelector('select')?.focus();
}

async function addVoucherRow(e = null, prefill = null) {
  const accounts = await getAccounts();
  const container = document.getElementById('voucher-entries');
  const row = document.createElement('div');
  row.className = 'voucher-entry-row';

  const opts = accounts.map(a => `<option value="${a.id}">${escHtml(a.name)}</option>`).join('');

  row.innerHTML = `
    <select class="entry-account">
      <option value="">— Select —</option>
      ${opts}
    </select>
    <input type="text" class="entry-narr" placeholder="Narration" />
    <input type="number" class="entry-debit" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <input type="number" class="entry-credit" placeholder="0.00" step="0.01" inputmode="decimal" min="0" />
    <button class="del-row" type="button">✕</button>
  `;
  container.appendChild(row);

  if (prefill) {
    row.querySelector('.entry-account').value = prefill.accountId || '';
    row.querySelector('.entry-narr').value = prefill.narration || '';
    if (prefill.debit) row.querySelector('.entry-debit').value = prefill.debit;
    if (prefill.credit) row.querySelector('.entry-credit').value = prefill.credit;
  }

  // Keyboard navigation: Enter moves to next field
  row.querySelectorAll('input, select').forEach((field, i, all) => {
    field.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const next = all[i + 1];
        if (next) next.focus();
        else {
          // Check if balanced; if not, add row
          const { debit, credit } = getVoucherTotals();
          if (Math.abs(debit - credit) > 0.001) addVoucherRow();
          else document.getElementById('btn-save-voucher').focus();
        }
      }
    });
    field.addEventListener('input', updateVoucherTotals);
    field.addEventListener('change', updateVoucherTotals);
  });

  row.querySelector('.del-row').addEventListener('click', () => {
    if (container.children.length > 1) {
      row.remove();
      updateVoucherTotals();
    }
  });
}

function getVoucherTotals() {
  let debit = 0, credit = 0;
  document.querySelectorAll('#voucher-entries .voucher-entry-row').forEach(row => {
    debit += parseFloat(row.querySelector('.entry-debit').value) || 0;
    credit += parseFloat(row.querySelector('.entry-credit').value) || 0;
  });
  return { debit, credit };
}

function updateVoucherTotals() {
  const { debit, credit } = getVoucherTotals();
  document.getElementById('total-debit').textContent = debit.toFixed(2);
  document.getElementById('total-credit').textContent = credit.toFixed(2);
  const balanced = Math.abs(debit - credit) < 0.001;
  const checkEl = document.getElementById('balance-check');
  const rowEl = document.getElementById('balance-check-row');
  checkEl.textContent = balanced ? '✓ Balanced' : `✗ Diff: ${Math.abs(debit - credit).toFixed(2)}`;
  rowEl.className = 'total-row balance-row ' + (balanced ? 'balanced' : 'unbalanced');
}

async function saveVoucherHandler() {
  const date = document.getElementById('v-date').value;
  if (!date) { showToast('Date is required', 'error'); return; }

  const entries = [];
  let hasAccount = false;
  document.querySelectorAll('#voucher-entries .voucher-entry-row').forEach(row => {
    const accountId = row.querySelector('.entry-account').value;
    const narration = row.querySelector('.entry-narr').value.trim();
    const debit = parseFloat(row.querySelector('.entry-debit').value) || 0;
    const credit = parseFloat(row.querySelector('.entry-credit').value) || 0;
    if (accountId) hasAccount = true;
    if (accountId || debit || credit) {
      entries.push({ accountId, narration, debit: debit || 0, credit: credit || 0 });
    }
  });

  if (!hasAccount) { showToast('At least one account must be selected', 'error'); return; }
  if (entries.length < 2) { showToast('At least two entries required', 'error'); return; }

  const { debit, credit } = getVoucherTotals();
  if (Math.abs(debit - credit) > 0.001) {
    showToast('Voucher is not balanced. Debit must equal Credit.', 'error');
    return;
  }

  const voucher = {
    id: editingVoucherId || null,
    date,
    entries,
    locked: true
  };

  try {
    const saved = await saveVoucher(voucher);
    closeModal('modal-voucher');
    showToast(editingVoucherId ? 'Voucher updated' : `Voucher ${saved.id} saved`, 'success');
    renderVouchers();
    editingVoucherId = null;
  } catch (e) { showToast(e.message, 'error'); }
}

async function openVoucherView(id) {
  viewingVoucherId = id;
  const v = await getVoucher(id);
  if (!v) return;
  const accounts = await getAccounts();
  const accMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));

  document.getElementById('modal-vview-title').textContent = `Voucher ${v.id}`;
  let statusBadge = '';
  if (v.reversed) statusBadge = `<span class="voucher-badge badge-reversed" style="margin-left:8px">reversed</span>`;
  if (v.isReversal) statusBadge = `<span class="voucher-badge badge-reversal" style="margin-left:8px">reversal of ${v.reversalOf}</span>`;

  const rows = (v.entries || []).map(e => `
    <tr>
      <td>${escHtml(accMap[e.accountId] || e.accountId)}</td>
      <td>${escHtml(e.narration || '—')}</td>
      <td class="num">${e.debit ? fmt(e.debit) : ''}</td>
      <td class="num">${e.credit ? fmt(e.credit) : ''}</td>
    </tr>
  `).join('');

  const totalDebit = (v.entries || []).reduce((s, e) => s + (parseFloat(e.debit) || 0), 0);
  const totalCredit = (v.entries || []).reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);

  document.getElementById('modal-vview-body').innerHTML = `
    <div class="vview-header">
      <div class="vview-field"><span>Voucher ID</span><strong class="vview-id">${v.id}</strong></div>
      <div class="vview-field"><span>Date</span><strong>${formatDate(v.date)}</strong></div>
      <div class="vview-field"><span>Status</span><strong>${v.locked ? 'Locked' : 'Draft'}${statusBadge}</strong></div>
    </div>
    <div style="overflow-x:auto">
      <table class="vview-table">
        <thead><tr>
          <th>Account</th><th>Narration</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="font-weight:600;background:var(--bg3)">
          <td colspan="2">Total</td>
          <td class="num">${fmt(totalDebit)}</td>
          <td class="num">${fmt(totalCredit)}</td>
        </tr></tfoot>
      </table>
    </div>
  `;

  // Hide edit/reverse if already reversed or is a reversal
  document.getElementById('btn-vview-edit').style.display = v.reversed || v.isReversal ? 'none' : '';
  document.getElementById('btn-vview-reverse').style.display = v.reversed ? 'none' : '';
  openModal('modal-voucher-view');
}

// =====================================================
// REPORTS
// =====================================================
function setupReports() {
  document.getElementById('btn-generate-report').addEventListener('click', generateReport);
  document.getElementById('btn-print-report').addEventListener('click', printReport);
  // Set default date range to current month
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
  document.getElementById('report-from').value = `${y}-${m}-01`;
  document.getElementById('report-to').value = now.toISOString().split('T')[0];
}

async function populateReportAccounts() {
  const accounts = await getAccounts();
  const sel = document.getElementById('report-account');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select Account —</option>';
  accounts.sort((a,b) => a.name.localeCompare(b.name)).forEach(a => {
    sel.innerHTML += `<option value="${a.id}">${escHtml(a.name)} (${a.id})</option>`;
  });
  if (cur) sel.value = cur;
}

async function generateReport() {
  const accountId = document.getElementById('report-account').value;
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;

  if (!accountId) { showToast('Please select an account', 'error'); return; }

  const data = await getAccountLedger(accountId, from, to);
  if (!data) { showToast('Account not found', 'error'); return; }

  const output = document.getElementById('report-output');
  const rows = data.rows.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--accent)">${r.voucherId}</td>
      <td>${escHtml(r.narration)}</td>
      <td class="num debit-col">${r.debit ? fmt(r.debit) : ''}</td>
      <td class="num credit-col">${r.credit ? fmt(r.credit) : ''}</td>
      <td class="num bal-col">${fmtSigned(r.balance)}</td>
    </tr>
  `).join('');

  output.innerHTML = `
    <div id="printable-report">
      <div class="report-header-info">
        <div><span>Account</span><strong>${escHtml(data.account.name)} (${data.account.id})</strong></div>
        <div><span>Period</span><strong>${from ? formatDate(from) : 'All'} — ${to ? formatDate(to) : 'All'}</strong></div>
        <div><span>Opening Balance</span><strong>${fmtSigned(data.openingBalance)}</strong></div>
        <div><span>Closing Balance</span><strong>${fmtSigned(data.closingBalance)}</strong></div>
      </div>
      <div class="report-table-wrap card" style="padding:0;overflow:hidden">
        <table class="report-table">
          <thead><tr>
            <th>Date</th><th>Voucher</th><th>Narration</th>
            <th style="text-align:right">Debit</th>
            <th style="text-align:right">Credit</th>
            <th style="text-align:right">Balance</th>
          </tr></thead>
          <tbody>
            <tr style="font-style:italic;color:var(--text-muted)">
              <td colspan="5">Opening Balance</td>
              <td class="num bal-col">${fmtSigned(data.openingBalance)}</td>
            </tr>
            ${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim)">No transactions in this period</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="3">Totals</td>
              <td class="num debit-col">${fmt(data.totalDebit)}</td>
              <td class="num credit-col">${fmt(data.totalCredit)}</td>
              <td class="num bal-col">${fmtSigned(data.closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

async function printReport() {
  const printable = document.getElementById('printable-report');
  if (!printable) { showToast('Generate a report first', 'error'); return; }

  // Use html2pdf if available, otherwise print
  if (typeof html2pdf !== 'undefined') {
    const account = document.getElementById('report-account');
    const accName = account.options[account.selectedIndex]?.text || 'Ledger';
    html2pdf().set({
      margin: 12,
      filename: `Ledger_${accName}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(printable).save();
  } else {
    window.print();
  }
}

// =====================================================
// BACKUP
// =====================================================
function setupBackup() {
  document.getElementById('btn-export').addEventListener('click', exportBackup);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', importBackup);
  renderLastBackup();
}

function renderLastBackup() {
  const last = localStorage.getItem(BACKUP_KEY);
  const el = document.getElementById('last-backup-info');
  if (el) el.textContent = last ? `Last backup: ${formatDate(last.split('T')[0])}` : 'Last backup: Never';
}

async function exportBackup() {
  try {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ledger_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    renderLastBackup();
    showToast('Backup exported successfully', 'success');
  } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
}

async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const mode = document.querySelector('input[name="import-mode"]:checked').value;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    showConfirm(
      'Import Data',
      `${mode === 'replace' ? 'Replace ALL data' : 'Merge'} with ${data.accounts?.length || 0} accounts and ${data.vouchers?.length || 0} vouchers?`,
      async () => {
        try {
          await importData(data, mode);
          showToast('Data imported successfully', 'success');
          renderAuditLog();
          if (currentTab !== 'backup') switchTab('dashboard');
        } catch (err) { showToast('Import failed: ' + err.message, 'error'); }
      }
    );
  } catch (err) { showToast('Invalid JSON file', 'error'); }
  e.target.value = '';
}

async function renderAuditLog() {
  const log = await getAuditLog();
  const container = document.getElementById('audit-log-list');
  container.innerHTML = '';
  if (!log.length) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px 0">No audit entries yet</div>';
    return;
  }
  for (const entry of log) {
    const el = document.createElement('div');
    el.className = 'audit-item';
    const d = new Date(entry.timestamp);
    const time = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    el.innerHTML = `<span class="audit-time">${time}</span><span class="audit-msg">${escHtml(entry.message)}</span>`;
    container.appendChild(el);
  }
}

// =====================================================
// SETTINGS
// =====================================================
function setupSettings() {
  document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, theme);
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  });

  document.getElementById('btn-save-currency').addEventListener('click', () => {
    const sym = document.getElementById('currency-symbol').value.trim() || '$';
    currency = sym;
    localStorage.setItem(CURRENCY_KEY, sym);
    showToast('Currency symbol saved', 'success');
  });

  document.getElementById('btn-change-pin').addEventListener('click', () => {
    lockApp();
    pinMode = 'change';
    setPinSubtitle('Enter current PIN');
  });

  document.getElementById('btn-clear-all').addEventListener('click', () => {
    showConfirm('Clear All Data', 'This will permanently delete ALL accounts, vouchers, and data. Are you absolutely sure?', async () => {
      await storeClear('accounts');
      await storeClear('vouchers');
      await storeClear('metadata');
      await storeClear('audit');
      localStorage.removeItem(BACKUP_KEY);
      showToast('All data cleared', 'success');
      renderDashboard();
    });
  });
}

// =====================================================
// UTILS
// =====================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================
// BOOT
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
  initAuth();
  // If no PIN set yet, app will show setup flow first
  // If PIN set, user must enter it
  // Auto-start if no PIN stored (first time, will go through setup)
});
