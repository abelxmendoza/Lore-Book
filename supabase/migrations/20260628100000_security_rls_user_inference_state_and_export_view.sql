-- Resolve two CRITICAL Supabase security advisors. Both objects are accessed only
-- server-side via the service-role client (which bypasses RLS), and the frontend
-- (anon key) never touches them, so these changes do not affect the app.

-- 1) user_inference_state: RLS was disabled on a public table, so anyone with the
--    (publicly-shipped) anon key could read/write it via the Data API. Enable RLS
--    and scope access to the row owner. The server keeps full access via the
--    service role. Uses (select auth.uid()) so the check is evaluated once per
--    query, not once per row (auth_rls_initplan best practice).
alter table public.user_inference_state enable row level security;

drop policy if exists "owner_all_user_inference_state" on public.user_inference_state;
create policy "owner_all_user_inference_state"
  on public.user_inference_state
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2) provenance_edges_export: a SECURITY DEFINER view runs with the creator's
--    privileges and bypasses RLS. Recreate it as SECURITY INVOKER so it respects
--    the caller's RLS. Its own WHERE auth.uid() = user_id filter is preserved.
alter view public.provenance_edges_export set (security_invoker = on);
