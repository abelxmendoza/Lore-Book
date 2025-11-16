-- Character knowledge base schema: characters, relationships, and shared memories

-- Central roster of characters with lightweight metadata
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  alias text[],
  pronouns text,
  archetype text,
  role text,
  status text default 'active',
  first_appearance date,
  summary text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

comment on table public.characters is 'Named people, beings, or entities referenced in journal lore.';
comment on column public.characters.alias is 'Alternate names, titles, or codenames for the character.';
comment on column public.characters.pronouns is 'Pronoun preference for narrative grounding.';
comment on column public.characters.archetype is 'Story archetype (mentor, rival, companion, self, etc.).';

-- Relationship graph between characters scoped to a user
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source_character_id uuid references public.characters(id) on delete cascade,
  target_character_id uuid references public.characters(id) on delete cascade,
  relationship_type text not null,
  closeness_score smallint check (closeness_score between -10 and 10),
  status text default 'active',
  summary text,
  last_shared_memory_id uuid references public.journal_entries(id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, source_character_id, target_character_id, relationship_type)
);

comment on table public.character_relationships is 'Directional relationship edges between characters (ally, sibling, rival, etc.).';
comment on column public.character_relationships.closeness_score is 'Scaled -10 to 10 for hostility/support weighting.';

-- Bridge table capturing how characters appear within journal entries (memories)
create table if not exists public.character_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  journal_entry_id uuid references public.journal_entries(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  role text,
  emotion text,
  perspective text,
  summary text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, character_id, journal_entry_id)
);

comment on table public.character_memories is 'Links characters to specific journal entries, enabling ER joins across lore.';
comment on column public.character_memories.perspective is 'Narrative viewpoint: narrator, observer, participant, antagonist, etc.';

-- Helpful indexes for graph queries
create index if not exists characters_user_name_idx on public.characters (user_id, name);
create index if not exists character_relationships_source_idx on public.character_relationships (user_id, source_character_id);
create index if not exists character_relationships_target_idx on public.character_relationships (user_id, target_character_id);
create index if not exists character_memories_character_idx on public.character_memories (user_id, character_id);
create index if not exists character_memories_entry_idx on public.character_memories (journal_entry_id);

-- Materialized view sketching the ER-friendly knowledge base
create or replace view public.character_knowledge_base as
select
  c.id as character_id,
  c.user_id,
  c.name,
  c.alias,
  c.pronouns,
  c.archetype,
  c.role,
  c.status,
  c.tags,
  cm.journal_entry_id,
  cm.chapter_id,
  cm.role as memory_role,
  cm.emotion as memory_emotion,
  cm.perspective,
  cm.summary as memory_summary,
  cr.target_character_id,
  cr.relationship_type,
  cr.closeness_score,
  cr.summary as relationship_summary
from public.characters c
left join public.character_memories cm
  on cm.character_id = c.id
left join public.character_relationships cr
  on cr.source_character_id = c.id;

comment on view public.character_knowledge_base is 'Entity-relationship friendly view combining characters, their memories, and outbound relationships.';
