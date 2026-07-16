-- Timeline Engine alters deferred: public.timeline_events is created in
-- 20250325000134_task_timeline_links.sql. Column/index work runs in
-- 20260731140000_timeline_engine_columns.sql.
DO $$
BEGIN
  RAISE NOTICE 'timeline_engine: deferred until timeline_events exists (see 20260731140000)';
END $$;
