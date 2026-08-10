-- Deterministic identity for normalized MRQ proposals created by integrity policy v1.
-- Legacy rows are deliberately excluded so deployment remains safe before cleanup.
-- Release order: apply this migration before deploying policy-v1 writers. A normal
-- (non-CONCURRENTLY) index is intentional because Supabase migration runners may
-- wrap migrations in a transaction; PostgreSQL blocks competing writes while the
-- small partial index is built, preventing an index-build race. Keep lock waits
-- bounded so a busy production table fails safely instead of stalling deploys.
SET lock_timeout = '5s';
SET statement_timeout = '2min';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.memory_proposals
    WHERE status = 'PENDING'
      AND metadata -> 'proposal_integrity' ->> 'policy_version' = 'v1'
      AND metadata ->> 'proposal_fingerprint' IS NOT NULL
    GROUP BY user_id, metadata ->> 'proposal_fingerprint'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create MRQ fingerprint index: duplicate policy-v1 pending fingerprints exist; run the read-only audit first';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_proposals_integrity_fingerprint_v1
  ON public.memory_proposals (user_id, ((metadata ->> 'proposal_fingerprint')))
  WHERE status = 'PENDING'
    AND metadata -> 'proposal_integrity' ->> 'policy_version' = 'v1'
    AND metadata ->> 'proposal_fingerprint' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_proposals_group_key_pending
  ON public.memory_proposals (user_id, ((metadata ->> 'group_key')))
  WHERE status = 'PENDING';

COMMENT ON INDEX public.idx_memory_proposals_integrity_fingerprint_v1 IS
  'Prevents duplicate normalized pending beliefs while leaving legacy proposals available for audited cleanup.';

RESET statement_timeout;
RESET lock_timeout;

-- Manual rollback (not executed here):
-- DROP INDEX IF EXISTS public.idx_memory_proposals_group_key_pending;
-- DROP INDEX IF EXISTS public.idx_memory_proposals_integrity_fingerprint_v1;
