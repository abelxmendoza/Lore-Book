-- RLS hardening: four tables from 000_setup_all_tables.sql that were missed
-- by the 202504_security_rls_hardening pass. Each table has user_id and
-- must be strictly owner-scoped.

-- ─── chapters ────────────────────────────────────────────────────────────────
alter table public.chapters enable row level security;

create policy "chapters: owner read"
  on public.chapters for select
  using (auth.uid() = user_id);

create policy "chapters: owner insert"
  on public.chapters for insert
  with check (auth.uid() = user_id);

create policy "chapters: owner update"
  on public.chapters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chapters: owner delete"
  on public.chapters for delete
  using (auth.uid() = user_id);

-- ─── task_events ─────────────────────────────────────────────────────────────
alter table public.task_events enable row level security;

create policy "task_events: owner read"
  on public.task_events for select
  using (auth.uid() = user_id);

create policy "task_events: owner insert"
  on public.task_events for insert
  with check (auth.uid() = user_id);

create policy "task_events: owner update"
  on public.task_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "task_events: owner delete"
  on public.task_events for delete
  using (auth.uid() = user_id);

-- ─── daily_summaries ─────────────────────────────────────────────────────────
alter table public.daily_summaries enable row level security;

create policy "daily_summaries: owner read"
  on public.daily_summaries for select
  using (auth.uid() = user_id);

create policy "daily_summaries: owner insert"
  on public.daily_summaries for insert
  with check (auth.uid() = user_id);

create policy "daily_summaries: owner update"
  on public.daily_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "daily_summaries: owner delete"
  on public.daily_summaries for delete
  using (auth.uid() = user_id);

-- ─── people_places ───────────────────────────────────────────────────────────
alter table public.people_places enable row level security;

create policy "people_places: owner read"
  on public.people_places for select
  using (auth.uid() = user_id);

create policy "people_places: owner insert"
  on public.people_places for insert
  with check (auth.uid() = user_id);

create policy "people_places: owner update"
  on public.people_places for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "people_places: owner delete"
  on public.people_places for delete
  using (auth.uid() = user_id);
