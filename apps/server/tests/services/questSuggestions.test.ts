/**
 * Quest suggestions recovery (Sprint T)
 *
 * `getQuestSuggestions` previously returned `[]` unconditionally — the Quest
 * Suggestions surface was permanently empty. This locks in the
 * smallest-viable replacement: derive suggestions from active goals that
 * aren't yet tracked as quests (no LLM call, no new extraction pipeline —
 * just existing structured data: goals + quests).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGoals: any[] = [];

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockGoals, error: null }),
    })),
  },
}));

vi.mock('../../src/services/quests/questStorage', () => ({
  questStorage: {
    getQuests: vi.fn(),
    saveQuest: vi.fn(async (quest: any) => quest),
    saveHistoryEvent: vi.fn(async (event: any) => event),
  },
}));

import { questStorage } from '../../src/services/quests/questStorage';
import { QuestService } from '../../src/services/quests/questService';

describe('QuestService.getQuestSuggestions — smallest-viable recovery (Sprint T)', () => {
  let questService: QuestService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGoals.length = 0;
    questService = new QuestService();
  });

  it('returns [] when the user has no active goals', async () => {
    vi.mocked(questStorage.getQuests).mockResolvedValue([]);

    const suggestions = await questService.getQuestSuggestions('user-1');

    expect(suggestions).toEqual([]);
  });

  it('suggests an active goal that has no linked or matching quest', async () => {
    mockGoals.push({
      id: 'goal-1',
      title: 'Run a marathon',
      description: 'Train for and complete a full marathon',
      status: 'ACTIVE',
      goal_type: 'PERSONAL',
    });
    vi.mocked(questStorage.getQuests).mockResolvedValue([]);

    const suggestions = await questService.getQuestSuggestions('user-1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      title: 'Run a marathon',
      quest_type: 'main',
      confidence: 0.6,
    });
    expect(suggestions[0].reasoning).toContain('Run a marathon');
  });

  it('does not suggest a goal already linked to a quest via related_goal_id', async () => {
    mockGoals.push({
      id: 'goal-1',
      title: 'Run a marathon',
      description: 'Train for and complete a full marathon',
      status: 'ACTIVE',
      goal_type: 'PERSONAL',
    });
    vi.mocked(questStorage.getQuests).mockResolvedValue([
      { id: 'quest-1', title: 'Marathon training quest', related_goal_id: 'goal-1' } as any,
    ]);

    const suggestions = await questService.getQuestSuggestions('user-1');

    expect(suggestions).toEqual([]);
  });

  it('does not suggest a goal whose title already matches an existing quest (pre-link era data)', async () => {
    mockGoals.push({
      id: 'goal-1',
      title: 'Run a marathon',
      description: null,
      status: 'ACTIVE',
      goal_type: 'PERSONAL',
    });
    vi.mocked(questStorage.getQuests).mockResolvedValue([
      { id: 'quest-1', title: 'run a marathon', related_goal_id: undefined } as any,
    ]);

    const suggestions = await questService.getQuestSuggestions('user-1');

    expect(suggestions).toEqual([]);
  });

  it('maps non-PERSONAL/CAREER goal types to side quests', async () => {
    mockGoals.push({
      id: 'goal-2',
      title: 'Read 12 books this year',
      description: null,
      status: 'ACTIVE',
      goal_type: 'LEARNING',
    });
    vi.mocked(questStorage.getQuests).mockResolvedValue([]);

    const suggestions = await questService.getQuestSuggestions('user-1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].quest_type).toBe('side');
  });
});
