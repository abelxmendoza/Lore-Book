-- Add locations.summary (schema drift fix).
--
-- locationMergeService reads + writes locations.summary (LOC_COLUMNS and the
-- card-merge update), but the column was never created on the live DB. The
-- failing SELECT returned null, which the merge reported as the misleading
-- "Source location not found" — making every place merge fail. Applied to prod
-- 2026-07-26 via apply_migration; this file tracks it.
alter table public.locations add column if not exists summary text;
