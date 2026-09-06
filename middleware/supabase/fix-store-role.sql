-- ═══════════════════════════════════════════════════════════════════
-- PROSAFE × EGA — allow the "store" role  (run once in Supabase → SQL Editor)
--
-- The profiles table was created when there were only three roles, so its
-- CHECK constraint rejects the new SRS2 Store Module role. This widens it.
-- Safe to re-run. Nothing else is touched — no data is changed or deleted.
-- ═══════════════════════════════════════════════════════════════════

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add  constraint profiles_role_check
  check (role in ('employee','approver','store','admin'));

-- Optional: make sure admin accounts are active (clears a stale "Pending" badge)
update profiles set active = true where role in ('admin', 'store') and active = false;
