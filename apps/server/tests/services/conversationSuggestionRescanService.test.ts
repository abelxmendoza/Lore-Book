import { beforeEach, describe, expect, it, vi } from 'vitest';

const locationRescan = vi.fn();
const characterRescan = vi.fn();
const runCorpusParseAndApply = vi.fn();
const omegaBackfill = vi.fn();
const groupRunForUser = vi.fn();
const rescanOrganizationInference = vi.fn();
const extractQuests = vi.fn();
const extractSkillsFromEntry = vi.fn();
const extractProjects = vi.fn();
const romanticRescan = vi.fn();

function chain(data: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => chain([])),
  },
}));

vi.mock('../../src/services/lorebook/parser/loreBookParseCorpusService', () => ({
  runCorpusParseAndApply: (...args: unknown[]) => runCorpusParseAndApply(...args),
}));

vi.mock('../../src/services/locationSuggestionService', () => ({
  locationSuggestionService: {
    rescanFromCorpus: (...args: unknown[]) => locationRescan(...args),
  },
}));

vi.mock('../../src/services/characterConversationRescanService', () => ({
  characterConversationRescanService: {
    rescan: (...args: unknown[]) => characterRescan(...args),
  },
}));

vi.mock('../../src/services/quests/questExtractor', () => ({
  questExtractor: { extractQuests: (...args: unknown[]) => extractQuests(...args) },
}));
vi.mock('../../src/services/quests/questSuggestionService', () => ({
  questSuggestionService: { upsertFromExtraction: vi.fn() },
}));
vi.mock('../../src/services/quests/questStorage', () => ({
  questStorage: { getQuests: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/services/skills/skillExtractionService', () => ({
  skillExtractionService: {
    extractSkillsFromEntry: (...args: unknown[]) => extractSkillsFromEntry(...args),
  },
}));
vi.mock('../../src/services/skills/skillRelationshipService', () => ({
  skillRelationshipService: { resolvePendingParentLinks: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../src/services/skills/skillService', () => ({
  skillService: { getSkills: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/skills/skillSuggestionService', () => ({
  skillSuggestionService: { upsertFromExtraction: vi.fn() },
}));

vi.mock('../../src/services/projects/projectExtractor', () => ({
  projectExtractor: { extractProjects: (...args: unknown[]) => extractProjects(...args) },
}));
vi.mock('../../src/services/projectService', () => ({
  projectService: { listProjects: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/projects/projectSuggestionService', () => ({
  projectSuggestionService: { upsertManyFromExtraction: vi.fn() },
}));

vi.mock('../../src/services/entities/omegaOrgPromotionService', () => ({
  omegaOrgPromotionService: {
    backfillForUser: (...args: unknown[]) => omegaBackfill(...args),
  },
}));

vi.mock('../../src/workers/groupDetectionWorker', () => ({
  groupDetectionWorker: {
    runForUser: (...args: unknown[]) => groupRunForUser(...args),
  },
}));

vi.mock('../../src/services/organizations/inference/organizationInferenceIntegrationService', () => ({
  rescanOrganizationInference: (...args: unknown[]) => rescanOrganizationInference(...args),
}));

vi.mock('../../src/services/romanticConversationRescanService', () => ({
  romanticConversationRescanService: {
    rescan: (...args: unknown[]) => romanticRescan(...args),
  },
}));

import {
  conversationSuggestionRescanService,
  corpusToParseLines,
} from '../../src/services/conversationSuggestionRescanService';

describe('corpusToParseLines', () => {
  it('dedupes and drops short fragments', () => {
    expect(
      corpusToParseLines([
        { id: '1', content: 'Went to Northwind Depot today with Gary.\nHi', date: '2026-01-01' },
        { id: '2', content: 'Went to Northwind Depot today with Gary.', date: '2026-01-02' },
      ]),
    ).toEqual(['Went to Northwind Depot today with Gary.']);
  });
});

describe('conversationSuggestionRescanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCorpusParseAndApply.mockResolvedValue({
      apply: { linesParsed: 1, operationsSeen: 0, applied: 0, skipped: 0, byDomain: {} },
    });
    locationRescan.mockResolvedValue([{ name: 'Northwind Depot' }]);
    characterRescan.mockResolvedValue({ scanned: true, charactersPromoted: 0 });
    extractQuests.mockResolvedValue([]);
    extractSkillsFromEntry.mockResolvedValue([]);
    extractProjects.mockResolvedValue([]);
    omegaBackfill.mockResolvedValue({ promoted: 1, skippedAsExisting: 0, skippedAsLowSignal: 0, candidateIds: ['c1'] });
    groupRunForUser.mockResolvedValue(undefined);
    rescanOrganizationInference.mockResolvedValue({
      candidatesAccepted: 1,
      suggestionsUpserted: 1,
      rejected: 0,
    });
    romanticRescan.mockResolvedValue({ relationshipsUpserted: 0 });
  });

  it('runs only the requested book and skips location nickname LLM by default', async () => {
    const summary = await conversationSuggestionRescanService.rescan('user-1', ['locations']);

    expect(runCorpusParseAndApply).toHaveBeenCalledTimes(1);
    expect(runCorpusParseAndApply).toHaveBeenCalledWith('user-1', expect.objectContaining({
      applyDomains: ['locations'],
    }));
    expect(characterRescan).not.toHaveBeenCalled();
    expect(extractQuests).not.toHaveBeenCalled();
    expect(extractSkillsFromEntry).not.toHaveBeenCalled();
    expect(groupRunForUser).not.toHaveBeenCalled();
    expect(omegaBackfill).not.toHaveBeenCalled();
    expect(summary.results.locations).toMatchObject({ scanned: true, count: 1, skipAi: true });
    expect(summary).not.toHaveProperty('timelineStitching');
    expect(summary).not.toHaveProperty('emotionInference');
  });

  it('promotes omega orgs and scans groups without a full-year replay', async () => {
    const summary = await conversationSuggestionRescanService.rescan('user-1', ['organizations']);

    expect(omegaBackfill).toHaveBeenCalledWith('user-1');
    const applyDomains = (runCorpusParseAndApply.mock.calls[0][1] as { applyDomains: string[] }).applyDomains;
    expect(applyDomains).toEqual(expect.arrayContaining(['organizations', 'groups', 'schools']));
    expect(applyDomains).not.toContain('locations');
    expect(applyDomains).not.toContain('quests');
    expect(applyDomains).not.toContain('skills');
    expect(applyDomains).not.toContain('characters');
    expect(groupRunForUser).toHaveBeenCalledWith('user-1', 21, 80);
    expect(rescanOrganizationInference).toHaveBeenCalled();
    expect(characterRescan).not.toHaveBeenCalled();
    expect(summary.results.organizations).toMatchObject({
      scanned: true,
      omegaPromoted: 1,
      groupScanDays: 21,
      inferenceUpserted: 1,
    });
  });

  it('keeps character card audit off for incremental rescan', async () => {
    await conversationSuggestionRescanService.rescan('user-1', ['characters'], { incremental: true });
    expect(characterRescan).toHaveBeenCalledWith('user-1', {
      incremental: true,
      cardCleanup: undefined,
      cardAudit: false,
      fullRescan: undefined,
    });
  });
});
