/**
 * Modal → chat jump: open an exact thread/message and optionally highlight name terms.
 * Consumed by ChatFirstInterface via sessionStorage keys below.
 */

export const CHAT_JUMP_MESSAGE_KEY = 'lk:chat-jump-message';
export const CHAT_JUMP_HIGHLIGHT_KEY = 'lk:chat-jump-highlight';
export const CHAT_JUMP_SESSION_KEY = 'lk:chat-jump-session';
export const CHAT_OPEN_THREAD_EVENT = 'lorebook:open-chat-thread';

export type ChatThreadJumpInput = {
  sessionId: string;
  messageId: string;
  /** Name + aliases to mark inside the jumped message. */
  highlightTerms?: string[];
};

function normalizeHighlightTerms(terms: string[] | undefined): string[] {
  if (!terms?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw?.trim();
    if (!t || t.length < 2) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  // Longer first so "Jamie Lee" wins over "Jamie" when splitting.
  return out.sort((a, b) => b.length - a.length);
}

export function setChatThreadJump(input: ChatThreadJumpInput): void {
  sessionStorage.setItem(CHAT_JUMP_MESSAGE_KEY, input.messageId);
  sessionStorage.setItem(CHAT_JUMP_SESSION_KEY, input.sessionId);
  const terms = normalizeHighlightTerms(input.highlightTerms);
  if (terms.length > 0) {
    sessionStorage.setItem(CHAT_JUMP_HIGHLIGHT_KEY, JSON.stringify(terms));
  } else {
    sessionStorage.removeItem(CHAT_JUMP_HIGHLIGHT_KEY);
  }
}

export function peekChatJumpMessageId(): string | null {
  return sessionStorage.getItem(CHAT_JUMP_MESSAGE_KEY);
}

export function peekChatJumpSessionId(): string | null {
  return sessionStorage.getItem(CHAT_JUMP_SESSION_KEY);
}

export function peekChatJumpHighlightTerms(): string[] {
  const raw = sessionStorage.getItem(CHAT_JUMP_HIGHLIGHT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeHighlightTerms(parsed.filter((t): t is string => typeof t === 'string'));
  } catch {
    return [];
  }
}

/** Clear only after the target message was found (or jump abandoned). */
export function clearChatThreadJump(): void {
  sessionStorage.removeItem(CHAT_JUMP_MESSAGE_KEY);
  sessionStorage.removeItem(CHAT_JUMP_HIGHLIGHT_KEY);
  sessionStorage.removeItem(CHAT_JUMP_SESSION_KEY);
}

/**
 * Navigate to a chat thread at a specific message.
 * Sets jump storage, navigates to /chat/:sessionId, and dispatches a window event
 * so App can switch to chat even if a modal teardown races the router update.
 */
export function openChatThreadAtMessage(
  navigate: (to: string, opts?: { replace?: boolean }) => void,
  input: ChatThreadJumpInput,
): void {
  if (!input.sessionId?.trim() || !input.messageId?.trim()) {
    console.warn('[chatThreadJump] missing sessionId or messageId', input);
    return;
  }
  setChatThreadJump(input);
  window.dispatchEvent(
    new CustomEvent(CHAT_OPEN_THREAD_EVENT, {
      detail: input,
    }),
  );
  navigate(`/chat/${encodeURIComponent(input.sessionId)}`);
}
