-- Place intelligence model + verified character links.
-- Places can carry LoreBook-style dimensions, but people shown for a place
-- must resolve to confirmed character rows owned by the same user.

create extension if not exists "pgcrypto";

alter table public.locations
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists owner_operator text,
  add column if not exists operating_hours jsonb not null default '{}'::jsonb,
  add column if not exists purpose text[] not null default '{}'::text[],
  add column if not exists physical_attributes jsonb not null default '{}'::jsonb,
  add column if not exists reputation jsonb not null default '{}'::jsonb,
  add column if not exists user_relationship jsonb not null default '{}'::jsonb,
  add column if not exists timeline jsonb not null default '[]'::jsonb,
  add column if not exists current_state jsonb not null default '{}'::jsonb,
  add column if not exists social_graph jsonb not null default '{}'::jsonb,
  add column if not exists associated_character_ids uuid[] not null default '{}'::uuid[],
  add column if not exists associated_location_ids uuid[] not null default '{}'::uuid[],
  add column if not exists importance_level text not null default 'supporting',
  add column if not exists importance_score integer not null default 0,
  add column if not exists is_nickname boolean not null default false,
  add column if not exists event_context text,
  add column if not exists proximity_target text;

create table if not exists public.location_character_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  relationship_type text not null default 'mentioned',
  confidence numeric(4,3) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  evidence_count integer not null default 1 check (evidence_count >= 0),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_character_links_relationship_type_check
    check (relationship_type in (
      'regular',
      'staff',
      'owner',
      'manager',
      'frequent_visitor',
      'community_member',
      'visitor',
      'mentioned'
    )),
  constraint location_character_links_user_location_character_relationship_key
    unique (user_id, location_id, character_id, relationship_type)
);

create index if not exists idx_locations_associated_character_ids
  on public.locations using gin (associated_character_ids);
create index if not exists idx_locations_associated_location_ids
  on public.locations using gin (associated_location_ids);
create index if not exists idx_locations_place_type
  on public.locations (user_id, type);
create index if not exists idx_locations_importance_score
  on public.locations (user_id, importance_score desc);
create index if not exists idx_location_character_links_user_location
  on public.location_character_links (user_id, location_id);
create index if not exists idx_location_character_links_user_character
  on public.location_character_links (user_id, character_id);
create index if not exists idx_location_character_links_relationship
  on public.location_character_links (user_id, relationship_type);

alter table public.locations enable row level security;
alter table public.location_character_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_character_links'
      and policyname = 'location_character_links_owner_select'
  ) then
    create policy location_character_links_owner_select
      on public.location_character_links
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_character_links'
      and policyname = 'location_character_links_owner_insert'
  ) then
    create policy location_character_links_owner_insert
      on public.location_character_links
      for insert
      to authenticated
      with check (
        (select auth.uid()) = user_id
        and exists (
          select 1
          from public.locations l
          where l.id = location_id
            and l.user_id = location_character_links.user_id
        )
        and exists (
          select 1
          from public.characters c
          where c.id = character_id
            and c.user_id = location_character_links.user_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_character_links'
      and policyname = 'location_character_links_owner_update'
  ) then
    create policy location_character_links_owner_update
      on public.location_character_links
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check (
        (select auth.uid()) = user_id
        and exists (
          select 1
          from public.locations l
          where l.id = location_id
            and l.user_id = location_character_links.user_id
        )
        and exists (
          select 1
          from public.characters c
          where c.id = character_id
            and c.user_id = location_character_links.user_id
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'location_character_links'
      and policyname = 'location_character_links_owner_delete'
  ) then
    create policy location_character_links_owner_delete
      on public.location_character_links
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.location_character_links to authenticated;

insert into public.locations (
  user_id,
  name,
  normalized_name,
  type,
  confidence,
  metadata,
  created_at,
  updated_at
)
select distinct on (pp.user_id, regexp_replace(lower(trim(pp.name)), '\s+', ' ', 'g'))
  pp.user_id,
  pp.name,
  regexp_replace(lower(trim(pp.name)), '\s+', ' ', 'g'),
  'place',
  0.75,
  jsonb_build_object(
    'source', 'people_places_backfill',
    'people_place_id', pp.id,
    'total_mentions', coalesce(pp.total_mentions, 0)
  ),
  coalesce(pp.created_at, now()),
  coalesce(pp.updated_at, now())
from public.people_places pp
where pp.type = 'place'
  and trim(pp.name) <> ''
on conflict (user_id, normalized_name) do nothing;

insert into public.location_character_links (
  user_id,
  location_id,
  character_id,
  relationship_type,
  confidence,
  evidence_count,
  metadata
)
select distinct
  l.user_id,
  l.id,
  c.id,
  'mentioned',
  1.0,
  1,
  jsonb_build_object('source', 'locations.associated_character_ids_backfill')
from public.locations l
cross join lateral unnest(coalesce(l.associated_character_ids, '{}'::uuid[])) associated(character_id)
join public.characters c
  on c.id = associated.character_id
 and c.user_id = l.user_id
on conflict (user_id, location_id, character_id, relationship_type) do nothing;

insert into public.location_character_links (
  user_id,
  location_id,
  character_id,
  relationship_type,
  confidence,
  evidence_count,
  first_seen_at,
  last_seen_at,
  metadata
)
select
  l.user_id,
  l.id,
  cii.character_id,
  'mentioned',
  least(1.0, greatest(0.6, coalesce(cii.confidence, 0.8)))::numeric(4,3),
  count(distinct entry_id)::integer,
  min(je.date)::timestamptz,
  max(je.date)::timestamptz,
  jsonb_build_object(
    'source', 'people_places_cooccurrence_backfill',
    'place_entity_id', place_entity.id
  )
from public.people_places place_entity
join public.locations l
  on l.user_id = place_entity.user_id
 and l.normalized_name = regexp_replace(lower(trim(place_entity.name)), '\s+', ' ', 'g')
join public.people_places person_entity
  on person_entity.user_id = place_entity.user_id
 and person_entity.type = 'person'
 and person_entity.related_entries && place_entity.related_entries
join public.character_identity_index cii
  on cii.user_id = person_entity.user_id
 and cii.mention_key = regexp_replace(lower(trim(person_entity.name)), '\s+', ' ', 'g')
cross join lateral unnest(place_entity.related_entries) entry_id
left join public.journal_entries je
  on je.id = entry_id
 and je.user_id = l.user_id
where place_entity.type = 'place'
group by l.user_id, l.id, cii.character_id, cii.confidence, place_entity.id
on conflict (user_id, location_id, character_id, relationship_type) do update
set evidence_count = greatest(public.location_character_links.evidence_count, excluded.evidence_count),
    first_seen_at = least(public.location_character_links.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.location_character_links.last_seen_at, excluded.last_seen_at),
    updated_at = now();

update public.locations l
set associated_character_ids = coalesce(verified.character_ids, '{}'::uuid[])
from (
  select
    l_inner.id,
    array_agg(distinct c.id order by c.id) filter (where c.id is not null) as character_ids
  from public.locations l_inner
  left join lateral unnest(coalesce(l_inner.associated_character_ids, '{}'::uuid[])) associated(character_id) on true
  left join public.characters c
    on c.id = associated.character_id
   and c.user_id = l_inner.user_id
  group by l_inner.id
) verified
where verified.id = l.id
  and l.associated_character_ids is distinct from coalesce(verified.character_ids, '{}'::uuid[]);

update public.locations l
set associated_character_ids = coalesce(linked.character_ids, '{}'::uuid[])
from (
  select
    location_id,
    array_agg(distinct character_id order by character_id) as character_ids
  from public.location_character_links
  group by location_id
) linked
where linked.location_id = l.id
  and l.associated_character_ids is distinct from coalesce(linked.character_ids, '{}'::uuid[]);

comment on table public.location_character_links is
  'Verified links between places and confirmed character rows. UI should use this table or character_identity_index-backed resolution, never raw extracted person strings.';
comment on column public.locations.purpose is
  'Why this place exists for the user/story: entertainment, work, education, residence, worship, recreation, etc.';
comment on column public.locations.physical_attributes is
  'Layout, capacity, rooms, accessibility, parking, and notable physical features.';
comment on column public.locations.reputation is
  'Personal, public, and community reputation signals for this place.';
comment on column public.locations.user_relationship is
  'Per-user relationship to the place: first visit, last visit, frequency, memories, favorite areas, emotional associations.';
comment on column public.locations.timeline is
  'Place lifecycle and story timeline events such as opening, renovation, ownership changes, and important memories.';
comment on column public.locations.current_state is
  'Dynamic state such as active events, popularity, crowding, current sentiment, and status.';
