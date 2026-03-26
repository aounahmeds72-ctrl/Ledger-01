// auth.js – Supabase Auth handling

const SUPABASE_URL = 'https://bipgtkyyovuwdejxeunx.supabase.co';   // ← replace with your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcGd0a3l5b3Z1d2RlanhldW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjUwOTMsImV4cCI6MjA5MDEwMTA5M30.3UjjO5-K06nsw6gybZjqr9elQarMrame_iE6de94XT4';                // ← replace with your anon key

let supabase = null;

// Initialize Supabase client
function initSupabase() {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

// Auth state listener
async function initAuth() {
  initSupabase();

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    onAuthSuccess(session.user);
  } else {
    showAuthScreen();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      onAuthSuccess(session.user);
    } else if (event === 'SIGNED_OUT') {
      onAuthSignOut();
    }
  });
}

// UI for login / signup / forgot
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-error').textContent = '';
}

function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function onAuthSuccess(user) {
  hideAuthScreen();
  window.currentUserId = user.id;
  // set current user in db.js
  if (typeof setCurrentUser === 'function') setCurrentUser(user.id);
  // start the app
  if (typeof onAppStart === 'function') onAppStart();
}

function onAuthSignOut() {
  window.currentUserId = null;
  showAuthScreen();
}

// Login handler
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Signup handler
async function signup(email, password) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // User created, now they can login
  showToast('Account created! Please log in.', 'success');
}

// Forgot password (send reset email)
async function forgotPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
  showToast('Password reset email sent!', 'success');
}

// Logout
async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Change password (for settings)
async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  showToast('Password changed successfully', 'success');
}

// Setup UI event listeners
function setupAuthUI() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.authTab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      document.getElementById(`${target}-form`).classList.add('active');
    });
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');
    try {
      await login(email, password);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // Signup form
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('auth-error');
    try {
      await signup(email, password);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // Forgot password link
  document.getElementById('forgot-password-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showToast('Enter your email first', 'error');
      return;
    }
    try {
      await forgotPassword(email);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Logout buttons
  const logoutBtn = document.getElementById('logout-btn');
  const logoutBtnMobile = document.getElementById('logout-btn-mobile');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { await logout(); });
  if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', async () => { await logout(); });
}

// Expose supabase client globally for db.js
window.supabaseClient = () => supabase;
window.changePassword = changePassword; // for settings  } else {
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
