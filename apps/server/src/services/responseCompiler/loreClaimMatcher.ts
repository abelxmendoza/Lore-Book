import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { supabaseAdmin } from '../supabaseClient';
import type { GroundedClaim } from './responseCompilerTypes';
import {
  isSemanticGroundingEnabled,
  SEMANTIC_RELATED_THRESHOLD,
  type Embedder,
  type SemanticMatch,
} from './semanticGroundingChecker';

/**
 * Whole-lore grounding for the Response Compiler.
 *
 * The witness-based semantic layer (semanticGroundingChecker) only compares an
 * assistant claim to the *current thread's* user messages. This layer compares
 * it to the user's ENTIRE established canon — the `omega_claims` table — via the
 * `match_omega_claims` RPC (vector search over stored claim embeddings, HNSW
 * indexed). So "Bryan was in your band" can be grounded even when the supporting
 * message lives in a conversation from months ago.
 *
 * Stored canon claims are themselves user-originated evidence, so matching to
 * one is legitimate grounding. We still cap the result at `inferred` (handled by
 * applySemanticMatches): cosine relatedness means "the lore supports something
 * very close to this", not literal restatement — consistent with the rule that
 * assistant output never fabricates `grounded` truth on its own.
 *
 * Cost posture: only claims the heuristic + witness pass left unbound are
 * embedded (capped), embeddings are cache-backed, and the match is a single
 * indexed RPC per claim. Disabled under test + the RESPONSE_COMPILER_SEMANTIC
 * kill-switch via isSemanticGroundingEnabled().
 */

const MAX_CLAIMS_TO_MATCH = 8;
const MATCH_COUNT = 3;

export type LoreClaimRow = {
  id: string;
  entity_id: string;
  text: string;
  confidence: number;
  similarity: number;
};

export type LoreClaimMatcher = (embedding: number[], userId: string) => Promise<LoreClaimRow[]>;

const defaultMatcher: LoreClaimMatcher = async (embedding, userId) => {
  const { data, error } = await supabaseAdmin.rpc('match_omega_claims', {
    query_embedding: `[${embedding.join(',')}]`,
    user_id_param: userId,
    match_threshold: SEMANTIC_RELATED_THRESHOLD,
    match_count: MATCH_COUNT,
  });
  if (error) {
    logger.warn({ err: error, userId }, 'loreClaimMatcher: match_omega_claims RPC failed');
    return [];
  }
  return (data ?? []) as LoreClaimRow[];
};

function needsLoreHelp(claim: GroundedClaim): boolean {
  if (claim.grounding === 'unsupported') return true;
  if (claim.grounding === 'inferred' && !claim.provenance) return true;
  return false;
}

function snippet(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * Find canon-claim evidence for claims still unbound after the witness pass.
 * `embed` and `match` are injectable so unit tests run without network/DB.
 */
export async function findLoreEvidence(
  claims: GroundedClaim[],
  userId: string,
  opts: { embed?: Embedder; match?: LoreClaimMatcher; enabled?: boolean } = {},
): Promise<Map<string, SemanticMatch>> {
  const enabled = opts.enabled ?? isSemanticGroundingEnabled();
  const out = new Map<string, SemanticMatch>();
  if (!enabled || !userId) return out;

  const embed = opts.embed ?? ((t: string) => embeddingService.embedText(t));
  const match = opts.match ?? defaultMatcher;

  const targets = claims.filter(needsLoreHelp).slice(0, MAX_CLAIMS_TO_MATCH);
  if (targets.length === 0) return out;

  try {
    await Promise.all(
      targets.map(async (claim) => {
        const vec = await embed(claim.claim);
        if (!vec || vec.length === 0) return;

        const rows = await match(vec, userId);
        const best = rows
          .filter((r) => r.similarity >= SEMANTIC_RELATED_THRESHOLD)
          .sort((a, b) => b.similarity - a.similarity)[0];

        if (best) {
          out.set(claim.id, {
            // Prefixed so provenance consumers can tell canon evidence from a
            // raw message id.
            witnessId: `omega_claim:${best.id}`,
            quote: snippet(best.text),
            score: Math.round(best.similarity * 100) / 100,
          });
        }
      }),
    );
  } catch (err) {
    logger.warn({ err, userId }, 'loreClaimMatcher: lore grounding failed — leaving claims unbound');
    return new Map();
  }

  return out;
}
