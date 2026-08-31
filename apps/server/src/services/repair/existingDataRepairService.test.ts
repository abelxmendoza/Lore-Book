import { describe, expect, it } from 'vitest';

import { auditExistingDataRows } from './existingDataRepairService';

describe('existingDataRepairService', () => {
  it('reports deterministic wrong-domain and resume findings without mutating rows', () => {
    const locations = [
      {
        id: 'location-1',
        name: 'Vanguard Robotics',
        metadata: { section: 'employment', job_title: 'Engineer' },
      },
    ];
    const characters = [
      { id: 'character-1', name: "Here's", metadata: {} },
    ];
    const facts = [
      {
        id: 'fact-1',
        fact: 'email: alex@example.test',
        category: 'contact',
        metadata: { source: 'resume_upload' },
      },
    ];

    const report = auditExistingDataRows({
      userId: 'user-1',
      locations,
      characters,
      facts,
    });

    expect(report.counts.employer_as_place).toBe(1);
    expect(report.counts.false_person_candidate).toBe(1);
    expect(report.counts.resume_contact_fact).toBe(1);
    expect(locations[0].metadata).toEqual({ section: 'employment', job_title: 'Engineer' });
    expect(characters[0].metadata).toEqual({});
  });

  it('is idempotent for the same input', () => {
    const input = {
      userId: 'user-1',
      organizations: [
        { id: 'org-1', name: 'Vanguard Robotics', aliases: ['Vanguard'] },
        { id: 'org-2', name: 'Vanguard Robotics', aliases: [] },
      ],
    };

    const first = auditExistingDataRows(input);
    const second = auditExistingDataRows(input);

    expect(second.findings).toEqual(first.findings);
    expect(second.counts).toEqual(first.counts);
  });

  it('does not propose changes to user-confirmed records', () => {
    const report = auditExistingDataRows({
      userId: 'user-1',
      locations: [{ id: 'location-1', name: 'Vanguard Robotics', metadata: { user_confirmed: true } }],
      characters: [{ id: 'character-1', name: "Here's", metadata: { user_confirmed: true } }],
    });

    expect(report.findings).toEqual([]);
  });

  it('does not re-report records already marked by the repair path', () => {
    const report = auditExistingDataRows({
      userId: 'user-1',
      locations: [{
        id: 'location-1',
        name: 'Vanguard Robotics',
        metadata: {
          section: 'employment',
          repair_review: { kind: 'employer_as_place', review_state: 'pending' },
        },
      }],
      characters: [{
        id: 'character-1',
        name: "Here's",
        metadata: { repair_review: { kind: 'false_person_candidate' } },
      }],
    });

    expect(report.findings).toEqual([]);
  });
});
