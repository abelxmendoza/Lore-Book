/**
 * Scene Assembler — group Moments into continuous experiences.
 *
 * Pure functions: no DB. Callers persist via narrativeSceneService.
 *
 * Merge when: temporal + spatial + participant + activity + causal continuity.
 * Split when: location/objective/participants jump, or major narrative break.
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';

/** Max gap between moments still considered one scene (6 hours). */
export const SCENE_MAX_GAP_MS = 6 * 60 * 60 * 1000;

export type SceneMomentInput = {
  id: string;
  summary: string;
  occurredAt: string | null;
  participants?: string[];
  location?: string | null;
  significanceScore?: number;
  emotions?: string[];
};

export type AssembledScene = {
  momentIds: string[];
  moments: SceneMomentInput[];
  title: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  participants: string[];
  primaryGoal: string | null;
  dominantEmotion: string | null;
  confidence: number;
};

function compact(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function extractLocationHint(text: string): string | null {
  const at = text.match(
    /\b(?:at|to|from)\s+(?:the\s+)?([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,4}|Costco|home|house|gym|work|office)\b/,
  );
  if (at?.[1]) return compact(at[1]);
  const possessive = text.match(
    /\b([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]*){0,2})'?s?\s+(?:house|home|place)\b/,
  );
  if (possessive?.[1]) return `${compact(possessive[1])}'s house`;
  if (/\b(?:home|came home|stayed home)\b/i.test(text)) return 'home';
  return null;
}

function extractParticipants(text: string, explicit: string[] = []): string[] {
  const found = new Set(explicit.map(normalizeToken).filter(Boolean));
  const withMatch = text.matchAll(
    /\b(?:with|and)\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]*){0,2}|Abuela|Abuelo|Mom|Dad|Grandmother|Grandfather)\b/g,
  );
  for (const m of withMatch) {
    if (m[1]) found.add(normalizeToken(m[1]));
  }
  return [...found];
}

function activityTokens(text: string): Set<string> {
  const t = text.toLowerCase();
  const tokens = new Set<string>();
  const verbs = [
    'drove',
    'bought',
    'spent',
    'hung',
    'came',
    'built',
    'worked',
    'coded',
    'met',
    'visited',
    'shopped',
    'interview',
    'onboard',
    'ran',
    'gym',
  ];
  for (const v of verbs) {
    if (t.includes(v)) tokens.add(v);
  }
  if (/\bcostco|grocer|shopping\b/.test(t)) tokens.add('shopping');
  if (/\blore\s*book|memovault|app|project\b/.test(t)) tokens.add('building');
  if (/\binterview|onboard|hired|job\b/.test(t)) tokens.add('career');
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.5;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // unknown time → allow merge within thread batch
  return a.slice(0, 10) === b.slice(0, 10);
}

function locationsCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Trip continuity: home ↔ store is OK within a day scene
  const homeish = (x: string) => /\bhome|house\b/.test(x);
  const errand = (x: string) => /\bcostco|store|depot|market|gym|work|office\b/.test(x);
  if ((homeish(na) && errand(nb)) || (homeish(nb) && errand(na))) return true;
  return false;
}

function participantsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const setA = new Set(a.map(normalizeToken));
  return b.some((p) => setA.has(normalizeToken(p)));
}

/**
 * Should moment B continue the scene that currently ends with moment A?
 */
export function shouldMergeMoments(prev: SceneMomentInput, next: SceneMomentInput): boolean {
  const tPrev = ms(prev.occurredAt);
  const tNext = ms(next.occurredAt);
  if (tPrev != null && tNext != null) {
    const gap = Math.abs(tNext - tPrev);
    if (gap > SCENE_MAX_GAP_MS && !sameDay(prev.occurredAt, next.occurredAt)) {
      return false;
    }
    // Same day but huge gap with no shared signal → split
    if (gap > SCENE_MAX_GAP_MS) {
      const locOk = locationsCompatible(
        prev.location ?? extractLocationHint(prev.summary),
        next.location ?? extractLocationHint(next.summary),
      );
      const partOk = participantsOverlap(
        prev.participants ?? extractParticipants(prev.summary),
        next.participants ?? extractParticipants(next.summary),
      );
      const act = jaccard(activityTokens(prev.summary), activityTokens(next.summary));
      if (!locOk && !partOk && act < 0.15) return false;
    }
  }

  const locA = prev.location ?? extractLocationHint(prev.summary);
  const locB = next.location ?? extractLocationHint(next.summary);
  if (!locationsCompatible(locA, locB)) {
    // Hard location jump without travel language → split
    if (!/\b(?:drove|went|came|returned|left for|headed)\b/i.test(next.summary)) {
      return false;
    }
  }

  const partsA = prev.participants ?? extractParticipants(prev.summary);
  const partsB = next.participants ?? extractParticipants(next.summary);
  if (!participantsOverlap(partsA, partsB) && partsA.length > 0 && partsB.length > 0) {
    // Different exclusive casts → split unless activity strongly shared
    if (jaccard(activityTokens(prev.summary), activityTokens(next.summary)) < 0.25) {
      return false;
    }
  }

  // Major narrative break language
  if (/\b(?:years later|the next month|weeks later|meanwhile)\b/i.test(next.summary)) {
    return false;
  }

  return true;
}

/**
 * Cluster ordered moments into scenes.
 */
export function assembleScenesFromMoments(moments: SceneMomentInput[]): AssembledScene[] {
  if (moments.length === 0) return [];

  const ordered = [...moments].sort((a, b) => {
    const ta = ms(a.occurredAt) ?? 0;
    const tb = ms(b.occurredAt) ?? 0;
    return ta - tb;
  });

  const clusters: SceneMomentInput[][] = [];
  let current: SceneMomentInput[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const prev = current[current.length - 1];
    const next = ordered[i];
    if (shouldMergeMoments(prev, next)) {
      current.push(next);
    } else {
      clusters.push(current);
      current = [next];
    }
  }
  clusters.push(current);

  return clusters.map(buildScene);
}

function buildScene(moments: SceneMomentInput[]): AssembledScene {
  const summaries = moments.map((m) => compact(m.summary)).filter(Boolean);
  const locations = moments
    .map((m) => m.location ?? extractLocationHint(m.summary))
    .filter((x): x is string => Boolean(x));
  const location = pickDominant(locations);

  const participants = Array.from(
    new Set(moments.flatMap((m) => m.participants ?? extractParticipants(m.summary))),
  );

  const times = moments.map((m) => m.occurredAt).filter((x): x is string => Boolean(x));
  const timeStart = times.length ? times.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;

  const emotions = moments.flatMap((m) => m.emotions ?? []);
  const dominantEmotion = pickDominant(emotions.map(normalizeToken)) || null;

  const title = deriveSceneTitle({ summaries, location, participants });
  const summary = summaries.join(' ').slice(0, 500);
  const primaryGoal = inferPrimaryGoal(summaries);

  const confidence = Math.min(
    0.95,
    0.45 + moments.length * 0.08 + (location ? 0.1 : 0) + (participants.length ? 0.08 : 0),
  );

  return {
    momentIds: moments.map((m) => m.id),
    moments,
    title,
    summary,
    timeStart,
    timeEnd,
    location,
    participants,
    primaryGoal,
    dominantEmotion,
    confidence,
  };
}

function pickDominant(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, { raw: string; n: number }>();
  for (const v of values) {
    const key = normalizeToken(v);
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { raw: v, n: 1 });
  }
  let best: { raw: string; n: number } | null = null;
  for (const row of counts.values()) {
    if (!best || row.n > best.n) best = row;
  }
  return best?.raw ?? null;
}

function inferPrimaryGoal(summaries: string[]): string | null {
  const blob = summaries.join(' ').toLowerCase();
  if (/\bonboard|interview|hired|job\b/.test(blob)) return 'career_progress';
  if (/\bcostco|grocer|shopping|bought\b/.test(blob)) return 'errand_visit';
  if (/\bbuild|coded|worked on|lore\s*book|memovault\b/.test(blob)) return 'creative_work';
  if (/\bmet|hung out|visited|with\b/.test(blob)) return 'social_time';
  return null;
}

/**
 * Evidence-first scene title — never "Captured Conversation".
 */
export function deriveSceneTitle(input: {
  summaries: string[];
  location: string | null;
  participants: string[];
}): string {
  const blob = input.summaries.join(' ');
  const loc = input.location;
  const people = input.participants
    .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter(Boolean)
    .slice(0, 2);

  if (loc && /\bcostco\b/i.test(loc + blob) && people.length) {
    const title = `Costco trip with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (loc && /\b(?:house|home|place)\b/i.test(loc)) {
    const building = /\b(?:built|building|worked on|coded)\b/i.test(blob);
    if (building && /\blore\s*book\b/i.test(blob)) {
      const lb = `Building LoreBook at ${loc}`;
      if (isPublishableLifeLogTitle(lb)) return lb;
    }
    if (building && /\bmemovault\b/i.test(blob)) {
      const mv = `Building MemoVault at ${loc}`;
      if (isPublishableLifeLogTitle(mv)) return mv;
    }
    const social = people.length
      ? `Afternoon at ${loc} with ${people[0]}`
      : `Afternoon at ${loc}`;
    if (isPublishableLifeLogTitle(social)) return social;
  }
  if (/\bonboard/i.test(blob)) {
    const title = 'Onboarding day';
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (loc) {
    const title = people.length ? `Visit to ${loc} with ${people[0]}` : `Visit to ${loc}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (people.length && /\b(?:met|hung|visited)\b/i.test(blob)) {
    const title = `Time with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }

  // Structured fallback from first actionable phrase
  const first = input.summaries[0] ?? '';
  const started = first.match(/\b(?:I|We)\s+(?:drove to|went to|visited|met|worked on|built)\s+([^,.!?]{2,40})/i);
  if (started?.[1]) {
    const title = compact(started[0]).replace(/^(?:I|We)\s+/i, '');
    const labeled = title.charAt(0).toUpperCase() + title.slice(1);
    if (isPublishableLifeLogTitle(labeled)) return labeled;
  }

  return '';
}

/** Wire previous/next pointers for an ordered moment list (in-memory). */
export function linkMomentGraph(
  moments: SceneMomentInput[],
): Array<{ id: string; previousMomentId: string | null; nextMomentId: string | null }> {
  const ordered = [...moments].sort((a, b) => (ms(a.occurredAt) ?? 0) - (ms(b.occurredAt) ?? 0));
  return ordered.map((m, i) => ({
    id: m.id,
    previousMomentId: i > 0 ? ordered[i - 1].id : null,
    nextMomentId: i < ordered.length - 1 ? ordered[i + 1].id : null,
  }));
}
