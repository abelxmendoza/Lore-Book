import { describe, it, expect } from 'vitest';

import { areDistinctContextualPeople, dedupeAmbiguousCandidates } from '../../../src/services/characters/inference/ambiguousPersonResolver';
import { characterInferenceService } from '../../../src/services/characters/inference/characterInferenceService';
import type { CharacterCandidate } from '../../../src/services/characters/inference/characterInferenceTypes';
import { evaluatePromotionStatus } from '../../../src/services/characters/inference/characterPromotionGate';
import { isBareGenericLabel, detectEmotionalWeight } from '../../../src/services/characters/inference/rolePersonInference';
import { isBareTitleInvalid } from '../../../src/services/characters/audit/bareTitleInvalidGuard';
import { isJunkTestData } from '../../../src/services/characters/audit/wrongDomainCharacterGuard';

function infer(text: string, extra: Parameters<typeof characterInferenceService.inferFromMessage>[0] = {}) {
  return characterInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findAccepted(result: ReturnType<typeof infer>, namePart: string) {
  return result.accepted.find((c) =>
    c.displayName.toLowerCase().includes(namePart.toLowerCase()),
  );
}

describe('character inference rules', () => {
  it('Bryan Oconner creates full_name character', () => {
    const result = infer('Bryan Oconner is my best friend from high school.');
    const bryan = findAccepted(result, 'Bryan Oconner');
    expect(bryan).toBeDefined();
    expect(bryan!.identityType).toBe('full_name');
    expect(bryan!.promotionStatus).toMatch(/candidate|suggested_card/);
  });

  it('Tio Ralph creates family_title_name', () => {
    const result = infer('Tio Ralph came over for dinner last night.');
    const tio = findAccepted(result, 'Tio Ralph');
    expect(tio).toBeDefined();
    expect(tio!.identityType).toBe('family_title_name');
  });

  it('Mr Morten creates honorific_name', () => {
    const result = infer('Mr Morten teaches the morning class.');
    const mr = findAccepted(result, 'Mr Morten');
    expect(mr).toBeDefined();
    expect(mr!.identityType).toBe('honorific_name');
  });

  it('Professor alone is rejected', () => {
    expect(isBareTitleInvalid('Professor')).toBe(true);
    const result = infer('Professor was helpful today.');
    expect(result.accepted.some((c) => normalize(c.displayName) === 'professor')).toBe(false);
  });

  it('indefinite and vague collective phrases are bare generics', () => {
    expect(isBareGenericLabel('one girl')).toBe(true);
    expect(isBareGenericLabel('other girls')).toBe(true);
    expect(isBareGenericLabel('people in the scene')).toBe(true);
    expect(isBareGenericLabel('popular egirls')).toBe(true);
    const result = infer('one girl and other girls and people in the scene showed up.');
    expect(result.accepted.some((c) => /one girl|other girls|people in the scene/i.test(c.displayName))).toBe(
      false,
    );
  });

  it('Potential Investor from Antler creates contextual character', () => {
    const result = infer('I met a Potential Investor from Antler at the demo day.');
    const investor = findAccepted(result, 'Potential Investor from Antler');
    expect(investor).toBeDefined();
    expect(investor!.identityType).toBe('role_contextual');
    expect(investor!.needsResolution).toBe(true);
  });

  it('new guy with Noah from Ska Prom creates contextual character', () => {
    const result = infer(
      'There was a new guy I met that came with Noah at Ska Prom last weekend.',
    );
    const guy = findAccepted(result, 'New Guy');
    expect(guy).toBeDefined();
    expect(guy!.displayName.toLowerCase()).toContain('noah');
    expect(guy!.displayName.toLowerCase()).toContain('ska prom');
  });

  it('old college roommate becomes contextual only if school context exists', () => {
    const withoutSchool = infer('I ran into my old college roommate yesterday.');
    expect(
      withoutSchool.accepted.some((c) => c.displayName.toLowerCase().includes('old college roommate')),
    ).toBe(false);

    const withSchool = infer('My old college roommate from CSUF reached out on LinkedIn.');
    const roommate = findAccepted(withSchool, 'Old College Roommate');
    expect(roommate).toBeDefined();
    expect(roommate!.context.placeContext ?? roommate!.context.organizationContext).toBeTruthy();
  });

  it('foo is rejected as junk', () => {
    expect(isJunkTestData('foo')).toBe(true);
    const result = infer('foo said hello to me.');
    expect(result.accepted.some((c) => c.displayName.toLowerCase() === 'foo')).toBe(false);
  });

  it('Moth Queen is allowed with person context', () => {
    const result = infer('Moth Queen was at the show and she looked amazing.');
    const fairy = findAccepted(result, 'Moth Queen');
    expect(fairy).toBeDefined();
    expect(fairy!.identityType).toMatch(/stage_name|nickname/);
  });

  it('Cyberpunk is rejected unless explicit nickname context', () => {
    const genreOnly = infer('I have been really into Cyberpunk lately.');
    expect(genreOnly.accepted.some((c) => c.displayName.toLowerCase() === 'cyberpunk')).toBe(false);

    const asProject = infer('Cyberpunk is my side project name for the zine.', {
      knownDomains: { cyberpunk: 'project' },
    });
    expect(asProject.accepted.some((c) => c.displayName.toLowerCase() === 'cyberpunk')).toBe(false);
  });

  it('duplicate ambiguous people are not merged without provenance overlap', () => {
    const a: CharacterCandidate = {
      displayName: 'New Guy from Ska Prom',
      identityType: 'role_contextual',
      titleParts: { roleTitle: 'New Guy' },
      context: { eventContext: 'Ska Prom' },
      aliases: [],
      evidencePhrases: ['new guy at ska prom'],
      sourceMessageIds: ['m1'],
      confidence: 0.8,
      needsResolution: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    };
    const b: CharacterCandidate = {
      displayName: 'New Guy from Downtown Venue',
      identityType: 'role_contextual',
      titleParts: { roleTitle: 'New Guy' },
      context: { placeContext: 'Downtown Venue' },
      aliases: [],
      evidencePhrases: ['new guy at downtown venue'],
      sourceMessageIds: ['m2'],
      confidence: 0.8,
      needsResolution: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    };

    expect(areDistinctContextualPeople(a, b)).toBe(true);
    const merged = dedupeAmbiguousCandidates([a, b]);
    expect(merged).toHaveLength(2);
  });

  it('emotional weight boosts Oscar best friend promotion', () => {
    const weight = detectEmotionalWeight('Oscar is my best friend and always has my back.');
    expect(weight.boost).toBeGreaterThan(0);

    const candidate: CharacterCandidate = {
      displayName: 'Oscar',
      identityType: 'nickname',
      context: {},
      aliases: [],
      evidencePhrases: ['Oscar is my best friend'],
      sourceMessageIds: ['m1'],
      confidence: 0.8,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'candidate',
    };

    const status = evaluatePromotionStatus(candidate, {
      mentionCount: 2,
      evidenceText: 'Oscar is my best friend',
    });
    expect(status).toMatch(/candidate|suggested_card/);
  });

  it('assistant-generated guesses do not create characters', () => {
    const result = characterInferenceService.inferFromMessage({
      text: 'Bryan Oconner might be your cousin based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });

  it('every ambiguous character includes provenance', () => {
    const result = infer('A Potential Investor from Antler emailed me after the pitch.');
    const ambiguous = result.accepted.filter(
      (c) => c.needsResolution || c.identityType.includes('contextual'),
    );
    expect(ambiguous.length).toBeGreaterThan(0);
    for (const c of ambiguous) {
      expect(c.sourceMessageIds.length).toBeGreaterThan(0);
      expect(c.evidencePhrases.length).toBeGreaterThan(0);
      expect(
        c.context.storyContext ||
          c.context.organizationContext ||
          c.context.eventContext ||
          c.context.placeContext,
      ).toBeTruthy();
    }
  });
});

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
