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
alter table profiles drop constraint if exists profiles_price_list_fkey;
alter table profiles drop constraint if exists profiles_customer_fkey;
alter table profiles drop constraint if exists profiles_dept_fkey;
alter table profiles drop constraint if exists profiles_location_fkey;

-- Roles gained "store" (SRS2 Store Module) — the old CHECK constraint only
-- allowed employee/approver/admin and would reject it.
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'profiles') then
    alter table profiles drop constraint if exists profiles_role_check;
    alter table profiles add constraint profiles_role_check
      check (role in ('employee','approver','store','admin'));
  end if;
end $$;

alter table profiles add column if not exists location    text;
alter table profiles add column if not exists price_lists jsonb not null default '[]';
alter table profiles add column if not exists from_store  text;
alter table profiles add column if not exists to_store    text;

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
