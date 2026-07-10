/**
 * Slang Toponym Resolver.
 *
 * A slang toponym is a colloquial nickname shaped like a place — "Weeb City",
 * "Goth Town", "Nerd Central" — that actually refers to an event or venue the
 * user already knows ("Weeb City" tweeted on July 4th → Anime Expo at the LA
 * Convention Center). The place pipeline correctly lets these through as place
 * candidates (they are well-formed names), so this layer runs AFTER the place
 * guards and asks a different question: does this name better resolve to an
 * existing lore entity as an ALIAS than to a brand-new Place card?
 *
 * Deterministic, no LLM. Inference combines three signals:
 *   1. Theme affinity — a subculture lexicon expands the slang modifier
 *      ("weeb" → anime/manga/otaku/cosplay/expo/con) and matches it against
 *      candidate names, aliases, summaries, and tags.
 *   2. Temporal correlation — the source date (tweet/chat timestamp) is near a
 *      candidate event's date, or matches its annual recurrence window.
 *   3. Recency — the candidate was mentioned close in time to the source.
 *
 * Real cities are protected: "New York City", "Kansas City", "Studio City"
 * never detect as slang because their modifiers are not culture tokens.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';

// ── Detection ────────────────────────────────────────────────────────────────

/** Geo head nouns that slang toponyms borrow ("<culture> city/town/land…"). */
const GEO_HEAD_NOUNS = new Set([
  'city', 'town', 'land', 'ville', 'world', 'central', 'nation', 'country',
  'capital', 'zone', 'territory', 'kingdom', 'headquarters', 'hq', 'district',
  'island', 'planet',
]);

/**
 * Subculture / vibe tokens → expanded theme vocabulary. The expansion is what
 * lets "weeb" find "Anime Expo" without an LLM. Keys and values are matched
 * against candidate names, aliases, summaries, and tags (normalized).
 */
const CULTURE_THEMES: Record<string, string[]> = {
  weeb: ['anime', 'manga', 'otaku', 'cosplay', 'expo', 'con', 'japan', 'kawaii'],
  weeaboo: ['anime', 'manga', 'otaku', 'cosplay', 'expo', 'con', 'japan'],
  otaku: ['anime', 'manga', 'cosplay', 'expo', 'con', 'japan'],
  anime: ['anime', 'manga', 'otaku', 'cosplay', 'expo', 'con'],
  cosplay: ['cosplay', 'anime', 'expo', 'con', 'costume'],
  nerd: ['comic', 'con', 'anime', 'gaming', 'expo', 'convention'],
  geek: ['comic', 'con', 'gaming', 'tech', 'expo', 'convention'],
  gamer: ['gaming', 'game', 'esports', 'arcade', 'con', 'expo'],
  goth: ['goth', 'gothic', 'darkwave', 'industrial'],
  ska: ['ska', 'skank', 'two-tone', 'rude'],
  punk: ['punk', 'hardcore', 'mosh'],
  emo: ['emo', 'screamo'],
  metal: ['metal', 'metalcore', 'mosh'],
  skater: ['skate', 'skateboard', 'skatepark'],
  raver: ['rave', 'edm', 'festival'],
  rave: ['rave', 'edm', 'festival'],
  horror: ['horror', 'halloween', 'haunt'],
  comic: ['comic', 'con', 'expo', 'convention'],
};

export interface SlangToponymDetection {
  isSlangToponym: boolean;
  /** The culture modifier ("weeb" in "Weeb City"). */
  modifier?: string;
  /** The geo head noun ("city"). */
  headNoun?: string;
  /** Expanded theme vocabulary used for referent matching. */
  themeTokens: string[];
  reason: string;
}

/**
 * Detect whether a place-shaped name is a slang toponym. Conservative by
 * design: the modifier must be a known culture/vibe token, so real city names
 * are never flagged.
 */
export function detectSlangToponym(name: string): SlangToponymDetection {
  const key = normalizeNameKey(name ?? '');
  const tokens = key.split(' ').filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) {
    return { isSlangToponym: false, themeTokens: [], reason: 'token_count' };
  }

  const head = tokens[tokens.length - 1];
  if (!GEO_HEAD_NOUNS.has(head)) {
    return { isSlangToponym: false, themeTokens: [], reason: 'no_geo_head_noun' };
  }

  const modifiers = tokens.slice(0, -1);
  const cultureToken = modifiers.find((t) => CULTURE_THEMES[t]);
  if (!cultureToken) {
    return { isSlangToponym: false, themeTokens: [], reason: 'modifier_not_culture_token' };
  }

  const themes = new Set<string>([cultureToken, ...CULTURE_THEMES[cultureToken]]);
  return {
    isSlangToponym: true,
    modifier: cultureToken,
    headNoun: head,
    themeTokens: [...themes],
    reason: 'culture_modifier_with_geo_head',
  };
}

// ── Referent inference ───────────────────────────────────────────────────────

export interface SlangReferentCandidate {
  id: string;
  kind: 'event' | 'place';
  name: string;
  aliases?: string[];
  summary?: string | null;
  tags?: string[];
  /** ISO date(s) the event occurred, when known. */
  occurredDates?: string[];
  /** Annual recurrence window ("every 4th of July" → month 7, day 4). */
  annualRecurrence?: { month: number; day: number } | null;
  /** Most recent mention timestamp, for recency scoring. */
  lastMentionedAt?: string | null;
}

export interface SlangInferenceInput {
  name: string;
  /** Evidence line the name appeared in (tweet text, chat line). */
  evidence?: string;
  /** Timestamp of the source mention (tweet created_at, message time). */
  sourceDate?: string;
  candidates: SlangReferentCandidate[];
}

export type SlangDisposition = 'auto_alias' | 'review' | 'none';

export interface SlangInferenceResult {
  detection: SlangToponymDetection;
  matched: boolean;
  target?: SlangReferentCandidate;
  confidence: number;
  signals: string[];
  disposition: SlangDisposition;
}

const AUTO_ALIAS_THRESHOLD = 0.7;
const REVIEW_THRESHOLD = 0.45;
const TEMPORAL_WINDOW_DAYS = 5;

function candidateCorpus(c: SlangReferentCandidate): {
  nameKey: string;
  nameTokens: Set<string>;
  labelTokens: Set<string>;
  summaryTokens: Set<string>;
} {
  const nameKey = normalizeNameKey(c.name);
  const tokenize = (values: string[]): Set<string> =>
    new Set(values.flatMap((v) => normalizeNameKey(v).split(' ')).filter(Boolean));
  return {
    nameKey,
    nameTokens: tokenize([c.name]),
    // Aliases and tags are curated identity labels, scored like the name.
    labelTokens: tokenize([...(c.aliases ?? []), ...(c.tags ?? [])]),
    summaryTokens: tokenize([c.summary ?? '']),
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/** Distance in days between a date and the nearest occurrence of month/day. */
function daysToAnnualWindow(date: Date, month: number, day: number): number {
  const candidates = [date.getUTCFullYear() - 1, date.getUTCFullYear(), date.getUTCFullYear() + 1]
    .map((y) => new Date(Date.UTC(y, month - 1, day)));
  return Math.min(...candidates.map((c) => daysBetween(date, c)));
}

function scoreCandidate(
  detection: SlangToponymDetection,
  input: SlangInferenceInput,
  c: SlangReferentCandidate,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const { nameKey, nameTokens, labelTokens, summaryTokens } = candidateCorpus(c);

  // 1. Theme affinity. One signal per hit token. A hit in the name or in a
  // curated label (alias/tag) is strong; free-text summary hits are weaker.
  const nameHits = detection.themeTokens.filter((t) => nameTokens.has(t));
  const labelHits = detection.themeTokens.filter((t) => labelTokens.has(t));
  const summaryHits = detection.themeTokens.filter((t) => summaryTokens.has(t));
  if (nameHits.length > 0) {
    score += 0.5;
    for (const t of nameHits) signals.push(`theme_in_name:${t}`);
  } else if (labelHits.length > 0) {
    score += 0.5;
    for (const t of labelHits) signals.push(`theme_in_tags:${t}`);
  } else if (summaryHits.length > 0) {
    score += 0.35;
    for (const t of summaryHits) signals.push(`theme_in_lore:${t}`);
  }

  // 2. Evidence co-occurrence — the source line names the candidate directly.
  if (input.evidence && nameKey && normalizeNameKey(input.evidence).includes(nameKey)) {
    score += 0.3;
    signals.push('named_in_evidence');
  }

  // 3. Temporal correlation.
  const source = input.sourceDate ? new Date(input.sourceDate) : null;
  if (source && !Number.isNaN(source.getTime())) {
    const occurredNear = (c.occurredDates ?? []).some((d) => {
      const dt = new Date(d);
      return !Number.isNaN(dt.getTime()) && daysBetween(source, dt) <= TEMPORAL_WINDOW_DAYS;
    });
    if (occurredNear) {
      score += 0.25;
      signals.push('occurred_near_source_date');
    } else if (
      c.annualRecurrence &&
      daysToAnnualWindow(source, c.annualRecurrence.month, c.annualRecurrence.day) <= TEMPORAL_WINDOW_DAYS
    ) {
      score += 0.25;
      signals.push('annual_recurrence_window');
    }

    // 4. Recency of mention.
    if (c.lastMentionedAt) {
      const last = new Date(c.lastMentionedAt);
      if (!Number.isNaN(last.getTime()) && daysBetween(source, last) <= 30) {
        score += 0.1;
        signals.push('recently_mentioned');
      }
    }
  }

  return { score: Math.min(1, score), signals };
}

/**
 * Infer the lore entity a slang toponym refers to. Returns `auto_alias` only
 * when theme + at least one corroborating signal line up; a theme-only match
 * lands in `review` so the user confirms it once.
 */
export function inferSlangToponymReferent(input: SlangInferenceInput): SlangInferenceResult {
  const detection = detectSlangToponym(input.name);
  const none: SlangInferenceResult = {
    detection,
    matched: false,
    confidence: 0,
    signals: [],
    disposition: 'none',
  };
  if (!detection.isSlangToponym) return none;

  let best: { candidate: SlangReferentCandidate; score: number; signals: string[] } | null = null;
  for (const c of input.candidates) {
    const { score, signals } = scoreCandidate(detection, input, c);
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && c.kind === 'event' && best.candidate.kind !== 'event')) {
      best = { candidate: c, score, signals };
    }
  }

  if (!best) return none;

  const disposition: SlangDisposition =
    best.score >= AUTO_ALIAS_THRESHOLD ? 'auto_alias' : best.score >= REVIEW_THRESHOLD ? 'review' : 'none';

  return {
    detection,
    matched: disposition !== 'none',
    target: disposition === 'none' ? undefined : best.candidate,
    confidence: best.score,
    signals: best.signals,
    disposition,
  };
}
