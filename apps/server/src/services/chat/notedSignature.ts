/**
 * LoreBook's occasional signature acknowledgment — "Noted."
 * Used sparingly for log/deposit moments, never as a default for normal chat.
 *
 * Two forms:
 * - Full reply: content is exactly "Noted." (SILENT_LOG signature)
 * - Lead-in: styled "Noted." at the top of a normal reply (metadata.notedLeadIn)
 */

export const NOTED_SIGNATURE = 'Noted.';

export type NotedSignatureContext = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Inject for tests — defaults to Math.random */
  random?: () => number;
};

const EXPLICIT_LOG_PATTERN =
  /^\s*(log this|save this|remember this|journal entry|memory:|lore note:|note:|capture this|record this)/i;

const QUESTION_PATTERN =
  /\?|^(what|who|why|how|when|where|can you|could you|should i|do you|tell me|explain)\b/i;

const EMOTIONAL_PATTERN =
  /\b(sad|anxious|scared|depressed|overwhelmed|hurt|angry|lost|confused|help me|struggling|grief|lonely|cry|cried)\b/i;

const ADVICE_SEEKING =
  /\b(what do you think|advice|help me decide|not sure if|what should i)\b/i;

const CREATIVE_DISCUSSION_PATTERN =
  /\b(I thought|I think|what if|maybe we|the villain|character arc|backstory|plot|scene|chapter|draft|rewrite|more depth|story idea)\b/i;

/** Short factual deposits that can earn a Noted. lead-in on a normal reply. */
const FACT_SHARE_PATTERN =
  /\b(I am|I'm|I was|I've|my name is|I work|I live|I met|today I|just (got|finished|started|moved)|remember that|for the record)\b/i;

const MIN_TURNS_SINCE_LAST_NOTED = 5;

export function isNotedAssistantContent(content: string): boolean {
  const t = content.trim();
  return t === NOTED_SIGNATURE || /^Noted\.\s+/i.test(t);
}

export function isEligibleForNotedSignature(ctx: NotedSignatureContext): boolean {
  const msg = ctx.message.trim();
  if (!msg) return false;
  if (QUESTION_PATTERN.test(msg)) return false;
  if (EMOTIONAL_PATTERN.test(msg)) return false;
  if (ADVICE_SEEKING.test(msg)) return false;
  if (!EXPLICIT_LOG_PATTERN.test(msg) && CREATIVE_DISCUSSION_PATTERN.test(msg)) return false;

  const isExplicitLog = EXPLICIT_LOG_PATTERN.test(msg);
  const isShortDeposit =
    msg.length <= 160 && !/\b(because|although|however|but then|and then)\b/i.test(msg);

  if (!isExplicitLog && !isShortDeposit) return false;
  if (msg.length > 280 && !isExplicitLog) return false;

  return true;
}

/** Broader than full-signature: fact shares can get a lead-in on a normal reply. */
export function isEligibleForNotedLeadIn(ctx: NotedSignatureContext): boolean {
  if (isEligibleForNotedSignature(ctx)) return true;
  const msg = ctx.message.trim();
  if (!msg || msg.length < 12 || msg.length > 320) return false;
  if (QUESTION_PATTERN.test(msg)) return false;
  if (EMOTIONAL_PATTERN.test(msg)) return false;
  if (ADVICE_SEEKING.test(msg)) return false;
  if (CREATIVE_DISCUSSION_PATTERN.test(msg)) return false;
  return FACT_SHARE_PATTERN.test(msg);
}

export function turnsSinceLastNotedSignature(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): number {
  if (!history?.length) return Number.POSITIVE_INFINITY;

  let turns = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.role === 'assistant' && isNotedAssistantContent(entry.content)) {
      return turns;
    }
    turns += 1;
  }
  return turns;
}

export function shouldUseNotedSignature(ctx: NotedSignatureContext): boolean {
  if (!isEligibleForNotedSignature(ctx)) return false;

  const sinceLast = turnsSinceLastNotedSignature(ctx.conversationHistory);
  if (sinceLast < MIN_TURNS_SINCE_LAST_NOTED) return false;

  const rand = ctx.random ?? Math.random;
  const isExplicitLog = EXPLICIT_LOG_PATTERN.test(ctx.message.trim());
  const hasPriorAssistant = ctx.conversationHistory?.some((m) => m.role === 'assistant') ?? false;

  // Explicit log commands: ~22%. Short deposits: ~10%. First reply in thread: ~15%.
  let probability = isExplicitLog ? 0.22 : 0.1;
  if (!hasPriorAssistant && isEligibleForNotedSignature(ctx)) {
    probability = Math.max(probability, 0.15);
  }

  return rand() < probability;
}

/**
 * Occasional "Noted." lead-in on a normal (non-SILENT_LOG) reply.
 * Independent of the bare "Noted." signature roll (different code paths).
 */
export function shouldShowNotedLeadIn(ctx: NotedSignatureContext): boolean {
  if (!isEligibleForNotedLeadIn(ctx)) return false;

  const sinceLast = turnsSinceLastNotedSignature(ctx.conversationHistory);
  if (sinceLast < MIN_TURNS_SINCE_LAST_NOTED) return false;

  const rand = ctx.random ?? Math.random;
  const isExplicitLog = EXPLICIT_LOG_PATTERN.test(ctx.message.trim());
  // Lead-ins are slightly more common than full-signature replies.
  const probability = isExplicitLog ? 0.28 : 0.14;
  return rand() < probability;
}

export function maybeNotedSignatureResponse(ctx: NotedSignatureContext): string | null {
  return shouldUseNotedSignature(ctx) ? NOTED_SIGNATURE : null;
}

/** Strip a leading "Noted." line so the client can render the themed lead-in separately. */
export function stripLeadingNotedPrefix(content: string): string {
  return content.replace(/^Noted\.\s*/i, '').trimStart();
}
