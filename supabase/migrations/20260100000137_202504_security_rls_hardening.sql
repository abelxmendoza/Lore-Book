-- Enforce strict RLS for user-owned tables
alter table if exists journal_entries enable row level security;
alter table if exists tasks enable row level security;
alter table if exists characters enable row level security;
alter table if exists relationships enable row level security;
alter table if exists task_memory_bridges enable row level security;
alter table if exists timeline_events enable row level security;

-- Shared policy template: only allow the authenticated user to view or modify their own records
create policy if not exists journal_entries_owner_select on journal_entries
  for select using (auth.uid() = user_id);
create policy if not exists journal_entries_owner_insert on journal_entries
  for insert with check (auth.uid() = user_id);
create policy if not exists journal_entries_owner_update on journal_entries
  for update using (auth.uid() = user_id);

create policy if not exists tasks_owner_select on tasks
  for select using (auth.uid() = user_id);
create policy if not exists tasks_owner_insert on tasks
  for insert with check (auth.uid() = user_id);
create policy if not exists tasks_owner_update on tasks
  for update using (auth.uid() = user_id);

create policy if not exists characters_owner_select on characters
  for select using (auth.uid() = user_id);
create policy if not exists characters_owner_insert on characters
  for insert with check (auth.uid() = user_id);
create policy if not exists characters_owner_update on characters
  for update using (auth.uid() = user_id);

create policy if not exists relationships_owner_select on relationships
  for select using (auth.uid() = user_id);
create policy if not exists relationships_owner_insert on relationships
  for insert with check (auth.uid() = user_id);
create policy if not exists relationships_owner_update on relationships
  for update using (auth.uid() = user_id);

create policy if not exists task_memory_bridges_owner_select on task_memory_bridges
  for select using (auth.uid() = user_id);
create policy if not exists task_memory_bridges_owner_insert on task_memory_bridges
  for insert with check (auth.uid() = user_id);
create policy if not exists task_memory_bridges_owner_update on task_memory_bridges
  for update using (auth.uid() = user_id);

create policy if not exists timeline_events_owner_select on timeline_events
  for select using (auth.uid() = user_id);
create policy if not exists timeline_events_owner_insert on timeline_events
  for insert with check (auth.uid() = user_id);
create policy if not exists timeline_events_owner_update on timeline_events
  for update using (auth.uid() = user_id);

-- Deny cross-user reads implicitly by requiring auth.uid() match
