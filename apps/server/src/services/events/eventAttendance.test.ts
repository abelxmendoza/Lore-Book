import { describe, it, expect } from 'vitest';

import { inferEventAttendance } from './eventAttendance';

describe('inferEventAttendance', () => {
  it('marks events the user only heard about as not attended', () => {
    expect(
      inferEventAttendance(
        'The other show was the “Self Made” show that Undisputed World Champions was throwing, but the scene still needed more space from me.',
      ).attendance,
    ).toBe('not_attended');
    expect(inferEventAttendance("I didn't go to the afters").attendance).toBe('not_attended');
    expect(inferEventAttendance('I missed it, stayed home instead').attendance).toBe('not_attended');
  });

  it('marks first-person presence as attended', () => {
    expect(inferEventAttendance("I'm going to this show rn at First Street Pool and Billiards").attendance).toBe('attended');
    expect(inferEventAttendance('We pulled up to the gothicumbia around ten').attendance).toBe('attended');
  });

  it('not-attended cues win over attendance words in the same line', () => {
    expect(inferEventAttendance("Everyone went to the show but I didn't make it").attendance).toBe('not_attended');
  });

  it('stays unknown without a cue', () => {
    expect(inferEventAttendance('Self Made was a ska show').attendance).toBe('unknown');
    expect(inferEventAttendance('').attendance).toBe('unknown');
  });
});
