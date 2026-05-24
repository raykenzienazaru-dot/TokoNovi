# Setup Supabase

1. Buat project baru di Supabase.
2. Buka **SQL Editor**, salin semua isi `supabase-schema.sql`, lalu jalankan.
3. Buka **Project Settings > API**.
4. Salin **Project URL** dan **anon public key**.
5. Tempel ke `supabase-config.js`.

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://project-kamu.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-kamu",
  ADMIN_EMAILS: [
    "email-admin-kamu@gmail.com",
  ],
};
```

Catatan: policy di `supabase-schema.sql` dibuat longgar agar cocok untuk aplikasi HTML/JS sederhana tanpa Supabase Auth. Untuk produksi, gunakan Supabase Auth dan batasi policy admin.

Login memakai tabel `app_users` dan function `login_app_user(email, password)`.
Akun contoh setelah SQL dijalankan:

| Email | Password | Role |
| --- | --- | --- |
| `raykenzienazaru@gmail.com` | `admin123` | Admin |
| `noviantinovianti170@gmail.com` | `admin123` | Admin |
| `user@demo.com` | `user123` | User |

Untuk membuat akun baru dari SQL Editor:

```sql
insert into public.app_users (email, display_name, password_hash, is_admin)
values (
  'email@contoh.com',
  'Nama User',
  crypt('password123', gen_salt('bf')),
  false
);
```
