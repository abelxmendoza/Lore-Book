import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import type { GroundedClaim, SourceMessageWitness } from './responseCompilerTypes';

/**
 * Semantic grounding layer for the Response Compiler.
 *
 * The heuristic groundingChecker matches assistant claims to user witnesses by
 * token overlap, which misses paraphrase: "attended Whittier" vs "went to
 * Whittier", "closest friend" vs "we were really tight". This layer embeds the
 * claim and the witness messages (`text-embedding-3-small`, via the cached
 * embeddingService) and compares them by cosine similarity.
 *
 * Discipline, by design:
 *  - It only ever *upgrades* `unsupported → inferred` and attaches provenance.
 *    It never fabricates `grounded` (assistant statements don't create truth;
 *    semantic similarity is relatedness, not entailment).
 *  - It only embeds claims the heuristic couldn't ground, capped, so a typical
 *    message costs a handful of cache-friendly embed calls — respecting this
 *    codebase's cost posture.
 *  - It degrades to a no-op on any failure, when disabled, or under test, so
 *    the pure compile path stays deterministic and offline.
 */

const IS_TEST_ENV = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

/** Kill-switch: set RESPONSE_COMPILER_SEMANTIC=0 to disable the embed layer. */
export function isSemanticGroundingEnabled(): boolean {
  if (IS_TEST_ENV) return false;
  return process.env.RESPONSE_COMPILER_SEMANTIC !== '0';
}

// Cosine over short texts with text-embedding-3-small: ~0.78 reliably indicates
// the same referent/topic; below that the relation is too loose to call evidence.
export const SEMANTIC_RELATED_THRESHOLD = 0.78;
const MAX_CLAIMS_TO_EMBED = 8;
const MAX_WITNESSES_TO_EMBED = 12;

export type Embedder = (text: string) => Promise<number[]>;

export type SemanticMatch = {
  witnessId: string;
  quote: string;
  score: number;
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function needsSemanticHelp(claim: GroundedClaim): boolean {
  if (claim.grounding === 'unsupported') return true;
  // Inferred claims with no provenance yet can still gain a traceable witness.
  if (claim.grounding === 'inferred' && !claim.provenance) return true;
  return false;
}

function snippet(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * Find semantic evidence for claims the heuristic left unsupported/unbound.
 * Returns a map of claimId → best witness match above threshold.
 * `embed` is injectable so unit tests can run without network access.
 */
export async function findSemanticEvidence(
  claims: GroundedClaim[],
  witnesses: SourceMessageWitness[],
  opts: { embed?: Embedder; enabled?: boolean } = {},
): Promise<Map<string, SemanticMatch>> {
  const enabled = opts.enabled ?? isSemanticGroundingEnabled();
  const matches = new Map<string, SemanticMatch>();
  if (!enabled) return matches;

  const embed = opts.embed ?? ((t: string) => embeddingService.embedText(t));

  const targets = claims.filter(needsSemanticHelp).slice(0, MAX_CLAIMS_TO_EMBED);
  const userWitnesses = witnesses
    .filter((w) => w.role === 'user' && w.content.trim().length > 0)
    .slice(-MAX_WITNESSES_TO_EMBED);

  if (targets.length === 0 || userWitnesses.length === 0) return matches;

  try {
    const [claimVecs, witnessVecs] = await Promise.all([
      Promise.all(targets.map((c) => embed(c.claim))),
      Promise.all(userWitnesses.map((w) => embed(w.content))),
    ]);

    targets.forEach((claim, ci) => {
      const claimVec = claimVecs[ci];
      if (!claimVec || claimVec.length === 0) return;

      let best: SemanticMatch | null = null;
      userWitnesses.forEach((witness, wi) => {
        const score = cosineSimilarity(claimVec, witnessVecs[wi]);
        if (score >= SEMANTIC_RELATED_THRESHOLD && (!best || score > best.score)) {
          best = { witnessId: witness.id, quote: snippet(witness.content), score };
        }
      });

      if (best) matches.set(claim.id, best);
    });
  } catch (err) {
    logger.warn({ err }, 'semanticGroundingChecker: embed failed — heuristic grounding unchanged');
    return new Map();
  }

  return matches;
}

/**
 * Apply semantic matches to claims, upgrading unsupported → inferred and
 * attaching witness-backed provenance. Pure and synchronous; never downgrades.
 */
export function applySemanticMatches(
  claims: GroundedClaim[],
  matches: Map<string, SemanticMatch>,
): GroundedClaim[] {
  if (matches.size === 0) return claims;

  return claims.map((claim) => {
    const match = matches.get(claim.id);
    if (!match) return claim;

    const entities = claim.claim.match(/\b([A-Z][a-z]{2,})\b/g) ?? [];
    return {
      ...claim,
      // Relatedness is evidence of relevance, not literal truth — cap at inferred.
      grounding: claim.grounding === 'unsupported' ? 'inferred' : claim.grounding,
      provenance: claim.provenance ?? {
        sourceMessageIds: [match.witnessId],
        sourceQuotes: [match.quote],
        sourceEntities: [...new Set(entities)],
        parserFrames: [],
        confidence: Math.round(match.score * 100) / 100,
      },
    };
  });
}
