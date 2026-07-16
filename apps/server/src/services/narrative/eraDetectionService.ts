/**
 * Era detection — infer life periods from entity co-occurrence and lexical signals.
 */
import type { AnchorBuildContext, EntityGravityInput, NarrativeAnchorType } from './narrativeAnchorTypes';

type EraSignal = {
  anchorType: NarrativeAnchorType;
  title: string;
  keywords: RegExp;
  minMatches?: number;
};

const ERA_SIGNALS: EraSignal[] = [
  {
    anchorType: 'school_era',
    title: 'Middle School Era',
    keywords: /\b(middle school|junior high|grade school|elementary)\b/i,
  },
  {
    anchorType: 'school_era',
    title: 'High School Era',
    keywords: /\b(high school|senior year|freshman|sophomore|junior year)\b/i,
  },
  {
    anchorType: 'school_era',
    title: 'College Era',
    keywords: /\b(college|university|csuf|campus|undergrad|graduate school)\b/i,
  },
  {
    anchorType: 'school_era',
    title: 'School Era',
    keywords: /\b(school|band|classmate|teacher|homework|graduation)\b/i,
    minMatches: 2,
  },
  {
    anchorType: 'work_era',
    title: 'Work Era',
    keywords: /\b(vanguard|robotics|startup|serve robotics|workplace|job|office|coworker|denny'?s)\b/i,
  },
  {
    anchorType: 'project_arc',
    title: 'LoreBook Build Era',
    keywords: /\b(lorebook|claude code|codex|parser|lexical intelligence)\b/i,
    minMatches: 2,
  },
  {
    anchorType: 'family_period',
    title: 'Family Period',
    keywords: /\b(family|tio|tía|aunt|uncle|cousin|graduation party|family party)\b/i,
  },
  {
    anchorType: 'community',
    title: 'Ska Scene Era',
    keywords: /\b(ska scene|goth scene|bad dogg|club metro|music community|local scene)\b/i,
    minMatches: 2,
  },
  {
    anchorType: 'travel_period',
    title: 'Travel Period',
    keywords: /\b(travel|trip|vacation|flight|abroad)\b/i,
  },
  {
    anchorType: 'life_era',
    title: 'Childhood',
    keywords: /\b(childhood|growing up|when i was (?:a )?kid)\b/i,
  },
];

export type EraDetectionResult = {
  anchorType: NarrativeAnchorType;
  title: string;
  confidence: number;
  matchedSignals: string[];
  entityIds: string[];
};

function uniqueSignals(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contextualTitle(
  signal: EraSignal,
  entityIds: string[],
  ctx: AnchorBuildContext,
): string {
  const idSet = new Set(entityIds);
  const organization = ctx.organizations.find((org) =>
    org.memberIds.some((id) => idSet.has(id)),
  );

  if (organization && signal.anchorType === 'work_era') return `${organization.name} Chapter`;
  if (organization && signal.anchorType === 'community') return organization.name;
  return signal.title;
}

function corpusForEntities(
  entityIds: string[],
  ctx: AnchorBuildContext,
): string {
  const idSet = new Set(entityIds);
  const parts: string[] = [];

  for (const e of ctx.entities) {
    if (!idSet.has(e.entityId)) continue;
    parts.push(e.name);
    parts.push(...(e.facts ?? []));
    parts.push(...(e.roles ?? []));
  }

  for (const f of ctx.facts) {
    if (idSet.has(f.entityId)) parts.push(f.text);
  }

  for (const org of ctx.organizations) {
    if (org.memberIds.some((id) => idSet.has(id))) parts.push(org.name, org.type ?? '');
  }

  for (const ev of ctx.events) {
    if (ev.entityIds.some((id) => idSet.has(id))) parts.push(ev.title);
  }

  return parts.join(' ').toLowerCase();
}

function matchingEvidenceSources(
  signal: EraSignal,
  entityIds: string[],
  ctx: AnchorBuildContext,
): number {
  const idSet = new Set(entityIds);
  const sources = new Set<string>();

  if (ctx.entities.some((entity) => idSet.has(entity.entityId) &&
    signal.keywords.test([entity.name, ...(entity.roles ?? [])].join(' ')))) sources.add('entity');
  if (ctx.facts.some((fact) => idSet.has(fact.entityId) && signal.keywords.test(fact.text))) sources.add('fact');
  if (ctx.organizations.some((org) => org.memberIds.some((id) => idSet.has(id)) &&
    signal.keywords.test(`${org.name} ${org.type ?? ''}`))) sources.add('organization');
  if (ctx.events.some((event) => event.entityIds.some((id) => idSet.has(id)) &&
    signal.keywords.test(event.title))) sources.add('event');

  return sources.size;
}

function matchingEntityCount(signal: EraSignal, entityIds: string[], ctx: AnchorBuildContext): number {
  const supported = new Set<string>();
  for (const entityId of entityIds) {
    const entity = ctx.entities.find((item) => item.entityId === entityId);
    const facts = ctx.facts.filter((fact) => fact.entityId === entityId).map((fact) => fact.text);
    const corpus = [entity?.name ?? '', ...(entity?.roles ?? []), ...(entity?.facts ?? []), ...facts].join(' ');
    if (signal.keywords.test(corpus)) supported.add(entityId);
  }
  return supported.size;
}

export function detectEraForCluster(
  entityIds: string[],
  ctx: AnchorBuildContext,
): EraDetectionResult | null {
  if (entityIds.length === 0) return null;

  const corpus = corpusForEntities(entityIds, ctx);
  let best: EraDetectionResult | null = null;

  for (const signal of ERA_SIGNALS) {
    const matches = corpus.match(new RegExp(signal.keywords.source, 'gi')) ?? [];
    const min = signal.minMatches ?? 1;
    if (matches.length < min) continue;

    const uniqueMatches = uniqueSignals(matches);
    const evidenceSources = matchingEvidenceSources(signal, entityIds, ctx);
    const supportedEntities = matchingEntityCount(signal, entityIds, ctx);
    const hasExplicitGroup = ctx.organizations.some((org) =>
      org.memberIds.filter((id) => entityIds.includes(id)).length >= 2 &&
      signal.keywords.test(`${org.name} ${org.type ?? ''}`));
    // One keyword on one entity must not label an entire co-mention cluster.
    if (supportedEntities < 2 && !hasExplicitGroup) continue;
    if (evidenceSources < 2 && !hasExplicitGroup) continue;
    // Repetition alone is weak evidence. Confidence rises when distinct terms
    // agree across facts, entities, organizations, and resolved events.
    const confidence = Math.min(0.95, 0.45 + uniqueMatches.length * 0.08 + evidenceSources * 0.08);
    const result: EraDetectionResult = {
      anchorType: signal.anchorType,
      title: contextualTitle(signal, entityIds, ctx),
      confidence,
      matchedSignals: uniqueSignals([signal.title, ...uniqueMatches]),
      entityIds,
    };

    if (!best || confidence > best.confidence) best = result;
  }

  return best;
}

export function entitiesBelongToMultipleEras(
  entity: EntityGravityInput,
  ctx: AnchorBuildContext,
  allClusters: string[][],
): string[] {
  const titles: string[] = [];
  for (const cluster of allClusters) {
    if (!cluster.includes(entity.entityId)) continue;
    const era = detectEraForCluster(cluster, ctx);
    if (era) titles.push(era.title);
  }
  return [...new Set(titles)];
}
