-- Add indexes for efficient fact queries (cost-optimized verification)
-- Tables are created in 20251118000144_verification_system.sql (same day, later).
-- Guard so fresh Preview replay does not index missing relations.

DO $$
BEGIN
  IF to_regclass('public.fact_claims') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS fact_claims_entry_id_idx ON public.fact_claims(entry_id);
    CREATE INDEX IF NOT EXISTS fact_claims_subject_attribute_idx ON public.fact_claims(user_id, subject, attribute);
    CREATE INDEX IF NOT EXISTS fact_claims_user_entry_idx ON public.fact_claims(user_id, entry_id);
    CREATE INDEX IF NOT EXISTS fact_claims_lookup_idx ON public.fact_claims(user_id, subject, attribute, value);
  END IF;

  IF to_regclass('public.entry_verifications') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS entry_verifications_status_idx ON public.entry_verifications(user_id, verification_status, resolved);
    CREATE INDEX IF NOT EXISTS entry_verifications_entry_idx ON public.entry_verifications(entry_id);
    CREATE INDEX IF NOT EXISTS entry_verifications_contradictions_idx ON public.entry_verifications(user_id, verification_status)
      WHERE verification_status IN ('contradicted', 'ambiguous') AND resolved = false;
  END IF;
END $$;
