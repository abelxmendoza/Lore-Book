import type { MemoryCard } from '../types/memory';
import { getDisplayTitle } from '../utils/displayTitle';

import { buildListClipboardText, type ListClipboardFilterOptions } from './listClipboard';

export function buildSearchFactsClipboardText(
  memories: MemoryCard[],
  options?: ListClipboardFilterOptions,
): string {
  return buildListClipboardText({
    title: 'Search facts',
    filters: options?.filters,
    items: memories.map((memory) => ({
      heading: getDisplayTitle({
        title: memory.title,
        summary: memory.content,
        people: memory.characters,
        fallbackNoun: 'Fact',
      }),
      fields: [
        { label: 'Id', value: memory.id },
        { label: 'When', value: memory.date },
        { label: 'Source', value: memory.source },
        { label: 'Mood', value: memory.mood },
        { label: 'Tags', value: memory.tags.slice(0, 12) },
        { label: 'People', value: memory.characters?.slice(0, 12) },
        { label: 'Chapter', value: memory.chapterTitle },
        { label: 'Arc', value: memory.arcTitle },
        { label: 'Saga', value: memory.sagaTitle },
        { label: 'Favorite', value: memory.metadata?.favorite === true },
      ],
      body: memory.content?.trim() || undefined,
    })),
  });
}
