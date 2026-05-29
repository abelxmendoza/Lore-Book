-- Neural Training Signals
--
-- Storage table for training data accumulated by trainingSignalLogger.ts.
-- Used as the data source for future KGE (RotatE/TransE) and GNN model training.
--
-- signal_type values:
--   retrieval_feedback   — (query, retrieved_ids, positive_ids) for dense retrieval training
--   entity_co_occurrence — (entity_a, entity_b, memory_id) for KGE training triples
--   community_assignment — (node_id, community_id) for GNN node classification labels
--   temporal_transition  — (edge_id, from_phase, to_phase) for temporal GNN / HMM

CREATE TABLE IF NOT EXISTS neural_training_signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type  text NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Time-based partitioning hint (partition by month when volume warrants it)
CREATE INDEX IF NOT EXISTS idx_nts_user_type    ON neural_training_signals (user_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_nts_created_at   ON neural_training_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nts_signal_type  ON neural_training_signals (signal_type);

-- GIN for payload queries (e.g., find all signals where entityA = X)
CREATE INDEX IF NOT EXISTS idx_nts_payload_gin  ON neural_training_signals USING GIN (payload);

-- Auto-expire old signals after 6 months (training data has diminishing marginal value)
-- Uses a background job rather than TTL to avoid lock contention.
-- Manual cleanup: DELETE FROM neural_training_signals WHERE created_at < now() - interval '6 months';

-- RLS: users can only read their own signals (write is service-role only)
ALTER TABLE neural_training_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own training signals"
  ON neural_training_signals
  FOR SELECT
  USING (auth.uid() = user_id);
