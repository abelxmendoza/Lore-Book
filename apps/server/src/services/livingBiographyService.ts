/**
 * Living Biography Service — Sprint I
 *
 * Turns the Sprint F biography snapshot (a backend artifact in
 * narrative_accounts) into a product-facing identity surface.
 *
 * This is primarily a PROJECTION layer:
 *   - no new tables
 *   - card fields reshape the existing snapshot
 *   - current focus is overlaid from live structured sources (quests /
 *     future timeline events) so the home card stays current without
 *     waiting for a full biography regenerate
 *
 * It reads biographyFoundationService.getBiography() — facts, themes,
 * periods, relationships, key events — and reshapes them into:
 *   1. A "Living Biography Card" (who am I / what's happening / who matters / what I'm focused on)
 *   2. A readable, evidence-backed "current chapter" label
 *   3. A factual "what's changed in your biography" diff (no new storage — derived on read)
 *   4. A staleness check that decides when the existing snapshot should refresh
 *
 * Rules carried over from the foundation service:
 *   - Facts only. Every label traces to an existing theme, period, event, or relationship.
 *   - No interpretation, psychology, or invented chapter names.
 */

import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { stitchedTimelineService } from './chronologyV2/stitchedTimelineService';
import { stitchedIsFuture } from './chronologyV2/stitchedOccurrence';
import {
  biographyFoundationService,
  type BiographyOutput,
  type BiographyTheme,
  type LifePeriod,
} from './biographyFoundationService';
import { evaluateWrongDomain } from './characters/audit/wrongDomainCharacterGuard';
import { normalizeNameKey } from '../utils/nameNormalization';

// ── Card types ────────────────────────────────────────────────────────────────

export type CurrentChapter = {
  label: string;
  evidence: string[];
};

export type LivingBiographyPerson = {
  name: string;
  relationship: string;
  status: string;
};

export type LivingBiographyCard = {
  name: string | null;
  currentChapter: CurrentChapter | null;
  topThemes: string[];
  keyPeople: LivingBiographyPerson[];
  currentFocus: string[];
  recentDevelopments: string[];
  lastUpdated: string | null;
  hasEnoughData: boolean;
};

export type NarrativeIdentityRecall = {
  content: string;
  card: LivingBiographyCard;
  provenance: {
    sourceEntryCount: number;
    timelineEventCount: number;
    relationshipCount: number;
    generatedAt: string | null;
  };
};

export type BiographyChange = {
  kind: 'new_chapter' | 'new_person' | 'new_milestone' | 'emerging_theme';
  label: string;
};

const MAX_THEMES = 3;
const MAX_PEOPLE = 4;
const MAX_FOCUS = 4;
const MAX_DEVELOPMENTS = 3;

/** Legacy snapshot strings that should never surface as "current focus". */
const STALE_FOCUS_RE = /\bepirus\b/i;

// ── Card projection ───────────────────────────────────────────────────────────

/**
 * Build the user-facing Living Biography Card from the existing snapshot.
 * Returns `hasEnoughData: false` (with nulls) when there isn't yet enough
 * foundation data to show an identity surface — never fabricates one.
 */
export async function getLivingBiographyCard(userId: string): Promise<LivingBiographyCard> {
  const bio = await biographyFoundationService.getBiography(userId);

  return buildLivingBiographyCard(userId, bio);
}

async function buildLivingBiographyCard(
  userId: string,
  bio: BiographyOutput | null,
): Promise<LivingBiographyCard> {

  if (!bio) {
    return {
      name: null,
      currentChapter: null,
      topThemes: [],
      keyPeople: [],
      currentFocus: [],
      recentDevelopments: [],
      lastUpdated: null,
      hasEnoughData: false,
    };
  }

  const [currentFocus, recentDevelopments] = await Promise.all([
    deriveCurrentFocus(userId, bio),
    Promise.resolve(deriveRecentDevelopments(bio)),
  ]);

  // Background refresh — never blocks the response. Serves the current
  // snapshot immediately; regenerates quietly if enough new evidence exists
  // or the stored snapshot still carries known-stale focus copy.
  maybeRefreshInBackground(userId, bio);

  return {
    name: bio.facts.identity.name,
    currentChapter: deriveCurrentChapter(bio, currentFocus),
    topThemes: bio.themes.slice(0, MAX_THEMES).map(t => t.theme),
    keyPeople: deriveKeyPeople(bio),
    currentFocus,
    recentDevelopments,
    lastUpdated: bio.generatedAt,
    hasEnoughData: true,
  };
}

/**
 * Authoritative identity-recall projection shared by chat and the About Me UI.
 * It deliberately summarizes the Living Biography card instead of exposing the
 * stored snapshot, full chapter archive, or persistence lifecycle metadata.
 */
export async function getNarrativeIdentityRecall(userId: string): Promise<NarrativeIdentityRecall> {
  const bio = await biographyFoundationService.getBiography(userId);
  const card = await buildLivingBiographyCard(userId, bio);

  if (!bio || !card.hasEnoughData) {
    return {
      content: 'I do not have enough grounded biography evidence to summarize you yet.',
      card,
      provenance: {
        sourceEntryCount: 0,
        timelineEventCount: 0,
        relationshipCount: 0,
        generatedAt: null,
      },
    };
  }

  return {
    content: formatNarrativeIdentityRecall(card, bio),
    card,
    provenance: {
      sourceEntryCount: bio.facts.sourceEntryCount,
      timelineEventCount: bio.facts.keyEvents.length,
      relationshipCount: bio.facts.relationships.length,
      generatedAt: bio.generatedAt,
    },
  };
}

export function formatNarrativeIdentityRecall(
  card: LivingBiographyCard,
  bio: BiographyOutput,
): string {
  const sections: string[] = [];
  const identity = bio.facts.identity;
  const identityDetails = [
    identity.education,
    identity.employment,
    identity.location ? `based in ${identity.location}` : null,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (card.name || identityDetails.length > 0) {
    const lead = card.name
      ? identityDetails.length > 0
        ? `${card.name} — ${joinNaturally(identityDetails)}.`
        : `${card.name}.`
      : `${joinNaturally(identityDetails)}.`;
    sections.push(`## Core identity\n${lead}`);
  }

  if (card.currentChapter) {
    const focusSentence = card.currentFocus.length > 0
      ? `Right now, your attention is on ${joinNaturally(card.currentFocus)}.`
      : '';
    sections.push(
      `## Current chapter\n${card.currentChapter.label}.${focusSentence ? ` ${focusSentence}` : ''}`,
    );
  }

  const peopleByCategory = groupPeopleForRecall(card.keyPeople);
  if (peopleByCategory.length > 0) {
    sections.push(
      `## Important relationships\n${peopleByCategory
        .map(([category, names]) => `${category}: ${joinNaturally(names)}.`)
        .join(' ')}`,
    );
  }

  if (card.recentDevelopments.length > 0) {
    sections.push(`## Recent changes\n${card.recentDevelopments.slice(0, 3).map(item => `- ${item}`).join('\n')}`);
  }

  if (card.topThemes.length > 0) {
    sections.push(`## Long-term themes\n${joinNaturally(card.topThemes)}.`);
  }

  return sections.join('\n\n');
}

function joinNaturally(values: string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function relationshipCategory(type: string): string {
  const normalized = type.toLowerCase();
  if (/family|parent|sibling|cousin|aunt|uncle|grand/.test(normalized)) return 'Family';
  if (/partner|romantic|dating|spouse|crush|love/.test(normalized)) return 'Romantic';
  if (/friend|close|confidant/.test(normalized)) return 'Friends';
  if (/coworker|colleague|manager|mentor|professional|work/.test(normalized)) return 'Professional';
  if (/community|group|organization|member/.test(normalized)) return 'Community';
  if (/creator|public|inspiration|influencer/.test(normalized)) return 'Public figures';
  return 'Other people';
}

function groupPeopleForRecall(people: LivingBiographyPerson[]): Array<[string, string[]]> {
  const grouped = new Map<string, string[]>();
  for (const person of people) {
    const category = relationshipCategory(person.relationship);
    const names = grouped.get(category) ?? [];
    if (!names.includes(person.name)) names.push(person.name);
    grouped.set(category, names);
  }
  return [...grouped.entries()];
}

/**
 * Key people = relationships that are still active or close, ranked by how
 * much evidence backs them (source memory count). Ended relationships are
 * excluded — "who matters most" should reflect the present, not the archive.
 */
function deriveKeyPeople(bio: BiographyOutput): LivingBiographyPerson[] {
  const byName = new Map<string, LivingBiographyPerson & { evidenceCount: number }>();

  for (const relationship of bio.facts.relationships
    .filter(r => r.status !== 'ended')
    .filter(r => !evaluateWrongDomain(r.name).wrongDomain)) {
    const key = normalizeNameKey(relationship.name);
    if (!key) continue;
    const next = {
      name: relationship.name,
      relationship: relationship.type,
      status: relationship.status,
      evidenceCount: relationship.sourceMemoryIds.length,
    };
    const existing = byName.get(key);
    if (!existing || next.evidenceCount > existing.evidenceCount) {
      byName.set(key, next);
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .slice(0, MAX_PEOPLE)
    .map(({ evidenceCount: _evidenceCount, ...person }) => person);
}

/**
 * Current focus prefers live structured sources so the home card updates as
 * soon as quests / future timeline events change — without waiting for a
 * biography snapshot regenerate.
 */
export async function deriveCurrentFocus(userId: string, bio: BiographyOutput): Promise<string[]> {
  const focus: string[] = [];
  const seen = new Set<string>();

  const push = (label: string | null | undefined) => {
    const trimmed = label?.trim();
    if (!trimmed || STALE_FOCUS_RE.test(trimmed)) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    focus.push(trimmed);
  };

  const [{ data: focusedProjects }, { data: quests }, stitched] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('name, status, metadata')
      .eq('user_id', userId)
      .contains('metadata', { current_focus: true })
      .order('importance_score', { ascending: false })
      .limit(MAX_FOCUS),
    supabaseAdmin
      .from('quests')
      .select('title')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(MAX_FOCUS),
    stitchedTimelineService.getStitchedTimeline(userId, { limit: 40 }),
  ]);

  for (const project of focusedProjects ?? []) {
    if (!['dormant', 'paused', 'completed', 'abandoned'].includes(String(project.status ?? '').toLowerCase())) {
      push(project.name);
    }
  }
  for (const quest of quests ?? []) push(quest.title);
  for (const item of stitched.items ?? []) {
    if (!stitchedIsFuture(item)) continue;
    push(item.title);
  }

  // Snapshot upcoming events only when live sources produced nothing —
  // never pad live focus with potentially stale snapshot strings.
  if (focus.length === 0) {
    for (const event of bio.facts.upcomingEvents) {
      push(event);
      if (focus.length >= MAX_FOCUS) break;
    }
  }

  return focus.slice(0, MAX_FOCUS);
}

/**
 * Recent developments = the most recent timeline-derived key events,
 * newest first. These are things that already happened — distinct from
 * "current focus" (forward-looking, from live quests / upcoming events).
 */
function deriveRecentDevelopments(bio: BiographyOutput): string[] {
  return [...bio.facts.keyEvents]
    .filter((e) => Boolean(e.date) && e.unresolved !== true)
    .sort((a, b) => Date.parse(b.date as string) - Date.parse(a.date as string))
    .slice(0, MAX_DEVELOPMENTS)
    .map(e => e.connection ? `${e.title} (with ${e.connection})` : e.title);
}

// ── Life chapter detection ────────────────────────────────────────────────────

/**
 * Derive a readable "current chapter" label — evidence-backed, never invented.
 * Built strictly from data the foundation pipeline already produced:
 *   1. The most recent life period's dominant theme (date-anchored, strongest signal)
 *   2. Falls back to the strongest recurring theme across the whole record
 * Every label is a direct transformation of an existing string; nothing is composed
 * from guesses about the user's life.
 */
export function deriveCurrentChapter(
  bio: BiographyOutput,
  currentFocus: string[] = [],
): CurrentChapter | null {
  const focusChapter = deriveChapterFromCurrentFocus(currentFocus);
  if (focusChapter) return focusChapter;

  const latestPeriod = mostRecentPeriod(bio.periods);
  if (latestPeriod?.dominantTheme) {
    return {
      label: toChapterLabel(latestPeriod.dominantTheme),
      evidence: [`${latestPeriod.eventCount} timeline event${latestPeriod.eventCount === 1 ? '' : 's'} in ${latestPeriod.label}`],
    };
  }

  const topTheme = bio.themes[0];
  if (topTheme) {
    return {
      label: toChapterLabel(topTheme.theme),
      evidence: topTheme.evidence.slice(0, 2),
    };
  }

  return null;
}

const FOCUS_CHAPTER_SIGNALS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Career Rebuilding', pattern: /\b(job|career|interview|employment|resume|robotic|engineering|technical prep)\b/i },
  { label: 'Building', pattern: /\b(build|building|ship|develop|coding|code|app|product|project|software|launch|beta)\b/i },
  { label: 'Creative Work', pattern: /\b(music|song|album|record|recording|art|creative|writing|release)\b/i },
  { label: 'Health', pattern: /\b(health|fitness|therapy|recovery|training|sleep|wellness)\b/i },
  { label: 'Relationships', pattern: /\b(relationship|dating|romance|partner|friendship|reconnect)\b/i },
  { label: 'Family', pattern: /\b(family|parent|sibling|grandparent|cousin|home)\b/i },
  { label: 'Learning', pattern: /\b(school|class|course|degree|study|learning|certification)\b/i },
];

function deriveChapterFromCurrentFocus(currentFocus: string[]): CurrentChapter | null {
  // One task is too weak to redefine a life chapter. Two or more live focus
  // signals can safely outrank a stale historical period.
  if (currentFocus.length < 2) return null;

  const labels: string[] = [];
  for (const signal of FOCUS_CHAPTER_SIGNALS) {
    if (currentFocus.some(item => signal.pattern.test(item))) labels.push(signal.label);
    if (labels.length >= 3) break;
  }
  if (labels.length === 0) return null;

  return {
    label: `${joinNaturally(labels)} Chapter`,
    evidence: currentFocus.slice(0, 3),
  };
}

function mostRecentPeriod(periods: LifePeriod[]): LifePeriod | null {
  if (!periods.length) return null;
  return [...periods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
}

const CHAPTER_SUFFIX_RE = /\b(era|period|chapter|phase)\b/i;

/** "career rebuilding" → "Career Rebuilding Era"; "Active family period" → "Active Family Period" (no double suffix). */
function toChapterLabel(base: string): string {
  const trimmed = base.trim();
  const titled = trimmed
    .split(/\s+/)
    .map(w => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return CHAPTER_SUFFIX_RE.test(trimmed) ? titled : `${titled} Era`;
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
//
// Recommended approach (see Sprint I audit): threshold-triggered, lazy refresh
// on read — not a scheduled cron. Biography should update when there's enough
// new evidence to justify it, not on a clock that burns LLM calls on inactive
// users. A minimum cooldown prevents thrashing on bursty days.

const REFRESH_MIN_HOURS_BETWEEN = 6;
const REFRESH_MIN_NEW_ENTRIES   = 2;
const REFRESH_MIN_NEW_EVENTS    = 1;

const refreshInFlight = new Set<string>();

/**
 * Fire-and-forget: regenerate the snapshot in the background if enough new
 * evidence has accumulated since it was last generated, or if the stored
 * snapshot still contains known-stale focus copy. Never blocks the card
 * response — the user always sees the current projection immediately.
 */
function maybeRefreshInBackground(userId: string, bio: BiographyOutput): void {
  if (refreshInFlight.has(userId)) return;

  const hasStaleFocus = bio.facts.upcomingEvents.some(e => STALE_FOCUS_RE.test(e));

  const decide = hasStaleFocus
    ? Promise.resolve(true)
    : shouldRefreshBiography(userId, bio.generatedAt);

  decide
    .then(should => {
      if (!should) return;
      refreshInFlight.add(userId);
      return biographyFoundationService.generateBiography(userId)
        .then(() => logger.info({ userId, hasStaleFocus }, 'LivingBiography: background refresh complete'))
        .catch(err => logger.error({ err, userId }, 'LivingBiography: background refresh failed'))
        .finally(() => refreshInFlight.delete(userId));
    })
    .catch(() => {});
}

/**
 * Threshold check: enough newly *recorded* journal rows OR new resolved events
 * since the snapshot was generated. Uses created_at (recording), never journal
 * date (occurrence) — an imported 2018 memory recorded today should refresh.
 */
export async function shouldRefreshBiography(userId: string, generatedAtIso: string): Promise<boolean> {
  const hoursSince = (Date.now() - new Date(generatedAtIso).getTime()) / 3_600_000;
  if (hoursSince < REFRESH_MIN_HOURS_BETWEEN) return false;

  const [entriesRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', generatedAtIso),
    supabaseAdmin
      .from('resolved_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', generatedAtIso),
  ]);

  return (entriesRes.count ?? 0) >= REFRESH_MIN_NEW_ENTRIES
      || (eventsRes.count ?? 0) >= REFRESH_MIN_NEW_EVENTS;
}

// ── Biography change tracking ─────────────────────────────────────────────────
//
// "What's changed in your biography recently?" — derived entirely from
// existing rows' timestamps. No new storage: a person/period/event is "new"
// if it was created/dated after `sinceIso`; a theme is "emerging" if every
// piece of its evidence is newer than `sinceIso`.

const MAX_CHANGES = 6;

export async function getBiographyChanges(userId: string, sinceIso: string): Promise<BiographyChange[]> {
  const bio = await biographyFoundationService.getBiography(userId);
  if (!bio) return [];

  const since = new Date(sinceIso);
  const changes: BiographyChange[] = [];

  // New life chapter — most recent period started after `since`
  const latestPeriod = mostRecentPeriod(bio.periods);
  if (latestPeriod && new Date(latestPeriod.startDate) > since) {
    changes.push({ kind: 'new_chapter', label: `New life chapter: ${toChapterLabel(latestPeriod.dominantTheme ?? latestPeriod.label)}` });
  }

  // New milestones — key events dated after `since`
  for (const event of bio.facts.keyEvents) {
    if (!event.date || event.unresolved) continue;
    if (new Date(event.date) > since) {
      changes.push({ kind: 'new_milestone', label: `New milestone: ${event.title}` });
    }
  }

  // New important people — characters that entered the story after `since`
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('name, created_at')
    .eq('user_id', userId)
    .gt('created_at', sinceIso);

  for (const char of chars ?? []) {
    changes.push({ kind: 'new_person', label: `New important person: ${char.name}` });
  }

  // Emerging themes — every piece of evidence for the theme postdates `since`
  for (const theme of bio.themes) {
    if (theme.evidence.length > 0 && (await isThemeEmerging(theme, sinceIso))) {
      changes.push({ kind: 'emerging_theme', label: `New theme detected: ${theme.theme}` });
    }
  }

  return changes.slice(0, MAX_CHANGES);
}

/**
 * A theme is "emerging" if all of its evidencing journal entries were
 * recorded after `sinceIso` — i.e. it has no history before the cutoff.
 */
async function isThemeEmerging(theme: BiographyTheme, sinceIso: string): Promise<boolean> {
  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date')
    .in('id', theme.evidence.slice(0, 20));

  if (!entries?.length) return false;
  const since = new Date(sinceIso);
  return entries.every(e => e.date && new Date(e.date) > since);
}
