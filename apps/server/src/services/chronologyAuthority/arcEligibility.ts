/**
 * Gate: when may a life_arc be drawn as a duration bar on Omni swimlanes.
 */

export type ArcEligibilityInput = {
  arcType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  linkedEventCount?: number;
  distinctTimepoints?: number;
};

export type ArcEligibility = {
  eligible: boolean;
  durationDays: number;
  renderAs: 'arc' | 'event' | 'session' | 'hidden';
  reasons: string[];
};

const DAY_MS = 86_400_000;

function durationDays(start?: string | null, end?: string | null): number {
  if (!start) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end || start).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, Math.round((e - s) / DAY_MS));
}

export function evaluateArcEligibility(input: ArcEligibilityInput): ArcEligibility {
  const days = durationDays(input.startDate, input.endDate);
  const reasons: string[] = [];
  const eventCount = input.linkedEventCount ?? 0;
  const timepoints = input.distinctTimepoints ?? (days > 0 ? 2 : 1);
  const renderMeta = String(input.metadata?.render_as ?? '');

  if (input.arcType === 'occasion') {
    reasons.push('occasion_is_day_cluster');
    return {
      eligible: false,
      durationDays: days,
      renderAs: renderMeta === 'session' ? 'session' : 'event',
      reasons,
    };
  }

  if (days < 2) {
    reasons.push('zero_or_one_day');
    return {
      eligible: false,
      durationDays: days,
      renderAs: 'event',
      reasons,
    };
  }

  if (eventCount > 0 && eventCount < 2 && timepoints < 2) {
    reasons.push('insufficient_linked_events');
    return {
      eligible: false,
      durationDays: days,
      renderAs: 'event',
      reasons,
    };
  }

  reasons.push('multi_day_arc');
  return {
    eligible: true,
    durationDays: days,
    renderAs: 'arc',
    reasons,
  };
}

/** Swimlanes should draw bars only for eligible non-occasion arcs. */
export function shouldDrawAsSwimlaneBar(input: ArcEligibilityInput): boolean {
  const gate = evaluateArcEligibility(input);
  return gate.eligible && gate.renderAs === 'arc';
}
