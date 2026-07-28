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
    input.storyOnly
      ? 'I dumped a Life Log moment as a story (details optional). Please process it into LoreBook.'
      : 'I already saved this Life Log event. Please process the attached flyer/photos and my notes into LoreBook.',
    '',
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
    'Extract people, places, groups, timing, and what happened from the story and images. Approximate dates and time periods are fine — do not invent exact dates. Update timelines, this Life Log event, and related knowledge bases. Do not invent details that are not in my story or the images. Do not create a duplicate event — enrich the one already saved.',
  );
  return lines.join('\n');
}
