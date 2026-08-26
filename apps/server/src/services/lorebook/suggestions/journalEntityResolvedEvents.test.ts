import { describe, expect, it } from 'vitest';

import { eventAcceptedForOrganization, readOrganizationAttributions } from '../../organizations/organizationEventAttribution';
import { planJournalResolvedEvent } from './journalEntityResolvedEvents';

const MARCUS = { id: 'char-marcus', names: ['Marcus'] };
const DEPOT = { id: 'loc-depot', names: ['Northwind Depot'] };
const NORTHWIND = { id: 'org-northwind', name: 'Northwind Logistics', groupType: 'company' };

describe('planJournalResolvedEvent', () => {
  it('creates a dated event when a journal names a saved person', () => {
    const plan = planJournalResolvedEvent({
      content: 'Had lunch with Marcus at the office cafeteria after the standup.',
      summary: 'Lunch with Marcus',
      occurredOn: '2026-03-12',
      linkedCharacterIds: [],
      characterRefs: [MARCUS],
      locationRefs: [],
      orgCatalog: [],
    });
    expect(plan?.people).toEqual([MARCUS.id]);
    expect(plan?.title).toBe('Lunch with Marcus');
  });

  it('keeps explicit character_memories links even when the name is abbreviated', () => {
    const plan = planJournalResolvedEvent({
      content: 'Caught up after work and talked through the week.',
      summary: null,
      occurredOn: '2026-03-12',
      linkedCharacterIds: [MARCUS.id],
      characterRefs: [MARCUS],
      locationRefs: [],
      orgCatalog: [],
    });
    expect(plan?.people).toEqual([MARCUS.id]);
  });

  it('attaches a saved place named in the journal', () => {
    const plan = planJournalResolvedEvent({
      content: 'Dropped a pallet at Northwind Depot before heading home.',
      summary: null,
      occurredOn: '2026-04-01',
      linkedCharacterIds: [],
      characterRefs: [],
      locationRefs: [DEPOT],
      orgCatalog: [],
    });
    expect(plan?.locations).toEqual([DEPOT.id]);
  });

  it('puts a saved company named in a dated journal on Organization Timeline', () => {
    const plan = planJournalResolvedEvent({
      content: 'Shift at Northwind Logistics ran long because of the new route.',
      summary: null,
      occurredOn: '2026-04-02',
      linkedCharacterIds: [],
      characterRefs: [],
      locationRefs: [],
      orgCatalog: [NORTHWIND],
    });
    expect(eventAcceptedForOrganization(readOrganizationAttributions(plan?.metadata), NORTHWIND.id)).toBe(true);
  });

  it('returns null when the journal does not name a book entity', () => {
    expect(
      planJournalResolvedEvent({
        content: 'Felt tired after a long day and went to bed early.',
        summary: null,
        occurredOn: '2026-04-03',
        linkedCharacterIds: [],
        characterRefs: [MARCUS],
        locationRefs: [DEPOT],
        orgCatalog: [NORTHWIND],
      }),
    ).toBeNull();
  });

  it('returns null without an occurrence date', () => {
    expect(
      planJournalResolvedEvent({
        content: 'Had lunch with Marcus at the office cafeteria after the standup.',
        summary: null,
        occurredOn: null,
        linkedCharacterIds: [],
        characterRefs: [MARCUS],
        locationRefs: [],
        orgCatalog: [],
      }),
    ).toBeNull();
  });
});
