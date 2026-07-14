import { describe, it, expect } from 'vitest';

import { buildWorkContext } from '../../../src/services/work/workContextResolver';
import { inferTenure, resolveCurrentRole } from '../../../src/services/work/currentRoleResolver';
import { composeWorkAnswer } from '../../../src/services/responseScope/focusedRecallComposer';
import { planResponseScope } from '../../../src/services/responseScope/responseScopePlanner';
import type { WorkContextInputs } from '../../../src/services/work/workContextTypes';

// Fictional employer/team only.
const INPUTS: WorkContextInputs = {
  employmentPhrase: 'Quality Assurance Technician at Voltra Dynamics (Titanworks), Diagnostics and Prototypes Team',
  organizations: [
    { id: 'org-1', name: 'Voltra Dynamics', parentName: 'Titanworks' },
    { id: 'org-2', name: 'Diagnostics and Prototypes Team', isTeam: true },
  ],
  workPeople: [
    { name: 'Kavi', roleEvidence: 'main on-site lead when Cole is absent' },
    { name: 'Wren', roleEvidence: 'lead engineer; not on-site often' },
    { name: 'Kelan', roleEvidence: 'lead developer' },
    { name: 'Dorian' },
    { name: 'Rhys' },
  ],
  tenureStatements: [{ text: "It's my 4th week here.", statedAt: '2026-07-06T18:00:00Z' }],
};

describe('current role resolution', () => {
  it('resolves role, organization, parent organization, and team', () => {
    const role = resolveCurrentRole(INPUTS);
    expect(role.currentRole?.title).toBe('Quality Assurance Technician');
    expect(role.currentRole?.status).toBe('current');
    expect(role.organization?.name).toBe('Voltra Dynamics');
    expect(role.parentOrganization?.name).toBe('Titanworks');
    expect(role.team?.name).toBe('Diagnostics and Prototypes Team');
  });
});

describe('tenure inference', () => {
  it('fourth week means about one month, precision week, no exact start date', () => {
    const tenure = inferTenure(INPUTS.tenureStatements);
    expect(tenure?.precision).toBe('week');
    expect(tenure?.phrase).toMatch(/about one month/);
    const range = tenure?.inferredStartDateRange;
    expect(range).toBeDefined();
    // A window, never a fabricated single day.
    expect(range!.earliest).not.toBe(range!.latest);
    expect(range!.earliest < range!.latest).toBe(true);
    // ~4 weeks before July 6 → early-to-mid June window.
    expect(range!.earliest.startsWith('2026-06')).toBe(true);
  });
});

describe('work context + focused answer', () => {
  it('answers the team question from work evidence only', () => {
    const context = buildWorkContext(INPUTS);
    const plan = planResponseScope("Who's on my team at Titanworks?");
    const answer = composeWorkAnswer(context, plan);

    for (const name of ['Kavi', 'Wren', 'Kelan', 'Dorian', 'Rhys']) {
      expect(answer).toContain(name);
    }
    expect(answer).toMatch(/lead engineer/i);
    expect(answer).toMatch(/lead developer/i);
    // No dump shapes.
    expect(answer).not.toMatch(/memory layer|character memory|structured|provenance/i);
    expect(answer.length).toBeLessThan(1200);
  });

  it('degrades honestly when no teammates are recorded', () => {
    const context = buildWorkContext({ ...INPUTS, workPeople: [] });
    const answer = composeWorkAnswer(context, planResponseScope('who do I work with?'));
    expect(answer).toMatch(/don'?t have teammates recorded/i);
    expect(answer).toContain('Voltra Dynamics');
  });
});
