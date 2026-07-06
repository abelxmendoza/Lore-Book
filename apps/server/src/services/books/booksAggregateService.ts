/**
 * BFF aggregate loaders for Book surfaces — one round-trip per page load.
 * Delegates to existing services; does not duplicate business logic.
 */
import { familyGraphService } from '../kinship/familyGraphService';
import { householdService } from '../kinship/householdService';
import { familyTreeService } from '../familyTreeService';
import { locationService } from '../locationService';
import { projectService } from '../projectService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { skillService } from '../skills/skillService';
import { skillSuggestionService } from '../skills/skillSuggestionService';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { evaluateWrongDomain } from '../characters/audit/wrongDomainCharacterGuard';

export type BookCounts = {
  characters: number;
  locations: number;
  events: number;
  organizations: number;
  skills: number;
  projects: number;
};

async function loadCounts(userId: string): Promise<BookCounts> {
  const [chars, locs, evts, orgs, skills, projects] = await Promise.all([
    supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('omega_entities').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('entity_type', 'LOCATION'),
    supabaseAdmin.from('event_candidates').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('organizations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('skills').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return {
    characters: chars.count ?? 0,
    locations: locs.count ?? 0,
    events: evts.count ?? 0,
    organizations: orgs.count ?? 0,
    skills: skills.count ?? 0,
    projects: projects.count ?? 0,
  };
}

function characterProvenanceText(row: { metadata?: unknown }): string {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return [
    metadata.storyContext,
    metadata.provenance,
    metadata.sourceText,
    metadata.source_excerpt,
    metadata.evidence,
  ]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

function isVisibleCharacter(row: { name?: string | null; metadata?: unknown }): boolean {
  const name = String(row.name ?? '').trim();
  if (!name) return false;
  return !evaluateWrongDomain(name, characterProvenanceText(row)).wrongDomain;
}

function dedupeCharacters<T extends { name?: string | null; importance_score?: number | null; updated_at?: string | null }>(
  rows: T[],
): T[] {
  const byName = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeNameKey(String(row.name ?? ''));
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    const rowScore = row.importance_score ?? 0;
    const existingScore = existing.importance_score ?? 0;
    const rowUpdated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    const existingUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
    if (rowScore > existingScore || (rowScore === existingScore && rowUpdated > existingUpdated)) {
      byName.set(key, row);
    }
  }
  return [...byName.values()];
}

export async function loadCharactersBook(userId: string, opts?: { includeDuplicates?: boolean }) {
  const [{ data: characters, error }, counts] = await Promise.all([
    supabaseAdmin
      .from('characters')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'archived')
      // Reclassified characters live in another book now (see reclassifyCharacterService)
      .neq('status', 'reclassified')
      .order('updated_at', { ascending: false }),
    loadCounts(userId),
  ]);

  if (error) throw error;

  const visibleCharacters = dedupeCharacters((characters ?? []).filter(isVisibleCharacter));
  const visibleCounts = { ...counts, characters: visibleCharacters.length };

  let duplicate_groups: unknown[] = [];
  if (opts?.includeDuplicates !== false) {
    const rows = visibleCharacters.filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return meta.is_self !== true && meta.is_user !== true;
    });
    const byKey = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = normalizeNameKey(row.name);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }
    duplicate_groups = [...byKey.entries()]
      .filter(([, chars]) => chars.length > 1)
      .map(([canonical_name, chars]) => ({
        match_type: 'exact',
        canonical_name,
        characters: chars,
      }));
  }

  return { characters: visibleCharacters, duplicate_groups, counts: visibleCounts };
}

export async function loadLocationsBook(userId: string) {
  const [locations, counts] = await Promise.all([
    locationService.listLocations(userId),
    loadCounts(userId),
  ]);

  // Suggestions load lazily via GET /api/locations/suggestions (DetectedLocationSuggestions).
  // Avoids 30+ OpenAI calls on every Places book page load.
  return { locations, suggestions: [], counts };
}

export async function loadProjectsBook(userId: string) {
  const [projects, duplicate_groups, counts, suggestions] = await Promise.all([
    projectService.listProjects(userId),
    projectService.listDuplicates(userId),
    loadCounts(userId),
    projectSuggestionService.getPendingSuggestions(userId).catch(() => []),
  ]);

  return { projects, duplicate_groups, suggestions, counts };
}

export async function loadSkillsBook(userId: string) {
  const [skills, counts, suggestions] = await Promise.all([
    skillService.getSkills(userId, { active_only: false }),
    loadCounts(userId),
    skillSuggestionService.getPendingSuggestions(userId).catch(() => []),
  ]);

  return { skills, suggestions, counts };
}

export async function loadFamilyBook(userId: string) {
  const [graph, households, analytics, tree, counts] = await Promise.all([
    familyGraphService.getGraph(userId),
    householdService.listHouseholds(userId),
    familyGraphService.getAnalytics(userId),
    familyTreeService.getUserFamilyTree(userId),
    loadCounts(userId),
  ]);

  const { data: familyGroups } = await supabaseAdmin
    .from('organizations')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .eq('type', 'family');

  const groups = (familyGroups ?? []).filter(
    (o) => (o.metadata as Record<string, unknown>)?.inference_source === 'kinship_graph'
  );

  return {
    graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, selfId: graph.selfId },
    tree,
    households,
    familyGroups: groups,
    analytics: analytics.slice(0, 12),
    counts,
  };
}

export async function loadDiscoverySummary(userId: string) {
  const counts = await loadCounts(userId);
  const [{ contradictionEngine }, { revealedPreferenceService }] = await Promise.all([
    import('../contradiction/contradictionEngine'),
    import('../revealedPreference/revealedPreferenceService'),
  ]);

  const [contradictions, revealed] = await Promise.all([
    contradictionEngine.getReport(userId).catch(() => ({ contradictions: [] })),
    revealedPreferenceService.getRevealedSelf(userId).catch(() => ({ signals: [] })),
  ]);

  return {
    counts,
    contradictionCount: contradictions.contradictions?.length ?? 0,
    revealedSignalCount: revealed.categories?.length ?? 0,
  };
}
