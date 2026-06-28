import { describe, it, expect } from 'vitest';
import { guardPlaceCandidate } from './placeCandidateGuard';

const loc = (name: string) => guardPlaceCandidate({ name, domain: 'locations' });

describe('guardPlaceCandidate', () => {
  it('rejects the real-world garbage place suggestions', () => {
    // Every one of these was wrongly surfaced as a "place detected in your chats".
    const garbage = [
      'home coding Lorebook all weekend',
      'Amazon now as of',
      'Amazon as a Quality Assurance Technician',
      'work',
      'mail',
      'all day',
      'my project',
    ];
    for (const name of garbage) {
      expect(guardPlaceCandidate({ name, domain: 'locations' })?.gate, name).toBe('reject');
    }
  });

  it('keeps real place names (single and multi-word venues)', () => {
    const places = [
      'Blue Note Lounge',
      'Main Street Pool and Billiards', // multi-word venue with "and" must survive
      'Riverside Park',
      'Portland',
      'Downtown Coffee House',
      "Grandma's House",
      'Lobby Cafe',
    ];
    for (const name of places) {
      expect(loc(name), name).toBeNull();
    }
  });

  it('only applies to the locations domain', () => {
    expect(guardPlaceCandidate({ name: 'work', domain: 'skills' })).toBeNull();
    expect(guardPlaceCandidate({ name: 'my project', domain: 'projects' })).toBeNull();
  });

  it('classifies the rejection reasons', () => {
    expect(loc('all day')?.rejectionReason).toBe('temporal_phrase_not_place');
    expect(loc('mail')?.rejectionReason).toBe('generic_non_place_word');
    expect(loc('my project')?.rejectionReason).toBe('possessive_generic_non_place');
    expect(loc('home coding Lorebook all weekend')?.rejectionReason).toMatch(/activity|temporal/);
    expect(loc('Amazon as a Quality Assurance Technician')?.rejectionReason).toBe('sentence_fragment_span');
  });
});
