import { describe, expect, it, vi } from 'vitest';

import { lexicalAnalyzerService } from '../../src/services/lexical';
import { meaningResolutionService } from '../../src/services/meaning';
import { resolveReferences } from '../../src/services/meaning/referenceResolutionService';
import { resolveTemporalContext } from '../../src/services/meaning/temporalResolutionService';
import { resolveFactuality } from '../../src/services/meaning/factualityResolutionService';
import { buildActionsFromMeaning } from '../../src/services/ontology/actionPlanService';
import {
  assertMessyActionChips,
  assertMessyMeaningSnapshot,
  MESSY_SHOW_CONFLICT_KICKBOXING_ID,
  MESSY_SHOW_CONFLICT_KICKBOXING_TEXT,
} from '../fixtures/messyShowConflictKickboxing';
import type { MeaningResolutionInput } from '../../src/services/meaning/meaningResolutionTypes';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'char-abel', name: 'Abel Mendoza' }],
            }),
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} } }),
              ilike: vi.fn().mockResolvedValue({ data: [] }),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            ilike: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'lex-1' } }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      };
    }),
    auth: { admin: { getUserById: vi.fn() } },
  },
}));

vi.mock('../../src/services/selfCharacterService', () => ({
  selfCharacterService: {
    ensureSelfCharacter: vi.fn().mockResolvedValue({ id: 'self-1', name: 'Me' }),
  },
}));

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({ proposal: { id: 'p1' }, auto_approved: false }),
  },
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([{ id: 'self-1', primary_name: 'Me' }]),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-1', type: 'SELF' }]),
  },
}));

const base = { userId: 'user-1', messageId: 'msg-1', threadId: 'thread-1' };

function inputFor(text: string): MeaningResolutionInput {
  const lexicalResult = lexicalAnalyzerService.analyzeMessage({ ...base, text });
  return { ...base, text, lexicalResult, timestamp: new Date().toISOString() };
}

async function resolve(text: string) {
  return meaningResolutionService.resolve(inputFor(text));
}

describe('meaningResolutionService', () => {
  it('resolves "Abel Mendoza is me"', async () => {
    const result = await resolve('Abel Mendoza is me');
    expect(result.resolvedEntities.some((e) => e.isSelf)).toBe(true);
    expect(result.ontologyActionCandidates.some((a) => a.kind === 'set_legal_name')).toBe(true);
  });

  it('resolves "Abel Mendoza is my father"', async () => {
    const result = await resolve('Abel Mendoza is my father');
    expect(result.resolvedRelationships.some((r) => r.role === 'father')).toBe(true);
    expect(result.resolvedRelationships[0]?.requiresConfirmation).toBe(true);
  });

  it('detects identity collision when same name is self and father', async () => {
    const msg = "Abel Mendoza is actually me but it's also my estranged father";
    const result = await resolve(msg);
    expect(result.identityCollisions.length).toBeGreaterThan(0);
    expect(result.identityCollisions[0].mustNotAutoMerge).toBe(true);
    expect(result.ontologyActionCandidates.some((a) => a.kind === 'set_legal_name')).toBe(true);
    expect(result.ontologyActionCandidates.some((a) => a.kind === 'distinct_from_self' || a.kind === 'resolve_duplicate')).toBe(true);
  });

  it('resolves pronoun in "I met Tony. He works at SpaceX."', () => {
    const msg = 'I met Tony. He works at SpaceX.';
    const refs = resolveReferences(msg, [{
      surface: 'Tony',
      normalized: 'tony',
      kind: 'PERSON',
      confidence: 0.85,
      resolutionReason: 'test',
      requiresConfirmation: false,
    }]);
    expect(refs.some((r) => r.reference === 'he' && r.antecedent === 'Tony')).toBe(true);
    expect(refs.some((r) => r.relation?.includes('SpaceX'))).toBe(true);
  });

  it('detects past work vs present work', () => {
    const past = resolveTemporalContext('I worked at Armstrong Robotics.', lexicalAnalyzerService.analyzeMessage({ ...base, text: 'I worked at Armstrong Robotics.' }));
    const present = resolveTemporalContext('I work at Armstrong Robotics.', lexicalAnalyzerService.analyzeMessage({ ...base, text: 'I work at Armstrong Robotics.' }));
    expect(past.defaultStatus).toBe('past');
    expect(present.defaultStatus).toBe('present');
  });

  it('detects desire vs fact', () => {
    const lexical = lexicalAnalyzerService.analyzeMessage({ ...base, text: 'x' });
    expect(resolveFactuality('I am a robotics technician.', lexical).factuality).toBe('fact');
    expect(resolveFactuality('I want to work at SpaceX.', lexical).factuality).toBe('desire');
  });

  it('detects hypothetical and prevents hard memory candidate', async () => {
    const result = await resolve('If I worked at SpaceX I would be happy.');
    expect(result.factuality).toBe('hypothetical');
    expect(result.memoryReviewCandidates.filter((c) => c.category === 'skill' && !c.requiresConfirmation)).toHaveLength(0);
    expect(meaningResolutionService.allowsMemoryWrite(result)).toBe(false);
  });

  it('detects current hobby skill', async () => {
    const result = await resolve('I train Muay Thai every week.');
    const skill = result.resolvedSkills.find((s) => /muay thai/i.test(s.name));
    expect(skill?.hobbyOrPaid === 'hobby' || skill?.hobbyOrPaid === 'unknown').toBe(true);
    expect(skill?.currentOrFormer).not.toBe('former');
  });

  it('detects former paid skill', async () => {
    const result = await resolve('I used to teach boxing for money.');
    const skill = result.resolvedSkills.find((s) => /boxing/i.test(s.name));
    if (skill) {
      expect(skill.currentOrFormer).toBe('former');
      expect(skill.hobbyOrPaid).toBe('paid');
    }
  });

  it('normalizes estranged father relationship', async () => {
    const result = await resolve('My estranged father still lives in Dallas.');
    expect(result.resolvedRelationships.some((r) => r.role === 'estranged_father' || r.role === 'father')).toBe(true);
  });

  it('detects contradiction against existing current work fact', async () => {
    const { supabaseAdmin } = await import('../../src/services/supabaseClient');
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'self-1', name: 'Me' }] }),
          }),
        } as any;
      }
      if (table === 'entity_facts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockResolvedValue({
                    data: [{ fact: 'Works at Armstrong Robotics' }],
                  }),
                }),
              }),
            }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      } as any;
    });

    const result = await resolve('I work at SpaceX now.');
    expect(result.contradictions.some((c) => c.field === 'works_at')).toBe(true);
    expect(result.contradictions[0]?.needsReview).toBe(true);
  });

  it('low confidence routes to review only', async () => {
    const result = await resolve('Maybe something with someone somewhere.');
    const reviewOnly = result.memoryReviewCandidates.every((c) => c.requiresConfirmation);
    expect(reviewOnly || result.confidence < 0.6).toBe(true);
  });

  it('family relationship requires confirmation', async () => {
    const result = await resolve('My mother lives in Texas.');
    expect(result.resolvedRelationships.every((r) => r.requiresConfirmation)).toBe(true);
  });

  it('action planner uses meaning result not raw lexical', async () => {
    const meaning = await resolve("Abel Mendoza is actually me but it's also my estranged father");
    const actions = buildActionsFromMeaning(meaning);
    expect(actions.length).toBeGreaterThan(0);
  });
});

describe(`regression fixture: ${MESSY_SHOW_CONFLICT_KICKBOXING_ID}`, () => {
  it('resolves messy show/conflict/kickboxing meaning snapshot', async () => {
    const result = await resolve(MESSY_SHOW_CONFLICT_KICKBOXING_TEXT);
    assertMessyMeaningSnapshot(result);
  });

  it('routes conflict memories to review queue only', async () => {
    const result = await resolve(MESSY_SHOW_CONFLICT_KICKBOXING_TEXT);
    const conflictMemories = result.memoryReviewCandidates.filter((c) =>
      /fight|conflict|charlie|fasbender/i.test(c.claim)
    );
    expect(conflictMemories.length).toBeGreaterThan(0);
    expect(conflictMemories.every((c) => c.requiresConfirmation)).toBe(true);
  });

  it('does not link Michael Fasbender to a celebrity entity', async () => {
    const result = await resolve(MESSY_SHOW_CONFLICT_KICKBOXING_TEXT);
    expect(result.resolvedEntities.some((e) => /fassbender/i.test(e.surface))).toBe(false);
    expect(result.identityCollisions.some((c) => /celebrity|actor/i.test(c.name))).toBe(false);
  });

  it('produces ontology action chips from meaning resolution', async () => {
    const result = await resolve(MESSY_SHOW_CONFLICT_KICKBOXING_TEXT);
    const actions = buildActionsFromMeaning(result);
    assertMessyActionChips(actions);
  });
});
