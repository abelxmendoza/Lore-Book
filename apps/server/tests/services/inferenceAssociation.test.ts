import { describe, expect, it, vi, beforeEach } from 'vitest';

import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { meaningResolutionService } from '../../src/services/meaning/meaningResolutionService';
import {
  inferenceAssociationService,
  NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT,
} from '../../src/services/inference';
import { loadHistoryContext } from '../../src/services/inference/historyAssociationService';
import { buildActionsFromOntologyCandidates } from '../../src/services/ontology/actionPlanService';

const storedCharacters: Array<{ id: string; name: string; aliases?: string[] }> = [];

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: storedCharacters }),
          }),
        };
      }
      if (table === 'organizations' || table === 'skills') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'row-1' } }),
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

const FIXTURE = NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT;
const base = { userId: 'user-1', messageId: 'msg-inf-1', threadId: 'thread-1' };

async function inferFixture() {
  const lexical = lexicalAnalyzerService.analyzeMessage({ ...base, text: FIXTURE });
  const meaning = await meaningResolutionService.resolve({
    ...base,
    text: FIXTURE,
    lexicalResult: lexical,
    timestamp: new Date().toISOString(),
  });
  return inferenceAssociationService.infer({
    ...base,
    rawText: FIXTURE,
    lexicalResult: lexical,
    meaningResult: meaning,
    timestamp: new Date().toISOString(),
  });
}

describe('buildActionsFromOntologyCandidates — inference kinds', () => {
  it('maps review_club_details to a navigate chip', () => {
    const actions = buildActionsFromOntologyCandidates([
      {
        kind: 'review_club_details',
        label: 'Review school/club details',
        confidence: 0.7,
        requiresConfirmation: true,
        payload: {},
      },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe('review-club-details');
  });
});

describe('inferenceAssociationService — neighborhood_after_school_coding_club', () => {
  beforeEach(() => {
    storedCharacters.length = 0;
    vi.clearAllMocks();
  });

  it('creates street community from named street context', async () => {
    const result = await inferFixture();
    const community = result.inferredCommunities.find((c) => /wild rivers/i.test(c.place));
    expect(community).toBeDefined();
    expect(community?.type).toBe('street_community');
    expect(community?.privacyMode).toBe('coarse_location_only');
    expect(community?.name).toMatch(/Wild Rivers Street Community/i);
  });

  it('infers Mr Morten as neighbor candidate', async () => {
    const result = await inferFixture();
    const morten = result.inferredPeople.find((p) => /morten/i.test(p.name));
    expect(morten?.roles).toContain('neighbor_candidate');
    expect(morten?.roles).toContain('street_community_member_candidate');
    expect(
      result.inferredRelationships.some(
        (r) => /morten/i.test(r.subjectName) && r.relationshipType === 'neighbor_candidate'
      )
    ).toBe(true);
  });

  it('infers Mr Morten gardening hobby/skill candidate', async () => {
    const result = await inferFixture();
    const morten = result.inferredPeople.find((p) => /morten/i.test(p.name));
    expect(morten?.hobbyCandidates.some((h) => /garden/i.test(h))).toBe(true);
    expect(morten?.skillCandidates.some((s) => /garden/i.test(s))).toBe(true);
    expect(result.inferredHobbies.some((h) => /morten/i.test(h.subjectName) && /garden/i.test(h.hobby))).toBe(true);
  });

  it('infers Ducky as social contact/friend candidate from invitation', async () => {
    const result = await inferFixture();
    const ducky = result.inferredPeople.find((p) => /ducky/i.test(p.name));
    expect(ducky?.roles).toContain('social_contact_candidate');
    expect(ducky?.roles).toContain('friend_candidate');
    expect(ducky?.invitedTo?.some((t) => /coding club/i.test(t))).toBe(true);
  });

  it('infers Ducky biking and bike repair from fixing bike', async () => {
    const result = await inferFixture();
    const ducky = result.inferredPeople.find((p) => /ducky/i.test(p.name));
    expect(ducky?.hobbyCandidates.some((h) => /bik/i.test(h))).toBe(true);
    expect(ducky?.skillCandidates.some((s) => /bike repair|mechanics/i.test(s))).toBe(true);
  });

  it('creates Coding Club group candidate', async () => {
    const result = await inferFixture();
    const group = result.inferredGroups.find((g) => /coding club/i.test(g.name));
    expect(group?.type).toBe('school_club_or_interest_group');
    expect(group?.domain).toMatch(/coding|programming/i);
  });

  it('associates user with Coding Club from "our Coding Club"', async () => {
    const result = await inferFixture();
    expect(
      result.inferredRelationships.some(
        (r) => r.subjectName === 'user' && /coding club/i.test(r.objectName) && r.relationshipType === 'associated_with'
      )
    ).toBe(true);
  });

  it('infers user coding interest/skill candidate from Coding Club', async () => {
    const result = await inferFixture();
    expect(result.inferredSkills.some((s) => s.subjectKind === 'user' && /coding|programming/i.test(s.skill))).toBe(true);
    expect(result.inferredHobbies.some((h) => h.subjectKind === 'user' && /coding/i.test(h.hobby))).toBe(true);
  });

  it('keeps Ducky coding interest low confidence', async () => {
    const result = await inferFixture();
    const duckyCoding = result.inferredHobbies.find(
      (h) => /ducky/i.test(h.subjectName) && /coding/i.test(h.hobby)
    );
    expect(duckyCoding?.confidence).toBeLessThan(0.6);
    expect(duckyCoding?.requiresReview).toBe(true);
  });

  it('does not store exact house address', async () => {
    const result = await inferFixture();
    const claims = [
      ...result.memoryReviewCandidates.map((c) => c.claim),
      ...result.inferredPlaces.map((p) => p.name),
    ].join(' ').toLowerCase();
    expect(claims).not.toMatch(/\b\d+\s+wild rivers\b/);
    expect(result.ambiguities.some((a) => /no_exact_home|address|coarse/i.test(a.code + a.description))).toBe(true);
    expect(result.inferredPlaces.every((p) => p.coarseOnly === true)).toBe(true);
  });

  it('does not create unknown companion entities from "we"', async () => {
    const result = await inferFixture();
    expect(result.inferredPeople.some((p) => /^we$/i.test(p.name))).toBe(false);
    expect(result.ambiguities.some((a) => /inclusive_we/i.test(a.code))).toBe(true);
  });

  it('marks all inferred facts as inferredNotConfirmed', async () => {
    const result = await inferFixture();
    expect(inferenceAssociationService.validateInferredNotConfirmed(result)).toBe(true);
    const all = [
      ...result.inferredPeople,
      ...result.inferredGroups,
      ...result.inferredCommunities,
      ...result.inferredSkills,
      ...result.inferredHobbies,
      ...result.inferredRelationships,
      ...result.inferredPlaces,
      ...result.inferredEvents,
    ];
    expect(all.every((i) => i.inferredNotConfirmed === true)).toBe(true);
    expect(all.every((i) => i.sourceMessageId === base.messageId)).toBe(true);
    expect(all.every((i) => i.evidencePhrases.length > 0)).toBe(true);
  });

  it('checks history before duplicate creation', async () => {
    storedCharacters.push({ id: 'char-morten', name: 'Mr Morten', aliases: ['Morten'] });
    const history = await loadHistoryContext('user-1');
    expect(history.people.has('mr morten')).toBe(true);

    const result = await inferFixture();
    const morten = result.inferredPeople.find((p) => /morten/i.test(p.name));
    expect(morten?.existingEntityId).toBe('char-morten');
    expect(result.inferredPeople.filter((p) => /morten/i.test(p.name))).toHaveLength(1);
  });

  it('routes inference memories to Memory Review Queue', async () => {
    const { memoryReviewQueueService } = await import('../../src/services/memoryReviewQueueService');
    const lexical = lexicalAnalyzerService.analyzeMessage({ ...base, text: FIXTURE });
    const meaning = await meaningResolutionService.resolve({
      ...base,
      text: FIXTURE,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
    });

    await inferenceAssociationService.inferAndQueueReview({
      ...base,
      rawText: FIXTURE,
      lexicalResult: lexical,
      meaningResult: meaning,
      timestamp: new Date().toISOString(),
    });

    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalled();
    const calls = vi.mocked(memoryReviewQueueService.ingestMemory).mock.calls;
    expect(calls.some((c) => {
      const meta = (c[1] as { metadata?: Record<string, unknown> }).metadata;
      return meta?.from === 'inference_association' && meta?.inferred_not_confirmed === true;
    })).toBe(true);
  });

  it('produces expected memory review candidates (resilient)', async () => {
    const result = await inferFixture();
    const claims = result.memoryReviewCandidates.map((c) => c.claim.toLowerCase());
    expect(claims.some((c) => /wild rivers.*community|associated with wild rivers/i.test(c))).toBe(true);
    expect(claims.some((c) => /morten.*neighbor|local resident/i.test(c))).toBe(true);
    expect(claims.some((c) => /morten.*garden/i.test(c))).toBe(true);
    expect(claims.some((c) => /ducky.*friend|social contact/i.test(c))).toBe(true);
    expect(claims.some((c) => /ducky.*bike/i.test(c))).toBe(true);
    expect(claims.some((c) => /invited ducky.*coding club/i.test(c))).toBe(true);
    expect(claims.some((c) => /coding club.*user|user.*coding club/i.test(c))).toBe(true);
    expect(claims.every((c) => result.memoryReviewCandidates.find((m) => m.claim.toLowerCase() === c)?.requiresConfirmation)).toBe(true);
  });

  it('produces expected action chips (resilient)', async () => {
    const result = await inferFixture();
    const actions = buildActionsFromOntologyCandidates(result.actionCandidates);
    const labels = actions.map((a) => a.label.toLowerCase());
    expect(labels.some((l) => /street community.*wild rivers/i.test(l))).toBe(true);
    expect(labels.some((l) => /morten/i.test(l) && /person|neighbor/i.test(l))).toBe(true);
    expect(labels.some((l) => /garden/i.test(l))).toBe(true);
    expect(labels.some((l) => /ducky/i.test(l))).toBe(true);
    expect(labels.some((l) => /bik|bike repair|mechanics/i.test(l))).toBe(true);
    expect(labels.some((l) => /coding club/i.test(l))).toBe(true);
    expect(labels.some((l) => /review.*(school|club).*details/i.test(l))).toBe(true);
  });

  it('maps "around the corner" to coarse neighborhood context only', async () => {
    const result = await inferFixture();
    const ducky = result.inferredPeople.find((p) => /ducky/i.test(p.name));
    expect(ducky?.localContext).toMatch(/near wild rivers|neighborhood/i);
    expect(result.ambiguities.some((a) => /relative_location|coarse/i.test(a.code))).toBe(true);
  });
});
