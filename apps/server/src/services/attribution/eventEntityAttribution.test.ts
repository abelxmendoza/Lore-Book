import { describe, expect, it } from 'vitest';
import { applyAttributionCorrection } from './eventAttributionCorrections';
import { explainEventEntityAttribution } from './eventAttributionDiagnostics';
import {
  attributeNamedEntities,
  classifyOrganizationAttribution,
  classifyPersonAttribution,
  classifyPlaceAttribution,
  selectCanonicalLocations,
  selectCanonicalPeople,
} from './eventEntityAttribution';
import { characterBelongsOnCanonicalEvent, locationBelongsOnCanonicalEvent } from './eventAttributionProjection';

const MAYA = { id: 'char-maya', type: 'PERSON', primary_name: 'Maya' };
const PRIYA = { id: 'char-priya', type: 'PERSON', primary_name: 'Priya' };
const JORDAN = { id: 'char-jordan', type: 'PERSON', primary_name: 'Jordan Skasby' };
const KHALIL = { id: 'char-khalil', type: 'PERSON', primary_name: 'Khalil' };
const SHYLA = { id: 'char-shyla', type: 'PERSON', primary_name: 'Shyla' };
const GENNI = { id: 'char-genni', type: 'PERSON', primary_name: 'Genni' };
const CATCH_ONE = { id: 'loc-catch-one', type: 'LOCATION', primary_name: 'Catch One' };
const DISNEYLAND = { id: 'loc-disneyland', type: 'LOCATION', primary_name: 'Disneyland' };
const CLUB_METRO = { id: 'loc-club-metro', type: 'LOCATION', primary_name: 'Club Metro' };
const USC = { id: 'loc-usc', type: 'LOCATION', primary_name: 'USC' };
const RIVIAN = { id: 'org-rivian', type: 'ORG', primary_name: 'Rivian' };
const CLAUDE = { id: 'app-claude-code', type: 'APP', primary_name: 'Claude Code' };

describe('event entity attribution contract', () => {
  it('1. “I went with Maya” → Maya participant', () => {
    const row = classifyPersonAttribution('Maya', 'I went to the show with Maya.');
    expect(row).toMatchObject({ role: 'participant', accepted: true, canonical: true, reason: 'explicit_with_phrase' });
  });

  it('2. “I saw Maya there” → Maya grounded association', () => {
    const row = classifyPersonAttribution('Maya', 'I saw Maya at the show.');
    expect(row).toMatchObject({ role: 'participant', accepted: true, reason: 'observed_present' });
  });

  it('3. “I thought about Maya” → not attendance', () => {
    const row = classifyPersonAttribution('Maya', 'I went to the show and kept thinking about Maya.');
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('thought_about');
  });

  it('4. “Maya wasn\'t there” → not participant', () => {
    const row = classifyPersonAttribution('Maya', "Maya wasn't there.");
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('negation');
  });

  it('5. “I wanted Maya there” → not participant', () => {
    const row = classifyPersonAttribution('Maya', 'I wanted Maya to come.');
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('desire_or_plan');
  });

  it('6. “I might go with Maya” → future/planned, not completed', () => {
    const row = classifyPersonAttribution('Maya', 'I might go with Maya next week.');
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('future_or_planned');
  });

  it('7. “Jordan told me Maya went” → reported attendance, not shared interaction', () => {
    const row = classifyPersonAttribution('Maya', 'Jordan told me Maya went to the show.');
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('hearsay_reported_attendance');
    expect(classifyPersonAttribution('Jordan', 'Jordan told me Maya went to the show.').accepted).toBe(false);
  });

  it('8. “after the Jordan Skasby set” → Jordan not actor from timing phrase', () => {
    const text = 'After the Jordan Skasby set, I talked to Maya.';
    expect(classifyPersonAttribution('Jordan Skasby', text)).toMatchObject({
      accepted: false,
      reason: 'timing_phrase',
    });
    expect(classifyPersonAttribution('Maya', text).accepted).toBe(true);
  });

  it('9. “next to Khalil\'s desk” → Khalil not present', () => {
    const row = classifyPersonAttribution('Khalil', "I was standing next to Khalil's desk.");
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('possessive_owner');
  });

  it('10. “Shyla\'s friend” → not automatically Shyla', () => {
    const row = classifyPersonAttribution('Shyla', "Shyla's friend was there.");
    expect(row.accepted).toBe(false);
    expect(row.role).toBe('unresolved');
    expect(row.reason).toBe('relational_description');
  });

  it('11. Person later in the same message does not contaminate the earlier event', () => {
    const text = 'I went to Club Metro with Maya. Later I was thinking about Priya because we hadn\'t talked in months.';
    const { peopleIds } = selectCanonicalPeople([MAYA, PRIYA], text);
    expect(peopleIds).toEqual(['char-maya']);
  });

  it('12–13. Episode/thread co-mention is not event participation', () => {
    const outing = 'I interviewed with Rivian today.';
    const later = 'Later Genni posted something online.';
    expect(selectCanonicalPeople([GENNI, MAYA], `${outing} ${later}`).peopleIds).toEqual([]);
  });

  it('14. Explicit event participant survives', () => {
    const { peopleIds } = selectCanonicalPeople([MAYA, PRIYA], 'I talked to Maya after the show.');
    expect(peopleIds).toEqual(['char-maya']);
  });

  it('15. Explicit negation overrides weaker positive inference', () => {
    const row = classifyPersonAttribution('Maya', 'I went with Maya. Maya wasn\'t there.');
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('negation');
  });

  it('16. Correct alias resolves canonical person', () => {
    const row = classifyPersonAttribution('Maya Chen', 'I went to the show with Maya.', {
      entityId: 'char-maya',
      aliases: ['Maya'],
    });
    expect(row.accepted).toBe(true);
    expect(row.entityId).toBe('char-maya');
  });

  it('17. Same-name people remain distinct by entity id', () => {
    const alexA = { id: 'char-alex-a', type: 'PERSON', primary_name: 'Alex', aliases: ['Alex Rivera'] };
    const alexB = { id: 'char-alex-b', type: 'PERSON', primary_name: 'Alex', aliases: ['Alex Kim'] };
    const { peopleIds } = selectCanonicalPeople(
      [alexA, alexB],
      'I went to Catch One with Alex Rivera. I thought about Alex Kim afterward.',
    );
    expect(peopleIds).toEqual(['char-alex-a']);
  });

  it('18. Place mentioned as destination/location is associated', () => {
    expect(classifyPlaceAttribution('Catch One', 'I went to Catch One.').canonical).toBe(true);
  });

  it('19. Place merely discussed is not event location', () => {
    const text = 'I was at Catch One and told Maya about Disneyland.';
    const { locationIds } = selectCanonicalLocations([CATCH_ONE, DISNEYLAND], text);
    expect(locationIds).toEqual(['loc-catch-one']);
    expect(classifyPlaceAttribution('Disneyland', text).reason).toBe('discussed_not_visited');
  });

  it('20. Organization employer relationship does not attach unrelated people', () => {
    const text = 'Conner recruits for Rivian. Later Genni posted something online.';
    expect(selectCanonicalPeople([GENNI], text).peopleIds).toEqual([]);
    expect(classifyOrganizationAttribution('Rivian', text).role).toBe('employer');
    expect(classifyOrganizationAttribution('Rivian', text).accepted).toBe(false);
  });

  it('21. Software/tool is not organization membership', () => {
    const row = classifyOrganizationAttribution('Claude Code', 'Claude Code helped me build LoreBook.', {
      entityType: 'APP',
    });
    expect(row.accepted).toBe(false);
    expect(row.reason).toBe('software_or_tool_not_membership');
  });

  it('22. Character chronology only receives grounded associated events', () => {
    const concert = {
      id: 'evt-concert',
      title: 'Club Metro outing',
      summary: 'I went to a concert with Maya. I thought about Priya afterward.',
      people: ['char-maya', 'char-priya'],
      metadata: {
        entityAttributions: attributeNamedEntities(
          [MAYA, PRIYA],
          'I went to a concert with Maya. I thought about Priya afterward.',
        ),
      },
    };
    expect(characterBelongsOnCanonicalEvent(concert, { id: 'char-maya', name: 'Maya' }).associated).toBe(true);
    expect(characterBelongsOnCanonicalEvent(concert, { id: 'char-priya', name: 'Priya' }).associated).toBe(false);
  });

  it('23. Location chronology only receives grounded location events', () => {
    const event = {
      id: 'evt-catch-one',
      title: 'Night at Catch One',
      summary: 'I was at Catch One and told Maya about Disneyland.',
      locations: ['loc-catch-one', 'loc-disneyland'],
      metadata: {
        entityAttributions: attributeNamedEntities(
          [CATCH_ONE, DISNEYLAND],
          'I was at Catch One and told Maya about Disneyland.',
        ),
      },
    };
    expect(locationBelongsOnCanonicalEvent(event, { id: 'loc-catch-one', name: 'Catch One' }).associated).toBe(true);
    expect(locationBelongsOnCanonicalEvent(event, { id: 'loc-disneyland', name: 'Disneyland' }).associated).toBe(false);
  });

  it('24. Subject timeline can include reference-only material but labels WHY', () => {
    const row = classifyPersonAttribution('Priya', 'I thought about Priya afterward.');
    expect(row.role).toBe('referenced');
    expect(row.reason).toBe('thought_about');
    expect(row.accepted).toBe(false);
  });

  it('25. Correction removes false participant without deleting the event', () => {
    const result = applyAttributionCorrection(
      {
        id: 'evt-party',
        people: ['char-maya', 'char-marcus'],
        locations: ['loc-catch-one'],
        metadata: {},
      },
      { action: 'retract', entityId: 'char-maya', reason: 'Maya wasn\'t actually at that party.' },
    );
    expect(result.eventId).toBe('evt-party');
    expect(result.people).toEqual(['char-marcus']);
    expect(result.locations).toEqual(['loc-catch-one']);
    expect(result.duplicateCreated).toBe(false);
  });

  it('26. Correction swaps mistaken entity', () => {
    const result = applyAttributionCorrection(
      { id: 'evt-party', people: ['char-maya'], locations: [], metadata: {} },
      { action: 'replace_person', entityId: 'char-maya', replacementEntityId: 'char-priya', replacementName: 'Priya' },
    );
    expect(result.people).toEqual(['char-priya']);
    expect(result.eventId).toBe('evt-party');
  });

  it('27. Correction changes mistaken place', () => {
    const result = applyAttributionCorrection(
      { id: 'evt-night', people: ['char-maya'], locations: ['loc-catch-one'], metadata: {} },
      {
        action: 'replace_place',
        entityId: 'loc-catch-one',
        replacementEntityId: 'loc-club-metro',
        replacementName: 'Club Metro',
      },
    );
    expect(result.locations).toEqual(['loc-club-metro']);
    expect(result.eventId).toBe('evt-night');
  });

  it('28. Null primary entity is allowed when nothing is grounded', () => {
    const { peopleIds } = selectCanonicalPeople(
      [PRIYA],
      'I kept thinking about Priya because we hadn\'t talked in months.',
    );
    expect(peopleIds).toEqual([]);
  });

  it('29. Legacy contaminated compatibility row cannot override canonical association', () => {
    const event = {
      id: 'evt-legacy',
      title: 'Club Metro outing',
      summary: 'I went to Club Metro with Maya. Later I was thinking about Priya.',
      people: ['char-maya', 'char-priya'],
      metadata: {
        entityAttributions: attributeNamedEntities(
          [MAYA, PRIYA],
          'I went to Club Metro with Maya. Later I was thinking about Priya.',
        ),
      },
    };
    const priya = characterBelongsOnCanonicalEvent(event, { id: 'char-priya', name: 'Priya' });
    expect(priya.compatibility).toBe(true);
    expect(priya.associated).toBe(false);
    expect(priya.canonical).toBe(false);
  });

  it('30. Tenant isolation is encoded in the correction and repair write keys', async () => {
    const { readFileSync } = await import('node:fs');
    const correctionSrc = readFileSync('src/services/attribution/resolvedEventAttributionService.ts', 'utf8');
    const repairSrc = readFileSync('src/services/attribution/resolvedEventAttributionRepairService.ts', 'utf8');
    expect(correctionSrc).toMatch(/\.eq\('user_id', userId\)/);
    expect(correctionSrc).toMatch(/\.eq\('id', eventId\)/);
    expect(repairSrc).toMatch(/\.eq\('user_id', userId\)/);
    expect(repairSrc).toMatch(/\.eq\('id', plan\.eventId\)/);
    expect(correctionSrc).not.toMatch(/\.insert\(/);
    expect(repairSrc).not.toMatch(/\.insert\(/);
  });

  it('31–32. Stable canonical event ID survives attribution correction; no duplicate event', () => {
    const first = applyAttributionCorrection(
      { id: 'evt-stable', people: ['char-maya'], locations: [CATCH_ONE.id], metadata: {} },
      { action: 'retract', entityId: 'char-maya' },
    );
    const second = applyAttributionCorrection(
      { id: first.eventId, people: first.people, locations: first.locations, metadata: first.metadata },
      {
        action: 'replace_place',
        entityId: CATCH_ONE.id,
        replacementEntityId: CLUB_METRO.id,
        replacementName: 'Club Metro',
      },
    );
    expect(first.eventId).toBe('evt-stable');
    expect(second.eventId).toBe('evt-stable');
    expect(second.duplicateCreated).toBe(false);
  });

  it('generic place names are not event locations', () => {
    expect(classifyPlaceAttribution('warehouse', 'I was at the warehouse.').accepted).toBe(false);
    expect(classifyPlaceAttribution('home', 'I was talking about Catch One while sitting at home.').accepted).toBe(false);
  });

  it('drove past USC is not attendance/enrollment', () => {
    expect(classifyPlaceAttribution('USC', 'I drove past USC.').reason).toBe('observed_place_not_attendance');
  });

  it('third-party USC graduation is not protagonist education or event location', () => {
    expect(classifyPlaceAttribution('USC', 'My coworker graduated from USC.').accepted).toBe(false);
  });

  it('diagnostics explain why an event is or is not on a character timeline', () => {
    const event = {
      id: 'evt-diag',
      title: 'Club Metro outing',
      summary: 'I went to Club Metro with Maya. I thought about Priya afterward.',
      people: ['char-maya', 'char-priya'],
      metadata: {
        entityAttributions: attributeNamedEntities(
          [MAYA, PRIYA],
          'I went to Club Metro with Maya. I thought about Priya afterward.',
        ),
      },
    };
    const maya = explainEventEntityAttribution({ event, entityId: 'char-maya', entityName: 'Maya' });
    const priya = explainEventEntityAttribution({ event, entityId: 'char-priya', entityName: 'Priya' });
    expect(maya.accepted).toBe(true);
    expect(maya.evidenceSource).toBe('explicit_with_phrase');
    expect(priya.accepted).toBe(false);
    expect(priya.rejectedInferenceReason).toBe('thought_about');
  });
});
