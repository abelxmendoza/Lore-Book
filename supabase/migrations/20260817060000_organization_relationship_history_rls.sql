-- organization_relationship_history has RLS enabled (from its creating
-- migration, 20260815010000_organization_relationship_temporal_history.sql)
-- but was never given a policy — the only table found with that gap. Every
-- current reader/writer (organizationRelationshipStateService.ts,
-- organizationJourneyService.ts) goes through supabaseAdmin (service role,
-- bypasses RLS), so this isn't an active bug, but it's a real defense-in-depth
-- gap: any future code path that queries this table with a user-scoped client
-- instead of supabaseAdmin would silently see zero rows. Matches the same
-- user_id = auth.uid() isolation policy already used on `organizations`.

CREATE POLICY organization_relationship_history_user_isolation
  ON public.organization_relationship_history
  FOR ALL
  USING (user_id = auth.uid());
