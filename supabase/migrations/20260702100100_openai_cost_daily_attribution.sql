-- =====================================================
-- Whole-app OpenAI cost attribution (Launch-Readiness cost observability)
-- =====================================================
-- platform_openai_spend tracks a single monthly USD total with no breakdown, so
-- it can't answer "where is the money going and why". This adds a daily rollup
-- keyed by (day, operation, model) — bounded cardinality, but enough to attribute
-- spend to chat vs ingestion vs embeddings, to specific expensive operations
-- (chat.answer, chat.continuity, …), and to specific models, over time.

CREATE TABLE IF NOT EXISTS public.openai_cost_daily (
  day             date    NOT NULL,
  operation       text    NOT NULL DEFAULT 'unknown',
  model           text    NOT NULL DEFAULT 'unknown',
  calls           integer NOT NULL DEFAULT 0,
  input_tokens    bigint  NOT NULL DEFAULT 0,
  output_tokens   bigint  NOT NULL DEFAULT 0,
  estimated_usd   numeric(14, 8) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, operation, model)
);

CREATE INDEX IF NOT EXISTS openai_cost_daily_day_idx ON public.openai_cost_daily (day DESC);

-- Atomic upsert-with-increment so the meter can flush buffered deltas without a
-- read-modify-write race across concurrent requests / instances.
CREATE OR REPLACE FUNCTION public.record_openai_cost_daily(
  p_day           date,
  p_operation     text,
  p_model         text,
  p_calls         integer,
  p_input_tokens  bigint,
  p_output_tokens bigint,
  p_usd           numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.openai_cost_daily AS c
    (day, operation, model, calls, input_tokens, output_tokens, estimated_usd, updated_at)
  VALUES
    (p_day, COALESCE(p_operation, 'unknown'), COALESCE(p_model, 'unknown'),
     p_calls, p_input_tokens, p_output_tokens, p_usd, now())
  ON CONFLICT (day, operation, model) DO UPDATE SET
    calls         = c.calls         + EXCLUDED.calls,
    input_tokens  = c.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = c.output_tokens + EXCLUDED.output_tokens,
    estimated_usd = c.estimated_usd + EXCLUDED.estimated_usd,
    updated_at    = now();
END;
$$;
