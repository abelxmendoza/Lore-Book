-- Fix schema drift: add columns the application selects but that were missing in
-- production, which caused live "column does not exist" query errors (surfaced in
-- Postgres logs). All additive and idempotent with safe defaults.
--
-- Applied to production 2026-06-16 via two migrations (split because a STORED
-- generated column for omega_entities.entity_type forced a table rewrite that
-- exceeded the instance maintenance_work_mem; replaced with a sync trigger).

-- ── Additive columns (metadata-only adds, no table rewrite) ───────────────────
DO $$
BEGIN
  IF to_regclass('public.locations') IS NOT NULL THEN
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
  END IF;
  IF to_regclass('public.entity_facts') IS NOT NULL THEN
    ALTER TABLE public.entity_facts ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF to_regclass('public.life_arcs') IS NOT NULL THEN
    ALTER TABLE public.life_arcs ADD COLUMN IF NOT EXISTS stability_score real NOT NULL DEFAULT 0.5;
  END IF;
  IF to_regclass('public.social_communities') IS NOT NULL THEN
    ALTER TABLE public.social_communities ADD COLUMN IF NOT EXISTS theme text;
  END IF;
  IF to_regclass('public.organizations') IS NOT NULL THEN
    ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS importance_score real NOT NULL DEFAULT 0;
  END IF;
END $$;

-- journal_entries.timestamp — backfill from created_at, default now() for new rows
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS "timestamp" timestamptz;
UPDATE public.journal_entries SET "timestamp" = created_at WHERE "timestamp" IS NULL;
ALTER TABLE public.journal_entries ALTER COLUMN "timestamp" SET DEFAULT now();

-- ── omega_entities.entity_type — mirror of the canonical `type` column ─────────
-- Code inconsistently reads `entity_type`; the real column is `type`. Mirror it
-- via a plain column + sync trigger (avoids the STORED-generated-column rewrite).
DO $$
BEGIN
  IF to_regclass('public.omega_entities') IS NULL THEN
    RAISE NOTICE 'fix_schema_drift_missing_columns: omega_entities missing; skip entity_type mirror';
    RETURN;
  END IF;

  ALTER TABLE public.omega_entities ADD COLUMN IF NOT EXISTS entity_type text;
  UPDATE public.omega_entities SET entity_type = type WHERE entity_type IS DISTINCT FROM type;
END $$;

CREATE OR REPLACE FUNCTION public.sync_omega_entity_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.entity_type := NEW.type;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.omega_entities') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS omega_entities_sync_entity_type ON public.omega_entities;
  CREATE TRIGGER omega_entities_sync_entity_type
    BEFORE INSERT OR UPDATE ON public.omega_entities
    FOR EACH ROW EXECUTE FUNCTION public.sync_omega_entity_type();
END $$;
