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
  });
});
