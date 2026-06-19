import type { ChatFocus } from '../types/chatFocus';
import { emptyChatFocusSessionStats } from '../types/chatFocus';

export type OpenChatWithFocusInput = Omit<ChatFocus, 'sessionStats'> & {
  sessionStats?: Partial<ChatFocus['sessionStats']>;
};

/**
 * Navigate to main chat with entity + source context (modal → chat bridge).
 * Handled globally in App.tsx via the `lorebook:open-chat-focus` event.
 */
export function openChatWithFocus(input: OpenChatWithFocusInput): void {
  const stats = {
    ...emptyChatFocusSessionStats(),
    ...input.sessionStats,
  };
  window.dispatchEvent(
    new CustomEvent('lorebook:open-chat-focus', {
      detail: { ...input, sessionStats: stats } satisfies ChatFocus,
    })
  );
}

/** Legacy prefill-only bridge — wraps a generic lorebook chat open. */
export function openChatWithPrefill(message: string, sourceLabel = 'Lorebooks'): void {
  openChatWithFocus({
    entityId: 'lorebook',
    entityName: 'Your story',
    entityType: 'memory',
    sourceSurface: 'lorebook',
    sourceLabel,
    knowledgeScope: 'general lore',
    initialPrompt: message,
  });
}
