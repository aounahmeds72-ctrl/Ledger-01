The signup/login issue is caused by a corrupted auth.js file that mixes Supabase auth code with leftover PIN lock logic, leading to syntax errors and function conflicts. The attached file contains a clean, corrected auth.js that:

· Removes all PIN‑related code.
· Correctly initializes Supabase.
· Handles login, signup, password reset, and logout.
· Sets up UI event listeners and the auth state listener.
· Exposes the Supabase client for db.js.

After replacing auth.js with this version, the authentication flow will work. Ensure that your Supabase project has the required tables (accounts, vouchers, audit, user_counters) to fully use the app after login.

```javascript
// auth.js – Supabase Auth handling

const SUPABASE_URL = 'https://bipgtkyyovuwdejxeunx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcGd0a3l5b3Z1d2RlanhldW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MjUwOTMsImV4cCI6MjA5MDEwMTA5M30.3UjjO5-K06nsw6gybZjqr9elQarMrame_iE6de94XT4';

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
  if (typeof setCurrentUser === 'function') setCurrentUser(user.id);
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
window.changePassword = changePassword;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  setupAuthUI();
});
```
