import type { ProjectCardData } from '../components/projects/ProjectProfileCard';
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import type { Organization } from '../components/organizations/OrganizationProfileCard';
import type { Skill } from '../types/skill';
import { skillsApi } from '../api/skills';
import { fetchJson } from './api';
import { cachedFetchJson } from './requestCache';

export function isEphemeralEntityId(id: string | undefined): boolean {
  if (!id) return true;
  // Preview/pending group candidates use `candidate-<uuid>` until accepted into organizations.
  return (
    id.startsWith('dummy-') ||
    id.startsWith('temp-') ||
    id.startsWith('demo-') ||
    id.startsWith('mock-') ||
    id.startsWith('candidate-') ||
    id.startsWith('org-') // local-only optimistic org ids
  );
}

export function locationStub(id: string, name?: string): LocationProfile {
  return {
    id,
    name: name ?? 'Location',
    visitCount: 0,
    relatedPeople: [],
    tagCounts: [],
    chapters: [],
    moods: [],
    entries: [],
    sources: [],
  };
}

/** Book/list payloads can omit array fields — keep LocationDetailModal render-safe. */
export function normalizeLocationProfile(
  loc: Partial<LocationProfile> & Pick<LocationProfile, 'id' | 'name'>,
): LocationProfile {
  return {
    ...loc,
    visitCount: typeof loc.visitCount === 'number' ? loc.visitCount : 0,
    relatedPeople: Array.isArray(loc.relatedPeople) ? loc.relatedPeople : [],
    tagCounts: Array.isArray(loc.tagCounts) ? loc.tagCounts : [],
    chapters: Array.isArray(loc.chapters) ? loc.chapters : [],
    moods: Array.isArray(loc.moods) ? loc.moods : [],
    entries: Array.isArray(loc.entries) ? loc.entries : [],
    sources: Array.isArray(loc.sources) ? loc.sources : [],
    purpose: Array.isArray(loc.purpose) ? loc.purpose : loc.purpose,
  };
}

export function skillStub(id: string, name?: string): Skill {
  const now = new Date().toISOString();
  return {
    id,
    skill_name: name ?? 'Skill',
    skill_category: 'other',
    proficiency: 0,
    confidence: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

export async function fetchCharacterById<T = unknown>(id: string): Promise<T> {
  return cachedFetchJson<T>(`/api/characters/${id}`);
}

export async function fetchLocationById(id: string): Promise<LocationProfile> {
  const res = await cachedFetchJson<{ location: LocationProfile }>(`/api/locations/${id}`);
  return normalizeLocationProfile(res.location);
}

export async function fetchProjectById(id: string): Promise<ProjectCardData> {
  const res = await fetchJson<{ project: ProjectCardData }>(`/api/projects/${id}`);
  return res.project;
}

export async function fetchSkillById(id: string): Promise<Skill> {
  return skillsApi.getSkillDetails(id);
}

export async function fetchOrganizationById(id: string): Promise<Organization> {
  if (isEphemeralEntityId(id)) {
    throw new Error('Organization is not saved yet (preview/candidate only)');
  }
  const res = await fetchJson<{ success: boolean; organization: Organization }>(
    `/api/organizations/${id}`
  );
  return res.organization;
}
