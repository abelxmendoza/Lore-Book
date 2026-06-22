/**
 * LoreBook's occasional signature acknowledgment — "Noted."
 * Mirror of server logic for demo chat simulation.
 */

export const NOTED_SIGNATURE = 'Noted.';

export type NotedSignatureContext = {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
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

/** Reflective / creative discussion — not a memory deposit. */
const CREATIVE_DISCUSSION_PATTERN =
  /\b(I thought|I think|what if|maybe we|the villain|character arc|backstory|plot|scene|chapter|draft|rewrite|more depth|story idea)\b/i;

const MIN_TURNS_SINCE_LAST_NOTED = 5;

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

export function turnsSinceLastNotedSignature(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): number {
  if (!history?.length) return Number.POSITIVE_INFINITY;

  let turns = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.role === 'assistant' && entry.content.trim() === NOTED_SIGNATURE) {
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

  let probability = isExplicitLog ? 0.22 : 0.1;
  if (!hasPriorAssistant && isEligibleForNotedSignature(ctx)) {
    probability = Math.max(probability, 0.15);
  }

  return rand() < probability;
}

export function maybeNotedSignatureResponse(ctx: NotedSignatureContext): string | null {
  return shouldUseNotedSignature(ctx) ? NOTED_SIGNATURE : null;
}
