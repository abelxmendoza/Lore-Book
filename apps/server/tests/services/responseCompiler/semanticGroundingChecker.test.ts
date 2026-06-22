import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import { groundClaims } from '../../../src/services/responseCompiler/groundingChecker';
import {
  applySemanticMatches,
  cosineSimilarity,
  findSemanticEvidence,
  SEMANTIC_RELATED_THRESHOLD,
} from '../../../src/services/responseCompiler/semanticGroundingChecker';
import type {
  Embedder,
} from '../../../src/services/responseCompiler/semanticGroundingChecker';
import type { SourceMessageWitness } from '../../../src/services/responseCompiler/responseCompilerTypes';

/**
 * Fake embedder: returns a unit vector whose direction encodes a topic id, so
 * texts sharing a topic score ~1.0 cosine and unrelated topics score ~0. Lets us
 * test the paraphrase-rescue behavior deterministically without the network.
 */
function topicEmbedder(topicOf: (text: string) => number, dims = 8): Embedder {
  return async (text: string) => {
    const vec = new Array(dims).fill(0);
    vec[topicOf(text) % dims] = 1;
    return vec;
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('handles empty / mismatched vectors safely', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });
});

describe('semantic grounding (paraphrase rescue)', () => {
  const witnesses: SourceMessageWitness[] = [
    { id: 'm1', role: 'user', content: 'Me and Bryan were really tight back in the day.' },
  ];

  // The paraphrased witness shares no useful tokens with the claim, so the
  // heuristic leaves the claim inferred with NO provenance — untraceable.
  const RESPONSE = 'Bryan was one of your closest friends.';

  it('attaches witness-backed provenance to an otherwise unbacked claim', async () => {
    const claims = groundClaims(extractAssistantClaims(RESPONSE), witnesses);
    const rel0 = claims.find((c) => c.type === 'relationship_claim');
    expect(rel0?.grounding).toBe('inferred');
    expect(rel0?.provenance).toBeUndefined();

    // Both the claim and the witness map to the same topic id (friendship).
    const embed = topicEmbedder(() => 3);
    const matches = await findSemanticEvidence(claims, witnesses, { embed, enabled: true });
    expect(matches.size).toBeGreaterThan(0);

    const upgraded = applySemanticMatches(claims, matches);
    const rel = upgraded.find((c) => c.type === 'relationship_claim');
    expect(rel?.grounding).toBe('inferred');
    expect(rel?.provenance?.sourceMessageIds).toContain('m1');
    expect(rel?.provenance?.confidence).toBeGreaterThanOrEqual(SEMANTIC_RELATED_THRESHOLD);
  });

  it('upgrades a truly unsupported claim to inferred on a semantic match', () => {
    const unsupported = groundClaims(
      extractAssistantClaims('Bryan became a professional musician.'),
      witnesses,
    );
    expect(unsupported.some((c) => c.grounding === 'unsupported')).toBe(true);

    const target = unsupported.find((c) => c.grounding === 'unsupported')!;
    const matches = new Map([
      [target.id, { witnessId: 'm1', quote: 'Bryan played in a band with me.', score: 0.84 }],
    ]);
    const upgraded = applySemanticMatches(unsupported, matches);
    const after = upgraded.find((c) => c.id === target.id);
    expect(after?.grounding).toBe('inferred');
    expect(after?.provenance?.sourceMessageIds).toContain('m1');
  });

  it('never fabricates grounded truth from semantic similarity', async () => {
    const claims = groundClaims(extractAssistantClaims(RESPONSE), witnesses);
    const embed = topicEmbedder(() => 3);
    const matches = await findSemanticEvidence(claims, witnesses, { embed, enabled: true });
    const upgraded = applySemanticMatches(claims, matches);
    expect(upgraded.every((c) => c.grounding !== 'grounded')).toBe(true);
  });

  it('does not match unrelated witnesses (distinct topics stay below threshold)', async () => {
    const claims = groundClaims(extractAssistantClaims(RESPONSE), witnesses);
    let n = 0;
    const embed = topicEmbedder(() => n++); // every text gets a different topic
    const matches = await findSemanticEvidence(claims, witnesses, { embed, enabled: true });
    expect(matches.size).toBe(0);
  });

  it('is a no-op when disabled', async () => {
    const claims = groundClaims(extractAssistantClaims(RESPONSE), witnesses);
    const embed = topicEmbedder(() => 3);
    const matches = await findSemanticEvidence(claims, witnesses, { embed, enabled: false });
    expect(matches.size).toBe(0);
  });
});
