-- Group candidate quality + performance upgrade.
--
-- Group candidates keep user-readable member names, but now also store the
-- confirmed character ids those names resolve to. Confirmed organizations then
-- create organization_members rows using those stable ids.

do $$
begin
  if to_regclass('public.group_candidates') is not null then
    alter table public.group_candidates
      add column if not exists detected_member_ids uuid[] not null default '{}'::uuid[],
      add column if not exists metadata jsonb not null default '{}'::jsonb,
      add column if not exists rejected_reason text,
      add column if not exists detection_version integer not null default 2,
      add column if not exists evidence jsonb not null default '{}'::jsonb;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'group_candidates'
        and column_name = 'source_message_ids'
        and udt_name = '_uuid'
    ) then
      alter table public.group_candidates
        alter column source_message_ids drop default,
        alter column source_message_ids type text[] using source_message_ids::text[],
        alter column source_message_ids set default '{}'::text[];
    end if;

    create index if not exists group_candidates_user_status_updated_idx
      on public.group_candidates(user_id, status, updated_at desc);

    create index if not exists group_candidates_user_member_ids_gin_idx
      on public.group_candidates using gin (detected_member_ids);

    create index if not exists group_candidates_user_source_ids_gin_idx
      on public.group_candidates using gin (source_message_ids);
  end if;

  if to_regclass('public.organizations') is not null then
    create unique index if not exists organizations_user_name_key_idx
      on public.organizations(user_id, lower(name));

    create index if not exists organizations_user_updated_idx
      on public.organizations(user_id, updated_at desc);
  end if;

  if to_regclass('public.organization_members') is not null then
    create index if not exists organization_members_user_character_idx
      on public.organization_members(user_id, character_id)
      where character_id is not null;

    create unique index if not exists organization_members_unique_character_member_idx
      on public.organization_members(organization_id, character_id)
      where character_id is not null;

    create index if not exists organization_members_user_org_idx
      on public.organization_members(user_id, organization_id);
  end if;
end $$;
