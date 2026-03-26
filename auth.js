// ═══════════════════════════════════════════════════════
// auth.js — Supabase Authentication UI
// ═══════════════════════════════════════════════════════

let authMode = 'login'; // login | signup | forgot-password | reset-password

function _setupAuthUI() {
  // ...existing event listeners setup...
  document.getElementById('btn-to-signup')?.addEventListener('click', () => setAuthMode('signup'));
  document.getElementById('btn-to-login')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('btn-to-forgot')?.addEventListener('click', () => setAuthMode('forgot-password'));
  document.getElementById('btn-auth-submit')?.addEventListener('click', _handleAuthSubmit);
  document.getElementById('auth-password')?.addEventListener('keypress', e => { if(e.key==='Enter') _handleAuthSubmit(); });
  document.getElementById('auth-email')?.addEventListener('keypress', e => { if(e.key==='Enter') _handleAuthSubmit(); });
  
  // Check for password reset mode
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('type') === 'recovery') {
    setAuthMode('reset-password');
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const email = document.getElementById('auth-email');
  const pass = document.getElementById('auth-password');
  const confirmPass = document.getElementById('auth-confirm-password');
  const submitBtn = document.getElementById('btn-auth-submit');
  const links = document.getElementById('auth-links');

  form.innerHTML = '';
  if (pass) {
    pass.style.display = 'none';
    pass.value = '';
  }
  if (confirmPass) {
    confirmPass.style.display = 'none';
    confirmPass.value = '';
  }
  if (email) {
    email.value = '';
  }

  if (mode === 'login') {
    title.textContent = 'Sign In';
    form.innerHTML = `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="auth-email" placeholder="name@example.com" autocomplete="email" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password" />
      </div>`;
    submitBtn.textContent = 'Sign In';
    links.innerHTML = `
      <p style="font-size:12px;color:var(--t3)">
        Don't have an account? <button class="link-btn" id="btn-to-signup">Sign Up</button>
      </p>
      <p style="font-size:12px;color:var(--t3)">
        <button class="link-btn" id="btn-to-forgot">Forgot password?</button>
      </p>`;

  } else if (mode === 'signup') {
    title.textContent = 'Create Account';
    form.innerHTML = `
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="auth-email" placeholder="name@example.com" autocomplete="email" />
      </div>
      <div class="form-group">
        <label>Password (min 8 chars)</label>
        <input type="password" id="auth-password" placeholder="••••••••" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" id="auth-confirm-password" placeholder="••••••••" autocomplete="new-password" />
      </div>`;
    submitBtn.textContent = 'Create Account';
    links.innerHTML = `
      <p style="font-size:12px;color:var(--t3)">
        Already have an account? <button class="link-btn" id="btn-to-login">Sign In</button>
      </p>`;

  } else if (mode === 'forgot-password') {
    title.textContent = 'Reset Password';
    form.innerHTML = `
      <div class="form-group">
        <label>Enter your email</label>
        <input type="email" id="auth-email" placeholder="name@example.com" autocomplete="email" />
      </div>
      <p style="font-size:12px;color:var(--t3);margin-top:8px">
        We'll send you a link to reset your password
      </p>`;
    submitBtn.textContent = 'Send Reset Link';
    links.innerHTML = `
      <p style="font-size:12px;color:var(--t3)">
        <button class="link-btn" id="btn-to-login">Back to Sign In</button>
      </p>`;

  } else if (mode === 'reset-password') {
    title.textContent = 'Set New Password';
    form.innerHTML = `
      <div class="form-group">
        <label>New Password (min 8 chars)</label>
        <input type="password" id="auth-password" placeholder="••••••••" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" id="auth-confirm-password" placeholder="••••••••" autocomplete="new-password" />
      </div>`;
    submitBtn.textContent = 'Update Password';
    links.innerHTML = '';
  }

  // Re-attach event listeners
  document.getElementById('btn-to-signup')?.addEventListener('click', () => setAuthMode('signup'));
  document.getElementById('btn-to-login')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('btn-to-forgot')?.addEventListener('click', () => setAuthMode('forgot-password'));
  document.getElementById('auth-email')?.addEventListener('keypress', e => { if(e.key==='Enter') _handleAuthSubmit(); });
  document.getElementById('auth-password')?.addEventListener('keypress', e => { if(e.key==='Enter') _handleAuthSubmit(); });
  document.getElementById('auth-confirm-password')?.addEventListener('keypress', e => { if(e.key==='Enter') _handleAuthSubmit(); });
}

async function _handleAuthSubmit() {
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const confirmPassEl = document.getElementById('auth-confirm-password');
  const errorEl = document.getElementById('auth-error');

  if (!errorEl) {
    console.error('[auth] auth-error element not found');
    return;
  }

  const email = emailEl?.value?.trim() || '';
  const pass = passEl?.value || '';
  const confirmPass = confirmPassEl?.value || '';

  errorEl.textContent = '';

  try {
    if (authMode === 'login') {
      if (!email || !pass) throw new Error('Email and password required');
      await signIn(email, pass);
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      onAppStart();

    } else if (authMode === 'signup') {
      if (!email || !pass) throw new Error('Email and password required');
      if (pass.length < 8) throw new Error('Password must be at least 8 characters');
      if (pass !== confirmPass) throw new Error('Passwords do not match');
      await signUp(email, pass);
      errorEl.style.color = 'var(--green)';
      errorEl.textContent = 'Account created! Check your email to confirm.';
      setTimeout(() => setAuthMode('login'), 3000);

    } else if (authMode === 'forgot-password') {
      if (!email) throw new Error('Email is required');
      await resetPassword(email);
      errorEl.style.color = 'var(--green)';
      errorEl.textContent = 'Check your email for the password reset link';
      setTimeout(() => setAuthMode('login'), 3000);

    } else if (authMode === 'reset-password') {
      if (!pass) throw new Error('Password is required');
      if (pass.length < 8) throw new Error('Password must be at least 8 characters');
      if (pass !== confirmPass) throw new Error('Passwords do not match');
      await updatePassword(pass);
      errorEl.style.color = 'var(--green)';
      errorEl.textContent = 'Password updated! signing in...';

      let signedIn = false;
      const emailToUse = (currentUser && currentUser.email) ? currentUser.email : email;
      if (emailToUse) {
        try {
          await signIn(emailToUse, pass);
          signedIn = true;
        } catch (_) {
          signedIn = false;
        }
      }

      setTimeout(() => {
        if (signedIn) {
          document.getElementById('auth-screen').classList.add('hidden');
          document.getElementById('app').classList.remove('hidden');
          onAppStart();
        } else {
          setAuthMode('login');
          showToast('Please sign in with your new password', 'success');
        }
      }, 1500);
    }
  } catch(e) {
    errorEl.style.color = 'var(--red)';
    errorEl.textContent = e.message || 'Authentication failed';
  }
}

async function initAuth() {
  await initSupabase();
  const user = await getCurrentUser();
  
  if (user) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    onAppStart();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    setAuthMode('login');
  }

  _setupAuthUI();

  // Listen for auth changes
  onAuthChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      window.location.reload();
    }
  });
}

function logout() {
  signOut().then(() => window.location.reload());
}
