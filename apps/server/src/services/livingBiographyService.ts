/**
 * Living Biography Service — Sprint I
 *
 * Turns the Sprint F biography snapshot (a backend artifact in
 * narrative_accounts) into a product-facing identity surface.
 *
 * This is a PROJECTION layer only:
 *   - no new tables
 *   - no new extraction
 *   - no new memory/entity/timeline systems
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

export type BiographyChange = {
  kind: 'new_chapter' | 'new_person' | 'new_milestone' | 'emerging_theme';
  label: string;
};

const MAX_THEMES = 3;
const MAX_PEOPLE = 4;
const MAX_FOCUS = 3;
const MAX_DEVELOPMENTS = 3;

// ── Card projection ───────────────────────────────────────────────────────────

/**
 * Build the user-facing Living Biography Card from the existing snapshot.
 * Returns `hasEnoughData: false` (with nulls) when there isn't yet enough
 * foundation data to show an identity surface — never fabricates one.
 */
export async function getLivingBiographyCard(userId: string): Promise<LivingBiographyCard> {
  const bio = await biographyFoundationService.getBiography(userId);

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

  // Background refresh — never blocks the response. Serves the current
  // snapshot immediately; regenerates quietly if enough new evidence exists.
  maybeRefreshInBackground(userId, bio);

  return {
    name: bio.facts.identity.name,
    currentChapter: deriveCurrentChapter(bio),
    topThemes: bio.themes.slice(0, MAX_THEMES).map(t => t.theme),
    keyPeople: deriveKeyPeople(bio),
    currentFocus: bio.facts.upcomingEvents.slice(0, MAX_FOCUS),
    recentDevelopments: deriveRecentDevelopments(bio),
    lastUpdated: bio.generatedAt,
    hasEnoughData: true,
  };
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
 * Recent developments = the most recent timeline-derived key events,
 * newest first. These are things that already happened — distinct from
 * "current focus" (forward-looking, from facts.upcomingEvents).
 */
function deriveRecentDevelopments(bio: BiographyOutput): string[] {
  return [...bio.facts.keyEvents]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
export function deriveCurrentChapter(bio: BiographyOutput): CurrentChapter | null {
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

const REFRESH_MIN_HOURS_BETWEEN = 24;
const REFRESH_MIN_NEW_ENTRIES   = 5;
const REFRESH_MIN_NEW_EVENTS    = 3;

let refreshInFlight = new Set<string>();

/**
 * Fire-and-forget: regenerate the snapshot in the background if enough new
 * evidence has accumulated since it was last generated. Never blocks the
 * card response — the user always sees the current snapshot immediately,
 * and the next visit reflects the refreshed one.
 */
function maybeRefreshInBackground(userId: string, bio: BiographyOutput): void {
  if (refreshInFlight.has(userId)) return;

  shouldRefreshBiography(userId, bio.generatedAt)
    .then(should => {
      if (!should) return;
      refreshInFlight.add(userId);
      return biographyFoundationService.generateBiography(userId)
        .then(() => logger.info({ userId }, 'LivingBiography: background refresh complete'))
        .catch(err => logger.error({ err, userId }, 'LivingBiography: background refresh failed'))
        .finally(() => refreshInFlight.delete(userId));
    })
    .catch(() => {});
}

/**
 * Threshold check: enough new memories OR new timeline events since the
 * snapshot was generated, and at least REFRESH_MIN_HOURS_BETWEEN has passed.
 */
export async function shouldRefreshBiography(userId: string, generatedAtIso: string): Promise<boolean> {
  const hoursSince = (Date.now() - new Date(generatedAtIso).getTime()) / 3_600_000;
  if (hoursSince < REFRESH_MIN_HOURS_BETWEEN) return false;

  const [entriesRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('date', generatedAtIso),
    supabaseAdmin
      .from('character_timeline_events')
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
