-- Mirrored from supabase_migrations.schema_migrations (version 20260616170412).
-- Applied on remote before this file existed in the repo.

-- Schema-drift fix part 1: additive columns (metadata-only adds, no table rewrite).
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

ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS "timestamp" timestamptz;
UPDATE public.journal_entries SET "timestamp" = created_at WHERE "timestamp" IS NULL;
ALTER TABLE public.journal_entries ALTER COLUMN "timestamp" SET DEFAULT now();
