import { isPrimarySkillBookRecord } from './skillOntology';
import { readSkillProfile } from './skillProfile';
import { readRelatedSkillNames } from './skillStory';
import type { Skill, SkillMetadata } from '../types/skill';

export type SkillConnectionPerson = {
  id: string;
  name: string;
  role?: string;
  relationship?: string;
};

export type SkillConnectionPlace = {
  id: string;
  name: string;
};

export type SkillConnectionOrg = {
  id: string;
  name: string;
  type?: string;
};

export type AssembledSkillConnections = {
  learnedFrom: SkillConnectionPerson[];
  practicedWith: SkillConnectionPerson[];
  otherPeople: SkillConnectionPerson[];
  relatedSkills: string[];
  projects: string[];
  jobs: string[];
  places: SkillConnectionPlace[];
  organizations: SkillConnectionOrg[];
};

const PROJECT_HINTS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\blorebook\b/i, name: 'LoreBook' },
  { pattern: /\batlas notes\b/i, name: 'Atlas Notes' },
  { pattern: /\bomega-?1\b/i, name: 'Omega-1' },
  { pattern: /\bmemovault\b/i, name: 'MemoVault' },
];

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function uniqueNames(names: string[]): string[] {
  return uniqueBy(
    names.map((name) => name.trim()).filter(Boolean),
    (name) => name.toLowerCase(),
  );
}

export function inferRelatedProjects(skill: Skill): string[] {
  const haystack = `${skill.skill_name} ${skill.description ?? ''}`;
  return uniqueNames(
    PROJECT_HINTS.filter(({ pattern }) => pattern.test(haystack)).map(({ name }) => name),
  );
}

export function pickPeerSkillNames(skill: Skill, peers: Skill[], limit = 4): string[] {
  return peers
    .filter(
      (peer) =>
        peer.id !== skill.id &&
        peer.skill_name.toLowerCase() !== skill.skill_name.toLowerCase() &&
        peer.skill_category === skill.skill_category &&
        isPrimarySkillBookRecord(peer),
    )
    .sort((a, b) => b.practice_count - a.practice_count || a.skill_name.localeCompare(b.skill_name))
    .slice(0, limit)
    .map((peer) => peer.skill_name);
}

export function readSkillDetails(
  skill: Skill,
  details?: SkillMetadata | null,
): SkillMetadata | null {
  return details ?? (skill.metadata?.skill_details as SkillMetadata | undefined) ?? null;
}

export function assembleSkillConnections(input: {
  skill: Skill;
  details?: SkillMetadata | null;
  relatedCharacters?: SkillConnectionPerson[];
  relatedOrganizations?: SkillConnectionOrg[];
}): AssembledSkillConnections {
  const profile = readSkillProfile(input.skill.metadata);
  const details = readSkillDetails(input.skill, input.details);

  const learnedFrom = (details?.learned_from ?? []).map((teacher) => ({
    id: teacher.character_id,
    name: teacher.character_name,
    role: teacher.relationship_type,
    relationship: 'Learned from',
  }));
  const practicedWith = (details?.practiced_with ?? []).map((partner) => ({
    id: partner.character_id,
    name: partner.character_name,
    role: 'Practice partner',
    relationship: `${partner.practice_count} sessions`,
  }));
  const namedPeople = new Set(
    [...learnedFrom, ...practicedWith].map((person) => person.id || person.name.toLowerCase()),
  );
  const otherPeople = uniqueBy(
    (input.relatedCharacters ?? []).filter((person) => {
      const key = person.id || person.name.toLowerCase();
      return Boolean(key) && !namedPeople.has(key);
    }),
    (person) => person.id || person.name.toLowerCase(),
  );

  const jobs = uniqueNames(profile?.related_jobs ?? []);
  const jobKeys = new Set(jobs.map((job) => job.toLowerCase()));
  const organizations = uniqueBy(
    (input.relatedOrganizations ?? []).filter((org) => !jobKeys.has(org.name.toLowerCase())),
    (org) => org.id || org.name.toLowerCase(),
  );

  const places = uniqueBy(
    [
      ...(details?.learned_at ?? []).map((loc) => ({ id: loc.location_id, name: loc.location_name })),
      ...(details?.practiced_at ?? []).map((loc) => ({ id: loc.location_id, name: loc.location_name })),
    ],
    (loc) => loc.id || loc.name.toLowerCase(),
  );

  return {
    learnedFrom: uniqueBy(learnedFrom, (person) => person.id || person.name.toLowerCase()),
    practicedWith: uniqueBy(practicedWith, (person) => person.id || person.name.toLowerCase()),
    otherPeople,
    relatedSkills: uniqueNames(readRelatedSkillNames(input.skill.metadata)),
    projects: uniqueNames(profile?.related_projects ?? []),
    jobs,
    places,
    organizations,
  };
}

export function skillConnectionsAreEmpty(connections: AssembledSkillConnections): boolean {
  return (
    connections.learnedFrom.length === 0 &&
    connections.practicedWith.length === 0 &&
    connections.otherPeople.length === 0 &&
    connections.relatedSkills.length === 0 &&
    connections.projects.length === 0 &&
    connections.jobs.length === 0 &&
    connections.places.length === 0 &&
    connections.organizations.length === 0
  );
}
