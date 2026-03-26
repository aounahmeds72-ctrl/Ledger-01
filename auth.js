// =====================================================
// auth.js — PIN Authentication for Ledger
// =====================================================

const AUTH_KEY = 'ledger_pin_hash';
const THEME_KEY = 'ledger_theme';
const CURRENCY_KEY = 'ledger_currency';
const BACKUP_KEY = 'ledger_last_backup';

// Simple SHA-256 hash via Web Crypto
async function hashPin(pin) {
  const enc = new TextEncoder().encode(pin + 'ledger_salt_2024');
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredHash() { return localStorage.getItem(AUTH_KEY); }
function setStoredHash(h) { localStorage.setItem(AUTH_KEY, h); }
function isSetup() { return !!getStoredHash(); }

// =====================================================
// PIN UI Controller
// =====================================================
let pinBuffer = '';
let pinMode = 'verify'; // 'setup' | 'setup-confirm' | 'change' | 'change-new' | 'change-confirm' | 'verify'
let pinFirst = '';
let pinCallback = null;

function updateDots(len) {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach((d, i) => d.classList.toggle('filled', i < len));
}

function setPinSubtitle(text) {
  document.getElementById('pin-subtitle').textContent = text;
}

function setPinError(text) {
  const el = document.getElementById('pin-error');
  el.textContent = text;
  setTimeout(() => el.textContent = '', 2000);
}

function setPinHint(text) {
  document.getElementById('pin-hint').textContent = text;
}

function clearPinBuffer() {
  pinBuffer = '';
  updateDots(0);
}

async function handlePinOK() {
  if (pinBuffer.length < 4) {
    setPinError('PIN must be 4 digits');
    return;
  }
  const hash = await hashPin(pinBuffer);

  if (pinMode === 'verify') {
    const stored = getStoredHash();
    if (hash === stored) {
      clearPinBuffer();
      onPinSuccess();
    } else {
      setPinError('Incorrect PIN');
      clearPinBuffer();
    }
  } else if (pinMode === 'setup') {
    pinFirst = pinBuffer;
    clearPinBuffer();
    pinMode = 'setup-confirm';
    setPinSubtitle('Confirm your PIN');
    setPinHint('Enter the same PIN again');
  } else if (pinMode === 'setup-confirm') {
    if (pinBuffer === pinFirst) {
      setStoredHash(hash);
      clearPinBuffer();
      onPinSuccess();
    } else {
      setPinError('PINs do not match. Try again.');
      clearPinBuffer();
      pinMode = 'setup';
      setPinSubtitle('Create a 4-digit PIN');
      setPinHint('');
    }
  } else if (pinMode === 'change') {
    // Verify old PIN
    const stored = getStoredHash();
    if (hash === stored) {
      clearPinBuffer();
      pinMode = 'change-new';
      setPinSubtitle('Enter new PIN');
    } else {
      setPinError('Incorrect current PIN');
      clearPinBuffer();
    }
  } else if (pinMode === 'change-new') {
    pinFirst = pinBuffer;
    clearPinBuffer();
    pinMode = 'change-confirm';
    setPinSubtitle('Confirm new PIN');
  } else if (pinMode === 'change-confirm') {
    if (pinBuffer === pinFirst) {
      setStoredHash(hash);
      clearPinBuffer();
      if (pinCallback) pinCallback(true);
      showApp();
    } else {
      setPinError('PINs do not match');
      clearPinBuffer();
      pinMode = 'change-new';
      setPinSubtitle('Enter new PIN');
    }
  }
}

function onPinSuccess() {
  document.getElementById('pin-screen').classList.remove('active');
  document.getElementById('pin-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  if (typeof onAppStart === 'function') onAppStart();
}

function showApp() {
  document.getElementById('pin-screen').classList.remove('active');
  document.getElementById('pin-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function lockApp() {
  document.getElementById('app').classList.add('hidden');
  const ps = document.getElementById('pin-screen');
  ps.classList.remove('hidden');
  ps.classList.add('active');
  pinMode = 'verify';
  clearPinBuffer();
  setPinSubtitle('Enter your PIN');
  setPinHint('');
  setPinError('');
}

function initAuth() {
  const keypad = document.querySelectorAll('.key');
  keypad.forEach(btn => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.val;
      if (val === 'clear') {
        if (pinBuffer.length > 0) pinBuffer = pinBuffer.slice(0, -1);
        updateDots(pinBuffer.length);
      } else if (val === 'ok') {
        await handlePinOK();
      } else {
        if (pinBuffer.length < 4) {
          pinBuffer += val;
          updateDots(pinBuffer.length);
        }
      }
    });
  });

  // Keyboard support
  document.addEventListener('keydown', async (e) => {
    if (!document.getElementById('pin-screen').classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9' && pinBuffer.length < 4) {
      pinBuffer += e.key;
      updateDots(pinBuffer.length);
    } else if (e.key === 'Backspace') {
      if (pinBuffer.length > 0) pinBuffer = pinBuffer.slice(0, -1);
      updateDots(pinBuffer.length);
    } else if (e.key === 'Enter') {
      await handlePinOK();
    }
  });

  if (isSetup()) {
    pinMode = 'verify';
    setPinSubtitle('Enter your PIN');
  } else {
    pinMode = 'setup';
    setPinSubtitle('Create a 4-digit PIN');
    setPinHint('You\'ll use this to access your data');
  }

  document.getElementById('lock-btn-sidebar').addEventListener('click', lockApp);
  document.getElementById('lock-btn-top').addEventListener('click', lockApp);
}
