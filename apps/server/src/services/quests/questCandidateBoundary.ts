import { normalizeNameKey } from '../../utils/nameNormalization';
import { isConversationalPersonIntro } from '../identity/personIntroDecomposition';

export type QuestEvidenceSource = {
  id?: string;
  content: string;
  date?: string;
};

export type ResolvedQuestEvidence = {
  text: string;
  sourceMessageId?: string;
  observedAt?: string;
};

const EXPLANATION_SUFFIX_RE =
  /\s+(?:for\s+(?:my\s+)?self[-\s]?respect|as\s+(?:a\s+)?(?:personal\s+)?boundary|because\s+.+)$/i;

const LEADING_INTENT_RE =
  /^(?:i\s+|we\s+)?(?:still\s+)?(?:want|need|plan|intend|will|must|should|have\s+to|am\s+going|am\s+trying)\s+to\s+/i;

function normalizeQuestPhrase(value: string): string {
  return normalizeNameKey(value)
    .replace(EXPLANATION_SUFFIX_RE, '')
    .replace(LEADING_INTENT_RE, '')
    .replace(/^(?:keep|continue)\s+/, '')
    .replace(/^(?:stay\s+away\s+from|maintain\s+distance\s+from|distance\s+(?:myself|ourselves)\s+from)\s+/, 'avoid ')
    .replace(/\b(?:the|a|an|my|our)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalQuestIntentKey(title: string): string {
  return normalizeQuestPhrase(title);
}

export function questTitlesSemanticallyMatch(left: string, right: string): boolean {
  const a = canonicalQuestIntentKey(left);
  const b = canonicalQuestIntentKey(right);
  if (!a || !b) return false;
  if (a === b) return true;

  const aTokens = new Set(a.split(' ').filter((token) => token.length > 2));
  const bTokens = new Set(b.split(' ').filter((token) => token.length > 2));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size, 1) >= 0.8;
}

export function isQuestCandidateTextAllowed(sourceText: string, proposedTitle?: string): boolean {
  if (!sourceText.trim()) return false;
  return !isConversationalPersonIntro(sourceText)
    && !(proposedTitle && isConversationalPersonIntro(proposedTitle));
}

export function resolveQuestEvidence(
  sourceQuote: string | undefined,
  sources: QuestEvidenceSource[],
): ResolvedQuestEvidence | null {
  const quote = sourceQuote?.replace(/\s+/g, ' ').trim();
  if (!quote) return null;
  const quoteKey = quote.toLocaleLowerCase();
  const source = sources.find((entry) =>
    entry.content.replace(/\s+/g, ' ').toLocaleLowerCase().includes(quoteKey));
  if (!source) return null;
  return { text: quote, sourceMessageId: source.id, observedAt: source.date };
}
