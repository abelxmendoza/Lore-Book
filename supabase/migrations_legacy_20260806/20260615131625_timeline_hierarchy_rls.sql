-- Mirrored from supabase_migrations.schema_migrations (version 20260615131625).
-- Applied on remote before this file existed in the repo.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['timeline_mythos','timeline_epochs','timeline_eras','timeline_sagas','timeline_arcs','timeline_scenes','timeline_actions','timeline_microactions','timeline_search_index']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_user_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() = user_id);', t||'_user_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_user_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id);', t||'_user_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_user_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id);', t||'_user_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_user_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id);', t||'_user_delete', t);
  END LOOP;
END $$;
