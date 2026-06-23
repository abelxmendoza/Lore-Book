import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
vi.mock('../../src/lib/openai', () => ({
  openai: { chat: { completions: { create: (...a: unknown[]) => createMock(...a) } } },
}));

const ensureSelfMock = vi.fn();
vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: { ensureSelfCharacter: (...a: unknown[]) => ensureSelfMock(...a) },
}));

const extractSelfFactsMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/services/entityFactsService', () => ({
  entityFactsService: { extractAndPersistSelfFacts: (...a: unknown[]) => extractSelfFactsMock(...a) },
}));

const ingestStandaloneMock = vi.fn().mockResolvedValue('msg-1');
vi.mock('../../src/services/omegaChatService', () => ({
  omegaChatService: { ingestStandaloneText: (...a: unknown[]) => ingestStandaloneMock(...a) },
}));

const updateEqEq = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn(() => ({ eq: () => ({ eq: updateEqEq }) }));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: () => ({ update: updateMock }) },
}));

import { onboardingIntelligenceService } from '../../src/services/onboardingIntelligenceService';

function llmReturns(obj: unknown) {
  createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] });
}

describe('onboardingIntelligenceService', () => {
  beforeEach(() => {
    createMock.mockReset();
    ensureSelfMock.mockReset();
    updateMock.mockClear();
    updateEqEq.mockClear();
    extractSelfFactsMock.mockClear();
  });

  describe('extractIdentityProfile', () => {
    it('groups a narrative into structured identity chips', async () => {
      llmReturns({
        identity: { preferredName: 'Abel', occupation: 'Engineer', lifePhase: 'building a startup', summary: 'Builder.' },
        people: [{ label: 'Sarah', confidence: 0.9, evidence: 'my girlfriend Sarah' }],
        organizations: [{ label: 'Tesla', confidence: 0.95 }],
        skills: ['Engineering'],
        goals: [{ label: 'Launch LoreBook', confidence: 0.8 }],
        places: [],
        interests: [],
        projects: [],
        events: [],
        values: [],
      });

      const draft = await onboardingIntelligenceService.extractIdentityProfile('u1', 'I am an engineer...');
      expect(draft.identity.preferredName).toBe('Abel');
      expect(draft.identity.occupation).toBe('Engineer');
      expect(draft.people[0]).toMatchObject({ label: 'Sarah', confidence: 0.9 });
      expect(draft.organizations[0].label).toBe('Tesla');
      // bare-string skill normalized to a chip
      expect(draft.skills[0]).toMatchObject({ label: 'Engineering' });
      expect(draft.goals[0].label).toBe('Launch LoreBook');
    });

    it('returns an empty draft for blank input without calling the LLM', async () => {
      const draft = await onboardingIntelligenceService.extractIdentityProfile('u1', '   ');
      expect(createMock).not.toHaveBeenCalled();
      expect(draft.people).toEqual([]);
    });

    it('degrades to an empty draft when the LLM fails', async () => {
      createMock.mockRejectedValue(new Error('llm down'));
      const draft = await onboardingIntelligenceService.extractIdentityProfile('u1', 'hello');
      expect(draft.people).toEqual([]);
      expect(draft.identity).toEqual({});
    });
  });

  describe('confirmIdentityProfile', () => {
    const draft = {
      identity: { summary: 'A builder in Portland.', occupation: 'Engineer', lifePhase: 'startup' },
      people: [{ label: 'Sarah', confidence: 0.9 }],
      places: [],
      organizations: [],
      skills: [],
      interests: [{ label: 'Robotics', confidence: 0.8 }],
      goals: [],
      projects: [],
      events: [],
      values: [{ label: 'Freedom', confidence: 0.7 }],
    };

    it('writes the profile into the self character metadata and marks complete', async () => {
      ensureSelfMock.mockResolvedValue({ id: 'self-1', metadata: { existing: true } });
      const result = await onboardingIntelligenceService.confirmIdentityProfile('u1', draft, 'I build robots.');

      expect(result).toEqual({ selfCharacterId: 'self-1', completed: true });
      const writtenMeta = (updateMock.mock.calls[0][0] as Record<string, unknown>).metadata as Record<string, unknown>;
      expect(writtenMeta.existing).toBe(true); // preserves existing metadata
      expect(writtenMeta.onboarding_profile).toEqual(draft);
      expect(writtenMeta.onboarding_v2_completed_at).toBeTruthy();
      expect(writtenMeta.occupation).toBe('Engineer');
      expect(writtenMeta.values).toEqual(['Freedom']);
      expect(writtenMeta.interests).toEqual(['Robotics']);
      // self-facts linked from the narrative
      expect(extractSelfFactsMock).toHaveBeenCalledWith('u1', 'self-1', 'I build robots.');
      // narrative ingested through the durable pipeline to populate the books
      await vi.waitFor(() =>
        expect(ingestStandaloneMock).toHaveBeenCalledWith(
          'u1',
          'I build robots.',
          expect.objectContaining({ source: 'onboarding_narrative' }),
        ),
      );
    });

    it('returns not-completed when there is no self character', async () => {
      ensureSelfMock.mockResolvedValue(null);
      const result = await onboardingIntelligenceService.confirmIdentityProfile('u1', draft);
      expect(result).toEqual({ selfCharacterId: null, completed: false });
    });
  });

  describe('getOnboardingStatus', () => {
    it('reports completed when the metadata flag is present', async () => {
      ensureSelfMock.mockResolvedValue({
        id: 'self-1',
        metadata: { onboarding_v2_completed_at: '2026-06-22T00:00:00Z', onboarding_version: 2 },
      });
      const status = await onboardingIntelligenceService.getOnboardingStatus('u1');
      expect(status).toMatchObject({ completed: true, version: 2, hasSelfProfile: true });
    });

    it('reports not-completed for an existing user who never did v2', async () => {
      ensureSelfMock.mockResolvedValue({ id: 'self-1', metadata: {} });
      const status = await onboardingIntelligenceService.getOnboardingStatus('u1');
      expect(status.completed).toBe(false);
      expect(status.hasSelfProfile).toBe(true);
    });
  });
});
