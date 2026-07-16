/**
 * Life chapters, recurring themes, and the current chapter.
 *
 * Chapters are cut at accepted turning points and at dominant-context shifts,
 * then merged until each one has a coherent range, multiple events, and a
 * defining context. Names summarize a transformation or environment — never a
 * bare calendar year. Themes must recur across distinct events (ideally
 * distinct chapters) and are labeled from concrete evidence, not single
 * abstract nouns.
 */
import { randomUUID } from 'crypto';

import type {
  CanonicalEvent,
  CurrentChapter,
  EvidenceRecord,
  KnownEntity,
  LifeChapter,
  LifeDomain,
  Theme,
  TurningPointAssessment,
} from './narrativeRecords';

const DOMAIN_DISPLAY: Record<LifeDomain, string> = {
  education: 'education',
  career: 'work',
  relationships: 'relationships',
  family: 'family',
  health: 'health',
  location: 'a new place',
  projects: 'building projects',
  community: 'community',
  finances: 'finances',
  beliefs: 'beliefs',
  recreation: 'social life',
  identity: 'identity',
};

function dominantDomains(events: CanonicalEvent[]): LifeDomain[] {
  const counts = new Map<LifeDomain, number>();
  for (const e of events) {
    for (const d of e.domains) {
      // Weight by importance so one heavy event outvotes several trivial ones.
      counts.set(d, (counts.get(d) ?? 0) + 0.5 + e.importanceScore);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => d);
}

function dominantOrganization(
  events: CanonicalEvent[],
  entities: KnownEntity[]
): KnownEntity | undefined {
  const counts = new Map<string, number>();
  for (const e of events) {
    for (const id of e.organizationIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 2) return undefined;
  return entities.find((e) => e.id === top[0]);
}

function yearRange(events: CanonicalEvent[]): { start?: string; end?: string } {
  const dates = events
    .map((e) => e.startTime)
    .filter((d): d is string => Boolean(d))
    .sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function nameChapter(
  events: CanonicalEvent[],
  boundary: TurningPointAssessment | undefined,
  entities: KnownEntity[]
): { title: string; definingContext: string } {
  const domains = dominantDomains(events);
  const org = dominantOrganization(events, entities);

  if (boundary && boundary.affectedDomains.length > 0) {
    const domain = boundary.affectedDomains[0];
    if (boundary.arcLabel === 'victory' && domain === 'education') {
      return {
        title: 'Finishing the Degree',
        definingContext: 'completing formal education',
      };
    }
    if (domain === 'career') {
      return {
        title: org ? `The ${org.name} Era` : 'Breaking Into New Work',
        definingContext: org ? `working at ${org.name}` : 'a career transition',
      };
    }
    if (domain === 'location') {
      return { title: 'Starting Over Somewhere New', definingContext: 'relocation' };
    }
    if (domain === 'relationships' || domain === 'community') {
      return {
        title: 'Rebuilding Belonging',
        definingContext: 'changes in relationships and community',
      };
    }
  }

  if (org) {
    return { title: `The ${org.name} Era`, definingContext: `time centered on ${org.name}` };
  }
  if (domains.length >= 2) {
    return {
      title: `Between ${capitalize(DOMAIN_DISPLAY[domains[0]])} and ${capitalize(DOMAIN_DISPLAY[domains[1]])}`,
      definingContext: `${DOMAIN_DISPLAY[domains[0]]} alongside ${DOMAIN_DISPLAY[domains[1]]}`,
    };
  }
  if (domains.length === 1) {
    return {
      title: `A Season of ${capitalize(DOMAIN_DISPLAY[domains[0]])}`,
      definingContext: DOMAIN_DISPLAY[domains[0]],
    };
  }
  const { start, end } = yearRange(events);
  const years = [start?.slice(0, 4), end?.slice(0, 4)].filter(Boolean).join('–');
  // Last resort keeps the year but pairs it with content so the quality gate
  // can still flag chapters that are nothing but a date bucket.
  return { title: `Unmapped Season (${years || 'undated'})`, definingContext: 'insufficient context' };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function chapterSummary(events: CanonicalEvent[], definingContext: string): string {
  const top = [...events].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 3);
  const highlights = top.map((e) => e.title.replace(/\.$/, '')).join('; ');
  return `A period defined by ${definingContext}. Key moments: ${highlights}.`;
}

export function buildLifeChapters(
  events: CanonicalEvent[],
  turningPoints: TurningPointAssessment[],
  entities: KnownEntity[]
): LifeChapter[] {
  const dated = events.filter((e) => e.startTime).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  if (dated.length === 0) return [];

  const accepted = turningPoints.filter((tp) => tp.accepted);
  const boundaryEventIds = new Set(accepted.map((tp) => tp.eventId));

  // Cut a new chapter when we hit a turning point (the turning point opens
  // the new chapter).
  const segments: { events: CanonicalEvent[]; boundary?: TurningPointAssessment }[] = [];
  let current: CanonicalEvent[] = [];
  let currentBoundary: TurningPointAssessment | undefined;
  for (const event of dated) {
    if (boundaryEventIds.has(event.id) && current.length > 0) {
      segments.push({ events: current, boundary: currentBoundary });
      current = [];
      currentBoundary = accepted.find((tp) => tp.eventId === event.id);
    } else if (boundaryEventIds.has(event.id)) {
      currentBoundary = accepted.find((tp) => tp.eventId === event.id);
    }
    current.push(event);
  }
  if (current.length > 0) segments.push({ events: current, boundary: currentBoundary });

  // Merge thin segments (a chapter needs more than one isolated memory) into
  // the previous chapter, and merge adjacent segments that share the same
  // dominant context.
  const merged: typeof segments = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    const thin = seg.events.length < 2 && !seg.boundary;
    const sameContext =
      prev &&
      dominantDomains(prev.events).join() === dominantDomains(seg.events).join() &&
      !seg.boundary;
    if (prev && (thin || sameContext)) {
      prev.events.push(...seg.events);
    } else {
      merged.push(seg);
    }
  }

  const usedTitles = new Set<string>();
  return merged.map(({ events: segEvents, boundary }) => {
    let { title, definingContext } = nameChapter(segEvents, boundary, entities);
    const { start, end } = yearRange(segEvents);
    // Two chapters can earn the same template name (e.g. two separate stints
    // at the same org); qualify repeats with their years so titles stay unique.
    if (usedTitles.has(title)) {
      const years = [start?.slice(0, 4), end?.slice(0, 4)]
        .filter((y, i, arr) => y && arr.indexOf(y) === i)
        .join('–');
      title = years ? `${title} (${years})` : `${title} (continued)`;
    }
    usedTitles.add(title);
    return {
      id: randomUUID(),
      title,
      startTime: start,
      endTime: end,
      summary: chapterSummary(segEvents, definingContext),
      definingContext,
      eventIds: segEvents.map((e) => e.id),
      dominantDomains: dominantDomains(segEvents),
      confidence: Math.min(1, 0.4 + segEvents.length * 0.1 + (boundary ? 0.2 : 0)),
    };
  });
}

interface ThemePattern {
  label: string;
  description: (chapters: string[]) => string;
  match: (event: CanonicalEvent, text: string) => boolean;
}

const THEME_PATTERNS: ThemePattern[] = [
  {
    label: 'Entering unfamiliar environments and proving competence',
    description: (chapters) =>
      `Across ${chapters.join(' and ')}, new environments are met by earning a place through demonstrated skill.`,
    match: (e, text) =>
      /\b(new (job|team|scene|school|city)|first (day|week)|prove|earned (their|my place)|showed (them|that i))\b/i.test(
        text
      ) && (e.domains.includes('career') || e.domains.includes('education') || e.domains.includes('community')),
  },
  {
    label: 'Moving from physical work into technical mastery',
    description: () =>
      'A long trajectory out of manual and service work toward engineering and technical craft.',
    match: (e, text) =>
      /\b(kitchen|warehouse|manual labor|service (job|industry)|line cook|field (work|ops))\b/i.test(text) ||
      (e.domains.includes('career') &&
        /\b(engineer|technical|lab|robotics|hardware|software|analysis)\b/i.test(text)),
  },
  {
    label: 'Turning experiences into systems and structure',
    description: () =>
      'Recurring drive to capture, organize, and build systems out of lived experience.',
    match: (e, text) =>
      e.domains.includes('projects') &&
      /\b(built|building|system|organize|document|preserve|record|archive)\b/i.test(text),
  },
  {
    label: 'Seeking belonging while protecting self-respect',
    description: (chapters) =>
      `Community and connection recur across ${chapters.join(' and ')}, balanced against holding onto identity.`,
    match: (e, text) =>
      (e.domains.includes('community') || e.domains.includes('recreation')) &&
      /\b(belong|welcomed|accepted|fit in|my people|found (a|my) (scene|crew|community))\b/i.test(text),
  },
  {
    label: 'Discipline carried from training into everything else',
    description: () =>
      'Practice-built discipline (training, martial arts, drills) shows up as an approach to hard problems.',
    match: (_e, text) =>
      /\b(martial arts|jiu.?jitsu|boxing|muay thai|training|discipline|drill(s|ing)|belt)\b/i.test(text),
  },
  {
    label: 'Preserving meaningful experiences before they disappear',
    description: () => 'A recurring fear of losing memories, met by recording and preserving them.',
    match: (_e, text) =>
      /\b(never forget|preserve|memor(y|ies) (fade|disappear)|before (i|it'?s) (forget|gone)|write (it|this) down)\b/i.test(
        text
      ),
  },
];

export function inferThemes(
  events: CanonicalEvent[],
  chapters: LifeChapter[],
  evidenceById: Map<string, EvidenceRecord>
): Theme[] {
  const chapterByEvent = new Map<string, string>();
  for (const chapter of chapters) {
    for (const id of chapter.eventIds) chapterByEvent.set(id, chapter.id);
  }
  const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]));

  const themes: Theme[] = [];
  for (const pattern of THEME_PATTERNS) {
    const supporting = events.filter((event) => {
      const text = event.evidenceIds
        .map((id) => evidenceById.get(id)?.text ?? '')
        .join(' ');
      return pattern.match(event, text);
    });
    if (supporting.length < 2) continue; // a theme must recur

    const chapterIds = [
      ...new Set(supporting.map((e) => chapterByEvent.get(e.id)).filter((c): c is string => Boolean(c))),
    ];
    const chapterNames = chapterIds.map((id) => chapterTitle.get(id) ?? 'an earlier chapter');
    themes.push({
      id: randomUUID(),
      label: pattern.label,
      description: pattern.description(chapterNames.slice(0, 2)),
      supportingEventIds: supporting.map((e) => e.id),
      chapterIds,
      confidence: Math.min(1, 0.3 + supporting.length * 0.15 + (chapterIds.length >= 2 ? 0.25 : 0)),
    });
  }

  return themes.sort((a, b) => b.confidence - a.confidence);
}

export function synthesizeCurrentChapter(
  chapters: LifeChapter[],
  events: CanonicalEvent[],
  turningPoints: TurningPointAssessment[],
  records: EvidenceRecord[]
): CurrentChapter | undefined {
  const latest = chapters[chapters.length - 1];
  if (!latest) return undefined;

  const eventById = new Map(events.map((e) => [e.id, e]));
  const latestEvents = latest.eventIds
    .map((id) => eventById.get(id))
    .filter((e): e is CanonicalEvent => Boolean(e))
    .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));

  const recentTp = turningPoints.filter(
    (tp) => tp.accepted && latest.eventIds.includes(tp.eventId)
  );
  const whatChanged =
    recentTp.length > 0
      ? recentTp.map((tp) => tp.event.replace(/\.$/, '')).join('; ')
      : latestEvents[0]?.title ?? 'no major change detected recently';

  const earlier = chapters.slice(0, -1);
  const sharedDomain = latest.dominantDomains.find((d) =>
    earlier.some((c) => c.dominantDomains.includes(d))
  );
  const trajectory = earlier.length
    ? sharedDomain
      ? `continues a longer arc through ${DOMAIN_DISPLAY[sharedDomain]} that runs back through ${earlier[earlier.length - 1].title}`
      : `follows ${earlier[earlier.length - 1].title}, opening new ground`
    : 'is the earliest chapter on record';

  const openTensions = records
    .filter((r) => r.kind === 'usable' && r.recordType === 'uncertainty')
    .slice(0, 3)
    .map((r) => summarizeTension(r.text));

  const activePursuits = [
    ...new Set(
      records
        .filter((r) => r.kind === 'usable' && r.recordType === 'current_state')
        .flatMap((r) => r.domains)
        .map((d) => DOMAIN_DISPLAY[d])
    ),
  ].slice(0, 4);

  return { chapterId: latest.id, whatChanged, trajectory, openTensions, activePursuits };
}

function summarizeTension(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}
