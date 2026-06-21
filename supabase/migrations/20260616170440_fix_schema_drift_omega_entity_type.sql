-- Mirrored from supabase_migrations.schema_migrations (version 20260616170440).
-- Applied on remote before this file existed in the repo.

-- Schema-drift fix part 2: omega_entities.entity_type mirrors the canonical `type`
-- column. Plain column + backfill + BEFORE trigger avoids the table rewrite a
-- STORED generated column requires (which exceeded maintenance_work_mem).
ALTER TABLE public.omega_entities ADD COLUMN IF NOT EXISTS entity_type text;
UPDATE public.omega_entities SET entity_type = type WHERE entity_type IS DISTINCT FROM type;

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

DROP TRIGGER IF EXISTS omega_entities_sync_entity_type ON public.omega_entities;
CREATE TRIGGER omega_entities_sync_entity_type
  BEFORE INSERT OR UPDATE ON public.omega_entities
  FOR EACH ROW EXECUTE FUNCTION public.sync_omega_entity_type();
