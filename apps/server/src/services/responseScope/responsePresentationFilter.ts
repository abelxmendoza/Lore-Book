/**
 * Presentation-surface scope filter.
 *
 * The same response plan that gates LLM context must also gate everything the
 * user can see: source chips, citation chips, entity chips, and response
 * metadata. Otherwise an answer can be focused while its UI leaks unrelated
 * graph nodes.
 */

import type { WorkingMemoryAssembly } from '../chat/workingMemoryAssembler';
import { filterEvidence, classifyItemDomain } from './responseEvidenceFilter';
import type { EntityRef, ResponseScopePlan, ScopedEvidenceItem } from './responseScopeTypes';

export type PresentableSource = {
  type: string;
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

export type PresentableEntity = EntityRef & {
  type?: string;
};

const WORK_SIGNAL_RE =
  /\b(work|job|team|coworker|colleague|manager|boss|lead|engineer|developer|lab|department|shift|testing|prototype|on[- ]?site|employer|office|company)\b/i;
const JUNK_ENTITY_RE =
  /^(?:also\s+you|also\s+me|you|me|also|and|but|the|this|that|someone|everyone|unknown)$/i;

export function isPresentableEntityName(name: string): boolean {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.split(' ').length > 5) return false;
  if (JUNK_ENTITY_RE.test(clean)) return false;
  if (/^(?:also|and|but|so|then)\s+/i.test(clean)) return false;
  return true;
}

function relevantNames(
  plan: ResponseScopePlan,
  workingMemory?: WorkingMemoryAssembly | null,
): Set<string> {
  const names = new Set<string>();
  const add = (name?: string | null) => {
    const value = name?.trim().toLowerCase();
    if (value) names.add(value);
  };
  plan.primaryEntities.forEach((entity) => add(entity.name));
  plan.correctionNames.forEach(add);
  workingMemory?.entities.forEach((entity) => add(entity.name));

  // Accepted work relationship/community items often carry the teammate names
  // that were not present in the question itself ("who is on my team?").
  for (const item of [
    ...(workingMemory?.relationships ?? []),
    ...(workingMemory?.communities ?? []),
  ]) {
    const candidates = `${item.title} ${item.content}`.match(/\b[A-ZÁÉÍÓÚÑ][\w'’-]+\b/g) ?? [];
    candidates.forEach(add);
  }
  return names;
}

function overlapsRelevantName(value: string, names: Set<string>): boolean {
  const lower = value.toLowerCase();
  return [...names].some((name) => lower.includes(name) || name.includes(lower));
}

/** Scope and de-noise the source list before prompt, metadata, or citations. */
export function filterSourcesForPresentation<T extends PresentableSource>(
  sources: T[],
  plan: ResponseScopePlan,
  workingMemory?: WorkingMemoryAssembly | null,
): T[] {
  const names = relevantNames(plan, workingMemory);
  const eligible = sources.filter((source) => {
    if (!isPresentableEntityName(source.title)) return false;
    if (plan.intent !== 'work') return true;

    const text = `${source.title} ${source.snippet ?? ''}`;
    if (source.type === 'character') {
      return overlapsRelevantName(source.title, names) || WORK_SIGNAL_RE.test(text);
    }
    return overlapsRelevantName(text, names) || WORK_SIGNAL_RE.test(text);
  });

  const scoped: ScopedEvidenceItem[] = eligible.map((source) => ({
    id: source.id,
    title: source.title,
    content: source.snippet ?? '',
    domain: classifyItemDomain({ type: source.type, title: source.title, content: source.snippet }),
    entityNames: [source.title],
  }));
  const presentationPlan: ResponseScopePlan = {
    ...plan,
    primaryEntities: [...names].map((name) => ({ name })),
  };
  const acceptedIds = new Set(filterEvidence(scoped, presentationPlan).accepted.map((item) => item.id));
  return eligible.filter((source) => acceptedIds.has(source.id));
}

/** Entity chips are already message-derived; enforce name quality and scope. */
export function filterEntitiesForPresentation<T extends PresentableEntity>(
  entities: T[],
  plan: ResponseScopePlan,
): T[] {
  const names = relevantNames(plan);
  return entities.filter((entity) => {
    if (!isPresentableEntityName(entity.name)) return false;
    if (plan.intent !== 'work') return true;
    if (entity.type === 'location') return false;
    return overlapsRelevantName(entity.name, names);
  });
}

/** Keep citations strictly downstream of the already-scoped source list. */
export function filterCitationsForPresentation<T extends { sourceId: string }>(
  citations: T[],
  sources: PresentableSource[],
): T[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  return citations.filter((citation) => sourceIds.has(citation.sourceId));
}
