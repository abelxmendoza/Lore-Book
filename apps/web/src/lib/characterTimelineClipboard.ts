import type { CharTimelineEvent } from '../components/characters/CharacterTimelinePanel';

import { buildListClipboardText } from './listClipboard';

export type ClipboardCharTimelineEvent = CharTimelineEvent & { lane: 'with' | 'without' };

export function buildCharacterTimelineClipboardText(
  characterName: string,
  events: ClipboardCharTimelineEvent[],
  options?: { filters?: string[] },
): string {
  return buildListClipboardText({
    title: `${characterName}'s Timeline`,
    filters: options?.filters,
    items: events.map((event) => ({
      heading: event.eventTitle,
      fields: [
        { label: 'Date', value: event.eventDate },
        { label: 'Lane', value: event.lane === 'with' ? 'With you' : 'Without you' },
        { label: 'Type', value: event.eventType },
        { label: 'Role', value: event.characterRole },
        { label: 'Connection', value: event.connectionCharacter },
        { label: 'Emotional impact', value: event.emotionalImpact },
      ],
      body: event.eventSummary,
    })),
  });
}
