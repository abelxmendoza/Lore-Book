import { fetchJson } from '../lib/api';
import type { SuggestionBookDomain } from '../lib/suggestionMatchTypes';

export type DismissSuggestionInput = {
  bookDomain: SuggestionBookDomain;
  name: string;
  suggestionId?: string;
  sourceMessageId?: string | null;
  threadId?: string | null;
};

export type DismissSuggestionResult = {
  success: boolean;
  dismiss_count: number;
  is_permanent: boolean;
  remaining_until_permanent: number;
  thread_id?: string | null;
  normalized_name?: string;
};

export const suggestionDismissApi = {
  dismiss(input: DismissSuggestionInput): Promise<DismissSuggestionResult> {
    return fetchJson<DismissSuggestionResult>('/api/suggestions/dismiss', {
      method: 'POST',
      body: JSON.stringify({
        book_domain: input.bookDomain,
        name: input.name,
        suggestion_id: input.suggestionId,
        source_message_id: input.sourceMessageId ?? undefined,
        thread_id: input.threadId ?? undefined,
      }),
    });
  },
};
