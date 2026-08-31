/**
 * Stitched timeline → main chat handoff + LoreBook meter from chapter scenes.
 */

import type { NarrativeChapter, StitchedTimelineItem } from '../api/stitchedTimeline';
import type { ChronologyEntry } from '../types/timelineV2';
import { CHAT_FOCUS_SOURCE_LABELS } from '../types/chatFocus';
import { openChatWithFocus } from './openChatWithFocus';
import { meterFromTimelineOffer, type LorebookContentMeterModel } from './lorebookContentMeter';
import {
  evaluateTimelineSubjectLorebookOffer,
  type TimelineSubjectLorebookOffer,
} from './timelineSubjectLorebook';
import type { LoreReadinessSummary } from './loreReadiness';

export type StitchedTimelineChatInput = {
  title: string;
  lifeArcId?: string;
  items: StitchedTimelineItem[];
  chapter?: NarrativeChapter | null;
  scopeType?: 'global' | 'life_arc';
};

/** Map stitched scenes into chronology-shaped events for the LoreBook meter. */
export function stitchedItemsToChronologyEntries(
  items: StitchedTimelineItem[],
): ChronologyEntry[] {
  return items.map((item) => ({
    id: item.id,
    user_id: '',
    journal_entry_id: item.sourceId,
    start_time: item.sortTime,
    time_precision: 'day',
    time_confidence: item.timeConfidence ?? item.confidence ?? 0.7,
    content: [item.title, item.body].filter(Boolean).join('\n'),
    timeline_memberships: [],
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    source_ids: item.sourceIds,
    source_type: item.sourceType,
    title: item.title,
    tags: item.tags,
  }));
}

export function evaluateStitchedTimelineLorebookOffer(input: {
  title: string;
  items: StitchedTimelineItem[];
  chapter?: NarrativeChapter | null;
  readiness?: LoreReadinessSummary | null;
}): TimelineSubjectLorebookOffer {
  const subjectForDomain = [
    input.title,
    input.chapter?.dominantTheme,
    input.chapter?.thesis,
    ...(input.chapter?.backgroundContext ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  const offer = evaluateTimelineSubjectLorebookOffer({
    subject: subjectForDomain || input.title,
    events: stitchedItemsToChronologyEntries(input.items),
    readiness: input.readiness,
  });

  return {
    ...offer,
    subjectLabel: input.title,
    prefill: {
      ...offer.prefill,
      lorebookName: `${input.title} LoreBook`,
      themes: [input.title, input.chapter?.dominantTheme, offer.domain.label]
        .filter(Boolean)
        .join(', '),
    },
  };
}

export function meterFromStitchedTimeline(input: {
  title: string;
  items: StitchedTimelineItem[];
  chapter?: NarrativeChapter | null;
  readiness?: LoreReadinessSummary | null;
}): { offer: TimelineSubjectLorebookOffer; meter: LorebookContentMeterModel } {
  const offer = evaluateStitchedTimelineLorebookOffer(input);
  return { offer, meter: meterFromTimelineOffer(offer) };
}

export function buildStitchedTimelineKnowledgeScope(input: StitchedTimelineChatInput): string {
  const parts: string[] = [];
  const scope =
    input.scopeType === 'life_arc' || input.lifeArcId ? 'life arc chapter' : 'stitched chronology';
  parts.push(`${scope}: “${input.title}”`);
  parts.push(`${input.items.length} supporting scene${input.items.length === 1 ? '' : 's'}`);

  if (input.chapter) {
    parts.push(`theme: ${input.chapter.dominantTheme}`);
    parts.push(`thesis: ${input.chapter.thesis}`);
    if (input.chapter.startDate) {
      const span =
        input.chapter.endDate && input.chapter.endDate !== input.chapter.startDate
          ? `${input.chapter.startDate} → ${input.chapter.endDate}`
          : input.chapter.startDate;
      parts.push(`span: ${span}`);
    }
    if (input.chapter.participants.length > 0) {
      parts.push(`people: ${input.chapter.participants.slice(0, 8).join(', ')}`);
    }
    if (input.chapter.locations.length > 0) {
      parts.push(`places: ${input.chapter.locations.slice(0, 6).join(', ')}`);
    }
    if (input.chapter.outcomes.length > 0) {
      parts.push(`outcomes: ${input.chapter.outcomes.slice(0, 3).join('; ')}`);
    }
  } else {
    const sample = input.items
      .slice(0, 5)
      .map((i) => i.title)
      .filter(Boolean);
    if (sample.length > 0) parts.push(`scenes: ${sample.join(' · ')}`);
  }

  return parts.join(' · ');
}

export function buildStitchedTimelineChatPrompt(input: StitchedTimelineChatInput): string {
  const chapterLine = input.chapter
    ? `Chapter thesis: ${input.chapter.thesis}\nTheme: ${input.chapter.dominantTheme}.\n`
    : '';
  return (
    `I'm focusing on my stitched timeline “${input.title}”.\n` +
    chapterLine +
    `Help me explore this chapter: ask clarifying questions, connect people/places/projects that belong here, ` +
    `surface gaps in the story, and help me build toward a vignette or LoreBook when we have enough relevant content.`
  );
}

export function buildStitchedTimelineFollowUpPrompts(
  input: StitchedTimelineChatInput,
): string[] {
  const prompts = [
    'What patterns stand out here?',
    'Who else connects to this chapter?',
    'What places or projects should link in?',
  ];
  if (input.chapter?.outcomes?.[0]) {
    prompts.push('How did the outcome change what came next?');
  } else {
    prompts.push('What’s still missing for a vignette?');
  }
  return prompts;
}

export function openStitchedTimelineChat(
  input: StitchedTimelineChatInput & { initialPrompt?: string; autoSubmit?: boolean },
): void {
  const knowledgeScope = buildStitchedTimelineKnowledgeScope(input);
  openChatWithFocus({
    entityId: input.lifeArcId ?? `stitched-${input.scopeType ?? 'global'}`,
    entityName: input.title,
    entityType: 'memory',
    sourceSurface: 'timeline',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.timeline,
    knowledgeScope,
    initialPrompt: input.initialPrompt,
    autoSubmit: input.autoSubmit === true,
    startNewThread: true,
  });
}
