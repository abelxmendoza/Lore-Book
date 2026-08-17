import { describe, expect, it } from 'vitest';

import { detectExplicitEntityCorrection } from '../../src/services/meaning/entityCorrectionIntent';

describe('explicit entity correction intent', () => {
  it('extracts a reviewable same-entity correction without applying a merge', () => {
    expect(
      detectExplicitEntityCorrection(
        'Correction: Marcus Vale and Vanguard Productions are the same entity.',
      ),
    ).toMatchObject({
      sourceName: 'Marcus Vale',
      targetName: 'Vanguard Productions',
      relation: 'same_entity',
      confidence: 0.98,
    });
  });

  it('supports same-as phrasing', () => {
    expect(detectExplicitEntityCorrection('MemoVault is the same entity as LifeLedger.')).toMatchObject({
      sourceName: 'MemoVault',
      targetName: 'LifeLedger',
    });
  });

  it('does not turn pronouns or ordinary comparisons into merge proposals', () => {
    expect(detectExplicitEntityCorrection('He and they are the same person.')).toBeNull();
    expect(detectExplicitEntityCorrection('Marcus and Jamie attended the same event.')).toBeNull();
  });
});

