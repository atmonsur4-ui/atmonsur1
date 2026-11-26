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
  paystack_transaction_id text,
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
create index if not exists order_items_order on order_items (order_id);
