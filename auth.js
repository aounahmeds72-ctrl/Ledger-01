// ═══════════════════════════════════════════════════════
// auth.js — PIN Authentication
// ═══════════════════════════════════════════════════════

const AUTH_KEY     = 'ledger_pin_hash';
const THEME_KEY    = 'ledger_theme';
const CURRENCY_KEY = 'ledger_currency';
const BACKUP_KEY   = 'ledger_last_backup';

async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin + 'ldgr_salt_v2');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const getHash   = ()  => localStorage.getItem(AUTH_KEY);
const setHash   = h   => localStorage.setItem(AUTH_KEY, h);
const isPinSet  = ()  => !!getHash();

// ── State ────────────────────────────────────────────────
let _buf = '';
let _mode = 'verify'; // verify | setup | setup-confirm | change | change-new | change-confirm
let _first = '';

// ── DOM Helpers ──────────────────────────────────────────
const $id = id => document.getElementById(id);

function _setDots(n) {
  $id('pin-dots').querySelectorAll('span').forEach((s, i) => s.classList.toggle('filled', i < n));
}
function _setSubtitle(t)  { $id('pin-subtitle').textContent = t; }
function _setError(t) {
  const el = $id('pin-error');
  el.textContent = t;
  if (t) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
    setTimeout(() => { el.textContent = ''; }, 2200);
  }
}
function _setHint(t)  { $id('pin-hint').textContent = t; }
function _clearBuf()  { _buf = ''; _setDots(0); }

// ── PIN handling ─────────────────────────────────────────
async function _handleOK() {
  if (_buf.length < 4) { _setError('Enter 4 digits'); return; }
  const h = await hashPin(_buf);

  if (_mode === 'verify') {
    if (h === getHash()) { _clearBuf(); _enterApp(); }
    else { _setError('Incorrect PIN'); _clearBuf(); }

  } else if (_mode === 'setup') {
    _first = _buf; _clearBuf();
    _mode = 'setup-confirm';
    _setSubtitle('Confirm your PIN');
    _setHint('Enter the same PIN again');

  } else if (_mode === 'setup-confirm') {
    if (_buf === _first) { setHash(h); _clearBuf(); _enterApp(); }
    else {
      _setError('PINs do not match'); _clearBuf();
      _mode = 'setup'; _setSubtitle('Create a 4-digit PIN'); _setHint('');
    }

  } else if (_mode === 'change') {
    if (h === getHash()) { _clearBuf(); _mode = 'change-new'; _setSubtitle('Enter new PIN'); _setHint(''); }
    else { _setError('Incorrect PIN'); _clearBuf(); }

  } else if (_mode === 'change-new') {
    _first = _buf; _clearBuf();
    _mode = 'change-confirm'; _setSubtitle('Confirm new PIN');

  } else if (_mode === 'change-confirm') {
    if (_buf === _first) { setHash(h); _clearBuf(); _setSubtitle('Enter your PIN'); _setHint(''); _enterApp(); }
    else { _setError('PINs do not match'); _clearBuf(); _mode = 'change-new'; _setSubtitle('Enter new PIN'); }
  }
}

function _enterApp() {
  const ps = $id('pin-screen');
  ps.classList.add('hidden');
  $id('app').classList.remove('hidden');
  if (typeof onAppStart === 'function') onAppStart();
}

function lockApp() {
  $id('app').classList.add('hidden');
  const ps = $id('pin-screen');
  ps.classList.remove('hidden');
  _mode = 'verify'; _clearBuf();
  _setSubtitle('Enter your PIN'); _setHint(''); _setError('');
}

// ── Init ─────────────────────────────────────────────────
function initAuth() {
  // Keypad clicks
  document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.val;
      if (v === 'clear') { if (_buf.length) { _buf = _buf.slice(0,-1); _setDots(_buf.length); } }
      else if (v === 'ok') { await _handleOK(); }
      else if (_buf.length < 4) { _buf += v; _setDots(_buf.length); }
    });
  });

  // Physical keyboard
  document.addEventListener('keydown', async e => {
    if (!$id('pin-screen').classList.contains('active') &&
        $id('pin-screen').style.display !== '' &&
        !$id('pin-screen').classList.contains('hidden')) {
      if (e.key >= '0' && e.key <= '9' && _buf.length < 4) {
        _buf += e.key; _setDots(_buf.length);
      } else if (e.key === 'Backspace') {
        if (_buf.length) { _buf = _buf.slice(0,-1); _setDots(_buf.length); }
      } else if (e.key === 'Enter') { await _handleOK(); }
    }
  });

  // Lock buttons
  $id('lock-btn-sidebar')?.addEventListener('click', lockApp);
  $id('lock-btn-top')?.addEventListener('click', lockApp);

  // Initial mode
  if (isPinSet()) {
    _mode = 'verify';
    _setSubtitle('Enter your PIN');
  } else {
    _mode = 'setup';
    _setSubtitle('Create a 4-digit PIN');
    _setHint('You\'ll use this PIN to access your data');
  }
}
