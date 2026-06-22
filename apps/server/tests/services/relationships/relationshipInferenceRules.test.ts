import { describe, it, expect } from 'vitest';

import { relationshipInferenceService } from '../../../src/services/relationships/inference/relationshipInferenceService';
import { BARE_RELATIONSHIP_WORDS } from '../../../src/services/relationships/inference/contextualRelationshipInference';
import { hasProvenance } from '../../../src/services/relationships/inference/relationshipProvenanceService';

function infer(
  text: string,
  extra: Parameters<typeof relationshipInferenceService.inferFromMessage>[0] = {},
) {
  return relationshipInferenceService.inferFromMessage({
    text,
    sourceMessageId: 'msg-1',
    authorRole: 'user',
    ...extra,
  });
}

function findRel(result: ReturnType<typeof infer>, subjectPart: string, predicatePart?: string) {
  return result.accepted.find(
    (r) =>
      r.subject.displayName.toLowerCase().includes(subjectPart.toLowerCase()) &&
      (!predicatePart || r.predicate.toLowerCase().includes(predicatePart.toLowerCase())),
  );
}

describe('relationship inference rules', () => {
  it('Bryan best friend creates bidirectional friendship', () => {
    const result = infer('Bryan Oconner is my best friend from high school.');
    const rel = findRel(result, 'Bryan', 'best_friend');
    expect(rel).toBeDefined();
    expect(rel!.relationshipType).toBe('friendship');
    expect(rel!.direction).toBe('bidirectional');
    expect(rel!.object.displayName).toBe('user');
  });

  it('Leslie cousin creates family relationship confirm-first', () => {
    const result = infer('Leslie is my cousin on my dad side.');
    const rel = findRel(result, 'Leslie', 'cousin');
    expect(rel).toBeDefined();
    expect(rel!.relationshipType).toBe('family');
    expect(rel!.requiresReview).toBe(true);
  });

  it('Tio Ralph uncle confirm-first', () => {
    const result = infer('Tio Ralph is my uncle from my mom side.');
    const rel = findRel(result, 'Tio Ralph', 'uncle');
    expect(rel).toBeDefined();
    expect(rel!.relationshipType).toBe('family');
    expect(rel!.requiresReview).toBe(true);
  });

  it('Gary coworker does not become manager', () => {
    const result = infer('Gary is my coworker at Vanguard Robotics.');
    const rel = findRel(result, 'Gary', 'coworker');
    expect(rel).toBeDefined();
    expect(rel!.predicate).not.toMatch(/boss|manager/);
    expect(result.accepted.some((r) => r.predicate.includes('boss'))).toBe(false);
  });

  it('Vanguard employer relationship direction correct', () => {
    const result = infer('I work for Vanguard Robotics on robot deployments.');
    const worksFor = result.accepted.find(
      (r) => r.predicate === 'works_for' && r.subject.displayName === 'user',
    );
    const employer = findRel(result, 'Vanguard', 'employer');
    expect(worksFor).toBeDefined();
    expect(worksFor!.object.displayName).toMatch(/Vanguard/i);
    expect(employer).toBeDefined();
    expect(employer!.object.displayName).toBe('user');
  });

  it('Ducky invited to Coding Club event', () => {
    const result = infer('Ducky was invited to Coding Club meetup last week.');
    const rel = findRel(result, 'Ducky', 'invited');
    expect(rel).toBeDefined();
    expect(rel!.relationshipType).toBe('event_participation');
    expect(rel!.object.displayName).toMatch(/Coding Club/i);
  });

  it('Oscar dormant best friend temporal status', () => {
    const result = infer("Oscar Trujio used to be my best friend before covid.");
    const rel = findRel(result, 'Oscar', 'best_friend');
    expect(rel).toBeDefined();
    expect(rel!.temporalStatus).toMatch(/dormant|past|former/);
    expect(rel!.predicate).toMatch(/dormant_best_friend|former_best_friend|best_friend/);
  });

  it('Sol romantic/ex context sensitive review', () => {
    const result = infer('Sol ghosted me after we stopped talking.');
    const rel = findRel(result, 'Sol');
    expect(rel).toBeDefined();
    expect(rel!.sensitive).toBe(true);
    expect(rel!.requiresReview).toBe(true);
    expect(rel!.relationshipType).toMatch(/romantic|conflict/);
  });

  it('schoolmate inferred from shared school', () => {
    const result = infer('We went to Whittier Christian Middle School together.');
    const rel = result.accepted.find((r) => r.predicate === 'schoolmate_at');
    expect(rel).toBeDefined();
    expect(rel!.object.displayName).toMatch(/Whittier Christian/i);
  });

  it('bandmate inferred from shared band', () => {
    const result = infer('Noah is my bandmate in jazz band.');
    const rel = findRel(result, 'Noah', 'bandmate');
    expect(rel).toBeDefined();
    expect(rel!.relationshipType).toBe('school');
    expect(rel!.direction).toBe('bidirectional');
  });

  it('relationship without endpoints rejected', () => {
    expect(BARE_RELATIONSHIP_WORDS.has('friend')).toBe(true);
    const result = infer('He is my friend.');
    expect(result.accepted.some((r) => r.subject.displayName.toLowerCase() === 'friend')).toBe(
      false,
    );
    const bare = infer('cousin');
    expect(bare.accepted).toHaveLength(0);
  });

  it('every relationship has provenance', () => {
    const result = infer(
      'Bryan Oconner is my best friend and Leslie is my cousin.',
    );
    expect(result.accepted.length).toBeGreaterThan(0);
    for (const rel of result.accepted) {
      expect(hasProvenance(rel)).toBe(true);
      expect(rel.sourceMessageIds.length).toBeGreaterThan(0);
      expect(rel.evidencePhrases.length).toBeGreaterThan(0);
    }
  });

  it('assistant-generated guesses do not create relationships', () => {
    const result = relationshipInferenceService.inferFromMessage({
      text: 'Bryan might be your best friend based on context.',
      authorRole: 'assistant',
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected.some((r) => r.reason === 'assistant_generated')).toBe(true);
  });
});
