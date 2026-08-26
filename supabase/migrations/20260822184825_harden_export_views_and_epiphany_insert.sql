-- Production ledger alias (no schema changes).
--
-- GitHub Supabase Preview compares schema_migrations.version to filenames in
-- supabase/migrations/. Production recorded this migration at 20260822184825
-- while the canonical repo file remains:
--   20260820015515_harden_export_views_and_epiphany_insert.sql
--
-- This file exists so the version check can see 20260822184825. Do not copy or
-- re-run the canonical GRANT/policy payload. Do not treat this as permission to
-- supabase db push, migration repair, or apply SQL to production.

DO $production_ledger_alias$
BEGIN
  NULL;
END
$production_ledger_alias$;
