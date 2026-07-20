-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — Supabase schema
-- Run this FIRST in Supabase → SQL Editor, then run seed.sql.
-- Only the middleware (service role key) touches these tables:
-- RLS is enabled with NO policies, so anon/authenticated clients are
-- denied direct access — exactly what we want.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists customers (
  id      text primary key,
  name    text not null,
  address text default '',
  phone   text default '',
  email   text default ''
);

create table if not exists departments ( name text primary key );
create table if not exists locations   ( name text primary key );
create table if not exists uoms        ( name text primary key );

create table if not exists items (
  code  text primary key,
  name  text not null,
  descr text default '',
  alias text default '',
  uom   text not null references uoms(name),
  grp   text not null,
  cat   text not null,
  pic   text default ''
);

create table if not exists price_lists (
  id         text primary key,
  name       text not null,
  contract   text not null,
  customer   text not null references customers(id),
  valid_from date,
  valid_till date
);

create table if not exists price_list_lines (
  pl         text not null references price_lists(id) on delete cascade,
  code       text not null references items(code),
  price      numeric not null,
  alloc      integer not null default 0,
  restricted boolean not null default false,
  primary key (pl, code)
);

-- App user profiles. id = Supabase Auth user id (auth.users.id).
create table if not exists profiles (
  id         uuid primary key,
  email      text unique not null,
  name       text not null,
  phone      text default '',
  emp_id     text unique,
  role       text not null default 'employee' check (role in ('employee','approver','admin')),
  customer   text references customers(id),
  dept       text,
  price_list text references price_lists(id),
  active     boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per-employee allocation usage: consumed against price-list allocation,
-- extra = additional qty granted through EGA approvals.
create table if not exists allocations (
  user_id  uuid not null,
  code     text not null references items(code),
  consumed numeric not null default 0,
  extra    numeric not null default 0,
  primary key (user_id, code)
);

create table if not exists orders (
  ref        text primary key,
  emp        uuid,
  status     text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists erp_docs (
  ref        text not null,
  kind       text not null check (kind in ('so','dn','inv','ret')),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ref, kind)
);

create table if not exists erp_log (
  id  bigserial primary key,
  at  timestamptz not null default now(),
  msg text not null
);

create table if not exists sequences (
  key text primary key,
  val integer not null
);

-- Atomic sequence counter (order/SO/DO/invoice/return/employee numbers)
create or replace function next_seq(p_key text) returns integer
language plpgsql security definer as $$
declare v integer;
begin
  update sequences set val = val + 1 where key = p_key returning val into v;
  if v is null then
    insert into sequences(key, val) values (p_key, 1) returning val into v;
  end if;
  return v;
end $$;

-- Atomic allocation bump (consumption / approved extra)
create or replace function bump_allocation(p_user uuid, p_code text, p_consumed numeric, p_extra numeric)
returns void language plpgsql security definer as $$
begin
  insert into allocations(user_id, code, consumed, extra)
  values (p_user, p_code, p_consumed, p_extra)
  on conflict (user_id, code) do update
    set consumed = allocations.consumed + excluded.consumed,
        extra    = allocations.extra    + excluded.extra;
end $$;

-- Lock everything down: middleware uses the service role key which bypasses RLS.
alter table customers        enable row level security;
alter table departments      enable row level security;
alter table locations        enable row level security;
alter table uoms             enable row level security;
alter table items            enable row level security;
alter table price_lists      enable row level security;
alter table price_list_lines enable row level security;
alter table profiles         enable row level security;
alter table allocations      enable row level security;
alter table orders           enable row level security;
alter table erp_docs         enable row level security;
alter table erp_log          enable row level security;
alter table sequences        enable row level security;
