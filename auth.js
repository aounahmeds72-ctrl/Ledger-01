// ═══════════════════════════════════════════════════════
// auth.js — PIN Authentication + Security Question Reset
// ═══════════════════════════════════════════════════════

const AUTH_KEY     = 'ledger_pin_hash';
const SEC_ANS_KEY  = 'ledger_sec_ans';
const THEME_KEY    = 'ledger_theme';
const CURRENCY_KEY = 'ledger_currency';
const BACKUP_KEY   = 'ledger_last_backup';

async function _sha256(text) {
  const enc = new TextEncoder().encode(text + 'ldgr_salt_v2');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
const hashPin = _sha256;
async function hashAnswer(ans) {
  const enc = new TextEncoder().encode(ans.trim().toLowerCase() + 'ldgr_sec_v1');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

const getHash      = ()  => localStorage.getItem(AUTH_KEY);
const setHash      = h   => localStorage.setItem(AUTH_KEY, h);
const getSecAns    = ()  => localStorage.getItem(SEC_ANS_KEY);
const setSecAns    = h   => localStorage.setItem(SEC_ANS_KEY, h);
const isPinSet     = ()  => !!getHash();
const isSecAnsSet  = ()  => !!getSecAns();

// ── State ────────────────────────────────────────────────
let _buf  = '';
let _mode = 'verify';
// modes: verify | setup | setup-confirm | setup-sec
//        change | change-new | change-confirm
//        forgot-ans | forgot-new | forgot-confirm
let _first = '';

// ── DOM Helpers ──────────────────────────────────────────
const $id = id => document.getElementById(id);

function _setDots(n) {
  $id('pin-dots').querySelectorAll('span').forEach((s, i) => s.classList.toggle('filled', i < n));
}
function _setSubtitle(t) { $id('pin-subtitle').textContent = t; }
function _setError(t) {
  const el = $id('pin-error');
  el.textContent = t;
  if (t) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
    setTimeout(() => { el.textContent = ''; }, 2400);
  }
}
function _setHint(t) { $id('pin-hint').textContent = t; }
function _clearBuf() { _buf = ''; _setDots(0); }

// Show/hide keypad vs text-input panel
function _showKeypad() {
  $id('pin-keypad').style.display    = '';
  $id('pin-dots').style.display      = '';
  $id('pin-sec-wrap').style.display  = 'none';
}
function _showSecPanel(label, placeholder) {
  $id('pin-keypad').style.display    = 'none';
  $id('pin-dots').style.display      = 'none';
  $id('pin-sec-label').textContent   = label;
  $id('pin-sec-input').value         = '';
  $id('pin-sec-input').placeholder   = placeholder || 'Your answer…';
  $id('pin-sec-wrap').style.display  = '';
  setTimeout(() => $id('pin-sec-input').focus(), 80);
}

// ── Security question text submit ────────────────────────
async function _handleSecSubmit() {
  const val = $id('pin-sec-input').value.trim();
  if (!val) { _setError('Please enter an answer'); return; }

  if (_mode === 'setup-sec') {
    // Saving security answer after PIN setup
    const h = await hashAnswer(val);
    setSecAns(h);
    _showKeypad();
    _enterApp();

  } else if (_mode === 'forgot-ans') {
    // Verifying security answer
    const h = await hashAnswer(val);
    if (h === getSecAns()) {
      _mode = 'forgot-new';
      _clearBuf();
      _showKeypad();
      _setSubtitle('Enter new PIN');
      _setHint('Choose a new 4-digit PIN');
      _setError('');
    } else {
      _setError('Incorrect answer');
      $id('pin-sec-input').value = '';
    }
  }
}

// ── PIN keypad OK ────────────────────────────────────────
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
    if (_buf === _first) {
      setHash(h);
      _clearBuf();
      // Ask for security question answer
      _mode = 'setup-sec';
      _setSubtitle('Security Question');
      _setHint('This helps you reset your PIN if forgotten');
      _showSecPanel('What is your favourite color?', 'e.g. Blue');
    } else {
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
    if (_buf === _first) {
      setHash(h); _clearBuf();
      _setSubtitle('Enter your PIN'); _setHint('');
      _enterApp();
    } else {
      _setError('PINs do not match'); _clearBuf();
      _mode = 'change-new'; _setSubtitle('Enter new PIN');
    }

  } else if (_mode === 'forgot-new') {
    _first = _buf; _clearBuf();
    _mode = 'forgot-confirm'; _setSubtitle('Confirm new PIN');

  } else if (_mode === 'forgot-confirm') {
    if (_buf === _first) {
      setHash(h); _clearBuf();
      _setSubtitle('Enter your PIN'); _setHint('');
      _setError('');
      _mode = 'verify';
      _showKeypad();
      _updateForgotBtn();
    } else {
      _setError('PINs do not match'); _clearBuf();
      _mode = 'forgot-new'; _setSubtitle('Enter new PIN');
    }
  }
}

function _enterApp() {
  _showKeypad();
  $id('pin-screen').classList.add('hidden');
  $id('app').classList.remove('hidden');
  if (typeof onAppStart === 'function') onAppStart();
}

function lockApp() {
  $id('app').classList.add('hidden');
  $id('pin-screen').classList.remove('hidden');
  _mode = 'verify'; _clearBuf(); _showKeypad();
  _setSubtitle('Enter your PIN'); _setHint(''); _setError('');
  _updateForgotBtn();
}

function _updateForgotBtn() {
  const btn = $id('btn-forgot-pin');
  if (!btn) return;
  btn.style.display = (isPinSet() && isSecAnsSet() && _mode === 'verify') ? '' : 'none';
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

  // Physical keyboard — PIN digits
  document.addEventListener('keydown', async e => {
    const pinVisible = !$id('pin-screen').classList.contains('hidden');
    const secVisible = $id('pin-sec-wrap') && $id('pin-sec-wrap').style.display !== 'none';
    if (!pinVisible) return;
    if (secVisible) {
      if (e.key === 'Enter') { e.preventDefault(); await _handleSecSubmit(); }
      return;
    }
    if (e.key >= '0' && e.key <= '9' && _buf.length < 4) { _buf += e.key; _setDots(_buf.length); }
    else if (e.key === 'Backspace') { if (_buf.length) { _buf = _buf.slice(0,-1); _setDots(_buf.length); } }
    else if (e.key === 'Enter') { await _handleOK(); }
  });

  // Security panel submit button
  $id('pin-sec-submit')?.addEventListener('click', _handleSecSubmit);

  // Forgot PIN button
  $id('btn-forgot-pin')?.addEventListener('click', () => {
    if (!isSecAnsSet()) return;
    _mode = 'forgot-ans';
    _clearBuf();
    _setSubtitle('Reset PIN');
    _setHint('Answer your security question to continue');
    _showSecPanel('What is your favourite color?', 'Your answer…');
    _setError('');
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
    _setHint("You'll use this PIN to access your data");
  }
  _updateForgotBtn();
}
