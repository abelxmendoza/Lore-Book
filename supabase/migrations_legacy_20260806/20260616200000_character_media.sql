-- Character media: photos + message/DM screenshots (with extracted text) that we
-- analyze and discuss in chat. One row per item, associated to a character.

create table if not exists public.character_media (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  character_id  uuid not null,
  kind          text not null check (kind in ('photo','message')),
  url           text,            -- public URL in the `photos` storage bucket (image items)
  storage_path  text,            -- bucket path (for deletion)
  text          text,            -- transcribed/typed message text (message items)
  caption       text,            -- user caption / note
  source        text,            -- e.g. 'imessage','instagram','manual'
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists character_media_lookup_idx
  on public.character_media(user_id, character_id, kind, created_at desc);

alter table public.character_media enable row level security;

drop policy if exists character_media_select on public.character_media;
drop policy if exists character_media_insert on public.character_media;
drop policy if exists character_media_update on public.character_media;
drop policy if exists character_media_delete on public.character_media;

create policy character_media_select on public.character_media for select using (auth.uid() = user_id);
create policy character_media_insert on public.character_media for insert with check (auth.uid() = user_id);
create policy character_media_update on public.character_media for update using (auth.uid() = user_id);
create policy character_media_delete on public.character_media for delete using (auth.uid() = user_id);

comment on table public.character_media is 'Per-character photos and message/DM screenshots (with extracted text) for the Characters Book Photos/Messages tabs.';
