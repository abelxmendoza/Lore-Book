import { buildListClipboardText, type ListClipboardFilterOptions } from './listClipboard';
import type { ChatSource } from '../features/chat/message/ChatMessage';
import { SOURCE_TYPE_LABELS } from '../features/chat/message/ChatMessage';

export function dedupeChatSources(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const source of sources) {
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
        { label: 'Id', value: source.id },
        { label: 'Date', value: source.date },
        { label: 'Usage', value: source.usage ?? 'background' },
        {
          label: 'Relevance',
          value: source.relevanceScore != null ? source.relevanceScore : null,
        },
        { label: 'Why', value: source.relevanceReasons },
        { label: 'Rejection reason', value: source.rejectionReason },
      ],
      body: source.snippet,
    })),
  });
}
