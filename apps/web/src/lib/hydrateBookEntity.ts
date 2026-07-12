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
  return res.location;
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
