import {
  buildAtomsFromEventCandidates,
  buildAtomsFromTimeline,
} from '../biographyGeneration/narrativeAtomBuilder';
import type { BiographySpec, Domain, NarrativeAtom, NarrativeAtomType } from '../biographyGeneration/types';
import { supabaseAdmin } from '../supabaseClient';
import { atomMatchesTopicDomain } from './domainMapping';

export type AtomFilterSpec = Partial<BiographySpec> & {
  characterIds?: string[];
  locationIds?: string[];
  eventIds?: string[];
  skillIds?: string[];
  topicDomain?: string;
};

export type AtomSliceMetrics = {
  atoms: NarrativeAtom[];
  atomCount: number;
  entryCount: number;
  wordCount: number;
  atomTypeCounts: Partial<Record<NarrativeAtomType, number>>;
  timeSpanMonths: number;
  entityIds: { characters: string[]; locations: string[] };
};

const atomCache = new Map<string, { atoms: NarrativeAtom[]; loadedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function loadAllAtoms(userId: string, force = false): Promise<NarrativeAtom[]> {
  const cached = atomCache.get(userId);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.atoms;
  }

  const [timelineAtoms, candidateAtoms] = await Promise.all([
    buildAtomsFromTimeline(userId),
    buildAtomsFromEventCandidates(userId),
  ]);

  const byId = new Map<string, NarrativeAtom>();
  for (const atom of [...timelineAtoms, ...candidateAtoms]) {
    byId.set(atom.id, atom);
  }

  const atoms = [...byId.values()];
  atomCache.set(userId, { atoms, loadedAt: Date.now() });
  return atoms;
}

export function invalidateAtomCache(userId: string): void {
  atomCache.delete(userId);
}

export function filterAtoms(atoms: NarrativeAtom[], spec: AtomFilterSpec): NarrativeAtom[] {
  let filtered = atoms;

  if (spec.scope === 'domain' && spec.domain) {
    filtered = filtered.filter((atom) => atom.domains.includes(spec.domain!));
  } else if (spec.topicDomain) {
    filtered = filtered.filter((atom) => atomMatchesTopicDomain(atom.domains, spec.topicDomain));
  }

  if (spec.scope === 'time_range' && spec.timeRange) {
    const start = new Date(spec.timeRange.start);
    const end = new Date(spec.timeRange.end);
    filtered = filtered.filter((atom) => {
      const atomDate = new Date(atom.timestamp);
      return atomDate >= start && atomDate <= end;
    });
  }

  if (spec.themes && spec.themes.length > 0) {
    filtered = filtered.filter((atom) => {
      const atomText = `${atom.content} ${(atom.tags || []).join(' ')}`.toLowerCase();
      return spec.themes!.some((theme) => atomText.includes(theme.toLowerCase()));
    });
  }

  const peopleIds = [...(spec.peopleIds ?? []), ...(spec.characterIds ?? [])];
  if (peopleIds.length > 0) {
    filtered = filtered.filter(
      (atom) => atom.peopleIds && atom.peopleIds.some((id) => peopleIds.includes(id))
    );
  }

  const locationIds = spec.locationIds ?? [];
  if (locationIds.length > 0) {
    filtered = filtered.filter((atom) => {
      const ids = atom.metadata?.locationIds as string[] | undefined;
      return ids && ids.some((id) => locationIds.includes(id));
    });
  }

  const eventIds = spec.eventIds ?? [];
  if (eventIds.length > 0) {
    filtered = filtered.filter((atom) => {
      const ids = atom.metadata?.eventIds as string[] | undefined;
      return ids && ids.some((id) => eventIds.includes(id));
    });
  }

  const skillIds = spec.skillIds ?? [];
  if (skillIds.length > 0) {
    filtered = filtered.filter((atom) => {
      const ids = atom.metadata?.skillIds as string[] | undefined;
      return ids && ids.some((id) => skillIds.includes(id));
    });
  }

  return filtered;
}

export function countUniqueEntries(atoms: NarrativeAtom[]): number {
  const ids = new Set<string>();
  for (const atom of atoms) {
    for (const id of atom.timelineIds) ids.add(id);
  }
  return ids.size;
}

export function countWords(atoms: NarrativeAtom[]): number {
  return atoms.reduce((sum, atom) => sum + atom.content.split(/\s+/).filter(Boolean).length, 0);
}

export function countAtomTypes(atoms: NarrativeAtom[]): Partial<Record<NarrativeAtomType, number>> {
  const counts: Partial<Record<NarrativeAtomType, number>> = {};
  for (const atom of atoms) {
    counts[atom.type] = (counts[atom.type] ?? 0) + 1;
  }
  return counts;
}

export function computeTimeSpanMonths(atoms: NarrativeAtom[]): number {
  if (atoms.length === 0) return 0;
  const times = atoms
    .map((a) => new Date(a.timestamp).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return 0;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return Math.max(0, Math.round((max - min) / (1000 * 60 * 60 * 24 * 30)));
}

export function sliceMetrics(atoms: NarrativeAtom[]): AtomSliceMetrics {
  const characterSet = new Set<string>();
  const locationSet = new Set<string>();
  for (const atom of atoms) {
    for (const id of atom.peopleIds ?? []) characterSet.add(id);
    const locIds = atom.metadata?.locationIds as string[] | undefined;
    for (const id of locIds ?? []) locationSet.add(id);
  }

  return {
    atoms,
    atomCount: atoms.length,
    entryCount: countUniqueEntries(atoms),
    wordCount: countWords(atoms),
    atomTypeCounts: countAtomTypes(atoms),
    timeSpanMonths: computeTimeSpanMonths(atoms),
    entityIds: {
      characters: [...characterSet],
      locations: [...locationSet],
    },
  };
}

export async function getEntityAtomCounts(
  userId: string,
  atoms: NarrativeAtom[]
): Promise<Map<string, { atomCount: number; entryCount: number; name: string }>> {
  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .neq('status', 'archived');

  const result = new Map<string, { atomCount: number; entryCount: number; name: string }>();
  for (const character of characters ?? []) {
    const entityAtoms = atoms.filter(
      (atom) => atom.peopleIds && atom.peopleIds.includes(character.id)
    );
    if (entityAtoms.length === 0) continue;
    result.set(character.id, {
      name: character.name ?? 'Unknown',
      atomCount: entityAtoms.length,
      entryCount: countUniqueEntries(entityAtoms),
    });
  }
  return result;
}

export async function getLocationAtomCounts(
  userId: string,
  atoms: NarrativeAtom[]
): Promise<Map<string, { atomCount: number; entryCount: number; name: string }>> {
  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name')
    .eq('user_id', userId);

  const result = new Map<string, { atomCount: number; entryCount: number; name: string }>();
  for (const location of locations ?? []) {
    const entityAtoms = atoms.filter((atom) => {
      const ids = atom.metadata?.locationIds as string[] | undefined;
      return ids && ids.includes(location.id);
    });
    if (entityAtoms.length === 0) continue;
    result.set(location.id, {
      name: location.name ?? 'Unknown place',
      atomCount: entityAtoms.length,
      entryCount: countUniqueEntries(entityAtoms),
    });
  }
  return result;
}

export function buildDomainCoverage(atoms: NarrativeAtom[]): Array<{ domain: Domain; atomCount: number; entryCount: number }> {
  const domainMap = new Map<Domain, number>();
  const domainEntryMap = new Map<Domain, Set<string>>();

  for (const atom of atoms) {
    for (const domain of atom.domains) {
      domainMap.set(domain, (domainMap.get(domain) ?? 0) + 1);
      if (!domainEntryMap.has(domain)) domainEntryMap.set(domain, new Set());
      for (const id of atom.timelineIds) domainEntryMap.get(domain)!.add(id);
    }
  }

  const coverage: Array<{ domain: Domain; atomCount: number; entryCount: number }> = [];
  domainMap.forEach((atomCount, domain) => {
    coverage.push({
      domain,
      atomCount,
      entryCount: domainEntryMap.get(domain)?.size ?? 0,
    });
  });
  coverage.sort((a, b) => b.atomCount - a.atomCount);
  return coverage;
}
