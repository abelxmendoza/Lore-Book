/**
 * Chat handoff for a group timeline moment — recount everything known, then
 * allow follow-ups and knowledge updates in main chat.
 */

import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
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

/** Initial main-chat prompt when the user clicks a group timeline row. */
export function buildOrgTimelineMomentChatPrompt(
  event: OrgDerivedEvent,
  organizationName: string,
): string {
  const when = fmtDate(event.date);
  const people =
    event.involved.length > 0
      ? `People who may be involved: ${event.involved.slice(0, 8).join(', ')}${
          event.involved.length > 8 ? ` (+${event.involved.length - 8} more)` : ''
        }.`
      : null;
  const hint = event.summary?.trim()
    ? `What I already have noted: ${event.summary.trim()}`
    : null;

  return [
    `Tell me the full story of “${event.title}” with ${organizationName}${
      when ? ` around ${when}` : ''
    }.`,
    `Stay focused on that time period for this group.`,
    `Cover what you actually know: who was there, where it was, what led up to it, what happened, and anything that came after.`,
    people,
    hint,
    `If something isn’t recorded, say so — don’t invent details.`,
    `I’ll ask follow-ups or correct you so we can update the knowledge base.`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function openOrgTimelineMomentChat(input: {
  event: OrgDerivedEvent;
  organizationId: string;
  organizationName: string;
}): void {
  openChatWithFocus({
    entityId: input.organizationId,
    entityName: input.organizationName,
    entityType: 'organization',
    sourceSurface: 'organizations',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.organizations,
    knowledgeScope: 'group timeline moment — recount, correct, and update knowledge',
    startNewThread: true,
    arrivedAt: Date.now(),
  });
}

/** True when this timeline row is a durable Life Log Event (vs detected stub). */
export function isOpenableLifeLogTimelineEvent(event: OrgDerivedEvent): boolean {
  if (event.source === 'user_posted') return true;
  if (event.id.startsWith('demo-posted-event-')) return true;
  return false;
}
