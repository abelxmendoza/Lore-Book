-- Character identity registry index
--
-- Goal:
--   - Keep `characters.id` as the stable unique person id.
--   - Maintain a fast lookup table for every known name/alias/mention.
--   - Preserve ambiguity: the same mention key can point to multiple people,
--     but each character can only own a given mention once.
--   - Optimize the growing knowledge base reads used by Character Book,
--     chat context, group detection, and deduplication.

create extension if not exists pg_trgm with schema public;

create or replace function public.normalize_character_registry_key(value text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      lower(
        translate(
          coalesce(value, ''),
          'ÀÁÂÃÄÅĀĂĄÇĆĈĊČÐĎÈÉÊËĒĔĖĘĚÌÍÎÏĨĪĬĮİÑŃŇÒÓÔÕÖØŌŎŐÙÚÛÜŨŪŬŮŰŲÝŸŶÞŠŚŜŞȘŽŹŻàáâãäåāăąçćĉċčðďèéêëēĕėęěìíîïĩīĭįıñńňòóôõöøōŏőùúûüũūŭůűųýÿŷþšśŝşșžźż',
          'AAAAAAAAACCCCCDDEEEEEEEEEIIIIIIIIINNNOOOOOOOOOUUUUUUUUUUYYYBSSSSSZZZaaaaaaaaacccccddeeeeeeeeeiiiiiiiiinnnooooooooouuuuuuuuuuyyybssssszzz'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.character_identity_index (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  mention text not null,
  mention_key text not null,
  source text not null default 'alias',
  confidence numeric not null default 1.0 check (confidence >= 0 and confidence <= 1),
  evidence_count integer not null default 1 check (evidence_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_identity_index_source_check
    check (source in ('primary_name', 'alias', 'nickname', 'mention', 'manual', 'imported'))
);

comment on table public.character_identity_index is
  'Per-user lookup index for every known character name, alias, nickname, and mention. characters.id remains the canonical stable person id.';
comment on column public.character_identity_index.mention_key is
  'Normalized lookup key matching app-side normalizeNameKey.';

create unique index if not exists character_identity_index_unique_character_mention
  on public.character_identity_index(user_id, character_id, mention_key);

create index if not exists character_identity_index_user_key_idx
  on public.character_identity_index(user_id, mention_key);

create index if not exists character_identity_index_user_mention_trgm_idx
  on public.character_identity_index using gin (mention gin_trgm_ops);

create index if not exists character_identity_index_character_idx
  on public.character_identity_index(user_id, character_id);

alter table public.character_identity_index enable row level security;

drop policy if exists "character_identity_index_select_own" on public.character_identity_index;
create policy "character_identity_index_select_own"
  on public.character_identity_index
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "character_identity_index_insert_own" on public.character_identity_index;
create policy "character_identity_index_insert_own"
  on public.character_identity_index
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "character_identity_index_update_own" on public.character_identity_index;
create policy "character_identity_index_update_own"
  on public.character_identity_index
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "character_identity_index_delete_own" on public.character_identity_index;
create policy "character_identity_index_delete_own"
  on public.character_identity_index
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.character_identity_index to authenticated;

create or replace function public.sync_character_identity_index()
returns trigger
language plpgsql
as $$
declare
  alias_value text;
  mention_count integer;
begin
  mention_count := case
    when coalesce(new.metadata->>'mention_count', '') ~ '^\d+$'
      then (new.metadata->>'mention_count')::integer
    else 1
  end;

  delete from public.character_identity_index
  where character_id = new.id
    and user_id = new.user_id
    and source in ('primary_name', 'alias');

  insert into public.character_identity_index (
    user_id,
    character_id,
    mention,
    mention_key,
    source,
    confidence,
    evidence_count,
    updated_at
  )
  values (
    new.user_id,
    new.id,
    new.name,
    public.normalize_character_registry_key(new.name),
    'primary_name',
    1.0,
    mention_count,
    now()
  )
  on conflict (user_id, character_id, mention_key)
  do update set
    mention = excluded.mention,
    source = excluded.source,
    confidence = greatest(public.character_identity_index.confidence, excluded.confidence),
    evidence_count = greatest(public.character_identity_index.evidence_count, excluded.evidence_count),
    updated_at = now();

  foreach alias_value in array coalesce(new.alias, '{}'::text[])
  loop
    if nullif(btrim(alias_value), '') is not null
      and public.normalize_character_registry_key(alias_value) <> public.normalize_character_registry_key(new.name)
    then
      insert into public.character_identity_index (
        user_id,
        character_id,
        mention,
        mention_key,
        source,
        confidence,
        evidence_count,
        updated_at
      )
      values (
        new.user_id,
        new.id,
        btrim(alias_value),
        public.normalize_character_registry_key(alias_value),
        'alias',
        0.95,
        mention_count,
        now()
      )
      on conflict (user_id, character_id, mention_key)
      do update set
        mention = excluded.mention,
        confidence = greatest(public.character_identity_index.confidence, excluded.confidence),
        evidence_count = greatest(public.character_identity_index.evidence_count, excluded.evidence_count),
        updated_at = now();
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists sync_character_identity_index_trigger on public.characters;
create trigger sync_character_identity_index_trigger
after insert or update of name, alias, metadata on public.characters
for each row
execute function public.sync_character_identity_index();

insert into public.character_identity_index (
  user_id,
  character_id,
  mention,
  mention_key,
  source,
  confidence,
  evidence_count
)
select
  c.user_id,
  c.id,
  c.name,
  public.normalize_character_registry_key(c.name),
  'primary_name',
  1.0,
  case
    when coalesce(c.metadata->>'mention_count', '') ~ '^\d+$'
      then (c.metadata->>'mention_count')::integer
    else 1
  end
from public.characters c
where nullif(btrim(c.name), '') is not null
on conflict (user_id, character_id, mention_key) do nothing;

insert into public.character_identity_index (
  user_id,
  character_id,
  mention,
  mention_key,
  source,
  confidence,
  evidence_count
)
select
  c.user_id,
  c.id,
  btrim(alias_value),
  public.normalize_character_registry_key(alias_value),
  'alias',
  0.95,
  case
    when coalesce(c.metadata->>'mention_count', '') ~ '^\d+$'
      then (c.metadata->>'mention_count')::integer
    else 1
  end
from public.characters c
cross join lateral unnest(coalesce(c.alias, '{}'::text[])) as alias_value
where nullif(btrim(alias_value), '') is not null
  and public.normalize_character_registry_key(alias_value) <> public.normalize_character_registry_key(c.name)
on conflict (user_id, character_id, mention_key) do nothing;

create index if not exists characters_user_updated_idx
  on public.characters(user_id, updated_at desc);

create index if not exists characters_user_status_idx
  on public.characters(user_id, status);

create index if not exists characters_metadata_gin_idx
  on public.characters using gin (metadata);

do $$
begin
  if to_regclass('public.entity_facts') is not null then
    create index if not exists entity_facts_character_lookup_idx
      on public.entity_facts(user_id, entity_type, entity_id, confidence desc, updated_at desc)
      where entity_type = 'character';
  end if;

  if to_regclass('public.character_memories') is not null then
    create index if not exists character_memories_user_character_recent_idx
      on public.character_memories(user_id, character_id, created_at desc);
  end if;

  if to_regclass('public.character_relationships') is not null then
    create index if not exists character_relationships_user_pair_idx
      on public.character_relationships(user_id, source_character_id, target_character_id);
  end if;
end $$;
