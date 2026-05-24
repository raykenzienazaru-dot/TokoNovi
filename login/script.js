const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  ADMIN_EMAILS: [],
  ...(window.APP_CONFIG || {}),
};

const USER_KEY = 'tokoku_user_v2';
const USER_APP_URL = '../user/index.html';
const ADMIN_APP_URL = '../admin/index.html';
const hasSupabaseConfig = CONFIG.SUPABASE_URL
  && CONFIG.SUPABASE_ANON_KEY
  && !CONFIG.SUPABASE_URL.startsWith('ISI_')
  && !CONFIG.SUPABASE_ANON_KEY.startsWith('ISI_');
const db = window.supabase && hasSupabaseConfig
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

function getUserFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch (error) {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function setError(message) {
  document.getElementById('login-error').textContent = message || '';
}

function buildUser(account) {
  const email = account.email.toLowerCase();
  return {
    email,
    id: account.id || 'u_' + btoa(email).replace(/=/g, ''),
    name: account.display_name || email.split('@')[0],
    isAdmin: Boolean(account.is_admin) || CONFIG.ADMIN_EMAILS.includes(email),
  };
}

function getAppUrl(user) {
  return user?.isAdmin ? ADMIN_APP_URL : USER_APP_URL;
}

async function loginEmail(event) {
  event.preventDefault();

  const email = document.getElementById('email-input').value.trim().toLowerCase();
  const password = document.getElementById('password-input').value.trim();
  const btn = document.getElementById('login-btn');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('Format email tidak valid');
    return;
  }

  if (!password) {
    setError('Password wajib diisi');
    return;
  }

  setError('');
  btn.disabled = true;
  btn.textContent = 'Masuk...';

  try {
    if (!db) {
      setError('Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase-config.js');
      return;
    }

    const { data, error } = await db.rpc('login_app_user', {
      input_email: email,
      input_password: password,
    });

    if (error) throw error;
    const account = Array.isArray(data) ? data[0] : null;

    if (!account) {
      setError('Email atau password salah');
      return;
    }

    const user = buildUser(account);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.location.href = getAppUrl(user);
  } catch (error) {
    setError('Login gagal: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = getUserFromStorage();
  if (savedUser) {
    window.location.href = getAppUrl(savedUser);
    return;
  }

  const passwordInput = document.getElementById('password-input');
  const passwordToggle = document.getElementById('password-toggle');

  document.getElementById('login-form').addEventListener('submit', loginEmail);
  document.getElementById('email-input').addEventListener('input', () => setError(''));
  passwordInput.addEventListener('input', () => setError(''));
  passwordToggle.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    passwordToggle.setAttribute('aria-label', isPassword ? 'Sembunyikan password' : 'Tampilkan password');
  });

  document.getElementById('google-login').addEventListener('click', () => {
    setError('Login Google belum tersedia');
  });
});
