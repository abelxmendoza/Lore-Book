import type { Message } from '../message/ChatMessage';

/** Internal placeholder for empty drafts — never shown as-is when messages exist. */
export const DRAFT_THREAD_TITLE = 'Draft';

const GENERIC_THREAD_TITLE_RE = /^(new chat|new thread|untitled( conversation)?|chat|draft)$/i;

export function isGenericThreadTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  return GENERIC_THREAD_TITLE_RE.test(title.trim());
}

const FILLER_PREFIX = /^(hi|hey|ok|okay|yo|huh|so|well|alright|um|uh)[,!.\s]+/i;
const QUESTION_PREFIX = /^(do you|did you|can you|could you|will you|have you|remember|what do|what did|what was)[,\s]+/i;

/** Derive a readable title from the first user message. Never returns a generic placeholder. */
export function deriveTitleFromFirstUserMessage(content: string): string {
  const stripped = content
    .replace(FILLER_PREFIX, '')
    .replace(QUESTION_PREFIX, '')
    .trim();
  const sentence = stripped.split(/[.!?]/)[0].trim();
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  let result = words.length > 45 ? words.slice(0, 42) + '…' : words;
  if (!result.trim()) {
    result = content.trim().slice(0, 40).trim();
  }
  if (!result.trim()) return DRAFT_THREAD_TITLE;
  const titled = result.charAt(0).toUpperCase() + result.slice(1);
  return isGenericThreadTitle(titled) ? DRAFT_THREAD_TITLE : titled;
}

export function deriveTitleFromMessages(
  messages: Array<{ role: string; content: string }>
): string | null {
  const firstUser = messages.find((m) => m.role === 'user' && m.content?.trim());
  if (!firstUser) return null;
  const derived = deriveTitleFromFirstUserMessage(firstUser.content);
  return isGenericThreadTitle(derived) ? null : derived;
}

export function resolveThreadDisplayTitle(thread: {
  title: string;
  messages?: Message[];
  updatedAt?: string;
}): string {
  if (!isGenericThreadTitle(thread.title)) return thread.title.trim();
  const fromMsgs = thread.messages?.length ? deriveTitleFromMessages(thread.messages) : null;
  if (fromMsgs) return fromMsgs;
  if (thread.updatedAt) {
    const d = new Date(thread.updatedAt);
    return `Conversation · ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  return DRAFT_THREAD_TITLE;
}

export function normalizeThreadTitle<T extends { title: string; messages: Message[] }>(thread: T): T {
  if (!isGenericThreadTitle(thread.title) || thread.messages.length === 0) return thread;
  const derived = deriveTitleFromMessages(thread.messages);
  if (!derived) return thread;
  return { ...thread, title: derived };
}
