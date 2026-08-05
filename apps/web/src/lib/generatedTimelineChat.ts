import type { SubjectTimelineCompilationSummary, TimelineEntityType } from '../api/subjectTimeline';
import type { GeneratedTimelineEvent } from '../components/timeline/GeneratedTimelineReveal';
import { CHAT_FOCUS_SOURCE_LABELS, type ChatFocusEntityType } from '../types/chatFocus';
import { openChatWithFocus } from './openChatWithFocus';

export type GeneratedTimelineChatInput = {
  query: string;
  events: GeneratedTimelineEvent[];
  isMock: boolean;
  compilation?: SubjectTimelineCompilationSummary | null;
};

function focusEntityType(type?: TimelineEntityType): ChatFocusEntityType {
  switch (type) {
    case 'person': return 'character';
    case 'organization':
    case 'group':
    case 'community': return 'organization';
    case 'place': return 'location';
    case 'project': return 'project';
    case 'skill': return 'skill';
    case 'event': return 'event';
    default: return 'memory';
  }
}

function compactMoment(event: GeneratedTimelineEvent): string | null {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(event.start_time)?.[0] ?? 'Undated';
  const title = 'title' in event && event.title?.trim() ? event.title.trim() : '';
  const content = event.content?.trim().replace(/\s+/g, ' ') ?? '';
  const description = title || content;
  if (!description) return null;
  return `${date}: ${description.slice(0, 180)}`;
}

export function buildGeneratedTimelineKnowledgeScope(input: GeneratedTimelineChatInput): string {
  const subject = input.compilation?.subject;
  const base = `Omni Timeline subject: “${input.query}”`;
  if (input.isMock) {
    return `${base} · simulated preview only · do not treat preview moments as evidence`;
  }

  const moments = input.events
    .map(compactMoment)
    .filter((moment): moment is string => Boolean(moment))
    .slice(0, 6);
  const parts = [
    base,
    subject ? `resolved subject: ${subject.displayName} (${subject.entityType})` : null,
    `${input.events.length} supporting moment${input.events.length === 1 ? '' : 's'}`,
    moments.length > 0 ? `moments: ${moments.join(' · ')}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

export function buildGeneratedTimelineChatPrompt(input: GeneratedTimelineChatInput): string {
  if (input.isMock) {
    return (
      `I want to talk about “${input.query}” so LoreBook can replace the simulated preview with real moments. ` +
      'Help me describe what actually happened, when it happened, who was involved, and why it mattered.'
    );
  }
  return (
    `I want to continue exploring “${input.query}” from my Omni Timeline. ` +
    'Use the attached timeline context, help me connect the real moments, and ask about important gaps or corrections.'
  );
}

export function openGeneratedTimelineChat(input: GeneratedTimelineChatInput): void {
  const subject = input.compilation?.subject;
  openChatWithFocus({
    entityId: subject?.entityId ?? `omni-subject:${input.query.trim().toLowerCase()}`,
    entityName: subject?.displayName ?? input.query,
    entityType: focusEntityType(subject?.entityType),
    sourceSurface: 'timeline',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.timeline,
    knowledgeScope: buildGeneratedTimelineKnowledgeScope(input),
    initialPrompt: buildGeneratedTimelineChatPrompt(input),
    // Timeline handoffs should begin with LoreBook responding to the selected
    // context, rather than leaving the user with a prefilled composer.
    autoSubmit: true,
    startNewThread: true,
  });
}
