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

update public.locations l
set associated_character_ids = coalesce(verified.character_ids, '{}'::uuid[])
from (
  select
    l_inner.id,
    array_agg(distinct c.id order by c.id) as character_ids
  from public.locations l_inner
  left join lateral unnest(coalesce(l_inner.associated_character_ids, '{}'::uuid[])) associated(character_id) on true
  left join public.characters c
    on c.id = associated.character_id
   and c.user_id = l_inner.user_id
  group by l_inner.id
) verified
where verified.id = l.id
  and l.associated_character_ids is distinct from coalesce(verified.character_ids, '{}'::uuid[]);

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
