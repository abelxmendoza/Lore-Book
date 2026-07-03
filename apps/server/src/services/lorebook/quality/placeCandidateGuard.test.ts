import { describe, it, expect } from 'vitest';
import { guardPlaceCandidate, isLikelyPlaceName } from './placeCandidateGuard';

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
    expect(loc('Amazon as a Quality Assurance Technician')?.rejectionReason).toBe('dal_role');
  });

  it('uses domain arbitration before place acceptance', () => {
    expect(loc('Ring Technician Job')?.rejectionReason).toBe('dal_role');
    expect(loc('Ring a sub company of Amazon')?.rejectionReason).toBe('dal_organization');
    expect(loc('Ring with')?.rejectionReason).toBe('dal_broken_span');
    expect(loc('pit she still said no')?.rejectionReason).toBe('dal_venue_subarea_context');
    expect(loc('her presence')?.rejectionReason).toBe('dal_social_context');
    expect(loc('This other promoter named Ruben')?.rejectionReason).toBe('dal_person');
  });

  it('rejects abstractions and descriptive-clause fragments', () => {
    // Stored junk found in the founder's Places book.
    expect(loc('Love')?.rejectionReason).toBe('generic_non_place_word');
    expect(loc('The Lounge anniversary where everyone danced')?.gate).toBe('reject');
  });

  it('rejects emotions and pronouns mis-grabbed as places', () => {
    expect(loc('depressed')?.rejectionReason).toBe('not_a_place_word');
    expect(loc('either')?.rejectionReason).toBe('not_a_place_word');
  });

  it('rejects unspecific generic place categories but keeps named venues', () => {
    // Generic categories — "go to the goth club", "goes to the gym".
    expect(loc('goth club')?.rejectionReason).toBe('unspecific_generic_place');
    expect(loc('gym')?.rejectionReason).toBe('unspecific_generic_place');
    expect(loc('house')?.rejectionReason).toBe('unspecific_generic_place');
    expect(loc('the bar')?.rejectionReason).toBe('unspecific_generic_place');
    expect(loc('music venue')?.rejectionReason).toBe('unspecific_generic_place');
    // Named, specific venues survive (proper noun present).
    expect(loc('Bricks Bar')).toBeNull();
    expect(loc('Bad Dogg Compound')).toBeNull();
    expect(loc('Anaheim')).toBeNull();
  });

  it('isLikelyPlaceName mirrors the guard for write paths', () => {
    expect(isLikelyPlaceName('Love')).toBe(false);
    expect(isLikelyPlaceName('all day')).toBe(false);
    expect(isLikelyPlaceName('The Lounge anniversary where everyone danced')).toBe(false);
    expect(isLikelyPlaceName('Riverside Park')).toBe(true);
    expect(isLikelyPlaceName('Main Street Pool and Billiards')).toBe(true);
    expect(isLikelyPlaceName('')).toBe(false);
  });
});
