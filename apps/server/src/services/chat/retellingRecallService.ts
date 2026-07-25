import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

const RETELLING_SIGNAL =
  /\b(?:this is (?:a )?repeated story|i (?:already )?told you (?:this|that) before|have i told you (?:this|that) before|do you remember (?:this|that)?|remember this)\b/i;

const RECALL_SUFFIX =
  /(?:^|[\n.!?]\s*)(?:this is (?:a )?repeated story[,.]?\s*)?(?:do you remember(?: this| that)?|have i told you (?:this|that) before|i (?:already )?told you (?:this|that) before)\??\s*$/i;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'before', 'being', 'came', 'could',
  'from', 'going', 'have', 'into', 'just', 'made', 'more', 'much', 'really',
  'said', 'some', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'very', 'what', 'when', 'where', 'which', 'with',
  'would', 'your', 'story', 'remember', 'repeated', 'told',
]);

export type PriorRetellingCandidate = {
  id: string;
  content: string;
  createdAt: string;
  sessionId: string | null;
  similarity: number;
  sharedTerms: string[];
};

type PriorMessageRow = {
  id: string;
  content: string;
  created_at: string;
  session_id: string | null;
};

export function isRetellingRecallMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length >= 80 && RETELLING_SIGNAL.test(trimmed);
}

export function retellingStatement(message: string): string {
  return message.trim().replace(RECALL_SUFFIX, '').trim();
}

function tokens(text: string): Set<string> {
  const normalized = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9' -]+/g, ' ');
  return new Set(
    normalized
      .split(/\s+/)
      .map((token) => token.replace(/^'+|'+$/g, ''))
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
  );
}

export function scoreRetellingSimilarity(current: string, prior: string): {
  score: number;
  sharedTerms: string[];
} {
  const currentTokens = tokens(retellingStatement(current));
  const priorTokens = tokens(retellingStatement(prior));
  if (currentTokens.size < 5 || priorTokens.size < 5) return { score: 0, sharedTerms: [] };

  const sharedTerms = [...currentTokens].filter((token) => priorTokens.has(token));
  const containment = sharedTerms.length / Math.min(currentTokens.size, priorTokens.size);
  const union = new Set([...currentTokens, ...priorTokens]).size;
  const jaccard = union > 0 ? sharedTerms.length / union : 0;
  const score = Math.min(1, containment * 0.72 + jaccard * 0.28);
  return { score, sharedTerms };
}

export function rankPriorRetellings(
  message: string,
  rows: PriorMessageRow[],
  options: { currentMessageId?: string; limit?: number; threshold?: number } = {},
): PriorRetellingCandidate[] {
  const threshold = options.threshold ?? 0.42;
  const limit = Math.max(1, Math.min(options.limit ?? 3, 5));

  return rows
    .filter((row) => row.id !== options.currentMessageId)
    .map((row) => {
      const similarity = scoreRetellingSimilarity(message, row.content);
      return {
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        sessionId: row.session_id,
        similarity: similarity.score,
        sharedTerms: similarity.sharedTerms,
      };
    })
    .filter((candidate) => candidate.similarity >= threshold && candidate.sharedTerms.length >= 5)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

export async function retrievePriorRetellings(
  userId: string,
  message: string,
  currentMessageId?: string,
): Promise<PriorRetellingCandidate[]> {
  if (!isRetellingRecallMessage(message)) return [];

  try {
    let query = supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, session_id')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(250);
    if (currentMessageId) query = query.neq('id', currentMessageId);
    const { data, error } = await query;
    if (error) throw error;
    return rankPriorRetellings(message, (data ?? []) as PriorMessageRow[], {
      currentMessageId,
    });
  } catch (error) {
    logger.warn({ error, userId }, 'Retelling recall lookup failed');
    return [];
  }
}

export function buildRetellingRecallBlock(
  message: string,
  candidates: PriorRetellingCandidate[],
): string | null {
  if (!isRetellingRecallMessage(message)) return null;
  if (candidates.length === 0) {
    return [
      '**RETELLING VERIFICATION**',
      'The user says this is a repeated story, but no sufficiently similar prior user record was retrieved.',
      'Do not claim you remember an earlier telling. Say that you recognize the story in the current message but cannot verify a prior copy yet.',
      'Do not infer participation, attendance, performance, or other facts the user did not state.',
    ].join('\n');
  }

  const evidence = candidates.map((candidate, index) => {
    const preview = candidate.content.replace(/\s+/g, ' ').trim().slice(0, 420);
    return `${index + 1}. ${candidate.createdAt} [message=${candidate.id} | similarity=${candidate.similarity.toFixed(2)}] ${preview}`;
  });
  return [
    '**RETELLING VERIFICATION — MATCHED PRIOR USER RECORDS**',
    'Acknowledge this as the same story only because the evidence below matched.',
    'Briefly name the shared beats, then identify only genuinely new or corrected details.',
    'Do not infer participation, attendance, performance, or other facts the user did not state.',
    ...evidence,
  ].join('\n');
}
