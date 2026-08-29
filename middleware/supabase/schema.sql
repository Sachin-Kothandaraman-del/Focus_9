-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — Supabase schema  v3 (Mobile App SRS2, 25-08-26)
-- Run this FIRST in Supabase → SQL Editor, then run seed.sql.
-- Only the middleware (service role key) touches these tables:
-- RLS is enabled with NO policies, so anon/authenticated clients are
-- denied direct access — exactly what we want.
--
-- v3 changes: masters unified into a flexible (kind,id,data) table so the
-- admin can create & control every master (customers, contracts,
-- departments, locations, divisions, stores, groups, categories, uoms,
-- items, priceLists); per-store inventory; server-side carts (10-minute
-- stock hold); notifications; allocations keyed by price-list LINE key
-- (e.g. 'PL1#4' — size variants share one allocation).
-- Migrating from v2? Drop the old tables first (or use a fresh project).
-- ═══════════════════════════════════════════════════════════════════

-- All masters, one row per record: kind ∈ customers|contracts|departments|
-- locations|divisions|stores|groups|categories|uoms|items|priceLists.
-- data holds the JSON object exactly as the app uses it.
create table if not exists masters (
  kind text not null,
  id   text not null,
  data jsonb not null,
  primary key (kind, id)
);

-- App user profiles. id = Supabase Auth user id (auth.users.id).
create table if not exists profiles (
  id          text primary key,
  email       text not null unique,
  name        text not null,
  phone       text default '',
  emp_id      text default '',
  role        text not null default 'employee' check (role in ('employee','approver','admin')),
  customer    text,
  dept        text,
  location    text,
  price_list  text,                       -- legacy single price list (first of price_lists)
  price_lists jsonb not null default '[]',
  from_store  text,                       -- Main store
  to_store    text,                       -- Reservation store
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Stock per store (Main + Reservation stores).
create table if not exists inventory (
  store_code text not null,
  item_code  text not null,
  qty        numeric not null default 0 check (qty >= 0),
  primary key (store_code, item_code)
);

-- Server-side shopping carts (10-minute stock hold). data = full cart JSON.
create table if not exists carts (
  user_id    text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id      bigserial primary key,
  user_id text not null,
  at      timestamptz not null default now(),
  msg     text not null,
  read    boolean not null default false
);

-- Allocation usage per user per price-list LINE key (e.g. 'PL1#4').
create table if not exists allocations (
  user_id  text not null,
  code     text not null,            -- price-list line key
  consumed numeric not null default 0,
  extra    numeric not null default 0,
  primary key (user_id, code)
);

-- Orders: full order document as JSONB (single source of truth for the apps).
create table if not exists orders (
  ref        text primary key,
  emp        text,
  status     text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- ERP counter-documents mirrored for the apps:
-- kind ∈ so|dn|inv|ret|cn|stv  (Receipt Vouchers removed per SRS2).
create table if not exists erp_docs (
  id         bigserial primary key,
  ref        text not null,
  kind       text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists erp_docs_kind_ref on erp_docs (kind, ref);

create table if not exists erp_log (
  id  bigserial primary key,
  at  timestamptz not null default now(),
  msg text not null
);

create table if not exists seqs (
  key text primary key,
  val bigint not null
);

-- ── atomic helpers ─────────────────────────────────────────────────
-- Drop any v2 versions first (their return/argument types may differ,
-- and CREATE OR REPLACE cannot change those).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname in ('next_seq', 'bump_allocation', 'bump_stock')
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function next_seq(p_key text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into seqs (key, val) values (p_key, 1)
    on conflict (key) do update set val = seqs.val + 1
    returning val into v;
  return v;
end $$;

create or replace function bump_allocation(p_user text, p_code text, p_consumed numeric, p_extra numeric)
returns void language plpgsql as $$
begin
  insert into allocations (user_id, code, consumed, extra)
    values (p_user, p_code, p_consumed, p_extra)
    on conflict (user_id, code) do update
      set consumed = allocations.consumed + p_consumed,
          extra    = allocations.extra + p_extra;
end $$;

-- Atomic stock adjustment; raises if it would go negative.
create or replace function bump_stock(p_store text, p_item text, p_dq numeric)
returns numeric language plpgsql as $$
declare v numeric;
begin
  insert into inventory (store_code, item_code, qty)
    values (p_store, p_item, greatest(p_dq, 0))
    on conflict (store_code, item_code) do update
      set qty = inventory.qty + p_dq
    returning qty into v;
  if v < 0 then
    raise exception 'Insufficient stock of % in %', p_item, p_store;
  end if;
  return v;
end $$;

-- ── lock the tables down (middleware uses the service role key) ────
alter table masters       enable row level security;
alter table profiles      enable row level security;
alter table inventory     enable row level security;
alter table carts         enable row level security;
alter table notifications enable row level security;
alter table allocations   enable row level security;
alter table orders        enable row level security;
alter table erp_docs      enable row level security;
alter table erp_log       enable row level security;
alter table seqs          enable row level security;
