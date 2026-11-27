-- Atmonsur Store schema. Runs on every server start; safe to re-run.
-- All money is stored in kobo (₦1 = 100 kobo) as integers.

create table if not exists categories (
  name text primary key,
  note text not null default '',
  color text not null default '#f4f6f8',   -- card background on the home page
  art_kind text not null default 'pack',   -- illustration when there is no photo: bottle | carton | bag | pack | jar | cleaner
  sort int not null default 0
);

create table if not exists products (
  id int generated always as identity primary key,
  name text not null,
  category text not null references categories (name) on update cascade,
  pack text not null,
  price_kobo int not null check (price_kobo > 0),
  bulk_price_kobo int not null check (bulk_price_kobo > 0 and bulk_price_kobo <= price_kobo),
  bulk_min_qty int not null default 5 check (bulk_min_qty >= 1), -- wholesale price applies from this many packs
  badge text,
  image_url text,
  art_kind text not null default 'pack',
  color text not null default '#f47820',
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists delivery_zones (
  id text primary key,
  name text not null,
  fee_kobo int not null check (fee_kobo >= 0),
  needs_address boolean not null default true,
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists orders (
  id int generated always as identity primary key,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  fulfilment text not null default 'new' check (fulfilment in ('new', 'dispatched', 'delivered', 'cancelled')),
  customer_name text not null,
  email text not null,
  phone text not null,
  delivery_zone text not null,
  delivery_zone_name text not null,
  address text,
  city text,
  notes text,
  subtotal_kobo int not null,
  delivery_fee_kobo int not null,
  total_kobo int not null,
  payment_reference text,                 -- PalmPay's order number (orderNo)
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists order_items (
  id int generated always as identity primary key,
  order_id int not null references orders (id) on delete cascade,
  product_id int references products (id) on delete set null,
  name text not null,
  pack text not null,
  qty int not null check (qty > 0),
  unit_price_kobo int not null,
  line_total_kobo int not null
);

create table if not exists enquiries (
  id int generated always as identity primary key,
  name text not null,
  phone text not null,
  email text not null,
  subject text not null,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists orders_created_at on orders (created_at desc);

-- Databases created while the store used Paystack: rename the payment column.
do $$ begin
  if exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'paystack_transaction_id') then
    alter table orders rename column paystack_transaction_id to payment_reference;
  end if;
end $$;
create index if not exists order_items_order on order_items (order_id);

-- Customer accounts (optional: guests can still check out).
create table if not exists customers (
  id int generated always as identity primary key,
  email text not null unique,             -- stored lowercase
  name text not null,
  phone text not null,
  password_hash text not null,            -- scrypt, see passwords.ts
  email_verified_at timestamptz,
  address text,
  city text,
  delivery_zone text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,            -- sha256 of the cookie value; the raw token is never stored
  customer_id int not null references customers (id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists email_tokens (
  token_hash text primary key,            -- sha256 of the emailed token
  customer_id int not null references customers (id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  expires_at timestamptz not null
);

alter table orders add column if not exists customer_id int references customers (id) on delete set null;
create index if not exists orders_customer on orders (customer_id, created_at desc);
create index if not exists sessions_customer on sessions (customer_id);

-- Product pages: optional longer text shown on the product's own page.
alter table products add column if not exists description text;

-- How the customer pays: 'palmpay' (online, before the order counts) or 'on_delivery' (cash or transfer on delivery or pickup,
-- used while PalmPay isn't set up). On-delivery orders stay status 'pending' until the owner marks them paid in admin.
alter table orders add column if not exists payment_method text not null default 'palmpay';
