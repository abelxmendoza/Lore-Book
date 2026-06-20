import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockOrgs: Array<{ id: string; name: string; type: string }> = [];
let mockCharacters: Array<{ id: string; name: string; aliases: string[] }> = [];
let mockSkills: Array<{ name: string }> = [];
const insertSpy = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data:
            table === 'organizations'
              ? mockOrgs
              : table === 'characters'
                ? mockCharacters
                : table === 'skills'
                  ? mockSkills
                  : [],
        }),
      }),
      insert: insertSpy,
      update: insertSpy,
      upsert: insertSpy,
    })),
  },
}));

import { previewLexicalSpans } from '../../src/services/lexical/lexicalPreviewService';
import { inferWorkplaceAssociations } from '../../src/services/inference/work/workplaceInferenceService';
import { applySkillFrequencyBoost, buildSkillGraphInferences } from '../../src/services/inference/work/skillGraphInferenceService';
import { loadHistoryContext } from '../../src/services/inference/historyAssociationService';
import { inferenceAssociationService } from '../../src/services/inference/inferenceAssociationService';
import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { meaningResolutionService } from '../../src/services/meaning/meaningResolutionService';
import {
  ROBOTICS_WORKPLACE_FIXTURE_TEXT,
  assertWorkplacePreviewSpans,
  assertWorkplaceInference,
  assertWorkplaceKnownWhenIndexed,
  assertSkillConfidenceGrowth,
  assertCareerTimeline,
} from '../fixtures/roboticsWorkplaceRoleSkillFixture';

const USER = 'test-user-workplace';

describe('workplaceInference — robotics fixture', () => {
  beforeEach(() => {
    mockOrgs = [];
    mockCharacters = [];
    mockSkills = [];
    insertSpy.mockClear();
  });

  it('returns colored preview spans for org, role, people, skills, tasks, deployment site', async () => {
    const result = await previewLexicalSpans({
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      userId: USER,
      mode: 'composer_preview',
    });
    assertWorkplacePreviewSpans(result);
  });

  it('infers worked_for, coworkers, deployment site, and skills (review-first)', async () => {
    const history = await loadHistoryContext(USER);
    const result = inferWorkplaceAssociations(ROBOTICS_WORKPLACE_FIXTURE_TEXT, 'msg-1', history);
    assertCareerTimeline(result.careerTimeline!);
    expect(result.relationships.some((r) => r.relationshipType === 'worked_for')).toBe(true);
    expect(result.relationships.filter((r) => r.relationshipType === 'worked_with').length).toBe(2);
    expect(result.groups.some((g) => g.type === 'deployment_site')).toBe(true);
    expect(result.skills.length).toBeGreaterThan(3);
    expect(result.ambiguities.some((a) => a.code === 'no_manager_assumed')).toBe(true);
  });

  it('marks organization and coworkers as known when in LoreBook', async () => {
    mockOrgs = [{ id: 'org-1', name: 'Armstrong Robotics', type: 'company' }];
    mockCharacters = [
      { id: 'char-gary', name: 'Gary', aliases: [] },
      { id: 'char-jeff', name: 'Jeff', aliases: [] },
    ];
    const result = await previewLexicalSpans({
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      userId: USER,
      mode: 'composer_preview',
    });
    assertWorkplaceKnownWhenIndexed(result);
  });

  it('elevates skill confidence after repeated mentions', async () => {
    const history = await loadHistoryContext(USER);
    mockSkills = [{ name: 'ArUco calibration' }];
    const counts = new Map<string, number>([['aruco calibration', 8]]);
    const graph = buildSkillGraphInferences({
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      messageId: 'msg-freq',
      history: await loadHistoryContext(USER),
      skillMentionCounts: counts,
    });
    const boosted = applySkillFrequencyBoost(graph.skills, 8);
    assertSkillConfidenceGrowth(boosted, 8);
  });

  it('does not treat Denny\'s as employer when Armstrong Robotics exists', async () => {
    const history = await loadHistoryContext(USER);
    const result = inferWorkplaceAssociations(ROBOTICS_WORKPLACE_FIXTURE_TEXT, 'msg-2', history);
    const dennysEmployer = result.groups.find(
      (g) => g.type === 'company' && /Denny/i.test(g.name)
    );
    expect(dennysEmployer, 'Denny\'s must not be employer').toBeUndefined();
    expect(result.ambiguities.some((a) => /deployment/i.test(a.code))).toBe(true);
  });

  it('generates Armstrong Robotics community membership', async () => {
    const history = await loadHistoryContext(USER);
    const result = inferWorkplaceAssociations(ROBOTICS_WORKPLACE_FIXTURE_TEXT, 'msg-3', history);
    expect(
      result.memoryReviewCandidates.some((c) => /Armstrong Robotics Community/i.test(c))
    ).toBe(true);
    expect(
      result.relationships.some((r) => r.relationshipType === 'member_of' && /Community/i.test(r.objectName))
    ).toBe(true);
  });

  it('builds organization hierarchy with deployment sites', async () => {
    const history = await loadHistoryContext(USER);
    const result = inferWorkplaceAssociations(ROBOTICS_WORKPLACE_FIXTURE_TEXT, 'msg-4', history);
    expect(
      result.memoryReviewCandidates.some((c) => /Deployment Sites.*Denny/i.test(c))
    ).toBe(true);
  });

  it('runs full inference orchestrator pipeline', async () => {
    const lexical = lexicalAnalyzerService.analyzeMessage({
      userId: USER,
      messageId: 'msg-full',
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
    });
    const meaning = await meaningResolutionService.resolve({
      userId: USER,
      messageId: 'msg-full',
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
    });
    const inference = await inferenceAssociationService.infer({
      userId: USER,
      messageId: 'msg-full',
      rawText: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      lexicalResult: lexical,
      meaningResult: meaning,
      timestamp: new Date().toISOString(),
    });
    assertWorkplaceInference(inference);
  });

  it('is read-only in preview — performs no DB writes', async () => {
    await previewLexicalSpans({
      text: ROBOTICS_WORKPLACE_FIXTURE_TEXT,
      userId: USER,
      mode: 'composer_preview',
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
