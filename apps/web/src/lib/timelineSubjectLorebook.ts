/**
 * Decide when an Omni Timeline subject (search reveal or life arc) has enough
 * evidence to compile a LoreBook for that subject/domain.
 */
import type { LorebookCreatorPrefill } from '../components/lorebook/KnowledgeBaseCreator';
import type { Domain } from '../../../server/src/services/biographyGeneration/types';
import type { GeneratedTimelineEvent } from '../components/timeline/GeneratedTimelineReveal';
import type { ArcTrack, LifeArc } from '../hooks/useLifeArcs';
import type { ChronologyEntry } from '../types/timelineV2';
import type { LoreReadinessSummary, LoreTopicId } from './loreReadiness';
import { LORE_TOPICS } from './loreReadiness';

const BIOGRAPHY_DOMAINS = new Set<string>([
  'fighting',
  'robotics',
  'relationships',
  'creative',
  'professional',
  'personal',
  'health',
  'education',
  'family',
  'friendship',
  'romance',
]);

function asBiographyDomain(value?: string): Domain | undefined {
  if (!value || !BIOGRAPHY_DOMAINS.has(value)) return undefined;
  return value as Domain;
}

export const TIMELINE_LOREBOOK_MIN_EVENTS = 5;
export const TIMELINE_LOREBOOK_MIN_DAYS = 3;
export const TIMELINE_LOREBOOK_MIN_WORDS = 120;
/** Slightly lower bar when domain readiness already says that topic can compile. */
export const TIMELINE_LOREBOOK_DOMAIN_READY_MIN_EVENTS = 3;

export type TimelineSubjectDomain = {
  topicId?: LoreTopicId;
  domain?: string;
  label: string;
  scope: LorebookCreatorPrefill['scope'];
};

export type TimelineSubjectLorebookOffer = {
  canCreate: boolean;
  reason: string;
  subjectLabel: string;
  domain: TimelineSubjectDomain;
  eventCount: number;
  uniqueDays: number;
  wordCount: number;
  prefill: LorebookCreatorPrefill;
};

const DOMAIN_KEYWORDS: Array<{
  topicId: LoreTopicId;
  domain?: string;
  label: string;
  keywords: string[];
}> = [
  {
    topicId: 'professional',
    domain: 'professional',
    label: 'Career & work',
    keywords: ['work', 'job', 'career', 'coworker', 'boss', 'office', 'interview', 'promotion'],
  },
  {
    topicId: 'relationships',
    domain: 'relationships',
    label: 'Love & relationships',
    keywords: ['dating', 'relationship', 'girlfriend', 'boyfriend', 'partner', 'romance', 'crush'],
  },
  {
    topicId: 'family',
    domain: 'family',
    label: 'Family',
    keywords: ['family', 'mom', 'dad', 'mother', 'father', 'sister', 'brother', 'cousin', 'aunt', 'uncle'],
  },
  {
    topicId: 'creative',
    domain: 'creative',
    label: 'Creative life',
    keywords: ['art', 'music', 'writing', 'creative', 'project', 'design', 'film', 'song'],
  },
  {
    topicId: 'health',
    domain: 'health',
    label: 'Health & body',
    keywords: ['health', 'gym', 'fitness', 'workout', 'doctor', 'injury', 'recovery', 'sleep'],
  },
  {
    topicId: 'education',
    domain: 'education',
    label: 'Education',
    keywords: ['school', 'college', 'university', 'class', 'course', 'study', 'exam', 'learning'],
  },
  {
    topicId: 'personal',
    domain: 'personal',
    label: 'Personal growth',
    keywords: ['growth', 'therapy', 'identity', 'values', 'habit', 'mindset', 'journal'],
  },
];

const TRACK_TO_DOMAIN: Partial<
  Record<ArcTrack, { topicId: LoreTopicId; domain?: string; label: string }>
> = {
  career: { topicId: 'professional', domain: 'professional', label: 'Career & work' },
  romance: { topicId: 'relationships', domain: 'romance', label: 'Love & dating' },
  relationships: { topicId: 'relationships', domain: 'relationships', label: 'Relationships' },
  creative: { topicId: 'creative', domain: 'creative', label: 'Creative life' },
  health: { topicId: 'health', domain: 'health', label: 'Health & body' },
  inner: { topicId: 'personal', domain: 'personal', label: 'Personal growth' },
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function eventText(event: GeneratedTimelineEvent | ChronologyEntry): string {
  const title = 'title' in event && typeof event.title === 'string' ? event.title : '';
  const content = 'content' in event ? String(event.content ?? '') : '';
  const tags = 'tags' in event && Array.isArray(event.tags) ? event.tags.join(' ') : '';
  return `${title} ${content} ${tags}`.trim();
}

export function summarizeTimelineEvents(
  events: Array<GeneratedTimelineEvent | ChronologyEntry>,
): { eventCount: number; uniqueDays: number; wordCount: number } {
  const days = new Set<string>();
  let words = 0;
  for (const event of events) {
    const day = String(event.start_time ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
    words += wordCount(eventText(event));
  }
  return { eventCount: events.length, uniqueDays: days.size, wordCount: words };
}

export function inferSubjectDomain(
  subject: string,
  extras: string[] = [],
): TimelineSubjectDomain {
  const hay = `${subject} ${extras.join(' ')}`.toLowerCase();
  for (const row of DOMAIN_KEYWORDS) {
    if (row.keywords.some((kw) => hay.includes(kw))) {
      return {
        topicId: row.topicId,
        domain: row.domain,
        label: row.label,
        scope: 'domain',
      };
    }
  }
  return {
    label: subject.trim() || 'This timeline',
    scope: 'thematic',
  };
}

export function domainFromArcTrack(track: ArcTrack | null | undefined): TimelineSubjectDomain | null {
  if (!track) return null;
  const mapped = TRACK_TO_DOMAIN[track];
  if (!mapped) return null;
  return { ...mapped, scope: 'domain' };
}

function dateSpanPrefill(
  events: Array<GeneratedTimelineEvent | ChronologyEntry>,
  lorebookName: string,
  themes: string,
  domain?: string,
): LorebookCreatorPrefill {
  const times = events
    .map((e) => new Date(e.start_time).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length >= 2) {
    return {
      scope: 'time_range',
      timeRangeStart: new Date(Math.min(...times)).toISOString().slice(0, 10),
      timeRangeEnd: new Date(Math.max(...times)).toISOString().slice(0, 10),
      themes,
      lorebookName,
      saveAsCore: true,
    };
  }
  if (domain) {
    return {
      scope: 'domain',
      themes,
      lorebookName,
      saveAsCore: true,
      // KnowledgeBaseCreator uses domain select separately; themes still help thematic fallback.
    };
  }
  return {
    scope: 'thematic',
    themes,
    lorebookName,
    saveAsCore: true,
  };
}

function topicReady(
  readiness: LoreReadinessSummary | null | undefined,
  topicId?: LoreTopicId,
): boolean {
  if (!readiness || !topicId) return false;
  const topic = readiness.topics.find((t) => t.topic.id === topicId);
  return Boolean(topic?.canGenerate);
}

function domainLabelForTopic(topicId?: LoreTopicId): string | undefined {
  if (!topicId) return undefined;
  return LORE_TOPICS.find((t) => t.id === topicId)?.label;
}

/**
 * Offer a LoreBook for a generated/search timeline when the subject has enough
 * moments — or when the matching domain is already ready in biography readiness.
 */
export function evaluateTimelineSubjectLorebookOffer(input: {
  subject: string;
  events: GeneratedTimelineEvent[];
  readiness?: LoreReadinessSummary | null;
}): TimelineSubjectLorebookOffer {
  const subjectLabel = input.subject.trim() || 'This timeline';
  const stats = summarizeTimelineEvents(input.events);
  const extras = input.events.slice(0, 12).map(eventText);
  const domain = inferSubjectDomain(subjectLabel, extras);
  const domainIsReady = topicReady(input.readiness, domain.topicId);

  const volumeReady =
    stats.eventCount >= TIMELINE_LOREBOOK_MIN_EVENTS &&
    stats.uniqueDays >= TIMELINE_LOREBOOK_MIN_DAYS &&
    stats.wordCount >= TIMELINE_LOREBOOK_MIN_WORDS;

  const domainBoostReady =
    domainIsReady &&
    stats.eventCount >= TIMELINE_LOREBOOK_DOMAIN_READY_MIN_EVENTS &&
    stats.wordCount >= 60;

  const canCreate = volumeReady || domainBoostReady;

  let reason: string;
  if (canCreate) {
    reason = domainIsReady
      ? `Enough ${domain.label.toLowerCase()} content to compile a LoreBook.`
      : `Enough moments about “${subjectLabel}” to compile a LoreBook.`;
  } else if (stats.eventCount === 0) {
    reason = 'No moments in this timeline yet.';
  } else {
    const needEvents = Math.max(0, TIMELINE_LOREBOOK_MIN_EVENTS - stats.eventCount);
    const needDays = Math.max(0, TIMELINE_LOREBOOK_MIN_DAYS - stats.uniqueDays);
    const parts = [
      needEvents > 0 ? `${needEvents} more moment${needEvents === 1 ? '' : 's'}` : null,
      needDays > 0 ? `${needDays} more day${needDays === 1 ? '' : 's'} of coverage` : null,
      stats.wordCount < TIMELINE_LOREBOOK_MIN_WORDS ? 'richer detail in chat' : null,
    ].filter(Boolean);
    reason = `Need ${parts.join(' and ')} about this subject before making a LoreBook.`;
  }

  const themes = [subjectLabel, domain.label, domain.domain].filter(Boolean).join(', ');
  const prefill = dateSpanPrefill(
    input.events,
    `${subjectLabel} LoreBook`,
    themes,
    domain.domain,
  );
  const bioDomain = asBiographyDomain(domain.domain);
  // Prefer domain scope in the creator when domain readiness is already green.
  if (domainIsReady && bioDomain && prefill.scope !== 'time_range') {
    prefill.scope = 'domain';
    prefill.domain = bioDomain;
  } else if (bioDomain) {
    prefill.domain = bioDomain;
  }

  return {
    canCreate,
    reason,
    subjectLabel,
    domain: {
      ...domain,
      label: domain.label || domainLabelForTopic(domain.topicId) || subjectLabel,
    },
    eventCount: stats.eventCount,
    uniqueDays: stats.uniqueDays,
    wordCount: stats.wordCount,
    prefill,
  };
}

/** Offer a LoreBook for a swimlane arc using overlapping chronology + domain readiness. */
export function evaluateArcLorebookOffer(input: {
  arc: LifeArc;
  entries: ChronologyEntry[];
  readiness?: LoreReadinessSummary | null;
}): TimelineSubjectLorebookOffer {
  const arc = input.arc;
  const subjectLabel = arc.title?.trim() || 'This arc';
  const start = arc.start_date ? new Date(arc.start_date).getTime() : NaN;
  const end = arc.end_date ? new Date(arc.end_date).getTime() : Date.now();

  const inRange = input.entries.filter((entry) => {
    const t = new Date(entry.start_time).getTime();
    if (!Number.isFinite(t)) return false;
    if (Number.isFinite(start) && t < start) return false;
    if (Number.isFinite(end) && t > end) return false;
    return true;
  });

  const trackDomain = domainFromArcTrack(arc.track);
  const inferred = inferSubjectDomain(subjectLabel, [
    arc.summary ?? '',
    ...(arc.tags ?? []),
    ...inRange.slice(0, 12).map(eventText),
  ]);
  const domain = trackDomain ?? inferred;
  const stats = summarizeTimelineEvents(inRange);
  const domainIsReady = topicReady(input.readiness, domain.topicId);

  const volumeReady =
    Boolean(arc.start_date) &&
    stats.eventCount >= TIMELINE_LOREBOOK_MIN_EVENTS &&
    stats.uniqueDays >= TIMELINE_LOREBOOK_MIN_DAYS &&
    stats.wordCount >= TIMELINE_LOREBOOK_MIN_WORDS;

  const domainBoostReady =
    Boolean(arc.start_date) &&
    domainIsReady &&
    stats.eventCount >= TIMELINE_LOREBOOK_DOMAIN_READY_MIN_EVENTS;

  const canCreate = volumeReady || domainBoostReady;

  let reason: string;
  if (!arc.start_date) {
    reason = 'This arc needs a start date before it can become a LoreBook.';
  } else if (canCreate) {
    reason = `Enough ${domain.label.toLowerCase()} content in this arc to compile a LoreBook.`;
  } else {
    const needEvents = Math.max(0, TIMELINE_LOREBOOK_MIN_EVENTS - stats.eventCount);
    reason =
      needEvents > 0
        ? `Need about ${needEvents} more moment${needEvents === 1 ? '' : 's'} in this arc (or more ${domain.label.toLowerCase()} lore overall).`
        : `Need richer coverage of “${subjectLabel}” before making a LoreBook.`;
  }

  const themes = [subjectLabel, domain.label, ...(arc.tags ?? [])].filter(Boolean).join(', ');
  const prefill: LorebookCreatorPrefill = {
    scope: 'time_range',
    timeRangeStart: (arc.start_date ?? new Date().toISOString()).slice(0, 10),
    timeRangeEnd: (arc.end_date ?? new Date().toISOString()).slice(0, 10),
    themes,
    lorebookName: `${subjectLabel} LoreBook`,
    saveAsCore: true,
    domain: asBiographyDomain(domain.domain),
  };

  return {
    canCreate,
    reason,
    subjectLabel,
    domain,
    eventCount: stats.eventCount,
    uniqueDays: stats.uniqueDays,
    wordCount: stats.wordCount,
    prefill,
  };
}
