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
    check (status in ('pending', 'paid', 'completed', 'rejected', 'cancelled')),
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

alter table public.app_users enable row level security;
alter table public.products enable row level security;
alter table public.discounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "anon read active app users" on public.app_users;
drop policy if exists "anon manage app users for simple app" on public.app_users;
drop policy if exists "anon manage app users for all" on public.app_users;

drop policy if exists "public read active approved products" on public.products;
create policy "public read active approved products"
on public.products for select
using (is_active = true and approval_status = 'approved');

drop policy if exists "anon manage products for simple app" on public.products;
create policy "anon manage products for simple app"
on public.products for all
using (true)
with check (true);

drop policy if exists "public read active discounts" on public.discounts;
create policy "public read active discounts"
on public.discounts for select
using (is_active = true);

drop policy if exists "anon manage discounts for simple app" on public.discounts;
create policy "anon manage discounts for simple app"
on public.discounts for all
using (true)
with check (true);

drop policy if exists "anon manage orders for simple app" on public.orders;
create policy "anon manage orders for simple app"
on public.orders for all
using (true)
with check (true);

drop policy if exists "anon manage order items for simple app" on public.order_items;
create policy "anon manage order items for simple app"
on public.order_items for all
using (true)
with check (true);

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
