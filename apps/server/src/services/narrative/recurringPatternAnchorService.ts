/**
 * Recurring activity anchors — repetition patterns become narrative anchors.
 */
import type {
  AnchorBuildContext,
  AnchorBuildRecurringPattern,
  AnchorEvidence,
  AnchorMember,
  NarrativeAnchor,
} from './narrativeAnchorTypes';
import { scoreAnchor } from './anchorScoringService';

const RECURRENCE_PATTERNS: Array<{ regex: RegExp; cadence: string; label: string }> = [
  { regex: /\bevery\s+wednesday\b/i, cadence: 'weekly', label: 'Wednesday Practice' },
  { regex: /\bevery\s+friday\b/i, cadence: 'weekly', label: 'Friday Shows' },
  { regex: /\bdaily\b/i, cadence: 'daily', label: 'Daily Activity' },
  { regex: /\bmonthly\b/i, cadence: 'monthly', label: 'Monthly Gathering' },
  { regex: /\bevery\s+week\b/i, cadence: 'weekly', label: 'Weekly Activity' },
  { regex: /\bpracticed?\s+in\s+the\s+band\b/i, cadence: 'weekly', label: 'Band Practice' },
];

export function extractRecurringPatterns(ctx: AnchorBuildContext): AnchorBuildRecurringPattern[] {
  const found: AnchorBuildRecurringPattern[] = [];
  const seen = new Set<string>();

  for (const fact of ctx.facts) {
    for (const pat of RECURRENCE_PATTERNS) {
      if (!pat.regex.test(fact.text)) continue;
      const key = `${pat.label}:${fact.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        pattern: fact.text,
        entityIds: [fact.entityId],
        cadence: pat.cadence,
        label: pat.label,
      });
    }
  }

  return [...found, ...ctx.recurringPatterns];
}

export function buildRecurringActivityAnchors(ctx: AnchorBuildContext): NarrativeAnchor[] {
  const patterns = extractRecurringPatterns(ctx);
  const anchors: NarrativeAnchor[] = [];
  const builtAt = new Date().toISOString();

  // Merge patterns with same label + overlapping entities
  const byLabel = new Map<string, AnchorBuildRecurringPattern[]>();
  for (const p of patterns) {
    const label = p.label ?? p.pattern.slice(0, 40);
    const list = byLabel.get(label) ?? [];
    list.push(p);
    byLabel.set(label, list);
  }

  for (const [label, group] of byLabel) {
    const entityIds = [...new Set(group.flatMap((g) => g.entityIds))];
    if (entityIds.length === 0) continue;

    const entities: AnchorMember[] = entityIds
      .map((id) => {
        const ent = ctx.entities.find((e) => e.entityId === id);
        if (!ent) return null;
        return {
          id: ent.entityId,
          kind: 'entity' as const,
          name: ent.name,
          role: 'participant',
          evidence: group.map((g, i) => ({
            id: `pattern-${i}`,
            label: g.pattern,
            source: 'pattern' as const,
            confidence: 0.8,
          })),
        };
      })
      .filter(Boolean) as AnchorMember[];

    const evidence: AnchorEvidence[] = group.map((g, i) => ({
      id: `recur-ev-${i}`,
      label: g.pattern,
      source: 'pattern',
      confidence: 0.85,
    }));

    const consolidationKey = `recurring:${label}:${entityIds.sort().join(',')}`;
    const anchor: NarrativeAnchor = {
      id: consolidationKey,
      title: label,
      anchorType: 'recurring_activity',
      confidence: 0.8,
      gravityScore: 0,
      entities,
      events: [],
      groups: [],
      places: [],
      evidence,
      provenance: {
        builtAt,
        signals: ['recurring_pattern', group[0]?.cadence ?? 'unknown'],
        consolidationKey,
      },
    };

    anchor.gravityScore = scoreAnchor(anchor, ctx);
    anchors.push(anchor);
  }

  return anchors;
}
