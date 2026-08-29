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

-- 1 ── profiles: add SRS2 columns, keep the accounts
alter table profiles add column if not exists location    text;
alter table profiles add column if not exists price_lists jsonb not null default '[]';
alter table profiles add column if not exists from_store  text;
alter table profiles add column if not exists to_store    text;

-- reset shopping assignments (old PL ids don't match the new price lists)
update profiles set price_list = null, price_lists = '[]'::jsonb;

-- 2 ── drop v2 master tables (replaced by the `masters` table in v3)
drop table if exists price_list_lines;
drop table if exists price_lists;
drop table if exists items;
drop table if exists uoms;
drop table if exists locations;
drop table if exists departments;
drop table if exists customers;

-- 3 ── clear v2 transactional data (incompatible with the SRS2 model)
drop table if exists orders;
drop table if exists erp_docs;
drop table if exists erp_log;
drop table if exists allocations;
drop table if exists seqs;

-- Done. Now run schema.sql, then seed.sql.
