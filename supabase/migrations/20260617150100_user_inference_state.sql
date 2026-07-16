-- Tracks per-user inference orchestration (T1 debounced sync, T2 full rescan).
CREATE TABLE IF NOT EXISTS public.user_inference_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_chat_at timestamptz,
  last_t1_run_at timestamptz,
  last_t2_run_at timestamptz,
  pending_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  domain_timestamps jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_report jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_inference_state_updated
  ON public.user_inference_state(updated_at);

COMMENT ON TABLE public.user_inference_state IS 'Orchestrator throttle + staleness for lore inference jobs';
