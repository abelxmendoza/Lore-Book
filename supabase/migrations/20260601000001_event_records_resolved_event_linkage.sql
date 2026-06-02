-- ============================================================================
-- MIGRATION: event_records → resolved_events explicit linkage
-- Phase A of the Event Intelligence Linkage Sprint
--
-- PROBLEM BEING SOLVED
-- ====================
-- event_records (Mode Router system — emotions/cognitions/identity impacts)
-- and resolved_events (Temporal Assembler — what happened/who/where) are
-- currently joined only by date approximation:
--
--   event_date::date = resolved_events.start_time::date
--
-- This breaks for:
--   - Retroactive journaling ("let me tell you about last week")
--   - Multi-session events
--   - Event chat conversations (user reflects on old events from a new date)
--
-- This migration adds an explicit nullable FK so the two systems can be
-- linked precisely. The date join remains as the backward-compatible fallback.
--
-- DESIGN PRINCIPLES
-- =================
-- 1. Nullable: no constraint on existing data, full backward compatibility
-- 2. Additive only: no existing columns modified or removed
-- 3. Zero downtime: nullable column addition in PostgreSQL is instant (no rewrite)
-- 4. Fallback preserved: date join continues to work for unlinked records
-- 5. Never-overwrite semantics enforced at the application layer via IS NULL guards
--
-- ROLLBACK
-- ========
-- ALTER TABLE public.event_records DROP COLUMN IF EXISTS resolved_event_id;
-- DROP INDEX IF EXISTS idx_event_records_resolved_event_user;
-- ============================================================================

-- Step 1: Add the nullable FK column
-- PostgreSQL adds nullable columns without a table rewrite — zero downtime.
ALTER TABLE public.event_records
  ADD COLUMN IF NOT EXISTS resolved_event_id UUID
    REFERENCES public.resolved_events(id)
    ON DELETE SET NULL;

-- Step 2: Sparse index — only indexes non-null values, minimal overhead.
-- Retrieval path: WHERE user_id = $1 AND resolved_event_id = $2 uses this index.
-- For null-valued rows (unlinked records), the date-based indexes already exist.
CREATE INDEX IF NOT EXISTS idx_event_records_resolved_event_user
  ON public.event_records(user_id, resolved_event_id)
  WHERE resolved_event_id IS NOT NULL;

-- Verification query (run after migration to confirm):
-- SELECT COUNT(*) as total,
--        COUNT(resolved_event_id) as linked,
--        COUNT(*) - COUNT(resolved_event_id) as unlinked
-- FROM event_records;
