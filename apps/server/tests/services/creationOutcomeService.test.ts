import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/services/characterRegistry', () => ({
  characterRegistry: {
    classifyForCreation: vi.fn(),
  },
}));

vi.mock('../../src/services/entityAmbiguityService', () => ({
  entityAmbiguityService: {
    extractEntityMentions: vi.fn(),
  },
}));

import { characterRegistry } from '../../src/services/characterRegistry';
import { entityAmbiguityService } from '../../src/services/entityAmbiguityService';
import {
  collectCreationOutcomesForMessage,
  summarizeCreationOutcomes,
  classifyCreationMentionDomain,
} from '../../src/services/creationOutcomeService';

describe('creationOutcomeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps classify decisions to creation outcomes', async () => {
    vi.mocked(entityAmbiguityService.extractEntityMentions).mockReturnValue([
      { text: 'Tío Rafa', start_index: 0, end_index: 8, confidence: 0.6 },
    ]);
    vi.mocked(characterRegistry.classifyForCreation).mockResolvedValue({
      action: 'create',
      cleanName: 'Tío Rafa',
    });

    const outcomes = await collectCreationOutcomesForMessage('user-1', 'Remember Tío Rafa');
    expect(outcomes).toEqual([
      expect.objectContaining({ mention: 'Tío Rafa', action: 'create' }),
    ]);
  });

  it('summarizes outcomes for chat metadata', () => {
    const summary = summarizeCreationOutcomes([
      { mention: 'Jerry', action: 'create', authority: 'core' },
      { mention: 'Ashley', action: 'merge', entityName: 'Ashley M.', authority: 'core' },
    ]);
    expect(summary).toContain('Jerry');
    expect(summary).toContain('Ashley');
    expect(summary).not.toContain('started a record');
  });

  it('routes a stage name, event, music works, and tools away from person creation', () => {
    const story =
      'Ska Horizon is coming up and it is the biggest ska show of the year. ' +
      'My new stage name is Night Signal. I generated tracks with Suno and they are called ' +
      '"Glass Harbor" and "Static Rooms".';
    expect(classifyCreationMentionDomain('Night Signal', story)).toBe('self_alias');
    expect(classifyCreationMentionDomain('Ska Horizon', story)).toBe('event');
    expect(classifyCreationMentionDomain('Suno', story)).toBe('tool');
    expect(classifyCreationMentionDomain('Glass Harbor', story)).toBe('media');
    expect(classifyCreationMentionDomain('Static Rooms', story)).toBe('media');
  });

  it('routes a business/brand suffix name to organization, not person', () => {
    const story = 'East Los Productions is throwing the show downtown next week.';
    expect(classifyCreationMentionDomain('East Los Productions', story)).toBe('organization');
  });

  it('does not misroute an occupation phrase ("show promoter") to event', () => {
    const story = 'Ink is a show promoter who books the downtown venue.';
    expect(classifyCreationMentionDomain('Ink', story)).toBeNull();
  });

  it('skips bare pronoun mentions entirely — no outcome emitted, no classifyForCreation call', async () => {
    vi.mocked(entityAmbiguityService.extractEntityMentions).mockReturnValue([
      { text: 'They', start_index: 0, end_index: 4, confidence: 0.6 },
    ]);

    const outcomes = await collectCreationOutcomesForMessage('user-1', 'They went to the show.');
    expect(outcomes).toEqual([]);
    expect(characterRegistry.classifyForCreation).not.toHaveBeenCalled();
  });
});
