import { describe, it, expect } from 'vitest';
import {
  isSelfCharacterRow,
  scoreFocusSubgraph,
  passesQualityGate,
  formatSignalLine,
  FOCUS_MIN_WORDS,
} from '../../../src/services/loreReadiness/focusCandidates';

describe('focusCandidates', () => {
  it('excludes self character rows from person foci', () => {
    expect(isSelfCharacterRow({ name: 'Me', metadata: { is_self: true } })).toBe(true);
    expect(isSelfCharacterRow({ name: 'Myself', metadata: {} })).toBe(true);
    expect(isSelfCharacterRow({ name: 'Marcus', metadata: {} })).toBe(false);
    expect(
      isSelfCharacterRow({ name: 'You', metadata: { distinct_from_self: true } })
    ).toBe(false);
  });

  it('scores richer subgraphs higher', () => {
    const thin = scoreFocusSubgraph(
      {
        atomCount: 2,
        wordCount: 80,
        entryCount: 1,
        meaningClusters: 1,
        threadLinks: 0,
        evidenceFacts: 0,
      },
      { atoms: 8, entries: 5 }
    );
    const rich = scoreFocusSubgraph(
      {
        atomCount: 20,
        wordCount: 2400,
        entryCount: 12,
        meaningClusters: 6,
        threadLinks: 4,
        evidenceFacts: 3,
      },
      { atoms: 8, entries: 5 }
    );
    expect(rich).toBeGreaterThan(thin);
    expect(rich).toBeGreaterThan(0.7);
  });

  it('quality gate requires words or dense atoms', () => {
    expect(
      passesQualityGate(0.5, {
        atomCount: 2,
        wordCount: 50,
        entryCount: 1,
        meaningClusters: 1,
        threadLinks: 0,
        evidenceFacts: 0,
      })
    ).toBe(false);

    expect(
      passesQualityGate(0.5, {
        atomCount: 6,
        wordCount: FOCUS_MIN_WORDS,
        entryCount: 4,
        meaningClusters: 3,
        threadLinks: 2,
        evidenceFacts: 1,
      })
    ).toBe(true);
  });

  it('formats human signal lines', () => {
    expect(
      formatSignalLine({
        atomCount: 12,
        wordCount: 2400,
        entryCount: 8,
        meaningClusters: 3,
        threadLinks: 2,
        evidenceFacts: 1,
      })
    ).toMatch(/2\.4k words/);
  });
});
