/**
 * One-shot handoff from Post Event composer → main chat.
 * Images stay out of Redux (data URLs are large); ChatFirstInterface takes them on focus arrival.
 */

import type { ChatImageAttachment } from '../features/chat/types/chatImageAttachment';

export type PostEventChatHandoff = {
  eventId: string;
  eventTitle: string;
  images: ChatImageAttachment[];
  /** When true, main chat auto-sends the focus prompt + images once. */
  autoSubmit: boolean;
};

let pending: PostEventChatHandoff | null = null;

export function stashPostEventChatHandoff(handoff: PostEventChatHandoff): void {
  pending = handoff;
}

export function takePostEventChatHandoff(): PostEventChatHandoff | null {
  const next = pending;
  pending = null;
  return next;
}

export function peekPostEventChatHandoff(): PostEventChatHandoff | null {
  return pending;
}

export function buildPostedEventIngestPrompt(input: {
  eventId: string;
  title: string;
  date: string;
  placeName?: string | null;
  organizationName?: string | null;
  story?: string | null;
  photoCount: number;
  /** User mostly dumped a story without structured fields. */
  storyOnly?: boolean;
}): string {
  const lines = [
    'EVENT ENRICHMENT MODE',
    '',
    input.storyOnly
      ? 'I dumped a Timeline moment as a story (details optional). Please process it into LoreBook.'
      : 'I already saved this Timeline moment. Please process the attached flyer/photos and my notes into LoreBook.',
    '',
    'TARGET EVENT',
    `Event id: ${input.eventId}`,
    `Title: ${input.title}`,
    `When: ${input.date}`,
  ];
  if (input.placeName?.trim()) lines.push(`Primary place: ${input.placeName.trim()}`);
  if (input.organizationName?.trim()) lines.push(`Host group: ${input.organizationName.trim()}`);
  if (input.story?.trim()) {
    lines.push('', 'My story:', input.story.trim());
  }
  if (input.photoCount > 0) {
    lines.push(
      '',
      `${input.photoCount} flyer/photo${input.photoCount === 1 ? '' : 's'} attached — read them carefully.`,
    );
  }
  lines.push(
    '',
    'TASK',
    'Treat the target event as the canonical ingestion object. Do not create a duplicate event.',
    'Extract only evidence supported by my notes, attached images, or attached documents.',
    'Return and merge: participants, organizations/groups, locations, timing, activities, relationships, memories, timeline updates, themes, a concise narrative summary, confidence, and evidence references.',
    'An explicitly present but unnamed participant must remain an unresolved participant — do not omit them and do not invent a name.',
    'Approximate dates and time periods are fine. Do not invent exact dates, names, or facts.',
    'Update the target Timeline moment and connected knowledge bases while preserving provenance and review rules.',
  );
  return lines.join('\n');
}
