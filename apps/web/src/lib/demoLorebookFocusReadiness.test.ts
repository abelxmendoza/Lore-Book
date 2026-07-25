import { beforeEach, describe, expect, it } from 'vitest';

import type { Character } from '../components/characters/CharacterProfileCard';
import { mockDataService } from '../services/mockDataService';
import { demoLorebookFocusReadiness } from './demoLorebookFocusReadiness';

const character: Character = {
  id: 'demo-marcus',
  name: 'Marcus',
  memory_count: 18,
  direct_memory_count: 12,
};

describe('Demo Mode subject capacity', () => {
  beforeEach(() => {
    mockDataService.register.characters([character]);
  });

  it('uses the selected character profile instead of global demo totals', () => {
    const evaluation = demoLorebookFocusReadiness({
      id: character.id,
      type: 'person',
      name: character.name,
    });

    expect(evaluation?.atomCount).toBe(character.memory_count);
    expect(evaluation?.wordCount).toBe((character.memory_count ?? 0) * 180);
  });
});
