/**
 * Hard domain-routing guards for life-arc tracks.
 * Consumes text + optional entity hints (band vs person).
 */

export type ArcTrack =
  | 'career'
  | 'romance'
  | 'relationships'
  | 'creative'
  | 'health'
  | 'inner'
  | 'mixed'
  | 'custom';

export type DomainGuardResult = {
  track: ArcTrack;
  confidence: number;
  reasons: string[];
  overruled: boolean;
};

const NIGHTLIFE =
  /\b(?:club|nightlife|rave|afters?|dj|dance\s*floor|goth\s*(?:club|night)|pool\s*and\s*billiards|concert|show|gig|festival|venue)\b/i;
const BAND_PERF =
  /\b(?:band|perform(?:ed|ing|ance)?|saw\s+\w+\s+play|went\s+to\s+see|line[- ]?up|opening\s+act)\b/i;
const EX_LOVER_BAND = /\bex\s*lover\b/i;
const CAREER =
  /\b(?:interview|onboarding|background[- ]?check|identity[- ]?verif|hired|job|shift|lab\s+work|coworker|manager|employer|workplace)\b/i;
const PROJECT =
  /\b(?:lore\s*book|coding|code(?:d|ing)?|cursor|codex|claude\s*code|distrokid|feature|pull\s*request|deploy|ui\s+test)\b/i;
const FAMILY =
  /\b(?:abuela|abuelo|t[ií]o|t[ií]a|cousin|mom|dad|grandma|grandpa|family|graduation\s+party)\b/i;
const ROMANCE_STRONG =
  /\b(?:date\s+night|boyfriend|girlfriend|romantic|breakup|broke\s+up|kissed|hooked\s+up|engagement|honeymoon)\b/i;
const HEALTH = /\b(?:gym|run|mile|workout|doctor|therapy|hospital)\b/i;
const ATTRACTIVE_ONLY = /\b(?:attractive|cute|hot|crush)\b/i;

export type EntityHint = {
  name: string;
  kind?: 'person' | 'band' | 'place' | 'org' | 'unknown';
  relationship?: string | null;
};

export function applyDomainRoutingGuards(input: {
  title?: string | null;
  summary?: string | null;
  proposedTrack?: ArcTrack | null;
  entities?: EntityHint[];
}): DomainGuardResult {
  const text = `${input.title ?? ''} ${input.summary ?? ''}`.trim();
  const reasons: string[] = [];
  let track: ArcTrack = input.proposedTrack ?? 'inner';
  let overruled = false;

  const entityIsBand = (input.entities ?? []).some(
    (e) => e.kind === 'band' || (/ex\s*lover/i.test(e.name) && e.kind !== 'person'),
  );
  const gothTioAcquaintance = (input.entities ?? []).some(
    (e) => /goth\s*tio/i.test(e.name) && !/family|uncle/i.test(e.relationship ?? ''),
  );

  if (EX_LOVER_BAND.test(text) || entityIsBand) {
    if (track === 'romance') {
      track = BAND_PERF.test(text) || NIGHTLIFE.test(text) ? 'creative' : 'relationships';
      overruled = true;
      reasons.push('band_not_romance');
    }
  }

  if (gothTioAcquaintance && (track === 'romance' || track === 'relationships')) {
    // acquaintance at club → nightlife/creative, not family/romance
    if (NIGHTLIFE.test(text)) {
      track = 'creative';
      overruled = true;
      reasons.push('acquaintance_nightlife');
    }
  }

  if (NIGHTLIFE.test(text) && track === 'career' && !CAREER.test(text)) {
    track = 'creative';
    overruled = true;
    reasons.push('nightlife_not_career');
  }

  if (BAND_PERF.test(text) && track === 'romance' && !ROMANCE_STRONG.test(text)) {
    track = 'creative';
    overruled = true;
    reasons.push('performance_not_romance');
  }

  if (ATTRACTIVE_ONLY.test(text) && track === 'romance' && !ROMANCE_STRONG.test(text) && NIGHTLIFE.test(text)) {
    track = 'creative';
    overruled = true;
    reasons.push('attraction_overlay_not_primary');
  }

  if (PROJECT.test(text) && (track === 'inner' || track === 'romance')) {
    track = 'creative';
    overruled = true;
    reasons.push('project_work_not_inner_or_romance');
  }

  if (FAMILY.test(text) && track === 'romance' && !ROMANCE_STRONG.test(text)) {
    track = 'relationships';
    overruled = true;
    reasons.push('family_event');
  }

  if (CAREER.test(text) && track === 'inner') {
    track = 'career';
    overruled = true;
    reasons.push('career_signals');
  }

  if (HEALTH.test(text) && track === 'inner' && !PROJECT.test(text)) {
    track = 'health';
    overruled = true;
    reasons.push('health_activity');
  }

  if (!overruled && track === 'inner' && NIGHTLIFE.test(text)) {
    track = 'creative';
    overruled = true;
    reasons.push('nightlife_from_inner_fallback');
  }

  return {
    track,
    confidence: overruled ? 0.85 : 0.55,
    reasons: reasons.length ? reasons : ['unchanged'],
    overruled,
  };
}

/** Convenience for occasion/pattern services that only have text. */
export function guardTrackFromText(
  proposed: ArcTrack,
  title: string,
  summary?: string | null,
): ArcTrack {
  return applyDomainRoutingGuards({
    title,
    summary,
    proposedTrack: proposed,
  }).track;
}
