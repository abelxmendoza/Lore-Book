import { describe, expect, it } from 'vitest';

import {
  classifyPlacePresence,
  classifyTagBucket,
  detectCompoundPlaceNames,
  hasPlaceParticipation,
  stripVenueAliasTail,
} from '../../../src/services/locations/placePresenceSemantics';

describe('placePresenceSemantics', () => {
  it('treats bare name drops as mentions, not visits', () => {
    expect(
      classifyPlacePresence('Stanford', 'Thinking about Stanford admissions again.'),
    ).toBe('mention');
  });

  it('detects first-person visit language', () => {
    expect(
      classifyPlacePresence('Mile Square Park', 'I ran at Mile Square Park this morning.'),
    ).toBe('visit');
    expect(
      classifyPlacePresence('Northwind Depot', 'We went to Northwind Depot after work.'),
    ).toBe('visit');
  });

  it('does not treat same-message people as present without a participation predicate', () => {
    const text =
      'I ran at Mile Square Park. Later Kelly texted about Cyberpunk and Sam mentioned verification.';
    expect(hasPlaceParticipation('Kelly', 'Mile Square Park', text)).toBe(false);
    expect(hasPlaceParticipation('Sam', 'Mile Square Park', text)).toBe(false);
  });

  it('accepts explicit co-presence language', () => {
    const text = 'Jamie and I went to Vanguard Hall after dinner.';
    expect(hasPlaceParticipation('Jamie', 'Vanguard Hall', text)).toBe(true);
  });

  it('buckets story/dev tags away from intrinsic place identity', () => {
    expect(classifyTagBucket('technology')).toBe('story');
    expect(classifyTagBucket('ui')).toBe('story');
    expect(classifyTagBucket('nightlife')).toBe('visit_context');
  });

  it('detects compound venue cards that should be split', () => {
    expect(detectCompoundPlaceNames('Nova Hall and Echo Lounge')).toEqual([
      'Nova Hall',
      'Echo Lounge',
    ]);
    expect(detectCompoundPlaceNames("Mom's House")).toBeNull();
  });

  it('strips venue alias tails', () => {
    expect(stripVenueAliasTail('Nova Hall the club')).toBe('Nova Hall');
    expect(stripVenueAliasTail('Nova Hall')).toBeNull();
  });
});
