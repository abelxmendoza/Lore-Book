-- Review-first life arc suggestions built from canonical chronology.
-- Proposals remain user-owned and separate from canonical life_arcs until the
-- user explicitly creates or merges one.

BEGIN;

CREATE TABLE IF NOT EXISTS public.life_arc_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  arc_type text NOT NULL CHECK (arc_type IN ('life_era', 'skill', 'location', 'work', 'custom')),
  track text NOT NULL CHECK (track IN ('career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed', 'custom')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  explanation text NOT NULL,
  source_record_ids text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'merged', 'dismissed')),
  created_arc_id uuid REFERENCES public.life_arcs(id) ON DELETE SET NULL,
  merged_into_arc_id uuid REFERENCES public.life_arcs(id) ON DELETE SET NULL,
  decision_reason text,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS life_arc_proposals_user_status_idx
  ON public.life_arc_proposals (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS life_arc_proposals_source_ids_idx
  ON public.life_arc_proposals USING gin (source_record_ids);

-- Canonical creation is idempotent without treating user-editable titles as IDs.
CREATE UNIQUE INDEX IF NOT EXISTS life_arcs_proposal_fingerprint_idx
  ON public.life_arcs (user_id, ((metadata ->> 'proposal_fingerprint')))
  WHERE (metadata ->> 'proposal_fingerprint') IS NOT NULL;

CREATE TRIGGER life_arc_proposals_updated_at
  BEFORE UPDATE ON public.life_arc_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_life_arcs_updated_at();

ALTER TABLE public.life_arc_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own life arc proposals"
  ON public.life_arc_proposals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own life arc proposals"
  ON public.life_arc_proposals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own life arc proposals"
  ON public.life_arc_proposals FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own life arc proposals"
  ON public.life_arc_proposals FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Explicit Data API grants are required by newer Supabase project defaults.
REVOKE ALL ON TABLE public.life_arc_proposals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.life_arc_proposals TO authenticated;
GRANT ALL ON TABLE public.life_arc_proposals TO service_role;

COMMENT ON TABLE public.life_arc_proposals IS
  'Review-first, evidence-backed proposals generated from canonical stitched chronology before life_arcs mutation.';

-- Durable, coalesced rebuild requests. Canonical evidence writes enqueue one
-- row per user; the bounded core worker consumes it without enabling the
-- experimental enrichment runtime.
CREATE TABLE IF NOT EXISTS public.life_arc_proposal_rebuild_requests (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.life_arc_proposal_rebuild_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can enqueue own life arc proposal rebuild"
  ON public.life_arc_proposal_rebuild_requests FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can refresh own life arc proposal rebuild"
  ON public.life_arc_proposal_rebuild_requests FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can read own life arc proposal rebuild"
  ON public.life_arc_proposal_rebuild_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.life_arc_proposal_rebuild_requests FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.life_arc_proposal_rebuild_requests TO authenticated;
GRANT ALL ON TABLE public.life_arc_proposal_rebuild_requests TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_life_arc_proposal_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.life_arc_proposal_rebuild_requests (user_id, reason, requested_at, attempts, last_error, updated_at)
  VALUES (NEW.user_id, TG_TABLE_NAME, now(), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    reason = EXCLUDED.reason,
    requested_at = EXCLUDED.requested_at,
    attempts = 0,
    last_error = NULL,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_life_arc_proposal_rebuild() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_life_arc_proposal_rebuild() TO authenticated, service_role;

CREATE TRIGGER journal_entries_queue_life_arc_proposals
  AFTER INSERT OR UPDATE OF date, content ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_life_arc_proposal_rebuild();

CREATE TRIGGER resolved_events_queue_life_arc_proposals
  AFTER INSERT OR UPDATE OF start_time, end_time, title, summary ON public.resolved_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_life_arc_proposal_rebuild();

DO $$
BEGIN
  IF to_regclass('public.timeline_events') IS NOT NULL THEN
    EXECUTE 'CREATE TRIGGER timeline_events_queue_life_arc_proposals
      AFTER INSERT OR UPDATE OF occurred_at, title, description ON public.timeline_events
      FOR EACH ROW EXECUTE FUNCTION public.enqueue_life_arc_proposal_rebuild()';
  END IF;
END;
$$;

COMMIT;
