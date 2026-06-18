import { describe, expect, it } from 'vitest';

import {
  characterCreationActionFromCore,
  characterToResolutionCandidate,
  compareCharacterCreationDecisions,
} from '../../src/services/entities/entityResolutionBridge';
import { resolveMention } from '../../src/services/entities/entityResolutionCore';

describe('entityResolutionBridge character creation', () => {
  it('maps auto_resolve to merge action', () => {
    const candidates = [
      characterToResolutionCandidate({
        id: 'c1',
        name: 'Neon Pulsedad',
        alias: ['Juan / Neon Pulsedad'],
        metadata: {},
      }),
    ];
    const result = resolveMention('Neon Pulsedad', candidates);
    expect(characterCreationActionFromCore(result)).toBe('merge');
  });

  it('records shadow disagreement between legacy and core', () => {
    const comparison = compareCharacterCreationDecisions(
      'Juan',
      'merge',
      'create',
      'create_separate'
    );
    expect(comparison.agreement).toBe(false);
  });
});
