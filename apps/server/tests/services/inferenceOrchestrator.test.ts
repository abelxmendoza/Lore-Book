import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferenceOrchestrator } from '../../src/services/inference/inferenceOrchestrator';
import { invalidateStoryEvidenceCache } from '../../src/services/inference/evidenceService';

vi.mock('../../src/services/inference/inferenceStateService', () => ({
  getInferenceState: vi.fn().mockResolvedValue({
    user_id: 'u1',
    last_chat_at: null,
    last_t1_run_at: null,
    last_t2_run_at: null,
    pending_reasons: [],
    domain_timestamps: {},
    last_report: null,
    updated_at: new Date().toISOString(),
  }),
  saveInferenceState: vi.fn().mockResolvedValue(undefined),
  clearPendingReasons: vi.fn().mockResolvedValue(undefined),
  noteInferenceActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/locationNormalizationService', () => ({
  locationNormalizationService: {
    normalizeUserLocations: vi.fn().mockResolvedValue({ processed: 1, schemaReady: true }),
  },
}));

vi.mock('../../src/services/organizationNormalizationService', () => ({
  organizationNormalizationService: {
    normalizeUserOrganizations: vi.fn().mockResolvedValue({ processed: 1, schemaReady: true }),
  },
}));

vi.mock('../../src/services/publicFigure/publicFigureRelationshipService', () => ({
  publicFigureRelationshipService: {
    inferForUser: vi.fn().mockResolvedValue({ publicFigures: 0, updated: 0 }),
  },
}));

vi.mock('../../src/services/socialStandingService', () => ({
  socialStandingService: { recompute: vi.fn().mockResolvedValue({ updated: 1 }) },
}));

vi.mock('../../src/services/characters/characterImportanceService', () => ({
  scoreAllCharactersForUser: vi.fn().mockResolvedValue({ scored: 1 }),
}));

vi.mock('../../src/services/conversationCentered/graphRecoveryTrigger', () => ({
  graphRecoveryTrigger: {
    runNow: vi.fn().mockResolvedValue({
      changed: false,
      relationships: { created: 0 },
      events: { created: 0 },
    }),
  },
}));

vi.mock('../../src/services/achievements/achievementService', () => ({
  achievementService: {
    checkAchievements: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/services/essenceProfileService', () => ({
  essenceProfileService: {
    extractEssence: vi.fn().mockResolvedValue({ hopes: [{ text: 'grow' }] }),
    updateProfile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/services/memoryService', () => ({
  memoryService: {
    searchEntries: vi.fn().mockResolvedValue([
      { content: 'a', date: '2026-01-01' },
      { content: 'b', date: '2026-01-02' },
      { content: 'c', date: '2026-01-03' },
      { content: 'd', date: '2026-01-04' },
      { content: 'e', date: '2026-01-05' },
    ]),
  },
}));

vi.mock('../../src/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

describe('inferenceOrchestrator.sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateStoryEvidenceCache();
  });

  it('runs T1 domain pipeline in order', async () => {
    const report = await inferenceOrchestrator.sync('u1', { tier: 't1', force: true });
    expect(report.tier).toBe('t1');
    expect(report.ran).toEqual([
      'graph_recovery',
      'locations',
      'organizations',
      'public_figures',
      'social_standing',
      'character_importance',
      'achievements_check',
      'projects_suggestions',
      'skills_suggestions',
      'quests_suggestions',
    ]);
    expect(report.skipped).toEqual([]);
  });

  it('can limit to specific domains', async () => {
    const report = await inferenceOrchestrator.sync('u1', {
      tier: 't1',
      force: true,
      domains: ['locations', 'organizations'],
    });
    expect(report.ran).toEqual(['locations', 'organizations']);
  });

  it('runs essence_profile on T2 when enough entries exist', async () => {
    const { essenceProfileService } = await import('../../src/services/essenceProfileService');
    const report = await inferenceOrchestrator.sync('u1', {
      tier: 't2',
      force: true,
      domains: ['essence_profile'],
    });
    expect(report.ran).toEqual(['essence_profile']);
    expect(essenceProfileService.extractEssence).toHaveBeenCalled();
    expect(essenceProfileService.updateProfile).toHaveBeenCalled();
  });

  it('checks achievements on T1', async () => {
    const { achievementService } = await import('../../src/services/achievements/achievementService');
    await inferenceOrchestrator.sync('u1', {
      tier: 't1',
      force: true,
      domains: ['achievements_check'],
    });
    expect(achievementService.checkAchievements).toHaveBeenCalledWith('u1');
  });
});
