const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  ADMIN_EMAILS: [],
  ...(window.APP_CONFIG || {}),
};

const USER_KEY = 'currentUser';
const USER_APP_URL = '../user/index.html';
const ADMIN_APP_URL = '../admin/index.html';

// Admin emails that cannot self-register (hardcoded)
const RESERVED_ADMIN_EMAILS = [
  'raykenzienazaru@gmail.com',
  'noviantinovianti170@gmail.com',
];

const hasSupabaseConfig = CONFIG.SUPABASE_URL
  && CONFIG.SUPABASE_ANON_KEY
  && !CONFIG.SUPABASE_URL.startsWith('ISI_')
  && !CONFIG.SUPABASE_ANON_KEY.startsWith('ISI_');
const db = window.supabase && hasSupabaseConfig
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

function getUserFromStorage() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY));
  } catch (error) {
    sessionStorage.removeItem(USER_KEY);
    return null;
  }
}

function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message || '';
}

function buildUser(account) {
  const email = account.email.toLowerCase();
  const isAdmin = Boolean(account.is_admin) || CONFIG.ADMIN_EMAILS.includes(email);
  return {
    email,
    id: account.id || 'u_' + btoa(email).replace(/=/g, ''),
    name: account.display_name || email.split('@')[0],
    isAdmin: isAdmin,
    role: isAdmin ? 'admin' : 'user'
  };
}

function getAppUrl(user) {
  return user?.isAdmin ? ADMIN_APP_URL : USER_APP_URL;
}

/* ===== TAB SWITCHING ===== */
function switchTab(tabName) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');
  const indicator = document.getElementById('tab-indicator');

  if (tabName === 'login') {
    tabLogin.classList.add('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabRegister.classList.remove('active');
    tabRegister.setAttribute('aria-selected', 'false');
    panelLogin.classList.add('active');
    panelRegister.classList.remove('active');
    if (indicator) indicator.style.transform = 'translateX(0)';
  } else {
    tabRegister.classList.add('active');
    tabRegister.setAttribute('aria-selected', 'true');
    tabLogin.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'false');
    panelRegister.classList.add('active');
    panelLogin.classList.remove('active');
    if (indicator) indicator.style.transform = 'translateX(100%)';
  }

  // Clear errors
  setError('login-error', '');
  setError('register-error', '');
}

/* ===== LOGIN ===== */
async function loginEmail(event) {
  event.preventDefault();

  const email = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value.trim();
  const btn = document.getElementById('login-btn');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('login-error', 'Format email tidak valid');
    return;
  }

  if (!password) {
    setError('login-error', 'Password wajib diisi');
    return;
  }

  setError('login-error', '');
  btn.disabled = true;
  btn.textContent = 'Masuk...';

  try {
    if (!db) {
      setError('login-error', 'Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase-config.js');
      return;
    }

    const { data, error } = await db.rpc('login_app_user', {
      input_email: email,
      input_password: password,
    });

    if (error) throw error;
    const account = Array.isArray(data) ? data[0] : null;

    if (!account) {
      setError('login-error', 'Email atau password salah');
      return;
    }

    const user = buildUser(account);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.location.href = getAppUrl(user);
  } catch (error) {
    setError('login-error', 'Login gagal: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

/* ===== REGISTER ===== */
async function registerUser(event) {
  event.preventDefault();

  const name = document.getElementById('reg-name-input').value.trim();
  const email = document.getElementById('reg-email-input').value.trim().toLowerCase();
  const password = document.getElementById('reg-password-input').value;
  const confirm = document.getElementById('reg-confirm-input').value;
  const btn = document.getElementById('register-btn');

  // Validation
  if (!name) {
    setError('register-error', 'Nama lengkap wajib diisi');
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('register-error', 'Format email tidak valid');
    return;
  }

  // Prevent registering with admin-reserved emails
  if (RESERVED_ADMIN_EMAILS.includes(email)) {
    setError('register-error', 'Email ini tidak dapat digunakan untuk pendaftaran');
    return;
  }

  if (!password || password.length < 6) {
    setError('register-error', 'Password minimal 6 karakter');
    return;
  }

  if (password !== confirm) {
    setError('register-error', 'Konfirmasi password tidak cocok');
    return;
  }

  setError('register-error', '');
  btn.disabled = true;
  btn.textContent = 'Mendaftar...';

  try {
    if (!db) {
      setError('register-error', 'Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase-config.js');
      return;
    }

    const { data, error } = await db.rpc('register_app_user', {
      input_email: email,
      input_password: password,
      input_name: name,
    });

    if (error) {
      // Handle duplicate email
      if (error.message && error.message.includes('sudah terdaftar')) {
        setError('register-error', 'Email sudah terdaftar. Silakan masuk.');
      } else if (error.message && error.message.includes('duplicate')) {
        setError('register-error', 'Email sudah terdaftar. Silakan masuk.');
      } else {
        throw error;
      }
      return;
    }

    const account = Array.isArray(data) ? data[0] : data;

    if (!account) {
      setError('register-error', 'Pendaftaran gagal. Silakan coba lagi.');
      return;
    }

    // Auto-login after successful registration
    const user = buildUser(account);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    window.location.href = getAppUrl(user);
  } catch (error) {
    setError('register-error', 'Pendaftaran gagal: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Daftar';
  }
}

/* ===== PASSWORD TOGGLE ===== */
function setupPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (!input || !toggle) return;

  toggle.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggle.setAttribute('aria-label', isPassword ? 'Sembunyikan password' : 'Tampilkan password');
  });
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = getUserFromStorage();
  // Only redirect if savedUser is valid (has email and role)
  if (savedUser && savedUser.email && savedUser.role) {
    window.location.href = getAppUrl(savedUser);
    return;
  }
  // Clear any invalid/corrupt session data to prevent loops
  sessionStorage.removeItem(USER_KEY);

  // Tab switching
  document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
  document.getElementById('go-to-register')?.addEventListener('click', () => switchTab('register'));
  document.getElementById('go-to-login')?.addEventListener('click', () => switchTab('login'));

  // Login form
  document.getElementById('login-form').addEventListener('submit', loginEmail);
  document.getElementById('email-input').addEventListener('input', () => setError('login-error', ''));
  document.getElementById('password-input').addEventListener('input', () => setError('login-error', ''));

  // Register form
  document.getElementById('register-form').addEventListener('submit', registerUser);
  document.getElementById('reg-name-input').addEventListener('input', () => setError('register-error', ''));
  document.getElementById('reg-email-input').addEventListener('input', () => setError('register-error', ''));
  document.getElementById('reg-password-input').addEventListener('input', () => setError('register-error', ''));
  document.getElementById('reg-confirm-input').addEventListener('input', () => setError('register-error', ''));

  // Password toggles
  setupPasswordToggle('password-input', 'password-toggle');
  setupPasswordToggle('reg-password-input', 'reg-password-toggle');
  setupPasswordToggle('reg-confirm-input', 'reg-confirm-toggle');


});
