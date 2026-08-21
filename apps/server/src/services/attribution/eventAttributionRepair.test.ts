import { describe, expect, it } from 'vitest';
import { planResolvedEventAttributionRepair } from './eventAttributionRepair';

const MAYA = { id: 'char-maya', names: ['Maya'] };
const PRIYA = { id: 'char-priya', names: ['Priya'] };
const CATCH_ONE = { id: 'loc-catch-one', names: ['Catch One'] };
const DISNEYLAND = { id: 'loc-disneyland', names: ['Disneyland'] };
const CLUB_METRO = { id: 'loc-club-metro', names: ['Club Metro'] };

describe('planResolvedEventAttributionRepair', () => {
  it('removes a thought-about person from a contaminated people[] without changing the event id', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-concert',
        title: 'Club Metro outing',
        summary: 'I went to a concert with Maya. I thought about Priya afterward.',
        people: ['char-maya', 'char-priya'],
        locations: [],
      },
      [MAYA, PRIYA],
      [],
    );
    expect(plan.eventId).toBe('evt-concert');
    expect(plan.people).toEqual(['char-maya']);
    expect(plan.peopleRemoved).toEqual(['char-priya']);
    expect(plan.changed).toBe(true);
  });

  it('does not treat a discussed place as the event location', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-catch-one',
        title: 'Night at Catch One',
        summary: 'I was at Catch One and told Maya about Disneyland.',
        people: ['char-maya'],
        locations: ['loc-catch-one', 'loc-disneyland'],
      },
      [MAYA],
      [CATCH_ONE, DISNEYLAND],
    );
    expect(plan.locations).toEqual(['loc-catch-one']);
    expect(plan.locationsRemoved).toEqual(['loc-disneyland']);
  });

  it('uses linked unit text when the title omits the participation cue', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-short-title',
        title: 'Concert',
        summary: '',
        people: ['char-maya'],
        locations: [],
      },
      [MAYA],
      [],
      'I went to the show with Maya.',
    );
    expect(plan.people).toEqual(['char-maya']);
    expect(plan.peopleRemoved).toEqual([]);
  });

  it('drops unverified compatibility ids when the name never appears in evidence text', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-unverified',
        title: 'Camping trip',
        summary: 'Went camping',
        people: ['char-priya'],
        locations: [],
      },
      [PRIYA],
      [],
    );
    expect(plan.people).toEqual([]);
    expect(plan.peopleRemoved).toEqual(['char-priya']);
  });

  it('honors a prior user retract and does not re-add the person from “with” language', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-party',
        title: 'Party',
        summary: 'I went to the party with Maya.',
        people: [],
        locations: [],
        metadata: {
          attributionCorrections: [{ action: 'retract', entityId: 'char-maya' }],
        },
      },
      [MAYA],
      [],
    );
    expect(plan.people).toEqual([]);
    expect(plan.peopleAdded).toEqual([]);
  });

  it('does not pull an unmentioned roster character onto the event', () => {
    const jamie = { id: 'char-jamie', names: ['Jamie'] };
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-concert',
        title: 'Club Metro outing',
        summary: 'I went to a concert with Maya.',
        people: ['char-maya'],
        locations: [],
      },
      [MAYA, jamie],
      [],
    );
    expect(plan.people).toEqual(['char-maya']);
    expect(plan.attributions.some((row) => row.entityId === 'char-jamie')).toBe(false);
  });

  it('adds a grounded participant named in evidence even if people[] omitted them', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-show',
        title: 'Show',
        summary: 'I went to the show with Maya.',
        people: [],
        locations: [],
      },
      [MAYA, PRIYA],
      [],
    );
    expect(plan.people).toEqual(['char-maya']);
    expect(plan.peopleAdded).toEqual(['char-maya']);
    expect(plan.people).not.toContain('char-priya');
  });

  it('stamps entityAttributions when people[] is already correct but metadata is missing', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-stamp',
        title: 'Club Metro outing',
        summary: 'I went to a concert with Maya.',
        people: ['char-maya'],
        locations: [],
      },
      [MAYA],
      [],
    );
    expect(plan.people).toEqual(['char-maya']);
    expect(plan.peopleRemoved).toEqual([]);
    expect(plan.changed).toBe(true);
    expect(plan.attributions.some((row) => row.entityId === 'char-maya' && row.canonical)).toBe(true);
  });

  it('keeps a stable event id when swapping a mistaken place via replacement already applied', () => {
    const plan = planResolvedEventAttributionRepair(
      {
        id: 'evt-night',
        title: 'Night out',
        summary: 'I went to Club Metro with Maya.',
        people: ['char-maya'],
        locations: ['loc-club-metro'],
        metadata: {
          attributionCorrections: [
            { action: 'replace_place', entityId: 'loc-catch-one', replacementEntityId: 'loc-club-metro' },
          ],
        },
      },
      [MAYA],
      [CATCH_ONE, CLUB_METRO],
    );
    expect(plan.eventId).toBe('evt-night');
    expect(plan.locations).toEqual(['loc-club-metro']);
    expect(plan.locations).not.toContain('loc-catch-one');
  });
});
