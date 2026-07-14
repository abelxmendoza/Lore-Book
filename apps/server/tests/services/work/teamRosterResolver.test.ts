import { describe, it, expect } from 'vitest';

import { resolveTeamRoster, rosterNames } from '../../../src/services/work/teamRosterResolver';
import type { WorkContextInputs } from '../../../src/services/work/workContextTypes';

// Fictional team only — never real coworkers in tests.
const inputs: WorkContextInputs = {
  organizations: [],
  workPeople: [
    { name: 'Kavi', roleEvidence: 'main on-site lead when Cole is absent' },
    { name: 'Wren', roleEvidence: 'lead engineer; not on-site often' },
    { name: 'Kelan', roleEvidence: 'lead developer' },
    { name: 'Dorian', roleEvidence: null },
    { name: 'Rhys', roleEvidence: '' },
    { name: 'Joss', roleEvidence: 'not there as often' },
    { name: 'Cole', roleEvidence: 'veteran, long-tenured from the early days' },
    { name: 'Mara', roleEvidence: 'my manager' },
  ],
};

describe('team roster resolution', () => {
  it('maps explicit role evidence to work relationships', () => {
    const roster = resolveTeamRoster(inputs);
    expect(roster.managers.map((p) => p.displayName)).toEqual(['Mara']);
    const leadNames = roster.leads.map((p) => `${p.displayName}:${p.relationship}`);
    expect(leadNames).toEqual(
      expect.arrayContaining(['Kavi:team_lead', 'Wren:lead_engineer', 'Kelan:lead_developer']),
    );
  });

  it('people without role evidence default to coworker — never romantic/family/friend', () => {
    const roster = resolveTeamRoster(inputs);
    const dorian = roster.coworkers.find((p) => p.displayName === 'Dorian');
    expect(dorian?.relationship).toBe('coworker');
    for (const person of [...roster.managers, ...roster.leads, ...roster.coworkers]) {
      expect(['manager', 'team_lead', 'lead_engineer', 'lead_developer', 'coworker', 'veteran_team_member']).toContain(
        person.relationship,
      );
    }
  });

  it('captures attendance patterns without inventing biography', () => {
    const roster = resolveTeamRoster(inputs);
    const kavi = roster.leads.find((p) => p.displayName === 'Kavi');
    expect(kavi?.attendancePattern).toMatch(/when Cole is absent/i);
    const wren = roster.leads.find((p) => p.displayName === 'Wren');
    expect(wren?.attendancePattern).toMatch(/not on-site often/i);
  });

  it('long tenure requires explicit support', () => {
    const roster = resolveTeamRoster(inputs);
    const cole = roster.coworkers.find((p) => p.displayName === 'Cole');
    expect(cole?.relationship).toBe('veteran_team_member');
    const rhys = roster.coworkers.find((p) => p.displayName === 'Rhys');
    expect(rhys?.relationship).toBe('coworker');
  });

  it('a stored romantic type never enters the work roster', () => {
    const roster = resolveTeamRoster({
      organizations: [],
      workPeople: [{ name: 'Vexadoll', storedRelationshipType: 'crush', roleEvidence: null }],
    });
    expect(rosterNames(roster)).not.toContain('Vexadoll');
    expect(roster.warnings[0]).toMatch(/non-work relationship/);
  });
});
