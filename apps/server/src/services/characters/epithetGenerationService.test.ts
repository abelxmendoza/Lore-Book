import { describe, expect, it } from 'vitest';
import {
  shouldAttemptEpithetGeneration,
  suggestEpithetFromCorpus,
} from './epithetGenerationService';

describe('epithetGenerationService', () => {
  it('suggests Hallway Guardian from recurring cleaning habits', () => {
    const suggestion = suggestEpithetFromCorpus(
      'Aunt Maribel is cleaning the hallways like she always does every Friday morning.',
    );
    expect(suggestion).toMatchObject({
      epithet: 'Hallway Guardian',
      evidence: { source: 'story_heuristic' },
    });
  });

  it('suggests Card Table Rival from Magic the Gathering context', () => {
    const suggestion = suggestEpithetFromCorpus(
      'James was in the room playing Magic the Gathering while everyone else coded.',
    );
    expect(suggestion?.epithet).toBe('Card Table Rival');
  });

  it('skips generation when pinned or disabled', () => {
    expect(shouldAttemptEpithetGeneration({ epithet_pinned: true })).toBe(false);
    expect(shouldAttemptEpithetGeneration({ epithet_disabled: true })).toBe(false);
    expect(shouldAttemptEpithetGeneration({ epithet: 'Hallway Guardian' })).toBe(false);
    expect(shouldAttemptEpithetGeneration({})).toBe(true);
  });
});
