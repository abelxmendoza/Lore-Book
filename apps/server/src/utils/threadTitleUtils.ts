const GENERIC_THREAD_TITLE_RE = /^(new chat|new thread|untitled( conversation)?|chat|draft)$/i;

export const DRAFT_THREAD_TITLE = 'Draft';

export function isGenericThreadTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  return GENERIC_THREAD_TITLE_RE.test(title.trim());
}

const FILLER_PREFIX = /^(hi|hey|ok|okay|yo|huh|so|well|alright|um|uh)[,!.\s]+/i;
const QUESTION_PREFIX = /^(do you|did you|can you|could you|will you|have you|remember|what do|what did|what was)[,\s]+/i;

export function deriveTitleFromFirstUserMessage(content: string): string {
  const stripped = content
    .replace(FILLER_PREFIX, '')
    .replace(QUESTION_PREFIX, '')
    .trim();
  const sentence = stripped.split(/[.!?]/)[0].trim();
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  let result = words.length > 45 ? words.slice(0, 42) + '…' : words;
  if (!result.trim()) result = content.trim().slice(0, 40).trim();
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

export function ensureNonGenericTitle(
  title: string,
  messages?: Array<{ role: string; content: string }>
): string {
  if (!isGenericThreadTitle(title)) return title.trim();
  const derived = messages ? deriveTitleFromMessages(messages) : null;
  if (derived) return derived;
  return `Conversation · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
