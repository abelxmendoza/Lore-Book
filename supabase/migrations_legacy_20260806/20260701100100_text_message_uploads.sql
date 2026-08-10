-- Persistent storage for uploaded text-message screenshots and transcripts.
-- Links to character_media rows; preserves originals even if character is reassigned.

create table if not exists public.text_message_uploads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  character_id      uuid,
  character_media_id uuid references public.character_media(id) on delete set null,
  storage_path      text,
  public_url        text,
  extracted_text    text,
  platform          text,
  counterpart_name  text,
  analysis          jsonb not null default '{}'::jsonb,
  source            text not null default 'chat',
  created_at        timestamptz not null default now()
);

create index if not exists text_message_uploads_user_idx
  on public.text_message_uploads(user_id, created_at desc);

create index if not exists text_message_uploads_character_idx
  on public.text_message_uploads(user_id, character_id, created_at desc);

alter table public.text_message_uploads enable row level security;

drop policy if exists text_message_uploads_select on public.text_message_uploads;
drop policy if exists text_message_uploads_insert on public.text_message_uploads;
drop policy if exists text_message_uploads_delete on public.text_message_uploads;

create policy text_message_uploads_select on public.text_message_uploads
  for select using (auth.uid() = user_id);
create policy text_message_uploads_insert on public.text_message_uploads
  for insert with check (auth.uid() = user_id);
create policy text_message_uploads_delete on public.text_message_uploads
  for delete using (auth.uid() = user_id);

comment on table public.text_message_uploads is
  'Archive of uploaded DM/text-message screenshots with AI-extracted transcripts.';
