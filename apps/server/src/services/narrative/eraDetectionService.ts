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
    anchorType: 'relationship_arc',
    title: 'Relationship Arc',
    keywords: /\b(dating|ghosting|blocking|reappearance|met|broke up|distancing|best friend)\b/i,
  },
  {
    anchorType: 'family_period',
    title: 'Family Period',
    keywords: /\b(family|tio|tía|aunt|uncle|cousin|graduation party|family party)\b/i,
  },
  {
    anchorType: 'community',
    title: 'Ska Scene Era',
    keywords: /\b(ska|goth|bad dogg|club metro|compound|show)\b/i,
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

    const confidence = Math.min(0.95, 0.45 + matches.length * 0.12);
    const result: EraDetectionResult = {
      anchorType: signal.anchorType,
      title: signal.title,
      confidence,
      matchedSignals: [signal.title, ...matches.slice(0, 5)],
      entityIds,
    };

    if (!best || confidence > best.confidence) best = result;
  }

  if (best) return best;

  // Fallback: generic life era when cluster has enough gravity-bearing entities
  const names = entityIds
    .map((id) => ctx.entities.find((e) => e.entityId === id)?.name)
    .filter(Boolean) as string[];

  if (entityIds.length >= 3) {
    return {
      anchorType: 'life_era',
      title: `${names[0] ?? 'Life'} Cluster`,
      confidence: 0.4,
      matchedSignals: ['co_mention_cluster'],
      entityIds,
    };
  }

  return null;
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
