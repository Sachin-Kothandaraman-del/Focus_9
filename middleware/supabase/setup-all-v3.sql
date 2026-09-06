-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — ONE-SHOT SETUP  v3 (Mobile App SRS2, 25-08-26)
--
-- Paste this ENTIRE file into Supabase → SQL Editor and press Run.
-- It performs, in order:  v2→v3 migration → schema → seed data.
-- Safe to re-run (idempotent): keeps user accounts, keeps the price-list
-- assignments the admin has made, and does not overwrite live inventory.
--
-- Product photos are NOT in this file — the middleware serves them from
-- middleware/store/item-images.js, so nothing here is oversized.
-- ═══════════════════════════════════════════════════════════════════



-- ╔══════════════ PART 1 · MIGRATION v2 → v3 ══════════════╗

-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — Supabase migration  v2 → v3 (Mobile App SRS2, 25-08-26)
--
-- Run these three files IN ORDER in Supabase → SQL Editor:
--   1) this file  (migrate-v2-to-v3.sql)
--   2) schema.sql
--   3) seed.sql
--
-- What it does:
--   · KEEPS all user accounts (Supabase Auth users + the profiles table)
--     and adds the new SRS2 profile fields (location, multiple price
--     lists, From/To stores). Price-list assignments are reset — the
--     admin re-assigns them in Users → "Set up" after deploying.
--   · DROPS the v2 master tables (customers, items, price_lists, …) —
--     v3 replaces them with the flexible `masters` table seeded from
--     the Data List Excel workbooks.
--   · CLEARS v2 transactional data (orders, ERP documents, allocations,
--     sequences) — the old documents are incompatible with the SRS2
--     model (stock reservation, line-key allocations, DOD lines).
-- ═══════════════════════════════════════════════════════════════════

-- 1 ── profiles: detach v2 foreign keys, add SRS2 columns, keep the accounts
--      (v2 linked profiles to the old master tables; v3 validates in the
--       middleware instead, so these constraints go away)
alter table if exists profiles drop constraint if exists profiles_price_list_fkey;
alter table if exists profiles drop constraint if exists profiles_customer_fkey;
alter table if exists profiles drop constraint if exists profiles_dept_fkey;
alter table if exists profiles drop constraint if exists profiles_location_fkey;

-- Roles gained "store" (SRS2 Store Module) — the old CHECK constraint only
-- allowed employee/approver/admin and would reject it.
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'profiles') then
    alter table if exists profiles drop constraint if exists profiles_role_check;
    alter table profiles add constraint profiles_role_check
      check (role in ('employee','approver','store','admin'));
  end if;
end $$;

alter table if exists profiles add column if not exists location    text;
alter table if exists profiles add column if not exists price_lists jsonb not null default '[]';
alter table if exists profiles add column if not exists from_store  text;
alter table if exists profiles add column if not exists to_store    text;

-- Reset shopping assignments ONLY on the first v2 -> v3 migration (the old
-- PL ids don't match the new price lists). On a re-run the v3 `masters`
-- table already exists, so assignments the admin has made are left alone.
do $$ begin
  if not exists (select 1 from information_schema.tables where table_name = 'masters')
     and exists (select 1 from information_schema.tables where table_name = 'profiles') then
    update profiles set price_list = null, price_lists = '[]'::jsonb;
  end if;
end $$;

-- 2 ── clear v2 transactional data (incompatible with the SRS2 model)
drop table if exists orders cascade;
drop table if exists erp_docs cascade;
drop table if exists erp_log cascade;
drop table if exists allocations cascade;
drop table if exists seqs cascade;

-- 3 ── drop v2 master tables (replaced by the `masters` table in v3);
--      CASCADE removes any remaining constraints that point at them
drop table if exists price_list_lines cascade;
drop table if exists price_lists cascade;
drop table if exists items cascade;
drop table if exists uoms cascade;
drop table if exists locations cascade;
drop table if exists departments cascade;
drop table if exists customers cascade;

-- Done. Now run schema.sql, then seed.sql.


-- ╔══════════════ PART 2 · SCHEMA ══════════════╗

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
  role        text not null default 'employee' check (role in ('employee','approver','store','admin')),
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


-- ╔══════════════ PART 3 · SEED DATA ══════════════╗

-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — Supabase seed  v3 (SRS2 25-08-26, from the Data List Excel workbooks)
-- Product photos are NOT stored here — the middleware serves them from
-- middleware/store/item-images.js, so this file stays small.
-- Run AFTER schema.sql. Safe to re-run: upserts by primary key.
-- ═══════════════════════════════════════════════════════════════════

-- masters
insert into masters (kind, id, data) values ('customers', 'C01', '{"id":"C01","name":"Dubai Aluminum","address":"P. O. Box 1234, Dubai - UAE","phone":"+971 4 223xxxx","fax":"+971 4 414xxxx","email":"dubal@gmail.com"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('customers', 'C02', '{"id":"C02","name":"Emirates Aluminum","address":"P. O. Box 5678, Abu Dhabi - UAE","phone":"+971 2 323xxxx","fax":"+971 4 512xxxx","email":"emal@gmail.com"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('contracts', '50002834', '{"ref":"50002834","customer":"C01","value":500000,"start":"2026-08-10","end":"2027-08-09"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('contracts', '60008792', '{"ref":"60008792","customer":"C02","value":450000,"start":"2026-08-20","end":"2027-08-19"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'PLDA', '{"code":"PLDA","name":"Pot Line Dubal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'EGDA', '{"code":"EGDA","name":"Engineering Dubal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'MNDA', '{"code":"MNDA","name":"Maintenance Dubal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'PLEA', '{"code":"PLEA","name":"Pot Line Emal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'EGEA', '{"code":"EGEA","name":"Engineering Emal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('departments', 'MNEA', '{"code":"MNEA","name":"Maintenance Emal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'DA001', '{"code":"DA001","name":"Dubal1"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'DA002', '{"code":"DA002","name":"Dubal2"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'DA003', '{"code":"DA003","name":"Dubal3"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'EA001', '{"code":"EA001","name":"Emal1"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'EA002', '{"code":"EA002","name":"Emal2"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('locations', 'EA003', '{"code":"EA003","name":"Emal3"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('divisions', 'PSSEGA', '{"code":"PSSEGA","name":"Prosafe EGA"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('divisions', 'PSSGNS', '{"code":"PSSGNS","name":"Prosafe General"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('stores', 'EGAMS', '{"code":"EGAMS","name":"EGA Main Store","division":"PSSEGA","type":"main"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('stores', 'EGADR', '{"code":"EGADR","name":"Dubal Reservation Store","division":"PSSEGA","type":"reservation"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('stores', 'EGAER', '{"code":"EGAER","name":"Emal Reservation Store","division":"PSSEGA","type":"reservation"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'HP', '{"code":"HP","name":"Head Protection"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'EF', '{"code":"EF","name":"Eye & Face Protection"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'RP', '{"code":"RP","name":"Respiratory Protection"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'PC', '{"code":"PC","name":"Protective Clothing"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'GL', '{"code":"GL","name":"Gloves"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('groups', 'FW', '{"code":"FW","name":"Foot Wear"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'HT', '{"code":"HT","name":"Hard Hat"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'SP', '{"code":"SP","name":"Spectacle"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'GG', '{"code":"GG","name":"Goggle"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'DM', '{"code":"DM","name":"Dust Mask"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'CV', '{"code":"CV","name":"Coverall"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'ST', '{"code":"ST","name":"Shirt"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'TR', '{"code":"TR","name":"Trouser"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'VS', '{"code":"VS","name":"Vest"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'HR', '{"code":"HR","name":"Heat Resistant"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'GP', '{"code":"GP","name":"General Purpose"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('categories', 'HM', '{"code":"HM","name":"Hot Metal"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'HPHTPE0001', '{"desc":"Hart Hat, Green","alias":"Hart Hat, Green","code":"HPHTPE0001","name":"Hart Hat, Green","uom":"PCS","group":"HP","cat":"HT","pic":"⛑️"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'HPHTPE0002', '{"desc":"Hart Hat, Red","alias":"Hart Hat, Red","code":"HPHTPE0002","name":"Hart Hat, Red","uom":"PCS","group":"HP","cat":"HT","pic":"⛑️"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'HPHTPE0003', '{"desc":"Hart Hat, Blue","alias":"Hart Hat, Blue","code":"HPHTPE0003","name":"Hart Hat, Blue","uom":"PCS","group":"HP","cat":"HT","pic":"⛑️"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'EFSPPC0001', '{"desc":"Safety Spectacle, Clear","alias":"Safety Spectacle, Clear","code":"EFSPPC0001","name":"Safety Spectacle, Clear","uom":"PCS","group":"EF","cat":"SP","pic":"🥽"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'EFSPPC0002', '{"desc":"Safety Spectacle, Grey","alias":"Safety Spectacle, Grey","code":"EFSPPC0002","name":"Safety Spectacle, Grey","uom":"PCS","group":"EF","cat":"SP","pic":"🥽"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'EFGGNY0001', '{"desc":"Impact Goggle","alias":"Impact Goggle","code":"EFGGNY0001","name":"Impact Goggle","uom":"PCS","group":"EF","cat":"GG","pic":"🥽"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'RPDM950001', '{"desc":"N95 Dust Mask, 20 pcs/pkt","alias":"N95 Dust Mask, 20 pcs/pkt","code":"RPDM950001","name":"N95 Dust Mask, 20 pcs/pkt","uom":"PKT","group":"RP","cat":"DM","pic":"😷"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCCVCT0001', '{"desc":"100% Cotton Coverall, Royal Blue, Size - Medium","alias":"100% Cotton Coverall, Royal Blue, Size - Medium","code":"PCCVCT0001","name":"100% Cotton Coverall, Royal Blue, Size - Medium","uom":"PCS","group":"PC","cat":"CV","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCCVCT0002', '{"desc":"100% Cotton Coverall, Royal Blue, Size - Large","alias":"100% Cotton Coverall, Royal Blue, Size - Large","code":"PCCVCT0002","name":"100% Cotton Coverall, Royal Blue, Size - Large","uom":"PCS","group":"PC","cat":"CV","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCCVCT0003', '{"desc":"100% Cotton Coverall, Royal Blue, Size - X Large","alias":"100% Cotton Coverall, Royal Blue, Size - X Large","code":"PCCVCT0003","name":"100% Cotton Coverall, Royal Blue, Size - X Large","uom":"PCS","group":"PC","cat":"CV","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHHM0001', '{"desc":"Hot Metal Shirt, Medium Blue, Size - Medium","alias":"Hot Metal Shirt, Medium Blue, Size - Medium","code":"PCSHHM0001","name":"Hot Metal Shirt, Medium Blue, Size - Medium","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHHM0002', '{"desc":"Hot Metal Shirt, Medium Blue, Size - Large","alias":"Hot Metal Shirt, Medium Blue, Size - Large","code":"PCSHHM0002","name":"Hot Metal Shirt, Medium Blue, Size - Large","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHHM0003', '{"desc":"Hot Metal Shirt, Medium Blue, Size - X Large","alias":"Hot Metal Shirt, Medium Blue, Size - X Large","code":"PCSHHM0003","name":"Hot Metal Shirt, Medium Blue, Size - X Large","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHCT0001', '{"desc":"Poly Cotton Work Shirt, Khaki, Size - Medium","alias":"Poly Cotton Work Shirt, Khaki, Size - Medium","code":"PCSHCT0001","name":"Poly Cotton Work Shirt, Khaki, Size - Medium","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHCT0002', '{"desc":"Poly Cotton Work Shirt, Khaki, Size - Large","alias":"Poly Cotton Work Shirt, Khaki, Size - Large","code":"PCSHCT0002","name":"Poly Cotton Work Shirt, Khaki, Size - Large","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCSHCT0003', '{"desc":"Poly Cotton Work Shirt, Khaki, Size - X Large","alias":"Poly Cotton Work Shirt, Khaki, Size - X Large","code":"PCSHCT0003","name":"Poly Cotton Work Shirt, Khaki, Size - X Large","uom":"PCS","group":"PC","cat":"ST","pic":"👕"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRHM0001', '{"desc":"Hot Metal Trouser, Grey, Size - 30","alias":"Hot Metal Trouser, Grey, Size - 30","code":"PCTRHM0001","name":"Hot Metal Trouser, Grey, Size - 30","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRHM0002', '{"desc":"Hot Metal Trouser, Grey, Size - 32","alias":"Hot Metal Trouser, Grey, Size - 32","code":"PCTRHM0002","name":"Hot Metal Trouser, Grey, Size - 32","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRHM0003', '{"desc":"Hot Metal Trouser, Grey, Size - 34","alias":"Hot Metal Trouser, Grey, Size - 34","code":"PCTRHM0003","name":"Hot Metal Trouser, Grey, Size - 34","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRHM0004', '{"desc":"Hot Metal Trouser, Grey, Size - 36","alias":"Hot Metal Trouser, Grey, Size - 36","code":"PCTRHM0004","name":"Hot Metal Trouser, Grey, Size - 36","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRCT0001', '{"desc":"Poly Cotton Work Trouser, Navy Blue, Size - 30","alias":"Poly Cotton Work Trouser, Navy Blue, Size - 30","code":"PCTRCT0001","name":"Poly Cotton Work Trouser, Navy Blue, Size - 30","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRCT0002', '{"desc":"Poly Cotton Work Trouser, Navy Blue, Size - 32","alias":"Poly Cotton Work Trouser, Navy Blue, Size - 32","code":"PCTRCT0002","name":"Poly Cotton Work Trouser, Navy Blue, Size - 32","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRCT0003', '{"desc":"Poly Cotton Work Trouser, Navy Blue, Size - 34","alias":"Poly Cotton Work Trouser, Navy Blue, Size - 34","code":"PCTRCT0003","name":"Poly Cotton Work Trouser, Navy Blue, Size - 34","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCTRCT0004', '{"desc":"Poly Cotton Work Trouser, Navy Blue, Size - 36","alias":"Poly Cotton Work Trouser, Navy Blue, Size - 36","code":"PCTRCT0004","name":"Poly Cotton Work Trouser, Navy Blue, Size - 36","uom":"PCS","group":"PC","cat":"TR","pic":"👖"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCVSPE0001', '{"desc":"Hi-Viz Vest, Yellow, Size - Medium","alias":"Hi-Viz Vest, Yellow, Size - Medium","code":"PCVSPE0001","name":"Hi-Viz Vest, Yellow, Size - Medium","uom":"PRS","group":"PC","cat":"VS","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCVSPE0002', '{"desc":"Hi-Viz Vest, Yellow, Size - Large","alias":"Hi-Viz Vest, Yellow, Size - Large","code":"PCVSPE0002","name":"Hi-Viz Vest, Yellow, Size - Large","uom":"PRS","group":"PC","cat":"VS","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'PCVSPE0003', '{"desc":"Hi-Viz Vest, Yellow, Size - X Large","alias":"Hi-Viz Vest, Yellow, Size - X Large","code":"PCVSPE0003","name":"Hi-Viz Vest, Yellow, Size - X Large","uom":"PRS","group":"PC","cat":"VS","pic":"🦺"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'GLHMCT0001', '{"desc":"Heat Resistant Gloves","alias":"Heat Resistant Gloves","code":"GLHMCT0001","name":"Heat Resistant Gloves","uom":"PRS","group":"GL","cat":"HR","pic":"🧤"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'GLGPCT0001', '{"desc":"General Purpose Gloves, 12 prs/dp","alias":"General Purpose Gloves, 12 prs/dp","code":"GLGPCT0001","name":"General Purpose Gloves, 12 prs/dp","uom":"DP","group":"GL","cat":"GP","pic":"🧤"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FWHMBT0001', '{"desc":"Hot Metal Boots, Black, Size - 40","alias":"Hot Metal Boots, Black, Size - 40","code":"FWHMBT0001","name":"Hot Metal Boots, Black, Size - 40","uom":"PRS","group":"FW","cat":"HM","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FWHMBT0002', '{"desc":"Hot Metal Boots, Black, Size - 41","alias":"Hot Metal Boots, Black, Size - 41","code":"FWHMBT0002","name":"Hot Metal Boots, Black, Size - 41","uom":"PRS","group":"FW","cat":"HM","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FWHMBT0003', '{"desc":"Hot Metal Boots, Black, Size - 42","alias":"Hot Metal Boots, Black, Size - 42","code":"FWHMBT0003","name":"Hot Metal Boots, Black, Size - 42","uom":"PRS","group":"FW","cat":"HM","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FWHMBT0004', '{"desc":"Hot Metal Boots, Black, Size - 43","alias":"Hot Metal Boots, Black, Size - 43","code":"FWHMBT0004","name":"Hot Metal Boots, Black, Size - 43","uom":"PRS","group":"FW","cat":"HM","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FWHMBT0005', '{"desc":"Hot Metal Boots, Black, Size - 44","alias":"Hot Metal Boots, Black, Size - 44","code":"FWHMBT0005","name":"Hot Metal Boots, Black, Size - 44","uom":"PRS","group":"FW","cat":"HM","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FEGPBT0001', '{"desc":"General Purpose Safety Boots, Brown, Size - 40","alias":"General Purpose Safety Boots, Brown, Size - 40","code":"FEGPBT0001","name":"General Purpose Safety Boots, Brown, Size - 40","uom":"PRS","group":"FW","cat":"GP","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FEGPBT0002', '{"desc":"General Purpose Safety Boots, Brown, Size - 41","alias":"General Purpose Safety Boots, Brown, Size - 41","code":"FEGPBT0002","name":"General Purpose Safety Boots, Brown, Size - 41","uom":"PRS","group":"FW","cat":"GP","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FEGPBT0003', '{"desc":"General Purpose Safety Boots, Brown, Size - 42","alias":"General Purpose Safety Boots, Brown, Size - 42","code":"FEGPBT0003","name":"General Purpose Safety Boots, Brown, Size - 42","uom":"PRS","group":"FW","cat":"GP","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FEGPBT0004', '{"desc":"General Purpose Safety Boots, Brown, Size - 43","alias":"General Purpose Safety Boots, Brown, Size - 43","code":"FEGPBT0004","name":"General Purpose Safety Boots, Brown, Size - 43","uom":"PRS","group":"FW","cat":"GP","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('items', 'FEGPBT0005', '{"desc":"General Purpose Safety Boots, Brown, Size - 44","alias":"General Purpose Safety Boots, Brown, Size - 44","code":"FEGPBT0005","name":"General Purpose Safety Boots, Brown, Size - 44","uom":"PRS","group":"FW","cat":"GP","pic":"🥾"}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('priceLists', 'PL1', '{"id":"PL1","name":"PPE Price List1","desc":"Supply of PPE","contract":"50002834","customer":"C01","validFrom":"2026-08-10","validTill":"2026-11-09","deliveryPeriod":2,"lines":[{"sl":1,"codes":["HPHTPE0001","HPHTPE0002","HPHTPE0003"],"uom":"PCS","price":15,"alloc":2,"restricted":true},{"sl":2,"codes":["EFSPPC0002","EFSPPC0001"],"uom":"PCS","price":30,"alloc":3,"restricted":true},{"sl":3,"codes":["RPDM950001"],"uom":"PKT","price":50,"alloc":5,"restricted":true},{"sl":4,"codes":["PCSHHM0001","PCSHHM0002","PCSHHM0003"],"uom":"PCS","price":225,"alloc":3,"restricted":true},{"sl":5,"codes":["PCTRHM0001","PCTRHM0002","PCTRHM0003","PCTRHM0004"],"uom":"PCS","price":230,"alloc":3,"restricted":true},{"sl":6,"codes":["GLHMCT0001"],"uom":"PRS","price":20,"alloc":10,"restricted":true},{"sl":7,"codes":["GLGPCT0001"],"uom":"DP","price":15,"alloc":20,"restricted":true},{"sl":8,"codes":["FWHMBT0001","FWHMBT0002","FWHMBT0003","FWHMBT0004","FWHMBT0005"],"uom":"PRS","price":600,"alloc":1,"restricted":true}]}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('priceLists', 'PL2', '{"id":"PL2","name":"PPE Price List2","desc":"Supply of PPE","contract":"50002834","customer":"C01","validFrom":"2026-08-15","validTill":"2026-11-14","deliveryPeriod":2,"lines":[{"sl":1,"codes":["HPHTPE0002","HPHTPE0001","HPHTPE0003"],"uom":"PCS","price":15,"alloc":2,"restricted":true},{"sl":2,"codes":["EFSPPC0001","EFSPPC0002"],"uom":"PCS","price":10,"alloc":3,"restricted":true},{"sl":3,"codes":["EFGGNY0001"],"uom":"PCS","price":15,"alloc":2,"restricted":true},{"sl":4,"codes":["RPDM950001"],"uom":"PKT","price":50,"alloc":5,"restricted":true},{"sl":5,"codes":["PCSHCT0001","PCSHCT0002","PCSHCT0003"],"uom":"PCS","price":85,"alloc":3,"restricted":true},{"sl":6,"codes":["PCTRCT0001","PCTRCT0002","PCTRCT0003","PCTRCT0004"],"uom":"PCS","price":80,"alloc":3,"restricted":true},{"sl":7,"codes":["PCVSPE0001","PCVSPE0002","PCVSPE0003"],"uom":"PRS","price":25,"alloc":2,"restricted":true},{"sl":8,"codes":["GLGPCT0001"],"uom":"DP","price":15,"alloc":10,"restricted":true},{"sl":9,"codes":["FEGPBT0001","FEGPBT0002","FEGPBT0003","FEGPBT0004","FEGPBT0005"],"uom":"PRS","price":175,"alloc":2,"restricted":true}]}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('priceLists', 'PL3', '{"id":"PL3","name":"PPE Price List3","desc":"Supply of PPE","contract":"60008792","customer":"C02","validFrom":"2026-08-20","validTill":"2026-11-19","deliveryPeriod":2,"lines":[{"sl":1,"codes":["HPHTPE0003","HPHTPE0001","HPHTPE0002"],"uom":"PCS","price":15,"alloc":0,"restricted":true},{"sl":2,"codes":["EFSPPC0002","EFSPPC0001"],"uom":"PCS","price":10,"alloc":3,"restricted":true},{"sl":3,"codes":["EFGGNY0001"],"uom":"PCS","price":15,"alloc":2,"restricted":true},{"sl":4,"codes":["RPDM950001"],"uom":"PKT","price":50,"alloc":5,"restricted":true},{"sl":5,"codes":["PCCVCT0001","PCCVCT0002","PCCVCT0003"],"uom":"PCS","price":100,"alloc":3,"restricted":true},{"sl":6,"codes":["PCVSPE0001","PCVSPE0002","PCVSPE0003"],"uom":"PRS","price":25,"alloc":2,"restricted":true},{"sl":7,"codes":["GLGPCT0001"],"uom":"DP","price":15,"alloc":10,"restricted":true},{"sl":8,"codes":["FEGPBT0001","FEGPBT0002","FEGPBT0003","FEGPBT0004","FEGPBT0005"],"uom":"PRS","price":175,"alloc":2,"restricted":true}]}'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('uoms', 'PCS', '"PCS"'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('uoms', 'PKT', '"PKT"'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('uoms', 'PRS', '"PRS"'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('uoms', 'DOZ', '"DOZ"'::jsonb) on conflict (kind, id) do update set data = excluded.data;
insert into masters (kind, id, data) values ('uoms', 'DP', '"DP"'::jsonb) on conflict (kind, id) do update set data = excluded.data;

-- opening inventory (EGA Main Store; reservation stores start empty)
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'HPHTPE0001', 25) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'HPHTPE0002', 25) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'HPHTPE0003', 25) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'EFSPPC0001', 25) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'EFSPPC0002', 25) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'EFGGNY0001', 10) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'RPDM950001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCCVCT0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCCVCT0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCCVCT0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHHM0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHHM0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHHM0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHCT0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHCT0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCSHCT0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRHM0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRHM0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRHM0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRHM0004', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRCT0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRCT0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRCT0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCTRCT0004', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCVSPE0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCVSPE0002', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'PCVSPE0003', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'GLHMCT0001', 50) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'GLGPCT0001', 100) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FWHMBT0001', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FWHMBT0002', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FWHMBT0003', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FWHMBT0004', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FWHMBT0005', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FEGPBT0001', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FEGPBT0002', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FEGPBT0003', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FEGPBT0004', 20) on conflict (store_code, item_code) do nothing;
insert into inventory (store_code, item_code, qty) values ('EGAMS', 'FEGPBT0005', 20) on conflict (store_code, item_code) do nothing;

-- document sequences
insert into seqs (key, val) values ('or', 1000) on conflict (key) do nothing;
insert into seqs (key, val) values ('so', 5000) on conflict (key) do nothing;
insert into seqs (key, val) values ('dn', 3000) on conflict (key) do nothing;
insert into seqs (key, val) values ('inv', 9000) on conflict (key) do nothing;
insert into seqs (key, val) values ('ret', 7000) on conflict (key) do nothing;
insert into seqs (key, val) values ('cn', 7500) on conflict (key) do nothing;
insert into seqs (key, val) values ('stv', 6000) on conflict (key) do nothing;
insert into seqs (key, val) values ('emp', 1003) on conflict (key) do nothing;

-- NOTE: no demo users in Supabase mode — people sign up in the apps and
-- the admin (ADMIN_EMAILS) assigns customer, price lists and stores.
