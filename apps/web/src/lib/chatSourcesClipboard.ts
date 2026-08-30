import { SOURCE_TYPE_LABELS, type ChatSource } from '../features/chat/message/ChatMessage';

import { buildListClipboardText, type ListClipboardFilterOptions } from './listClipboard';

export function dedupeChatSources(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const source of sources) {
    if (
      source.usage === 'rejected'
      || !source.id
      || !source.title?.trim()
      || /^(?:assistant|system|lorebook response|this answer)$/i.test(source.title.trim())
    ) continue;
    const key = `${source.type}:${source.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

/** Ranked, deduped list for the conversation Sources bar / clipboard. */
export function rankChatSourcesForDisplay(sources: ChatSource[]): ChatSource[] {
  return dedupeChatSources(sources).sort(
    (a, b) => (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1),
  );
}

export function buildChatSourcesClipboardText(
  sources: ChatSource[],
  options?: ListClipboardFilterOptions & { title?: string },
): string {
  const ranked = rankChatSourcesForDisplay(sources);
  return buildListClipboardText({
    title: options?.title ?? 'Conversation evidence consulted',
    filters: options?.filters,
    items: ranked.map((source) => ({
      heading: source.title?.trim() || '(untitled)',
      fields: [
        { label: 'Type', value: SOURCE_TYPE_LABELS[source.type] ?? source.type },
        { label: 'Date', value: source.date },
      ],
      body: source.snippet,
    })),
  });
}
