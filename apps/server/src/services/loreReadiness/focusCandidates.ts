/**
 * Topic-scoped focus candidates — spokes around the user's self prime node.
 * Only quality-gated options appear in the Create readiness picker.
 */

import type { NarrativeAtom } from '../biographyGeneration/types';
import { supabaseAdmin } from '../supabaseClient';
import {
  countUniqueEntries,
  countWords,
  filterAtoms,
  sliceMetrics,
} from './atomIndexService';
import { atomMatchesTopicDomain } from './domainMapping';
import type {
  FocusCandidate,
  FocusCompileRef,
  FocusKind,
  FocusSignals,
  LoreTopicId,
} from './types';

export const FOCUS_QUALITY_SCORE = 0.45;
export const FOCUS_MIN_WORDS = 400;
export const FOCUS_MAX_OPTIONS = 5;

const SELF_NAMES = new Set(['me', 'myself', 'self', 'you', 'i', 'my', 'mine']);

export function isSelfCharacterRow(row: {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const meta = row.metadata ?? {};
  if (meta.distinct_from_self === true || meta.confirmed_distinct === true) return false;
  if (meta.is_self === true || meta.is_user === true) return true;
  const name = (row.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return SELF_NAMES.has(name);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function meaningClusters(atoms: NarrativeAtom[]): number {
  const tags = new Set<string>();
  for (const atom of atoms) {
    for (const d of atom.domains ?? []) tags.add(`d:${d}`);
    for (const t of atom.tags ?? []) tags.add(`t:${t.toLowerCase()}`);
    tags.add(`type:${atom.type}`);
  }
  return tags.size;
}

function relatedEntityLinks(atoms: NarrativeAtom[]): number {
  const people = new Set<string>();
  const places = new Set<string>();
  const skills = new Set<string>();
  for (const atom of atoms) {
    for (const id of atom.peopleIds ?? []) people.add(id);
    for (const id of (atom.metadata?.locationIds as string[] | undefined) ?? []) places.add(id);
    for (const id of (atom.metadata?.skillIds as string[] | undefined) ?? []) skills.add(id);
  }
  return people.size + places.size + skills.size;
}

export function computeFocusSignals(
  atoms: NarrativeAtom[],
  evidenceFacts = 0
): FocusSignals {
  return {
    atomCount: atoms.length,
    wordCount: countWords(atoms),
    entryCount: countUniqueEntries(atoms),
    meaningClusters: meaningClusters(atoms),
    threadLinks: relatedEntityLinks(atoms),
    evidenceFacts,
  };
}

/** Composite score for whether a focus can carry a lorebook. */
export function scoreFocusSubgraph(
  signals: FocusSignals,
  mins: { atoms: number; entries: number; words?: number }
): number {
  const minWords = mins.words ?? FOCUS_MIN_WORDS;
  const atomProgress = mins.atoms > 0 ? signals.atomCount / mins.atoms : 1;
  const entryProgress = mins.entries > 0 ? signals.entryCount / mins.entries : 1;
  const wordProgress = minWords > 0 ? signals.wordCount / minWords : 1;
  const meaningProgress = Math.min(1, signals.meaningClusters / 4);
  const threadCohesion = Math.min(1, signals.threadLinks / 3);
  const evidenceProgress = Math.min(1, (30 + signals.evidenceFacts * 15) / 100);

  return clamp01(
    0.25 * atomProgress +
      0.2 * wordProgress +
      0.15 * entryProgress +
      0.15 * meaningProgress +
      0.15 * threadCohesion +
      0.1 * evidenceProgress
  );
}

export function passesQualityGate(score: number, signals: FocusSignals): boolean {
  if (score < FOCUS_QUALITY_SCORE) return false;
  if (signals.wordCount >= FOCUS_MIN_WORDS) return true;
  // Short but dense: enough atoms with some substance
  return signals.atomCount >= 4 && signals.wordCount >= 200;
}

function buildCandidate(input: {
  id: string;
  kind: FocusKind;
  label: string;
  topicId: LoreTopicId;
  atoms: NarrativeAtom[];
  evidenceFacts?: number;
  mins: { atoms: number; entries: number; words?: number };
  compileRef: FocusCompileRef;
  extraReasons?: string[];
}): FocusCandidate | null {
  const signals = computeFocusSignals(input.atoms, input.evidenceFacts ?? 0);
  const score = scoreFocusSubgraph(signals, input.mins);
  if (!passesQualityGate(score, signals) && score < 0.35) {
    // Still surface near-misses that are clearly building (for picker when topic is building)
    // but drop true noise below 0.35
    return null;
  }
  if (signals.atomCount === 0) return null;

  const reasons: string[] = [...(input.extraReasons ?? [])];
  if (signals.wordCount >= FOCUS_MIN_WORDS) {
    reasons.push(`~${Math.round(signals.wordCount / 100) * 100} words of story`);
  } else if (signals.atomCount > 0) {
    reasons.push(`${signals.atomCount} linked memories`);
  }
  if (signals.threadLinks >= 2) {
    reasons.push(`${signals.threadLinks} connected story links`);
  }
  if (signals.meaningClusters >= 3) {
    reasons.push('Several distinct themes');
  }

  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    topicId: input.topicId,
    score,
    canCompile: false, // set by finalizeCandidateCompile
    reasons: reasons.slice(0, 3),
    signals,
    compileRef: input.compileRef,
  };
}

/** Stricter canCompile: enough fuel relative to topic mins. */
export function finalizeCandidateCompile(
  candidate: FocusCandidate,
  mins: { atoms: number; entries: number }
): FocusCandidate {
  const canCompile =
    candidate.signals.atomCount >= mins.atoms &&
    candidate.signals.entryCount >= mins.entries &&
    candidate.score >= FOCUS_QUALITY_SCORE &&
    (candidate.signals.wordCount >= FOCUS_MIN_WORDS || candidate.signals.atomCount >= mins.atoms + 2);
  return { ...candidate, canCompile };
}

function rankAndCap(candidates: FocusCandidate[]): FocusCandidate[] {
  return candidates
    .filter((c) => c.score >= FOCUS_QUALITY_SCORE || c.signals.atomCount >= 3)
    .sort((a, b) => b.score - a.score || b.signals.atomCount - a.signals.atomCount)
    .filter((c) => passesQualityGate(c.score, c.signals) || c.score >= 0.4)
    .slice(0, FOCUS_MAX_OPTIONS)
    .map((c) => ({
      ...c,
      // Only show good options in the UI list — drop weak after sort
    }))
    .filter((c) => passesQualityGate(c.score, c.signals));
}

async function evidenceFactCount(
  userId: string,
  entityType: string,
  entityId: string
): Promise<number> {
  const { count } = await supabaseAdmin
    .from('entity_facts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);
  return count ?? 0;
}

export async function buildCharacterFocusCandidates(
  userId: string,
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number },
  options?: { domainHint?: string; relationshipOnly?: boolean }
): Promise<FocusCandidate[]> {
  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .neq('status', 'archived');

  const out: FocusCandidate[] = [];
  for (const character of characters ?? []) {
    if (isSelfCharacterRow(character)) continue;

    let entityAtoms = atoms.filter(
      (atom) => atom.peopleIds && atom.peopleIds.includes(character.id)
    );
    if (options?.domainHint) {
      entityAtoms = entityAtoms.filter((a) =>
        atomMatchesTopicDomain(a.domains, options.domainHint)
      );
    }
    if (entityAtoms.length === 0) continue;

    const facts = await evidenceFactCount(userId, 'character', character.id);
    const candidate = buildCandidate({
      id: character.id,
      kind: 'character',
      label: character.name ?? 'Someone',
      topicId,
      atoms: entityAtoms,
      evidenceFacts: facts,
      mins,
      compileRef: { characterId: character.id },
      extraReasons: [`Your story with ${character.name ?? 'them'}`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

export async function buildLocationFocusCandidates(
  userId: string,
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number }
): Promise<FocusCandidate[]> {
  const { data: locations } = await supabaseAdmin
    .from('locations')
    .select('id, name')
    .eq('user_id', userId);

  const out: FocusCandidate[] = [];
  for (const location of locations ?? []) {
    const entityAtoms = atoms.filter((atom) => {
      const ids = atom.metadata?.locationIds as string[] | undefined;
      return ids && ids.includes(location.id);
    });
    if (entityAtoms.length === 0) continue;

    const facts = await evidenceFactCount(userId, 'location', location.id);
    const candidate = buildCandidate({
      id: location.id,
      kind: 'location',
      label: location.name ?? 'A place',
      topicId,
      atoms: entityAtoms,
      evidenceFacts: facts,
      mins,
      compileRef: { locationId: location.id },
      extraReasons: [`Your story at ${location.name ?? 'this place'}`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

export async function buildOrganizationFocusCandidates(
  userId: string,
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number }
): Promise<FocusCandidate[]> {
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, aliases')
    .eq('user_id', userId);

  const professionalAtoms = filterAtoms(atoms, { topicDomain: 'professional' });
  const out: FocusCandidate[] = [];

  for (const org of orgs ?? []) {
    const names = [org.name, ...((org.aliases as string[] | null) ?? [])]
      .filter(Boolean)
      .map((n) => String(n).toLowerCase());
    if (names.length === 0) continue;

    const orgAtoms = professionalAtoms.filter((atom) => {
      const metaIds = atom.metadata?.organizationIds as string[] | undefined;
      if (metaIds?.includes(org.id)) return true;
      const hay = `${atom.content} ${(atom.tags ?? []).join(' ')}`.toLowerCase();
      return names.some((n) => n.length >= 3 && hay.includes(n));
    });
    if (orgAtoms.length === 0) continue;

    const candidate = buildCandidate({
      id: org.id,
      kind: 'organization',
      label: org.name ?? 'Workplace',
      topicId,
      atoms: orgAtoms,
      mins,
      compileRef: { organizationId: org.id, themes: [org.name].filter(Boolean) as string[] },
      extraReasons: [`Your years around ${org.name}`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

export async function buildSkillFocusCandidates(
  userId: string,
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number },
  domainHint?: string
): Promise<FocusCandidate[]> {
  const { data: skills } = await supabaseAdmin
    .from('skills')
    .select('id, skill_name')
    .eq('user_id', userId);

  const pool = domainHint ? filterAtoms(atoms, { topicDomain: domainHint }) : atoms;
  const out: FocusCandidate[] = [];

  for (const skill of skills ?? []) {
    const label = skill.skill_name || 'Skill';
    const skillAtoms = pool.filter((atom) => {
      const ids = atom.metadata?.skillIds as string[] | undefined;
      if (ids?.includes(skill.id)) return true;
      const hay = `${atom.content} ${(atom.tags ?? []).join(' ')}`.toLowerCase();
      return hay.includes(String(label).toLowerCase());
    });
    if (skillAtoms.length === 0) continue;

    const candidate = buildCandidate({
      id: skill.id,
      kind: 'skill',
      label,
      topicId,
      atoms: skillAtoms,
      mins,
      compileRef: { skillId: skill.id, themes: [label, 'learning', 'growth'] },
      extraReasons: [`Your journey with ${label}`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

export async function buildEraFocusCandidates(
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number }
): Promise<FocusCandidate[]> {
  const byYear = new Map<number, NarrativeAtom[]>();
  for (const atom of atoms) {
    const year = new Date(atom.timestamp).getFullYear();
    if (Number.isNaN(year) || year < 1970 || year > 2100) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(atom);
  }

  const out: FocusCandidate[] = [];
  for (const [year, yearAtoms] of byYear) {
    const candidate = buildCandidate({
      id: `era-${year}`,
      kind: 'era',
      label: `${year}`,
      topicId,
      atoms: yearAtoms,
      mins,
      compileRef: {
        timeRange: {
          start: `${year}-01-01T00:00:00.000Z`,
          end: `${year}-12-31T23:59:59.999Z`,
        },
      },
      extraReasons: [`Your ${year} chapter`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

export async function buildThreadFocusCandidates(
  userId: string,
  atoms: NarrativeAtom[],
  topicId: LoreTopicId,
  mins: { atoms: number; entries: number },
  category?: string,
  domainHint?: string
): Promise<FocusCandidate[]> {
  let q = supabaseAdmin.from('threads').select('id, name, category, description').eq('user_id', userId);
  if (category) q = q.eq('category', category);
  const { data: threads } = await q;

  const pool = domainHint ? filterAtoms(atoms, { topicDomain: domainHint }) : atoms;
  const out: FocusCandidate[] = [];

  for (const thread of threads ?? []) {
    const name = (thread.name ?? '').trim();
    if (!name || name.length < 2) continue;
    const needle = name.toLowerCase();
    const threadAtoms = pool.filter((atom) => {
      const hay = `${atom.content} ${(atom.tags ?? []).join(' ')}`.toLowerCase();
      return hay.includes(needle);
    });
    // If name match is thin, use domain pool as weak signal for category threads
    const useAtoms =
      threadAtoms.length >= 2
        ? threadAtoms
        : category && pool.length >= mins.atoms
          ? pool.slice(0, Math.min(pool.length, mins.atoms * 2))
          : threadAtoms;
    if (useAtoms.length === 0) continue;

    const candidate = buildCandidate({
      id: thread.id,
      kind: 'thread',
      label: name,
      topicId,
      atoms: useAtoms,
      mins,
      compileRef: {
        threadId: thread.id,
        themes: [name, ...(thread.description ? [thread.description.slice(0, 40)] : [])],
      },
      extraReasons: [`Recurring thread: ${name}`],
    });
    if (candidate) out.push(finalizeCandidateCompile(candidate, mins));
  }
  return rankAndCap(out);
}

/** Legacy UI shape for older clients. */
export function focusToEntityCandidate(focus: FocusCandidate): {
  id: string;
  name: string;
  atomCount: number;
  entryCount: number;
  progress: number;
  canGenerate: boolean;
} {
  return {
    id: focus.id,
    name: focus.label,
    atomCount: focus.signals.atomCount,
    entryCount: focus.signals.entryCount,
    progress: focus.score,
    canGenerate: focus.canCompile,
  };
}

export function bestFocusScore(candidates: FocusCandidate[]): number {
  if (candidates.length === 0) return 0;
  return Math.max(...candidates.map((c) => c.score));
}

export function filterAtomsForFocus(
  atoms: NarrativeAtom[],
  focus: FocusCandidate
): NarrativeAtom[] {
  const ref = focus.compileRef;
  if (ref.characterId) {
    return filterAtoms(atoms, { characterIds: [ref.characterId] });
  }
  if (ref.locationId) {
    return filterAtoms(atoms, { locationIds: [ref.locationId] });
  }
  if (ref.skillId) {
    return filterAtoms(atoms, { skillIds: [ref.skillId] });
  }
  if (ref.timeRange) {
    return filterAtoms(atoms, { scope: 'time_range', timeRange: ref.timeRange });
  }
  if (ref.organizationId || ref.themes?.length) {
    const themes = ref.themes ?? [];
    return atoms.filter((atom) => {
      const metaIds = atom.metadata?.organizationIds as string[] | undefined;
      if (ref.organizationId && metaIds?.includes(ref.organizationId)) return true;
      const hay = `${atom.content} ${(atom.tags ?? []).join(' ')}`.toLowerCase();
      return themes.some((t) => t.length >= 3 && hay.includes(t.toLowerCase()));
    });
  }
  if (ref.threadId && ref.themes?.length) {
    return filterAtoms(atoms, { themes: ref.themes });
  }
  return atoms;
}

export function summarizeFocusSignals(candidates: FocusCandidate[]): FocusSignals | undefined {
  const best = [...candidates].sort((a, b) => b.score - a.score)[0];
  return best?.signals;
}

/** Topic card aggregate signal line from best focus or domain slice. */
export function formatSignalLine(signals: FocusSignals): string {
  const parts: string[] = [];
  if (signals.wordCount > 0) {
    parts.push(
      signals.wordCount >= 1000
        ? `~${(signals.wordCount / 1000).toFixed(1)}k words`
        : `~${signals.wordCount} words`
    );
  }
  if (signals.entryCount > 0) parts.push(`${signals.entryCount} episodes`);
  if (signals.threadLinks > 0) parts.push(`${signals.threadLinks} linked threads`);
  if (parts.length === 0 && signals.atomCount > 0) {
    parts.push(`${signals.atomCount} memories`);
  }
  return parts.join(' · ');
}
