import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('./suggestionAttachApply', async () => {
  const actual = await vi.importActual<typeof import('./suggestionAttachApply')>('./suggestionAttachApply');
  return {
    ...actual,
    applyAttachPlan: vi.fn().mockResolvedValue(undefined),
  };
});

import { guardCharacterCandidate } from '../quality/characterCandidateGuard';
import { decideSuggestionCandidate } from './applySuggestionCandidate';
import {
  resetSuggestionWriteContextForTests,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function person(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'characters', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

describe('person vs place — character gate', () => {
  beforeEach(() => {
    resetSuggestionWriteContextForTests();
  });

  it('Jamie Park with person context is not rejected as a place', () => {
    const verdict = guardCharacterCandidate({
      name: 'Jamie Park',
      domain: 'characters',
      evidence: 'Had coffee with Maya Chen and Jamie Park after class.',
    });
    expect(verdict).toBeNull();
  });

  it('Park / Hill surnames with meeting context survive', () => {
    expect(
      guardCharacterCandidate({
        name: 'Morgan Hill',
        domain: 'characters',
        evidence: 'I met Morgan Hill after class.',
      }),
    ).toBeNull();
  });

  it('actual parks and hills do not become Characters', () => {
    expect(
      guardCharacterCandidate({
        name: 'Northwind Park',
        domain: 'characters',
        evidence: 'I went to Northwind Park after work.',
      })?.rejectionReason,
    ).toMatch(/canonical_type_(place|location)/);
    expect(
      guardCharacterCandidate({
        name: 'Northwind Hill',
        domain: 'characters',
        evidence: 'We met at Northwind Hill for the hike.',
      })?.rejectionReason,
    ).toMatch(/canonical_type_(place|location)/);
    expect(
      guardCharacterCandidate({
        name: 'the park',
        domain: 'characters',
        evidence: 'we walked to the park',
      })?.rejectionReason,
    ).toBeTruthy();
    expect(
      guardCharacterCandidate({
        name: 'the hill',
        domain: 'characters',
        evidence: 'we walked to the hill',
      })?.rejectionReason,
    ).toBeTruthy();
  });

  it('weak actors stay rejected', () => {
    for (const name of ['her friend', 'the guy from work', 'my manager', 'the girl from the show']) {
      const verdict = guardCharacterCandidate({
        name,
        domain: 'characters',
        evidence: `${name} waved from across the street`,
      });
      expect(verdict?.gate, name).toBe('reject');
    }
  });

  it('first-name Maya stays review when two Mayas exist', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'characters',
          name: 'Maya',
          evidence: 'Maya stopped by after class',
          extractor: 'eval',
        }),
      {
        index: {
          characters: [
            person({ id: 'maya-chen', name: 'Maya Chen' }),
            person({ id: 'maya-lopez', name: 'Maya Lopez' }),
          ],
        },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('REVIEW');
    expect(result.reason).toMatch(/first_name|ambiguous/i);
  });
});
