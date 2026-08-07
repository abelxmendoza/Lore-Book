-- Preserve the owner-only evidence policy while avoiding per-row auth.uid()
-- re-evaluation. Browser table grants remain revoked by the Kernel migration;
-- this policy is defense in depth and supports any future reviewed grant.

DROP POLICY IF EXISTS assertion_evidence_user ON public.assertion_evidence;

CREATE POLICY assertion_evidence_user
  ON public.assertion_evidence
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
