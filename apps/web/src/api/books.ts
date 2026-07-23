/**
 * Books BFF — one aggregate round-trip per LoreBook surface.
 * Canonical paths replace multiple legacy fetches on initial page load.
 */
import { fetchJson } from '../lib/api';
import type { Skill, SkillCategory } from '../types/skill';
import type { SkillSuggestion } from './skills';
import type { ProjectSuggestion } from './projects';

export type BookCounts = {
  characters: number;
  locations: number;
  events: number;
  organizations: number;
  skills: number;
  projects: number;
};

export type CharactersBookPayload = {
  characters: Array<Record<string, unknown>>;
  duplicate_groups: Array<Record<string, unknown>>;
  counts: BookCounts;
};

export type LocationsBookPayload = {
  locations: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
  counts: BookCounts;
};

export type ProjectsBookPayload = {
  projects: Array<Record<string, unknown>>;
  duplicate_groups: Array<Record<string, unknown>>;
  suggestions: ProjectSuggestion[];
  counts: BookCounts;
};

export type SkillsBookPayload = {
  skills: Skill[];
  suggestions: SkillSuggestion[];
  counts: BookCounts;
};

export type PossibleFamilyMatch = {
  id: string;
  characterAId: string;
  characterAName: string;
  characterBId: string;
  characterBName: string;
  sharedLastName: string;
};

export type FamilyBookPayload = {
  success?: boolean;
  graph: { nodeCount: number; edgeCount: number; selfId: string | null };
  tree: Record<string, unknown>;
  households: Array<Record<string, unknown>>;
  familyGroups: Array<{ id: string; name: string; metadata?: Record<string, unknown> }>;
  analytics: Array<Record<string, unknown>>;
  counts: BookCounts;
  possibleFamilyMatches: PossibleFamilyMatch[];
};

export type DiscoveryBookPayload = {
  counts: BookCounts;
  contradictionCount: number;
  revealedSignalCount: number;
};

export type ThreadHealthReport = Record<string, unknown>;

async function loadBook<T>(path: string): Promise<T> {
  const res = await fetchJson<{ success: boolean; data: T } & T>(path);
  return (res.data ?? res) as T;
}

export const booksApi = {
  loadCharacters: () => loadBook<CharactersBookPayload>('/api/books/characters'),
  loadLocations: () => loadBook<LocationsBookPayload>('/api/books/locations'),
  loadProjects: () => loadBook<ProjectsBookPayload>('/api/books/projects'),
  loadSkills: () => loadBook<SkillsBookPayload>('/api/books/skills'),
  loadFamily: () => loadBook<FamilyBookPayload>('/api/books/family'),
  loadDiscovery: () => loadBook<DiscoveryBookPayload>('/api/books/discovery'),
};

export const chatThreadsApi = {
  getHealth: () => fetchJson<ThreadHealthReport>('/api/chat-threads/health'),
  repairHealth: () =>
    fetchJson<{ repaired: number; report: ThreadHealthReport }>('/api/chat-threads/health/repair', {
      method: 'POST',
    }),
};

/** Use books BFF for unfiltered skill list loads; legacy route when filtering. */
export async function loadSkillsForBook(filters?: {
  active_only?: boolean;
  category?: SkillCategory;
}): Promise<{ skills: Skill[]; suggestions: SkillSuggestion[] }> {
  if (filters?.category) {
    const params = new URLSearchParams();
    if (filters.active_only) params.append('active_only', 'true');
    params.append('category', filters.category);
    const response = await fetchJson<{ skills: Skill[] }>(`/api/skills?${params.toString()}`);
    return { skills: response.skills, suggestions: [] };
  }

  const book = await booksApi.loadSkills();
  let skills = book.skills ?? [];
  if (filters?.active_only) {
    skills = skills.filter((s) => s.is_active !== false);
  }
  return { skills, suggestions: book.suggestions ?? [] };
}
