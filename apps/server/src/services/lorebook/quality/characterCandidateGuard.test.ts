import { describe, expect, it } from 'vitest';

import { evaluateEntityQuality, passesEntityQualityGate } from './entityQualityGateService';
import { guardCharacterCandidate } from './characterCandidateGuard';
import { createCrossBookIndex } from '../../lexical/projects/projectCrossBookGuard';

describe('guardCharacterCandidate', () => {
  it('rejects process labels, job titles, media, and software', () => {
    const garbage = [
      'Background Check',
      'Quality Assurance Technician',
      'One Piece',
      'Claude Code',
      'Electrical Engineering',
      'Support Team',
      'User mentioned',
      'Relationships',
    ];
    for (const name of garbage) {
      const verdict = guardCharacterCandidate({ name, domain: 'characters' });
      expect(verdict?.gate, name).toBe('reject');
      expect(passesEntityQualityGate(evaluateEntityQuality({ name, domain: 'characters' }))).toBe(false);
    }
  });

  it('keeps her friend unresolved instead of promoting a person card', () => {
    const verdict = guardCharacterCandidate({ name: 'her friend', domain: 'characters' });
    expect(verdict?.gate).toBe('reject');
    expect(verdict?.rejectionReason).toMatch(/unresolved|generic|not_promotable|individual/i);
  });

  it('allows a stable person name', () => {
    expect(guardCharacterCandidate({ name: 'Maya Chen', domain: 'characters' })).toBeNull();
    expect(guardCharacterCandidate({ name: 'Oscar Martinez', domain: 'characters' })).toBeNull();
    expect(guardCharacterCandidate({ name: 'Maya', domain: 'characters' })).toBeNull();
  });

  it('does not retype a person because nearby text mentions software', () => {
    const story = 'Maya and I talked after class. I use Claude Code every day.';
    expect(
      guardCharacterCandidate({
        name: 'Maya',
        domain: 'characters',
        contextText: story,
        evidence: story,
      }),
    ).toBeNull();
  });

  it('only applies to characters', () => {
    expect(guardCharacterCandidate({ name: 'Background Check', domain: 'locations' })).toBeNull();
  });

  it('rejects a canonical place used as a character', () => {
    const verdict = evaluateEntityQuality(
      { name: 'Riverside Park', domain: 'characters' },
      { crossBook: createCrossBookIndex({ places: ['Riverside Park'] }) },
    );
    expect(verdict.gate).toBe('reject');
    expect(verdict.rejectionReason).toMatch(/place|canonical/i);
  });
});
