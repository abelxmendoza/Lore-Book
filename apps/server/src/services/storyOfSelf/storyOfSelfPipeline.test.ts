/**
 * Stage-level tests for the Story of Self pipeline, built from the observed
 * production failure modes (fictional cast only — see check:founder-privacy).
 */
import { describe, expect, it } from 'vitest';

import type { MemoryEntry } from '../../types';

import { resolveEntities, buildSeparationConstraints, isSeparated } from './entityResolution';
import { clusterCanonicalEvents } from './eventClustering';
import { classifyRecordType, normalizeEvidence } from './evidenceNormalizer';
import { scoreEvents } from './importanceScoring';
import {
  StoryOfSelfPipelineError,
  assertEventStageInput,
  type EvidenceRecord,
  type KnownEntity,
} from './narrativeRecords';
import { validateLeakage } from './qualityGates';
import { classifyArcLabel } from './turningPointAssessment';

let seq = 0;
function entry(content: string, date: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    user_id: 'u1',
    date,
    content,
    tags: [],
    source: 'chat',
    ...overrides,
  };
}

const ENTITIES: KnownEntity[] = [
  { id: 'diego-uncle', name: 'Diego', aliases: [], kind: 'person', relationshipRole: 'uncle', distinctFromIds: ['diego-scene'] },
  { id: 'diego-scene', name: 'Diego', aliases: ['Umbra'], kind: 'person', distinctFromIds: [] },
  { id: 'marcus', name: 'Marcus', aliases: [], kind: 'person', relationshipRole: 'coworker', distinctFromIds: [] },
  { id: 'northwind', name: 'Northwind Labs', aliases: [], kind: 'organization', distinctFromIds: [] },
];

describe('evidence normalization and record typing', () => {
  it('quarantines raw chat fragments and system artifacts', () => {
    const records = normalizeEvidence([
      entry('over capacity???', '2026-07-01'),
      entry('aww what happened?', '2026-07-01'),
      entry('I was expecting more', '2026-07-01'),
      entry('{"role":"assistant","content":"retry"}', '2026-07-01'),
      entry("I wasn't able to generate that. Try again later.", '2026-07-01'),
    ]);
    expect(records.every((r) => r.kind !== 'usable')).toBe(true);
  });

  it('keeps short but contentful entries usable', () => {
    const [r] = normalizeEvidence([entry('I started my new job today.', '2026-06-08')]);
    expect(r.kind).toBe('usable');
    expect(r.recordType).toBe('event');
  });

  it('classifies coworker metadata as entity_fact, not event', () => {
    expect(classifyRecordType('Marcus leads the failure analysis department.')).toBe('entity_fact');
    expect(classifyRecordType('Priya has a PhD in materials science.')).toBe('entity_fact');
  });

  it('classifies durable self-attributes as identity_fact', () => {
    expect(classifyRecordType('I grew up in a loud, close-knit family near the coast.')).toBe(
      'identity_fact'
    );
    expect(classifyRecordType('I have my black belt after a decade of training.')).toBe(
      'identity_fact'
    );
  });

  it('classifies present-progressive updates as current_state', () => {
    expect(classifyRecordType("I'm in week four of onboarding and still learning names.")).toBe(
      'current_state'
    );
  });

  it('does not treat positive group descriptions as entity facts', () => {
    expect(classifyRecordType('Everyone at the new job is young and welcoming.')).not.toBe(
      'entity_fact'
    );
  });
});

describe('runtime stage validation', () => {
  it('rejects entity facts flowing into event-only stages', () => {
    const records = normalizeEvidence([entry('Marcus leads the failure analysis department.', '2026-06-10')]);
    expect(() => assertEventStageInput('test', records)).toThrow(StoryOfSelfPipelineError);
  });
});

describe('arc label classification', () => {
  it('never labels positive workplace belonging as fall', () => {
    const { label } = classifyArcLabel(
      'Everyone at the new job is young and welcoming, really easy to connect with.',
      ['happy'],
      1
    );
    expect(label).not.toBe('fall');
  });

  it('requires explicit loss plus negative valence for fall', () => {
    const { label } = classifyArcLabel(
      'I got laid off and the whole plan fell apart. Worst month in years.',
      ['sad'],
      2
    );
    expect(label).toBe('fall');
  });

  it('labels earned gains as victory', () => {
    const { label } = classifyArcLabel(
      'I graduated with my Computer Science degree. So proud.',
      ['proud'],
      2
    );
    expect(label).toBe('victory');
  });

  it('does not promote single-record anxiety to awakening', () => {
    const { label } = classifyArcLabel(
      'First-day nerves. I realized I was anxious about waking up on time.',
      ['anxious'],
      1
    );
    expect(label).not.toBe('awakening');
  });

  it('defaults to ordinary_event on weak evidence', () => {
    const { label } = classifyArcLabel('Met two people from the second floor at lunch.', [], 1);
    expect(label).toBe('ordinary_event');
  });
});

describe('entity separation and collision handling', () => {
  it('builds constraints from roster distinct_from metadata and corrections', () => {
    const records = normalizeEvidence([
      entry("Umbra's name is Diego. Do not confuse him with my tío Diego.", '2026-07-02'),
    ]);
    const constraints = buildSeparationConstraints(ENTITIES, records);
    expect(isSeparated('diego-uncle', 'diego-scene', constraints)).toBe(true);
    const corrected = constraints.find((c) => c.evidenceIds.length > 0);
    expect(corrected).toBeDefined();
  });

  it('disambiguates a kinship mention to the kin entity', () => {
    const records = normalizeEvidence([
      entry("My tío Diego grilled all afternoon at the graduation party.", '2026-05-30'),
    ]);
    const { records: resolved } = resolveEntities(records, ENTITIES);
    expect(resolved[0].mentions.map((m) => m.entityId)).toContain('diego-uncle');
    expect(resolved[0].mentions.map((m) => m.entityId)).not.toContain('diego-scene');
  });

  it('pins ambiguous names via exclusive aliases in context', () => {
    const records = normalizeEvidence([
      entry('Went to goth night with Diego — Umbra was on the decks until 2am.', '2026-07-04'),
    ]);
    const { records: resolved } = resolveEntities(records, ENTITIES);
    expect(resolved[0].mentions.map((m) => m.entityId)).toContain('diego-scene');
    expect(resolved[0].mentions.map((m) => m.entityId)).not.toContain('diego-uncle');
  });

  it('records a collision warning instead of guessing on bare ambiguous names', () => {
    const records = normalizeEvidence([entry('Diego and I got tacos after the show.', '2026-07-05')]);
    const { records: resolved, collisionWarnings } = resolveEntities(records, ENTITIES);
    expect(resolved[0].mentions).toHaveLength(0);
    expect(collisionWarnings.length).toBeGreaterThan(0);
  });
});

describe('canonical event clustering', () => {
  function toEventRecords(entries: MemoryEntry[]): EvidenceRecord[] {
    const { records } = resolveEntities(normalizeEvidence(entries), ENTITIES);
    return records.filter(
      (r) => r.kind === 'usable' && (r.recordType === 'event' || r.recordType === 'current_state')
    );
  }

  it('collapses repeated onboarding memories into one canonical event', () => {
    const records = toEventRecords([
      entry('I started my new job at Northwind Labs today. First day at the failure analysis lab.', '2026-06-08'),
      entry('First day at Northwind Labs — met the failure analysis lab team, started my new job.', '2026-06-08'),
      entry('Started my new job this week at Northwind Labs, the failure analysis lab is impressive.', '2026-06-09'),
    ]);
    const { events, duplicateClusters } = clusterCanonicalEvents(records, [], ENTITIES);
    expect(events).toHaveLength(1);
    expect(duplicateClusters).toBe(1);
    expect(events[0].evidenceIds).toHaveLength(3);
    expect(events[0].organizationIds).toContain('northwind');
  });

  it('never links records across a separation constraint alone', () => {
    const constraints = buildSeparationConstraints(ENTITIES, []);
    const records = toEventRecords([
      entry('My tío Diego grilled carne asada at the family party on Saturday.', '2026-07-04'),
      entry('Diego — Umbra — played the Saturday party downtown, grilled bass all night.', '2026-07-04'),
    ]);
    const { events } = clusterCanonicalEvents(records, constraints, ENTITIES);
    expect(events).toHaveLength(2);
  });
});

describe('importance scoring', () => {
  it('ranks a foundational graduation above a recent nightlife anecdote', () => {
    const { records } = resolveEntities(
      normalizeEvidence([
        entry(
          'I graduated with my Computer Science degree yesterday. One of the biggest days of my life.',
          '2023-05-20',
          { mood: 'proud' }
        ),
        entry('I finished the last final and walked at graduation with my family cheering.', '2023-05-21'),
        entry('Went to a warehouse rave and lost my vape somewhere near the bar.', '2026-07-05'),
      ]),
      ENTITIES
    );
    const eventRecords = records.filter(
      (r) => r.kind === 'usable' && (r.recordType === 'event' || r.recordType === 'current_state')
    );
    const { events } = clusterCanonicalEvents(eventRecords, [], ENTITIES);
    const ranked = scoreEvents(events, eventRecords, ENTITIES, new Date('2026-07-10'));
    const graduation = ranked.find((e) => /graduat/i.test(e.summary));
    const rave = ranked.find((e) => /rave/i.test(e.summary));
    expect(graduation).toBeDefined();
    expect(rave).toBeDefined();
    expect(graduation!.importanceScore).toBeGreaterThan(rave!.importanceScore);
  });
});

describe('leakage validation', () => {
  it('rejects prose containing quarantined fragments', () => {
    const records = normalizeEvidence([entry('over capacity???', '2026-07-01')]);
    const gate = validateLeakage('Your story includes over capacity??? and more.', records);
    expect(gate.passed).toBe(false);
  });

  it('rejects long verbatim evidence dumps', () => {
    const longText = `Today I drove out to the venue and ${'really '.repeat(40)}enjoyed the whole night with everyone there.`;
    const records = normalizeEvidence([entry(longText, '2026-07-01')]);
    const gate = validateLeakage(`Narrative: ${records[0].text}`, records);
    expect(gate.passed).toBe(false);
  });

  it('passes clean synthesized prose', () => {
    const records = normalizeEvidence([entry('I started my new job at Northwind Labs today.', '2026-06-08')]);
    const gate = validateLeakage(
      'A major transition came when a new chapter of technical work opened at Northwind Labs.',
      records
    );
    expect(gate.passed).toBe(true);
  });
});
