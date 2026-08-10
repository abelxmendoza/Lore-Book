import { describe, it, expect } from 'vitest';
import { assessMilestone, MILESTONE_ELIGIBLE_THRESHOLD } from './milestoneClassifier';
import type { SignificanceInputs } from '../events/eventSignificanceService';

const baseSignals: SignificanceInputs = {
  peopleCount: 0,
  locationsCount: 0,
  sourceUnitCount: 1,
  emotionalIntensity: 0,
  identityImpactCount: 0,
  relationshipImpact: 0,
  careerImpact: 0,
  isFirstOccurrence: false,
  hasLifeChangeIndicator: false,
  hasExplicitMeaning: false,
  title: 'Went to the store',
  summary: 'Picked up groceries.',
  type: 'EVENT',
};

describe('assessMilestone', () => {
  it('flags a first-time life-change event with high emotional weight as eligible', () => {
    const assessment = assessMilestone(
      { title: 'I quit the band', summary: 'It was time to move on for good.' },
      {
        ...baseSignals,
        peopleCount: 3,
        emotionalIntensity: 0.9,
        identityImpactCount: 2,
        isFirstOccurrence: true,
        hasLifeChangeIndicator: true,
        hasExplicitMeaning: true,
        title: 'I quit the band',
        summary: 'It was time to move on for good.',
      },
    );

    expect(assessment.eligible).toBe(true);
    expect(assessment.finalScore).toBeGreaterThanOrEqual(MILESTONE_ELIGIBLE_THRESHOLD);
    expect(assessment.firstTime).toBe(true);
    expect(assessment.reasons).toContain('first_occurrence');
    expect(assessment.reasons).toContain('life_change_indicator');
  });

  it('leaves a low-signal ordinary event ineligible', () => {
    const assessment = assessMilestone(
      { title: baseSignals.title, summary: baseSignals.summary },
      baseSignals,
    );

    expect(assessment.eligible).toBe(false);
    expect(assessment.reasons).toContain('below_milestone_threshold');
  });

  it('detects public commitment language', () => {
    const assessment = assessMilestone(
      { title: 'I announced the news', summary: 'Told everyone about the big move.' },
      { ...baseSignals, title: 'I announced the news', summary: 'Told everyone about the big move.' },
    );

    expect(assessment.publicCommitment).toBe(true);
    expect(assessment.reasons).toContain('public_commitment');
  });

  it('scales career and relationship impact into the 0-100 progress fields', () => {
    const assessment = assessMilestone(
      { title: baseSignals.title, summary: baseSignals.summary },
      { ...baseSignals, careerImpact: 1, relationshipImpact: 1 },
    );

    expect(assessment.careerProgress).toBe(100);
    expect(assessment.relationshipImpact).toBe(100);
    expect(assessment.reasons).toContain('career_impact');
    expect(assessment.reasons).toContain('relationship_impact');
  });

  it('keeps eligibility consistent with the threshold invariant across scores', () => {
    for (const overrides of [
      {},
      { emotionalIntensity: 0.5, peopleCount: 2 },
      { hasExplicitMeaning: true, isFirstOccurrence: true },
      { hasLifeChangeIndicator: true, hasExplicitMeaning: true, identityImpactCount: 2 },
    ]) {
      const assessment = assessMilestone(
        { title: baseSignals.title, summary: baseSignals.summary },
        { ...baseSignals, ...overrides },
      );
      expect(assessment.eligible).toBe(assessment.finalScore >= MILESTONE_ELIGIBLE_THRESHOLD);
    }
  });
});
