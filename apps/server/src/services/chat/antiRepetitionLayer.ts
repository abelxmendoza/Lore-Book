/**
 * Sprint AK-7 — Anti-repetition layer
 *
 * Blocks repeated fallback phrases across recent assistant responses.
 */

import { FORBIDDEN_UNVERIFIED_CLAIMS, VERIFIED_SILENCE_FALLBACK } from './verifiedMemoryLanguage';

export const BLOCKED_FALLBACK_PHRASES: RegExp[] = [
  ...FORBIDDEN_UNVERIFIED_CLAIMS,
  /we haven'?t talked about that yet/i,
  /tell me about it and it becomes part of your record/i,
  /something went wrong/i,
];

const ALTERNATIVE_EVIDENCE_DUMP =
  'Let me show what I actually have instead of repeating that — ask "what do you know about [name]?" or "did you save [name]?" for a verified check.';

export function containsBlockedPhrase(text: string): boolean {
  return BLOCKED_FALLBACK_PHRASES.some((re) => re.test(text));
}

export function wasRecentlyUsed(text: string, recentAssistantMessages: string[]): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  return recentAssistantMessages.some((msg) => {
    const prior = msg.toLowerCase().replace(/\s+/g, ' ').trim();
    return prior.includes(normalized.slice(0, 40)) || normalized.includes(prior.slice(0, 40));
  });
}

export function sanitizeAssistantResponse(
  text: string,
  recentAssistantMessages: string[] = []
): string {
  const trimmed = text.trim();
  if (!trimmed) return VERIFIED_SILENCE_FALLBACK;

  if (containsBlockedPhrase(trimmed)) {
    if (wasRecentlyUsed(trimmed, recentAssistantMessages)) {
      return ALTERNATIVE_EVIDENCE_DUMP;
    }
    return VERIFIED_SILENCE_FALLBACK;
  }

  if (wasRecentlyUsed(trimmed, recentAssistantMessages)) {
    return ALTERNATIVE_EVIDENCE_DUMP;
  }

  return trimmed;
}

export function getRecentAssistantMessages(
  history: Array<{ role: string; content: string }>,
  limit = 5
): string[] {
  return history
    .filter((m) => m.role === 'assistant')
    .map((m) => m.content)
    .slice(-limit);
}
