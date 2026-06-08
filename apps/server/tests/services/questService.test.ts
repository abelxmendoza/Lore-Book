/**
 * Quest provenance regression (Sprint S — quest surface recovery)
 *
 * Locks in the rule: `createQuest` must preserve the `source` the caller
 * provides (e.g. 'extracted' from chat ingestion, 'imported' from
 * questLinker conversions) and only default to 'manual' when the caller
 * supplies none. Before this fix, `source` was hardcoded to 'manual',
 * silently destroying provenance for every auto-detected/imported quest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/quests/questStorage', () => ({
  questStorage: {
    saveQuest: vi.fn(async (quest: any) => quest),
    saveHistoryEvent: vi.fn(async (event: any) => event),
  },
}));

import { questStorage } from '../../src/services/quests/questStorage';
import { QuestService } from '../../src/services/quests/questService';

describe('QuestService.createQuest — source provenance (Sprint S)', () => {
  let questService: QuestService;

  beforeEach(() => {
    vi.clearAllMocks();
    questService = new QuestService();
  });

  it('preserves source: "extracted" when supplied by chat-ingestion auto-detection', async () => {
    await questService.createQuest('user-1', {
      title: 'Finish the marathon training plan',
      quest_type: 'main',
      source: 'extracted',
    });

    const savedQuest = vi.mocked(questStorage.saveQuest).mock.calls[0][0];
    expect(savedQuest.source).toBe('extracted');
  });

  it('preserves source: "imported" when supplied by questLinker conversions', async () => {
    await questService.createQuest('user-1', {
      title: 'Ship the Q3 roadmap',
      quest_type: 'side',
      source: 'imported',
    });

    const savedQuest = vi.mocked(questStorage.saveQuest).mock.calls[0][0];
    expect(savedQuest.source).toBe('imported');
  });

  it('defaults to "manual" only when the caller supplies no source', async () => {
    await questService.createQuest('user-1', {
      title: 'Learn to cook pasta from scratch',
      quest_type: 'side',
    });

    const savedQuest = vi.mocked(questStorage.saveQuest).mock.calls[0][0];
    expect(savedQuest.source).toBe('manual');
  });

  it('does not coerce a non-manual source into "manual" (no silent overwrite)', async () => {
    await questService.createQuest('user-1', {
      title: 'Suggested: revisit the budget plan',
      quest_type: 'daily',
      source: 'suggested',
    });

    const savedQuest = vi.mocked(questStorage.saveQuest).mock.calls[0][0];
    expect(savedQuest.source).not.toBe('manual');
    expect(savedQuest.source).toBe('suggested');
  });
});
