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

/** Intents where WM relationship/community titles may invent focus people. */
const ROSTER_EXPAND_INTENTS = new Set<ResponseScopePlan['intent']>([
  'work',
  'relationship',
  'family',
]);

/** Vague vents / recaps must not surface unmentioned graph people as sources. */
const STRICT_PERSON_SOURCE_INTENTS = new Set<ResponseScopePlan['intent']>([
  'general',
  'event',
  'biography',
  'place',
  'project',
]);

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

  // Only expand focus from WM roster titles for work/relationship/family.
  // Mining crush/friend edges on a vague "worst night" vent invents people
  // the user never named (e.g. a crush listed under romantic edges).
  if (ROSTER_EXPAND_INTENTS.has(plan.intent)) {
    for (const item of [
      ...(workingMemory?.relationships ?? []),
      ...(workingMemory?.communities ?? []),
    ]) {
      const candidates = `${item.title} ${item.content}`.match(/\b[A-ZÁÉÍÓÚÑ][\w'’-]+\b/g) ?? [];
      candidates.forEach(add);
    }
  }
  return names;
}

function overlapsRelevantName(value: string, names: Set<string>): boolean {
  const lower = value.toLowerCase();
  return [...names].some((name) => lower.includes(name) || name.includes(lower));
}

/** When the plan names people/topics, require source overlap (or work signal). */
function sourceIsInScope(
  source: PresentableSource,
  plan: ResponseScopePlan,
  names: Set<string>,
): boolean {
  const text = `${source.title} ${source.snippet ?? ''}`;
  const hasFocus = names.size > 0;

  // Work answers must never drag music-scene contacts (e.g. Ink) into chips.
  if (plan.intent === 'work') {
    if (source.type === 'character') {
      return overlapsRelevantName(source.title, names) || WORK_SIGNAL_RE.test(text);
    }
    return overlapsRelevantName(text, names) || WORK_SIGNAL_RE.test(text);
  }

  // Person/place-focused questions: keep only sources that name the focus.
  if (hasFocus && (source.type === 'character' || source.type === 'person')) {
    return overlapsRelevantName(source.title, names);
  }
  if (hasFocus && plan.primaryEntities.length > 0) {
    // Episodes/entries still need name overlap so unrelated music lore drops.
    return overlapsRelevantName(text, names);
  }

  // No named focus: never list character chips on vents/recaps. RAG still
  // attaches the whole roster as candidate sources; without this gate a crush
  // in the top-N characters appears "sourced" despite never being mentioned.
  if (
    !hasFocus &&
    STRICT_PERSON_SOURCE_INTENTS.has(plan.intent) &&
    (source.type === 'character' || source.type === 'person')
  ) {
    return false;
  }
  return true;
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
    return sourceIsInScope(source, plan, names);
  });

  // Prefer type-stable domains for presentation. Content heuristics can tag a
  // character/entry as "work_relationships" / "music_scene" and then
  // filterEvidence drops them when that domain is not in the plan — even when
  // the name is in primaryEntities (Jesse filtered out of a Jesse question).
  const scoped: ScopedEvidenceItem[] = eligible.map((source) => {
    const type = (source.type ?? '').toLowerCase();
    const domain =
      type === 'character' || type === 'person'
        ? 'people'
        : type === 'location' || type === 'place'
          ? 'places'
          : type === 'organization' || type === 'org'
            ? 'organizations'
            : type === 'event'
              ? 'events'
              : type === 'project'
                ? 'projects'
                : type === 'entry' ||
                    type === 'memory' ||
                    type === 'journal' ||
                    type === 'episode' ||
                    type === 'timeline'
                  ? 'people'
                  : classifyItemDomain({
                      type: source.type,
                      title: source.title,
                      content: source.snippet,
                    });
    return {
      id: source.id,
      title: source.title,
      content: source.snippet ?? '',
      domain,
      entityNames: [source.title],
    };
  });
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
    // Work: no location chips; characters must be roster-relevant.
    if (plan.intent === 'work') {
      if (entity.type === 'location') return false;
      return names.size === 0 || overlapsRelevantName(entity.name, names);
    }
    // Focused person answers: only surface the people the plan is about.
    // Stops "Ink" (music contact) from riding along on unrelated recall.
    if (names.size > 0 && (entity.type === 'character' || entity.type === 'person' || !entity.type)) {
      return overlapsRelevantName(entity.name, names);
    }
    // Vague vents: no invented person chips when the plan named nobody.
    if (
      names.size === 0 &&
      STRICT_PERSON_SOURCE_INTENTS.has(plan.intent) &&
      (entity.type === 'character' || entity.type === 'person' || !entity.type)
    ) {
      return false;
    }
    return true;
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
