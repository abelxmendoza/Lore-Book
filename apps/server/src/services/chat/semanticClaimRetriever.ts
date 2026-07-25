import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { supabaseAdmin } from '../supabaseClient';

export const SEMANTIC_RECALL_THRESHOLD = 0.68;
const DEFAULT_MATCH_COUNT = 5;

export type SemanticClaimCandidate = {
  id: string;
  entity_id: string;
  text: string;
  confidence: number;
  similarity: number;
};

type SemanticClaimMatch = (
  embedding: number[],
  userId: string,
  threshold: number,
  limit: number,
) => Promise<SemanticClaimCandidate[]>;

function semanticRecallEnabled(): boolean {
  if (process.env.WMA_SEMANTIC_RECALL === 'off') return false;
  if (process.env.NODE_ENV === 'test') return false;
  return Boolean(process.env.OPENAI_API_KEY || process.env.LLM_EMBEDDING_PROVIDER);
}

const defaultMatch: SemanticClaimMatch = async (embedding, userId, threshold, limit) => {
  const { data, error } = await supabaseAdmin.rpc('match_omega_claims', {
    query_embedding: `[${embedding.join(',')}]`,
    user_id_param: userId,
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) throw error;
  return (data ?? []) as SemanticClaimCandidate[];
};

/**
 * Semantic recall boost for Working Memory.
 *
 * Structured retrieval remains authoritative. This adds a small set of
 * paraphrase-friendly canon candidates that still pass through WMA ranking,
 * deduplication, and the shared item budget.
 */
export async function retrieveSemanticClaimCandidates(
  question: string,
  userId: string,
  options: {
    enabled?: boolean;
    threshold?: number;
    limit?: number;
    embed?: (text: string) => Promise<number[]>;
    match?: SemanticClaimMatch;
  } = {},
): Promise<SemanticClaimCandidate[]> {
  const enabled = options.enabled ?? semanticRecallEnabled();
  const cleaned = question.trim();
  if (!enabled || !userId || cleaned.length < 8) return [];

  try {
    const embedding = await (options.embed ?? ((text) => embeddingService.embedText(text)))(cleaned);
    if (!embedding.length) return [];
    const threshold = options.threshold ?? SEMANTIC_RECALL_THRESHOLD;
    const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_MATCH_COUNT, 10));
    const rows = await (options.match ?? defaultMatch)(embedding, userId, threshold, limit);
    return rows
      .filter((row) => row.similarity >= threshold && row.text.trim().length > 0)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, limit);
  } catch (error) {
    logger.warn({ error, userId }, 'Working Memory semantic claim retrieval failed');
    return [];
  }
}
