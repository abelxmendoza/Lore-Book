import { describe, it, expect } from 'vitest';
import { extractAssistantClaims } from '../../../src/services/responseCompiler/assistantClaimExtractor';
import { groundClaims } from '../../../src/services/responseCompiler/groundingChecker';
import { applySemanticMatches } from '../../../src/services/responseCompiler/semanticGroundingChecker';
import {
  findLoreEvidence,
  type LoreClaimMatcher,
  type LoreClaimRow,
} from '../../../src/services/responseCompiler/loreClaimMatcher';

const NO_WITNESS: never[] = [];

// Fake embedder — content is irrelevant since the matcher is also injected.
const embed = async () => [1, 0, 0, 0];

describe('loreClaimMatcher (whole-lore grounding)', () => {
  it('grounds an unsupported claim against a canon claim match', async () => {
    const claims = groundClaims(
      extractAssistantClaims('Bryan became a professional musician.'),
      NO_WITNESS,
    );
    expect(claims.some((c) => c.grounding === 'unsupported')).toBe(true);

    const match: LoreClaimMatcher = async (): Promise<LoreClaimRow[]> => [
      { id: 'claim-9', entity_id: 'ent-1', text: 'Bryan plays in a band', confidence: 0.9, similarity: 0.83 },
    ];

    const matches = await findLoreEvidence(claims, 'user-1', { embed, match, enabled: true });
    expect(matches.size).toBeGreaterThan(0);

    const upgraded = applySemanticMatches(claims, matches);
    const rescued = upgraded.find((c) => c.grounding === 'inferred' && c.provenance);
    expect(rescued).toBeDefined();
    expect(rescued?.provenance?.sourceMessageIds[0]).toMatch(/^omega_claim:claim-9$/);
    expect(rescued?.provenance?.sourceQuotes[0]).toContain('Bryan plays in a band');
  });

  it('ignores canon matches below the relatedness threshold', async () => {
    const claims = groundClaims(
      extractAssistantClaims('Bryan became a professional musician.'),
      NO_WITNESS,
    );
    const match: LoreClaimMatcher = async () => [
      { id: 'claim-5', entity_id: 'ent-1', text: 'Unrelated fact', confidence: 0.9, similarity: 0.4 },
    ];
    const matches = await findLoreEvidence(claims, 'user-1', { embed, match, enabled: true });
    expect(matches.size).toBe(0);
  });

  it('is a no-op without a userId or when disabled', async () => {
    const claims = groundClaims(extractAssistantClaims('Bryan became a musician.'), NO_WITNESS);
    const match: LoreClaimMatcher = async () => [
      { id: 'c', entity_id: 'e', text: 'x', confidence: 1, similarity: 0.99 },
    ];
    expect((await findLoreEvidence(claims, '', { embed, match, enabled: true })).size).toBe(0);
    expect((await findLoreEvidence(claims, 'user-1', { embed, match, enabled: false })).size).toBe(0);
  });
});
