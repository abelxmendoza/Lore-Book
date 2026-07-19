/**
 * Narrative Thread Engine — what is unfolding, not what happened.
 *
 * A chapter is history; a thread is still happening. This engine derives the
 * user's Active Narrative Threads by joining durable storylines (life_arcs)
 * with recent lived evidence (moments/scenes), producing living state:
 *
 *   status        active | cooling | dormant   (from real activity recency)
 *   lastActivity  when the story last moved
 *   priority      recency × frequency × significance
 *   conflict      a dormant thread can still carry a live conflict
 *
 * Knowledge answers "what is true?"; threads answer "what is unfolding?".
 * Pure functions — no DB. narrativeThreadService loads inputs and persists
 * nothing: thread state is always derived, never stored stale.
 */

export type ThreadStatus = 'active' | 'cooling' | 'dormant';

export type ThreadArcInput = {
  id: string;
  title: string;
  /** life_arcs.track, e.g. career / romance / relationships / creative. */
  category: string | null;
  tags: string[];
  summary: string | null;
  updatedAt: string | null;
  isActive: boolean;
};

export type ThreadActivityItem = {
  text: string;
  participants: string[];
  at: string | null;
  significance?: number;
};

export type NarrativeThread = {
  id: string;
  title: string;
  category: string | null;
  status: ThreadStatus;
  lastActivityAt: string | null;
  daysSinceActivity: number | null;
  activityCount30d: number;
  /** 0–100: how much this thread currently matters. */
  priority: number;
  /** 0–100: how certain we are this thread is real and correctly characterized. */
  confidence: number;
  people: string[];
  /** A thread can be dormant while its conflict is still live. */
  conflictActive: boolean;
  recentEvidence: string[];
};

/** Activity within this window keeps a thread ACTIVE. */
export const THREAD_ACTIVE_DAYS = 7;
/** Activity within this window keeps a thread COOLING; older is DORMANT. */
export const THREAD_COOLING_DAYS = 30;
/** Only activity in this window is considered at all. */
export const THREAD_ACTIVITY_WINDOW_DAYS = 60;

const CONFLICT_RE =
  /\b(?:conflict|accus|blocked|argument|argu|fight|fought|drama|tension|fell out|falling out|beef|grudge|kicked|removed|banned|betray)\b/i;

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const GENERIC_ARC_TERMS = new Set([
  'the', 'and', 'with', 'life', 'new', 'time', 'chapter', 'arc', 'story',
  'building', 'working', 'getting', 'into', 'from', 'back',
]);

/** Distinctive terms that identify an arc in free text. */
function arcTerms(arc: ThreadArcInput): Set<string> {
  const out = new Set<string>();
  for (const raw of [arc.title, ...arc.tags]) {
    for (const term of normalizeToken(raw ?? '').split(' ')) {
      if (term.length > 2 && !GENERIC_ARC_TERMS.has(term)) out.add(term);
    }
  }
  return out;
}

function itemMatchesArc(item: ThreadActivityItem, terms: Set<string>): boolean {
  if (terms.size === 0) return false;
  const text = normalizeToken(`${item.text} ${item.participants.join(' ')}`);
  const tokens = new Set(text.split(' '));
  for (const term of terms) {
    if (tokens.has(term)) return true;
  }
  return false;
}

function daysBetween(nowMs: number, iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

function statusFor(daysSince: number | null): ThreadStatus {
  if (daysSince == null) return 'dormant';
  if (daysSince <= THREAD_ACTIVE_DAYS) return 'active';
  if (daysSince <= THREAD_COOLING_DAYS) return 'cooling';
  return 'dormant';
}

function excerpt(text: string): string {
  const compacted = text.replace(/\s+/g, ' ').trim();
  return compacted.length > 110 ? `${compacted.slice(0, 107)}…` : compacted;
}

export function deriveNarrativeThreads(opts: {
  arcs: ThreadArcInput[];
  activity: ThreadActivityItem[];
  now?: Date;
}): NarrativeThread[] {
  const nowMs = (opts.now ?? new Date()).getTime();
  const windowStart = nowMs - THREAD_ACTIVITY_WINDOW_DAYS * DAY_MS;

  const recent = opts.activity.filter((item) => {
    const t = item.at ? Date.parse(item.at) : NaN;
    return Number.isFinite(t) && t >= windowStart && t <= nowMs + DAY_MS;
  });

  const threads: NarrativeThread[] = [];

  for (const arc of opts.arcs) {
    const terms = arcTerms(arc);
    const matched = recent
      .filter((item) => itemMatchesArc(item, terms))
      .sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''));

    const lastActivityAt = matched[0]?.at ?? null;
    const daysSince = daysBetween(nowMs, lastActivityAt);
    const count30d = matched.filter(
      (m) => (daysBetween(nowMs, m.at) ?? Infinity) <= THREAD_COOLING_DAYS,
    ).length;

    // A thread's conflict stays live even when the thread itself goes quiet.
    const conflictActive = matched
      .slice(0, 6)
      .some((m) => CONFLICT_RE.test(m.text));

    const people = [
      ...new Set(matched.flatMap((m) => m.participants.map(normalizeToken)).filter(Boolean)),
    ].slice(0, 4);

    const recencyScore =
      daysSince == null ? 0 : Math.max(0, 50 - Math.min(50, daysSince * (50 / THREAD_COOLING_DAYS)));
    const frequencyScore = Math.min(30, count30d * 6);
    const significanceScore = Math.min(
      20,
      Math.round(Math.max(0, ...matched.map((m) => m.significance ?? 0)) / 5),
    );
    const priority = Math.round(
      Math.min(100, recencyScore + frequencyScore + significanceScore + (conflictActive ? 10 : 0)),
    );

    // Confidence: an arc backed by repeated recent evidence is near-certain;
    // an arc with no matching activity is only as sure as its own existence.
    const confidence = Math.round(
      Math.min(99, 40 + Math.min(40, matched.length * 8) + (count30d >= 2 ? 10 : 0) + (people.length ? 5 : 0)),
    );

    threads.push({
      id: arc.id,
      title: arc.title,
      category: arc.category,
      status: statusFor(daysSince),
      lastActivityAt,
      daysSinceActivity: daysSince,
      activityCount30d: count30d,
      priority,
      confidence,
      people,
      conflictActive,
      recentEvidence: matched.slice(0, 3).map((m) => excerpt(m.text)),
    });
  }

  threads.sort((a, b) => b.priority - a.priority);
  return threads;
}

// ---------------------------------------------------------------------------
// Prompt block
// ---------------------------------------------------------------------------

function statusLabel(thread: NarrativeThread): string {
  const days =
    thread.daysSinceActivity == null
      ? 'no recent activity'
      : thread.daysSinceActivity === 0
        ? 'active today'
        : `last activity ${thread.daysSinceActivity}d ago`;
  const conflict = thread.conflictActive ? '; CONFLICT STILL LIVE' : '';
  return `${thread.status.toUpperCase()} — ${days}${conflict}`;
}

/**
 * Render the top threads for the system prompt. "What have I been focused on
 * lately?" should be answered by inspecting this list, not by searching.
 */
export function formatThreadsPromptBlock(threads: NarrativeThread[]): string | null {
  const shown = threads
    .filter((t) => t.status !== 'dormant' || t.conflictActive)
    .slice(0, 6);
  if (shown.length === 0) return null;

  const lines = shown.map((t) => {
    const people = t.people.length ? `; people: ${t.people.join(', ')}` : '';
    const category = t.category ? ` [${t.category}]` : '';
    return `- ${t.title}${category} — ${statusLabel(t)} (priority ${t.priority}, confidence ${t.confidence})${people}`;
  });

  return [
    'These are the storylines currently unfolding in the user\'s life, ranked by how alive they are right now.',
    'When asked what they have been focused on, what is going on lately, or where their energy is going — answer from these threads directly; do not re-derive from raw memories.',
    'A DORMANT thread with a live conflict is still emotionally present even without recent activity.',
    '',
    ...lines,
  ].join('\n');
}
