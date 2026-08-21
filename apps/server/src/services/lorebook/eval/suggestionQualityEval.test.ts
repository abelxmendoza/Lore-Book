import { describe, expect, it } from 'vitest';
import { EXPECTED_CANON, EVAL_DOCUMENTS, allEvalCandidates } from './suggestionEvalCorpus';
import { CANDIDATE_OUTCOMES, CLEANUP_OUTCOMES } from './suggestionQualityMetrics';

describe('suggestion quality eval harness', () => {
  it('uses only synthetic fixtures and a complete outcome vocabulary', () => {
    const blob = JSON.stringify({ EXPECTED_CANON, EVAL_DOCUMENTS });
    expect(blob).not.toMatch(/abelxmendoza|firefistabel|789bd607|Ashley De La Cruz|Armstrong Robotics|Building LoreBook/i);
    expect(allEvalCandidates().length).toBeGreaterThan(20);
    expect(CANDIDATE_OUTCOMES).toContain('ATTACHED_EXISTING');
    expect(CLEANUP_OUTCOMES).toContain('DUPLICATE_CARD_CREATED');
  });

  it('requires expectedCanonId for create/attach/merge outcomes', () => {
    const identityOutcomes = new Set(['CREATED_NEW', 'ATTACHED_EXISTING', 'MERGED', 'MERGE_MEMORY_ATTACH']);
    const missing = allEvalCandidates().filter(
      (candidate) =>
        (identityOutcomes.has(candidate.expectedFirstPass) || identityOutcomes.has(candidate.expectedSecondPass)) &&
        !candidate.expectedCanonId,
    );
    expect(missing.map((row) => row.id)).toEqual([]);

    const dangling = allEvalCandidates().filter(
      (candidate) => candidate.expectedCanonId && !EXPECTED_CANON.some((entity) => entity.conceptId === candidate.expectedCanonId),
    );
    expect(dangling.map((row) => row.id)).toEqual([]);
  });
});
