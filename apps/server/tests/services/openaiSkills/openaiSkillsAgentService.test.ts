import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config', () => ({
  config: {
    openAiKey: 'test-key',
    openAiSkillsAgentEnabled: true,
    openAiAgentModel: 'gpt-4o',
    openAiSkillCharacterCardAuditId: 'skill_audit_1',
    openAiSkillRescanOpsId: 'skill_rescan_1',
  },
}));

vi.mock('../../../src/services/characters/audit/characterCardAuditService', () => ({
  characterCardAuditService: {
    audit: vi.fn().mockResolvedValue({
      userId: 'u1',
      characterCount: 1,
      results: [],
      summary: {},
    }),
  },
}));

vi.mock('../../../src/services/characters/audit/characterCardRescanAuditService', () => ({
  characterCardRescanAuditService: {
    getPendingReviewSuggestions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../src/services/characters/audit/characterRescanStateService', () => ({
  characterRescanStateService: {
    load: vi.fn().mockResolvedValue({ watermarkAt: null, validatedPersonKeys: [] }),
  },
}));

import { openAiSkillsAgentService } from '../../../src/services/openaiSkills/openaiSkillsAgentService';

describe('openAiSkillsAgentService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'resp_1',
          output_text: 'Audit complete: 0 cards need review.',
        }),
      }),
    );
  });

  it('calls OpenAI Responses API with shell tool and skill references', async () => {
    const result = await openAiSkillsAgentService.run({
      workflow: 'character_card_audit',
      targetUserId: '11111111-1111-4111-8111-111111111111',
      input: 'Summarize audit findings.',
      requestedByUserId: 'admin-1',
    });

    expect(result.outputText).toContain('Audit complete');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.tools[0].type).toBe('shell');
    expect(body.tools[0].environment.skills).toHaveLength(1);
    expect(body.tools[0].environment.skills[0].skill_id).toBe('skill_audit_1');
  });

  it('lists workflows with readiness', () => {
    const workflows = openAiSkillsAgentService.listWorkflows();
    expect(workflows.some((w) => w.id === 'lorebook_ops')).toBe(true);
    expect(workflows.find((w) => w.id === 'character_card_audit')?.skillsReady).toBe(true);
  });
});
