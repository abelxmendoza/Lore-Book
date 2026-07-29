/**
 * Dating & Romance timeline moment — summary, related lore links, and chat handoff.
 */

import { getMockPeripheralsForRelationship } from './romanticPeripherals';

export type RomanceDateEventLike = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

export type RomanceTimelineRelatedLink = {
  kind: 'person' | 'place' | 'moment' | 'bond';
  id: string;
  label: string;
  detail?: string;
  /** When set, Open Character Book is available. */
  characterId?: string;
};

export type RomanceTimelineMoment = {
  id: string;
  title: string;
  dateType: string;
  date: string;
  location?: string;
  impact: string;
  sentiment?: number;
  isPositive: boolean;
  summary: string;
  related: RomanceTimelineRelatedLink[];
  followUpPrompts: string[];
};

function formatDateType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const INTIMACY_TYPES = new Set([
  'first_kiss',
  'love_declaration',
  'emotional_intimacy',
  'physical_intimacy',
  'vulnerability_moment',
  'connection_deepening',
  'connection_began',
  'anniversary',
  'reconciliation',
]);

export function intimacyImpactLabel(
  type: string,
  sentiment?: number,
  wasPositive?: boolean,
): string {
  if (type.includes('breakup') || type.includes('fight') || type.includes('distance')) return 'Strain';
  if (INTIMACY_TYPES.has(type)) return 'Deepening';
  if (sentiment != null && sentiment >= 0.85) return 'Peak intimacy';
  if (sentiment != null && sentiment >= 0.6) return 'Connection growth';
  if (wasPositive === false || (sentiment != null && sentiment < 0.4)) return 'Tension';
  return 'Connection moment';
}

function expandSummary(
  event: RomanceDateEventLike,
  personName: string,
  impact: string,
): string {
  const raw = event.description?.trim();
  const when = fmtWhen(event.date_time);
  const where = event.location?.trim();
  const title = formatDateType(event.date_type);

  if (raw && raw.length >= 120) return raw;

  const base =
    raw ||
    `A ${title.toLowerCase()} moment with ${personName}${when ? ` around ${when}` : ''}.`;

  const placeBit = where
    ? ` It unfolded at ${where}, which still anchors how you remember the day.`
    : '';

  const arcBit =
    impact === 'Strain' || impact === 'Tension' || impact === 'Rupture'
      ? ` Looking back, this marks a turn toward distance or friction in the bond — useful context when you ask what changed and what still lingers.`
      : ` Looking back, this is one of the beats that deepened closeness with ${personName} — a place to ask what it meant then, and what it still means now.`;

  const follow =
    ' LoreBook can reconnect this moment to other dates, people, and places in your love timeline, then keep answering as you add detail in chat.';

  return `${base}${placeBit}${arcBit}${follow}`;
}

export function buildRomanceTimelineMoment(opts: {
  event: RomanceDateEventLike;
  personName: string;
  relationshipId: string;
  characterId?: string | null;
  allEvents: RomanceDateEventLike[];
}): RomanceTimelineMoment {
  const { event, personName, relationshipId, characterId, allEvents } = opts;
  const isPositive = event.was_positive ?? (event.sentiment != null ? event.sentiment > 0 : true);
  const impact = intimacyImpactLabel(event.date_type, event.sentiment, isPositive);
  const title = formatDateType(event.date_type);

  const related: RomanceTimelineRelatedLink[] = [
    {
      kind: 'person',
      id: `person-${characterId ?? personName}`,
      label: personName,
      detail: 'Partner on this bond',
      characterId: characterId ?? undefined,
    },
  ];

  if (event.location?.trim()) {
    related.push({
      kind: 'place',
      id: `place-${event.location}`,
      label: event.location.trim(),
      detail: 'Where this moment landed',
    });
  }

  related.push({
    kind: 'bond',
    id: relationshipId,
    label: `Dating arc with ${personName}`,
    detail: 'Whole intimacy timeline for this relationship',
  });

  const peripherals = getMockPeripheralsForRelationship(relationshipId).slice(0, 3);
  for (const p of peripherals) {
    related.push({
      kind: 'person',
      id: p.id,
      label: p.peripheral_name ?? p.peripheral_surface,
      detail: `Attributed to ${personName} · ${p.tier}`,
      characterId: p.peripheral_person_id ?? undefined,
    });
  }

  const sorted = [...allEvents].sort(
    (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime(),
  );
  const idx = sorted.findIndex((e) => e.id === event.id);
  for (const neighbor of [sorted[idx - 1], sorted[idx + 1]].filter(Boolean)) {
    if (!neighbor) continue;
    related.push({
      kind: 'moment',
      id: neighbor.id,
      label: formatDateType(neighbor.date_type),
      detail: fmtWhen(neighbor.date_time),
    });
  }

  const followUpPrompts = [
    `What else do you remember about this ${title.toLowerCase()} with ${personName}?`,
    `How did this moment change how you felt about ${personName} afterward?`,
    `Who else or what else connects to this — friends, places, other dates?`,
  ];

  return {
    id: event.id,
    title,
    dateType: event.date_type,
    date: event.date_time,
    location: event.location,
    impact,
    sentiment: event.sentiment,
    isPositive,
    summary: expandSummary(event, personName, impact),
    related,
    followUpPrompts,
  };
}

/** Initial main-chat prompt when continuing from a romance timeline moment. */
export function buildRomanceTimelineMomentChatPrompt(
  moment: RomanceTimelineMoment,
  personName: string,
): string {
  const when = fmtWhen(moment.date);
  const relatedPeople = moment.related
    .filter((r) => r.kind === 'person')
    .map((r) => r.label)
    .slice(0, 6);
  const relatedMoments = moment.related
    .filter((r) => r.kind === 'moment')
    .map((r) => r.label)
    .slice(0, 4);

  return [
    `Tell me the full story of “${moment.title}” with ${personName}${when ? ` around ${when}` : ''}.`,
    moment.location ? `It was at ${moment.location}.` : null,
    `Stay focused on this intimacy milestone and how it sits in our dating arc.`,
    `Cover what you actually know: what led up to it, what happened, how it felt, and what came after.`,
    relatedPeople.length
      ? `People who may connect: ${relatedPeople.join(', ')}.`
      : null,
    relatedMoments.length
      ? `Nearby milestones on the same arc: ${relatedMoments.join(', ')}.`
      : null,
    `Here is the summary I already have: ${moment.summary}`,
    `If something isn’t recorded, say so — don’t invent details.`,
    `Then help me connect this to other related lore, and I’ll ask follow-ups so we can deepen what LoreBook knows.`,
  ]
    .filter(Boolean)
    .join(' ');
}
