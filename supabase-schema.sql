-- Catatan: Supabase menginstall extension ke schema 'extensions', bukan 'public'.
-- Pastikan pgcrypto sudah diaktifkan di Dashboard → Database → Extensions.
-- Fungsi crypt() dan gen_salt() dipanggil dengan prefix 'extensions.' agar bisa ditemukan.
create extension if not exists pgcrypto schema extensions;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  password_hash text not null,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'umum',
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  seller_name text default 'Admin',
  approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  discount_type text not null default 'percent'
    check (discount_type in ('percent', 'fixed')),
  value numeric(12, 2) not null default 0 check (value >= 0),
  minimum_order numeric(12, 2) not null default 0 check (minimum_order >= 0),
  starts_at date,
  ends_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'rejected', 'cancelled', 'paid')),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  customer_address text,
  payment_method text,
  payment_proof_url text,
  notes text,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_image text,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_products_active on public.products (is_active, approval_status, created_at desc);
create index if not exists idx_app_users_email on public.app_users (lower(email));
create index if not exists idx_orders_email on public.orders (customer_email, created_at desc);
create index if not exists idx_orders_status on public.orders (status, created_at desc);
create index if not exists idx_order_items_order_id on public.order_items (order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists set_discounts_updated_at on public.discounts;
create trigger set_discounts_updated_at
before update on public.discounts
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.login_app_user(input_email text, input_password text)
returns table (
  id uuid,
  email text,
  display_name text,
  is_admin boolean
)
language sql
security definer
set search_path = public
as $$
  select app_users.id, app_users.email, app_users.display_name, app_users.is_admin
  from public.app_users
  where lower(app_users.email) = lower(trim(input_email))
    and app_users.is_active = true
    and app_users.password_hash = extensions.crypt(input_password, app_users.password_hash)
  limit 1;
$$;

grant execute on function public.login_app_user(text, text) to anon, authenticated;

-- ============================================================
-- Register function: users can self-register (non-admin only)
-- ============================================================
create or replace function public.register_app_user(
  input_email text,
  input_password text,
  input_name text
)
returns table (
  id uuid,
  email text,
  display_name text,
  is_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  -- Check password length
  if length(input_password) < 6 then
    raise exception 'Password minimal 6 karakter';
  end if;

  -- Check if email already exists
  if exists (
    select 1 from public.app_users
    where lower(app_users.email) = lower(trim(input_email))
  ) then
    raise exception 'Email sudah terdaftar';
  end if;

  -- Insert new user (always non-admin)
  insert into public.app_users (email, display_name, password_hash, is_admin, is_active)
  values (
    lower(trim(input_email)),
    trim(input_name),
    extensions.crypt(input_password, extensions.gen_salt('bf')),
    false,
    true
  )
  returning app_users.id into new_id;

  -- Return user data
  return query
    select app_users.id, app_users.email, app_users.display_name, app_users.is_admin
    from public.app_users
    where app_users.id = new_id;
end;
$$;

grant execute on function public.register_app_user(text, text, text) to anon, authenticated;

-- ============================================================
-- Reset Password Function (Step 2 TODO)
-- ============================================================
create or replace function public.reset_app_user_password(
  input_email text,
  input_name text,
  input_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_users
  set password_hash = extensions.crypt(input_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where lower(email) = lower(trim(input_email))
    and lower(display_name) = lower(trim(input_name));

  if found then
    return true;
  else
    raise exception 'Email atau Nama tidak cocok dengan data kami';
  end if;
end;
$$;

grant execute on function public.reset_app_user_password(text, text, text) to anon, authenticated;

alter table public.app_users enable row level security;
alter table public.products enable row level security;
alter table public.discounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "anon read active app users" on public.app_users;
drop policy if exists "anon manage app users for simple app" on public.app_users;
drop policy if exists "anon manage app users for all" on public.app_users;

-- Izinkan pembacaan semua produk agar admin bisa melihat status pending
drop policy if exists "public read products" on public.products;
create policy "public read products"
on public.products for select
using (true);

-- Izinkan pengelolaan produk untuk anon (sementara agar aplikasi jalan)
drop policy if exists "anon manage products" on public.products;
create policy "anon manage products"
on public.products for all
using (true)
with check (true);

drop policy if exists "public read active discounts" on public.discounts;
create policy "public read active discounts"
on public.discounts for select
using (is_active = true);

-- Izinkan pengelolaan diskon untuk anon
drop policy if exists "anon manage discounts" on public.discounts;
create policy "anon manage discounts"
on public.discounts for all
using (true)
with check (true);

-- User hanya bisa melihat pesanan miliknya sendiri, Admin bisa lihat semua
drop policy if exists "users see own orders" on public.orders;
create policy "users see own orders"
on public.orders for select
to authenticated
using (
  customer_email = auth.jwt()->>'email' 
  or 
  exists (select 1 from app_users where email = auth.jwt()->>'email' and is_admin = true)
);

-- Izinkan insert pesanan untuk user yang login
drop policy if exists "users insert own orders" on public.orders;
create policy "users insert own orders"
on public.orders for insert
to authenticated
with check (customer_email = auth.jwt()->>'email');

-- Order Items mengikuti akses Orders
drop policy if exists "users see own order items" on public.order_items;
create policy "users see own order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from orders 
    where orders.id = order_items.order_id 
    and (orders.customer_email = auth.jwt()->>'email' or exists (select 1 from app_users where email = auth.jwt()->>'email' and is_admin = true))
  )
);
insert into public.products (name, category, description, price, stock, image_url)
values
  ('Kaos Oversize Basic', 'fashion', 'Bahan katun nyaman untuk harian.', 89000, 24, null),
  ('Headset Wireless', 'elektronik', 'Audio jernih dengan baterai tahan lama.', 175000, 12, null),
  ('Tumbler Stainless', 'rumah', 'Tahan panas dan dingin untuk aktivitas harian.', 65000, 30, null)
on conflict do nothing;

insert into public.discounts (code, name, discount_type, value, minimum_order, starts_at, ends_at)
values
  ('DISKON10', 'Diskon 10%', 'percent', 10, 100000, current_date, current_date + 30),
  ('HEMAT20K', 'Potongan 20K', 'fixed', 20000, 150000, current_date, current_date + 30)
on conflict (code) do nothing;

insert into public.app_users (email, display_name, password_hash, is_admin)
values
  ('raykenzienazaru@gmail.com', 'Ray Kenzie', extensions.crypt('admin123', extensions.gen_salt('bf')), true),
  ('noviantinovianti170@gmail.com', 'Novianti', extensions.crypt('admin123', extensions.gen_salt('bf')), true),
  ('user@demo.com', 'User Demo', extensions.crypt('user123', extensions.gen_salt('bf')), false)
on conflict (email) do nothing;

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('payment-proofs', 'payment-proofs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "public upload product images" on storage.objects;
create policy "public upload product images"
on storage.objects for insert
with check (bucket_id = 'product-images');

drop policy if exists "public read payment proofs" on storage.objects;
create policy "public read payment proofs"
on storage.objects for select
using (bucket_id = 'payment-proofs');

drop policy if exists "public upload payment proofs" on storage.objects;
create policy "public upload payment proofs"
on storage.objects for insert
with check (bucket_id = 'payment-proofs');
