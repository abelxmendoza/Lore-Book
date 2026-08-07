-- Relationship ontology and richer edge metadata.
-- Keeps universal role definitions separate from the actual people who fill them.

create table if not exists public.relationship_type_ontology (
  id text primary key,
  category text not null,
  role text not null,
  display_name text not null,
  inverse_role text,
  hierarchy text not null default 'lateral',
  generation_delta integer not null default 0,
  aliases text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, role)
);

comment on table public.relationship_type_ontology is
  'Universal relationship roles independent from the characters/entities filling those roles.';
comment on column public.relationship_type_ontology.generation_delta is
  'Position relative to the user/root for family-style trees: parent=-1, grandparent=-2, child=1.';

alter table public.relationship_type_ontology enable row level security;

drop policy if exists "Authenticated users can view relationship ontology" on public.relationship_type_ontology;
create policy "Authenticated users can view relationship ontology"
  on public.relationship_type_ontology
  for select
  to authenticated
  using (true);

alter table public.character_relationships
  add column if not exists relationship_category text,
  add column if not exists relationship_role text,
  add column if not exists inverse_role text,
  add column if not exists strength smallint check (strength between 0 and 100),
  add column if not exists trust smallint check (trust between 0 and 100),
  add column if not exists frequency text,
  add column if not exists sentiment text,
  add column if not exists inference_status text not null default 'asserted',
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists timeline jsonb not null default '[]'::jsonb;

create index if not exists character_relationships_user_category_idx
  on public.character_relationships(user_id, relationship_category, relationship_role);

create index if not exists character_relationships_inference_status_idx
  on public.character_relationships(user_id, inference_status);

insert into public.relationship_type_ontology
  (id, category, role, display_name, inverse_role, hierarchy, generation_delta, aliases)
values
  ('family:mother', 'family', 'mother', 'Mother', 'child', 'above', -1, array['mom','mama','mamá','ma']),
  ('family:father', 'family', 'father', 'Father', 'child', 'above', -1, array['dad','papa','papá','pa']),
  ('family:stepmother', 'family', 'stepmother', 'Stepmother', 'step_child', 'above', -1, array['stepmom']),
  ('family:stepfather', 'family', 'stepfather', 'Stepfather', 'step_child', 'above', -1, array['stepdad']),
  ('family:adoptive_mother', 'family', 'adoptive_mother', 'Adoptive mother', 'adopted_child', 'above', -1, array['adoptive mom']),
  ('family:adoptive_father', 'family', 'adoptive_father', 'Adoptive father', 'adopted_child', 'above', -1, array['adoptive dad']),
  ('family:parent', 'family', 'parent', 'Parent', 'child', 'above', -1, array['parent','guardian']),
  ('family:brother', 'family', 'brother', 'Brother', 'sibling', 'lateral', 0, array['bro']),
  ('family:sister', 'family', 'sister', 'Sister', 'sibling', 'lateral', 0, array['sis']),
  ('family:sibling', 'family', 'sibling', 'Sibling', 'sibling', 'lateral', 0, array['sib']),
  ('family:half_brother', 'family', 'half_brother', 'Half-brother', 'half_sibling', 'lateral', 0, array['half brother']),
  ('family:half_sister', 'family', 'half_sister', 'Half-sister', 'half_sibling', 'lateral', 0, array['half sister']),
  ('family:grandmother', 'family', 'grandmother', 'Grandmother', 'grandchild', 'above', -2, array['grandma','abuela','abuelita','nana']),
  ('family:grandfather', 'family', 'grandfather', 'Grandfather', 'grandchild', 'above', -2, array['grandpa','abuelo','abuelito','tata']),
  ('family:grandparent', 'family', 'grandparent', 'Grandparent', 'grandchild', 'above', -2, array['grandparent']),
  ('family:aunt', 'family', 'aunt', 'Aunt', 'niece_nephew', 'above_lateral', -1, array['tia','tía','auntie']),
  ('family:uncle', 'family', 'uncle', 'Uncle', 'niece_nephew', 'above_lateral', -1, array['tio','tío']),
  ('family:cousin', 'family', 'cousin', 'Cousin', 'cousin', 'lateral', 0, array['primo','prima']),
  ('family:niece', 'family', 'niece', 'Niece', 'aunt_uncle', 'below', 1, array[]::text[]),
  ('family:nephew', 'family', 'nephew', 'Nephew', 'aunt_uncle', 'below', 1, array[]::text[]),
  ('family:child', 'family', 'child', 'Child', 'parent', 'below', 1, array['son','daughter']),
  ('family:grandchild', 'family', 'grandchild', 'Grandchild', 'grandparent', 'below', 2, array[]::text[]),
  ('romantic:spouse', 'romantic', 'spouse', 'Spouse', 'spouse', 'lateral', 0, array['husband','wife']),
  ('romantic:ex_spouse', 'romantic', 'ex_spouse', 'Ex-spouse', 'ex_spouse', 'lateral', 0, array['ex husband','ex wife']),
  ('romantic:partner', 'romantic', 'partner', 'Partner', 'partner', 'lateral', 0, array[]::text[]),
  ('romantic:ex_partner', 'romantic', 'ex_partner', 'Ex-partner', 'ex_partner', 'lateral', 0, array['ex']),
  ('romantic:boyfriend', 'romantic', 'boyfriend', 'Boyfriend', 'partner', 'lateral', 0, array['bf']),
  ('romantic:girlfriend', 'romantic', 'girlfriend', 'Girlfriend', 'partner', 'lateral', 0, array['gf']),
  ('romantic:fiance', 'romantic', 'fiance', 'Fiancé/fiancée', 'fiance', 'lateral', 0, array['fiancé','fiancée']),
  ('romantic:crush', 'romantic', 'crush', 'Crush', 'crush', 'lateral', 0, array['love interest']),
  ('friendship:best_friend', 'friendship', 'best_friend', 'Best friend', 'best_friend', 'lateral', 0, array['ride or die']),
  ('friendship:close_friend', 'friendship', 'close_friend', 'Close friend', 'close_friend', 'lateral', 0, array[]::text[]),
  ('friendship:friend', 'friendship', 'friend', 'Friend', 'friend', 'lateral', 0, array[]::text[]),
  ('friendship:acquaintance', 'friendship', 'acquaintance', 'Acquaintance', 'acquaintance', 'lateral', 0, array[]::text[]),
  ('friendship:former_friend', 'friendship', 'former_friend', 'Former friend', 'former_friend', 'lateral', 0, array['ex friend']),
  ('friendship:childhood_friend', 'friendship', 'childhood_friend', 'Childhood friend', 'childhood_friend', 'lateral', 0, array[]::text[]),
  ('professional:boss', 'professional', 'boss', 'Boss', 'direct_report', 'above', 0, array['manager','supervisor']),
  ('professional:coworker', 'professional', 'coworker', 'Coworker', 'coworker', 'lateral', 0, array['colleague']),
  ('professional:direct_report', 'professional', 'direct_report', 'Direct report', 'boss', 'below', 0, array[]::text[]),
  ('professional:client', 'professional', 'client', 'Client', 'vendor', 'lateral', 0, array['customer']),
  ('professional:business_partner', 'professional', 'business_partner', 'Business partner', 'business_partner', 'lateral', 0, array['partner']),
  ('professional:founder', 'professional', 'founder', 'Founder', null, 'above', 0, array['co-founder','cofounder']),
  ('education:teacher', 'education', 'teacher', 'Teacher', 'student', 'above', 0, array['professor']),
  ('education:student', 'education', 'student', 'Student', 'teacher', 'below', 0, array[]::text[]),
  ('education:classmate', 'education', 'classmate', 'Classmate', 'classmate', 'lateral', 0, array[]::text[]),
  ('education:mentor', 'education', 'mentor', 'Mentor', 'mentee', 'above', 0, array[]::text[]),
  ('education:mentee', 'education', 'mentee', 'Mentee', 'mentor', 'below', 0, array[]::text[]),
  ('community:neighbor', 'community', 'neighbor', 'Neighbor', 'neighbor', 'lateral', 0, array[]::text[]),
  ('community:roommate', 'community', 'roommate', 'Roommate', 'roommate', 'lateral', 0, array[]::text[]),
  ('community:organization_member', 'community', 'organization_member', 'Organization member', 'organization_member', 'lateral', 0, array['club member','team member','volunteer']),
  ('authority:doctor', 'authority', 'doctor', 'Doctor', 'patient', 'above', 0, array[]::text[]),
  ('authority:therapist', 'authority', 'therapist', 'Therapist', 'client', 'above', 0, array[]::text[]),
  ('authority:lawyer', 'authority', 'lawyer', 'Lawyer', 'client', 'above', 0, array['attorney']),
  ('authority:coach', 'authority', 'coach', 'Coach', 'trainee', 'above', 0, array['trainer']),
  ('adversarial:rival', 'adversarial', 'rival', 'Rival', 'rival', 'lateral', 0, array['competitor','opponent']),
  ('adversarial:enemy', 'adversarial', 'enemy', 'Enemy', 'enemy', 'lateral', 0, array['critic']),
  ('online:follower', 'online', 'follower', 'Follower', 'following', 'lateral', 0, array[]::text[]),
  ('online:following', 'online', 'following', 'Following', 'follower', 'lateral', 0, array[]::text[]),
  ('online:subscriber', 'online', 'subscriber', 'Subscriber', 'creator', 'lateral', 0, array[]::text[]),
  ('online:moderator', 'online', 'moderator', 'Moderator', null, 'above', 0, array[]::text[]),
  ('online:content_creator', 'online', 'content_creator', 'Content creator', 'subscriber', 'lateral', 0, array['creator','influencer']),
  ('online:community_leader', 'online', 'community_leader', 'Community leader', 'community_member', 'above', 0, array[]::text[])
on conflict (id) do update set
  category = excluded.category,
  role = excluded.role,
  display_name = excluded.display_name,
  inverse_role = excluded.inverse_role,
  hierarchy = excluded.hierarchy,
  generation_delta = excluded.generation_delta,
  aliases = excluded.aliases,
  updated_at = now();
