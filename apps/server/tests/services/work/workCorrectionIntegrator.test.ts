import { describe, it, expect } from 'vitest';

import { applyRosterCorrection } from '../../../src/services/work/workCorrectionIntegrator';
import { buildWorkContext } from '../../../src/services/work/workContextResolver';
import { composeWorkAnswer } from '../../../src/services/responseScope/focusedRecallComposer';
import { planResponseScope } from '../../../src/services/responseScope/responseScopePlanner';

// Fictional cast only.
const baseContext = () =>
  buildWorkContext({
    employmentPhrase: 'Quality Assurance Technician at Voltra Dynamics (Titanworks)',
    organizations: [{ id: 'org-1', name: 'Voltra Dynamics' }],
    workPeople: [{ name: 'Kelan', roleEvidence: 'lead developer' }, { name: 'Dorian' }],
  });

describe('roster correction integration', () => {
  it('adds the forgotten names as coworkers and records the correction', () => {
    const corrected = applyRosterCorrection(baseContext(), ['Kavi', 'Joss', 'Wren']);
    const names = corrected.coworkers.map((p) => p.displayName);
    expect(names).toEqual(expect.arrayContaining(['Kavi', 'Joss', 'Wren']));
    expect(corrected.correctionsApplied[0]).toMatch(/Kavi, Joss, Wren/);
    // User-stated additions carry high confidence but no invented role.
    const kavi = corrected.coworkers.find((p) => p.displayName === 'Kavi');
    expect(kavi?.relationship).toBe('coworker');
    expect(kavi?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('is idempotent for names already on the roster', () => {
    const corrected = applyRosterCorrection(baseContext(), ['Kelan', 'Dorian']);
    expect(corrected.correctionsApplied).toHaveLength(0);
    expect(corrected.coworkers.filter((p) => p.displayName === 'Dorian')).toHaveLength(1);
  });

  it('the corrected answer acknowledges and answers — no memory dump', () => {
    const plan = planResponseScope('you forgot Kavi, Joss, and Wren', { previousIntent: 'work' });
    const corrected = applyRosterCorrection(baseContext(), plan.correctionNames);
    const answer = composeWorkAnswer(corrected, plan);

    expect(answer).toMatch(/you'?re right/i);
    expect(answer).toContain('Kavi');
    expect(answer).toContain('Kelan');
    expect(answer).not.toMatch(/memory layer|character memory|structured|all characters|provenance/i);
    // Corrections update the answer, not the response size.
    expect(answer.length).toBeLessThan(800);
  });
});
