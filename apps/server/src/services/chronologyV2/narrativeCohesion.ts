/**
 * Narrative cohesion scoring for stitched timelines.
 *
 * Problem: the arc-scoped stitcher used to include every moment/event inside
 * the arc's date window, so unrelated threads ("ex blocked me", "unemployed")
 * leaked into tight scenes ("building the app at grandma's house") just
 * because they happened the same week.
 *
 * Model: an arc defines a Narrative Anchor — the scene's terms, participants,
 * locations, and the times of its member events. Every candidate is scored
 * against the anchor on independent features (participants, location,
 * activity, seed terms, temporal continuity), then classified:
 *
 *   scene      — cohesive with the anchor → belongs in the stitched timeline
 *   background — persistent-state fact (graduated, unemployed, living with
 *                family, heartbreak…) → shown separately as period context
 *   excluded   — same week, different story → dropped from this scene
 *
 * Design rules (from the over-stitching postmortem):
 *   - Same week / same conversation / named-entity mention alone never merge.
 *   - Optimize narrative coherence over recall: fewer, tighter items win.
 *   - No embeddings — features are structured IDs + lexical terms only.
 */

export type CohesionClass = 'scene' | 'background' | 'excluded';

export interface AnchorSeed {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  /** ISO date/datetime bounds of the arc window, when known. */
  startTime?: string;
  endTime?: string;
}

export interface CohesionCandidate {
  key: string;
  kind: 'moment' | 'event';
  /** Title + body/summary, concatenated. */
  text: string;
  /** ISO timestamp. */
  time: string;
  peopleIds?: string[];
  locationIds?: string[];
  activityIds?: string[];
  tags?: string[];
}

export interface NarrativeAnchor {
  /** Terms from the arc title/summary/tags — the scene's identity. */
  seedTerms: Set<string>;
  /** Seed terms ∪ member-event terms — the scene's working vocabulary. */
  terms: Set<string>;
  peopleIds: Set<string>;
  locationIds: Set<string>;
  activityIds: Set<string>;
  /** Lowercase display names for anchor people/locations, for matching
   *  text-only moments that mention them by name. */
  personNames: string[];
  locationNames: string[];
  /** Epoch ms of member events — temporal continuity is measured against
   *  these, not against the whole window. */
  memberTimes: number[];
  /** Candidate keys that seeded the anchor (always scene). */
  memberKeys: Set<string>;
}

export interface CohesionBreakdown {
  participants: number;
  location: number;
  activity: number;
  seed: number;
  temporal: number;
  total: number;
}

export interface CohesionVerdict {
  cls: CohesionClass;
  score: number;
  breakdown: CohesionBreakdown;
}

// Feature weights (max contribution of each). Total possible = 100.
const W_PARTICIPANTS = 25;
const W_LOCATION = 20;
const W_ACTIVITY = 20;
const W_SEED = 15;
const W_TEMPORAL = 20;

/** Minimum total to join the scene. */
export const SCENE_THRESHOLD = 40;

/** Minimum seed-term hits for an event to become an anchor member. */
const MEMBER_MIN_SEED_HITS = 2;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'was', 'were', 'are', 'have', 'has', 'had',
  'this', 'that', 'these', 'those', 'from', 'into', 'about', 'over', 'after',
  'before', 'during', 'while', 'when', 'then', 'than', 'them', 'they', 'their',
  'she', 'her', 'him', 'his', 'you', 'your', 'our', 'out', 'not', 'but', 'all',
  'got', 'get', 'went', 'going', 'just', 'really', 'very', 'some', 'more',
  'today', 'yesterday', 'tomorrow', 'still', 'been', 'being', 'because', 'off',
  'day', 'week', 'month', 'year', 'time', 'thing', 'things', 'lot', 'bit',
  'house', 'home', 'place', 'new', 'first', 'last', 'one', 'two',
]);

/** Persistent-state / exposition patterns — background context, not scene events. */
const BACKGROUND_PATTERNS: RegExp[] = [
  /\bunemploy(ed|ment)\b/i,
  /\bjobless\b/i,
  /\blooking for (a )?(job|work)\b/i,
  /\bjob (hunt|search)(ing)?\b/i,
  /\b(recently |just )?graduat(ed|ing|ion)\b/i,
  /\bliv(e|es|ing) (with|at|in)\b/i,
  /\bheartbr(eak|oken)\b/i,
  /\b(broke|breaking|broken) up\b/i,
  /\bbreakup\b/i,
  /\brecovering from\b/i,
  /\bsingle (again|now)\b/i,
  /\breflect(ion|ions|ing)\b/i,
  /\blooking back\b/i,
  /\bno contact\b/i,
];

export function tokenizeTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const t = raw.replace(/'/g, '');
    if (t.length > 2 && !STOPWORDS.has(t)) terms.add(t);
  }
  return terms;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function idOverlap(candidate: string[] | undefined, anchor: Set<string>): number {
  if (!candidate?.length || anchor.size === 0) return 0;
  return candidate.filter((id) => anchor.has(id)).length;
}

function textMentionsAny(text: string, names: string[]): boolean {
  if (names.length === 0) return false;
  const lower = text.toLowerCase();
  return names.some((n) => n.length > 2 && lower.includes(n));
}

export function isBackgroundStatement(text: string): boolean {
  return BACKGROUND_PATTERNS.some((re) => re.test(text));
}

/**
 * Build the scene anchor: seed terms from the arc itself, then absorb the
 * events whose own text clearly matches the seed (≥ MEMBER_MIN_SEED_HITS
 * distinct seed terms). Members donate their participants, locations,
 * activities, vocabulary, and times to the anchor.
 *
 * Returns null when no candidate event matches the seed — an anchor with no
 * members can't distinguish scene from noise, and callers should fall back
 * to unfiltered behavior rather than guess.
 */
export function buildNarrativeAnchor(
  seed: AnchorSeed,
  candidates: CohesionCandidate[],
): NarrativeAnchor | null {
  const seedTerms = tokenizeTerms(
    [seed.title, seed.summary ?? '', ...(seed.tags ?? [])].join(' '),
  );
  if (seedTerms.size === 0) return null;

  const anchor: NarrativeAnchor = {
    seedTerms,
    terms: new Set(seedTerms),
    peopleIds: new Set(),
    locationIds: new Set(),
    activityIds: new Set(),
    personNames: [],
    locationNames: [],
    memberTimes: [],
    memberKeys: new Set(),
  };

  for (const c of candidates) {
    if (c.kind !== 'event') continue;
    const hits = overlapCount(tokenizeTerms(c.text), seedTerms);
    if (hits < MEMBER_MIN_SEED_HITS) continue;

    anchor.memberKeys.add(c.key);
    const t = new Date(c.time).getTime();
    if (Number.isFinite(t)) anchor.memberTimes.push(t);
    for (const id of c.peopleIds ?? []) anchor.peopleIds.add(id);
    for (const id of c.locationIds ?? []) anchor.locationIds.add(id);
    for (const id of c.activityIds ?? []) anchor.activityIds.add(id);
    for (const term of tokenizeTerms(c.text)) anchor.terms.add(term);
  }

  return anchor.memberKeys.size > 0 ? anchor : null;
}

/** Attach display names (for matching text-only moments) after ID lookups. */
export function attachAnchorEntityNames(
  anchor: NarrativeAnchor,
  personNames: string[],
  locationNames: string[],
): void {
  anchor.personNames = personNames.map((n) => n.toLowerCase()).filter((n) => n.length > 2);
  anchor.locationNames = locationNames.map((n) => n.toLowerCase()).filter((n) => n.length > 2);
}

export function scoreCohesion(
  anchor: NarrativeAnchor,
  candidate: CohesionCandidate,
): CohesionBreakdown {
  const terms = tokenizeTerms(candidate.text);

  // Every feature is graded, never a flat cap — a uniform score distribution
  // means the score has stopped discriminating (the "everything is 55" bug:
  // with empty entity arrays, the three text/time features all saturated at
  // their maxima for any related item).

  // Participants: structured ID overlap (graded by count), or a weaker
  // text mention of an anchor person.
  const peopleHits = idOverlap(candidate.peopleIds, anchor.peopleIds);
  const participants =
    peopleHits >= 2
      ? W_PARTICIPANTS
      : peopleHits === 1
        ? W_PARTICIPANTS * 0.72
        : textMentionsAny(candidate.text, anchor.personNames)
          ? W_PARTICIPANTS * 0.6
          : 0;

  // Location: same shape.
  const locationHits = idOverlap(candidate.locationIds, anchor.locationIds);
  const location =
    locationHits > 0
      ? W_LOCATION
      : textMentionsAny(candidate.text, anchor.locationNames)
        ? W_LOCATION * 0.7
        : 0;

  // Activity: share of the candidate's vocabulary that lives in the scene's.
  // Denominator floor of 8 stops short texts from trivially saturating.
  const activityIdHits = idOverlap(candidate.activityIds, anchor.activityIds);
  const termHits = overlapCount(terms, anchor.terms);
  const termRatio = terms.size > 0 ? termHits / Math.max(Math.min(terms.size, 12), 8) : 0;
  const activity = activityIdHits > 0 ? W_ACTIVITY : Math.min(W_ACTIVITY, termRatio * W_ACTIVITY);

  // Seed: hits on the arc's own identity terms, graded up to 3.
  const seedHits = overlapCount(terms, anchor.seedTerms);
  const seed = Math.min(1, seedHits / 3) * W_SEED;

  // Temporal continuity: distance to the nearest anchor member, not the window.
  const t = new Date(candidate.time).getTime();
  let temporal = 0;
  if (Number.isFinite(t) && anchor.memberTimes.length > 0) {
    const gap = Math.min(...anchor.memberTimes.map((m) => Math.abs(m - t)));
    if (gap <= HOUR_MS) temporal = W_TEMPORAL;
    else if (gap <= 6 * HOUR_MS) temporal = W_TEMPORAL * 0.85;
    else if (gap <= DAY_MS) temporal = W_TEMPORAL * 0.6;
    else if (gap <= 3 * DAY_MS) temporal = W_TEMPORAL * 0.25;
  }

  const total = Math.round(participants + location + activity + seed + temporal);
  return { participants, location, activity, seed, temporal, total };
}

/**
 * Classify a candidate against the anchor.
 *
 * Anchor members and user-pinned items are scene by definition. Otherwise
 * scene requires BOTH the threshold score and at least one non-temporal
 * signal — proximity alone ("same afternoon") never stitches.
 */
export function classifyCandidate(
  anchor: NarrativeAnchor,
  candidate: CohesionCandidate,
  opts: { userPinned?: boolean } = {},
): CohesionVerdict {
  const breakdown = scoreCohesion(anchor, candidate);

  if (opts.userPinned || anchor.memberKeys.has(candidate.key)) {
    return { cls: 'scene', score: Math.max(breakdown.total, SCENE_THRESHOLD), breakdown };
  }

  const narrativeSignal =
    breakdown.participants > 0 ||
    breakdown.location > 0 ||
    breakdown.seed > 0 ||
    breakdown.activity >= W_ACTIVITY * 0.5;

  if (breakdown.total >= SCENE_THRESHOLD && narrativeSignal) {
    return { cls: 'scene', score: breakdown.total, breakdown };
  }
  if (isBackgroundStatement(candidate.text)) {
    return { cls: 'background', score: breakdown.total, breakdown };
  }
  return { cls: 'excluded', score: breakdown.total, breakdown };
}
