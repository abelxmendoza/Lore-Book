import { describe, expect, it } from 'vitest';
import {
  computeEventSignificance,
  type SignificanceInputs,
} from '../../src/services/events/eventSignificanceService';

describe('eventSignificanceService', () => {
  const base: SignificanceInputs = {
    peopleCount: 0,
    locationsCount: 0,
    sourceUnitCount: 0,
    emotionalIntensity: 0,
    identityImpactCount: 0,
    relationshipImpact: 0,
    careerImpact: 0,
    isFirstOccurrence: false,
    hasLifeChangeIndicator: false,
    hasExplicitMeaning: false,
    title: '',
    summary: '',
    type: '',
  };

  it('scores job offer as high', () => {
    const { significanceScore, significanceLevel } = computeEventSignificance({
      ...base,
      title: 'Job offer from Amazon',
      summary: 'Received a job offer',
      careerImpact: 1,
      hasLifeChangeIndicator: true,
      sourceUnitCount: 2,
    });
    expect(significanceScore).toBeGreaterThanOrEqual(50);
    expect(significanceLevel).toMatch(/moderate|major|legendary/);
  });

  it('scores Costco + Grandma Rose meaning as high', () => {
    const { significanceScore } = computeEventSignificance({
      ...base,
      title: 'Costco trip',
      summary: 'The highlight was that my Grandma Rose is still alive',
      peopleCount: 2,
      hasExplicitMeaning: true,
      relationshipImpact: 1,
    });
    expect(significanceScore).toBeGreaterThanOrEqual(35);
  });

  it('scores routine Costco lower without meaning', () => {
    const plain = computeEventSignificance({
      ...base,
      title: 'Costco trip',
      summary: 'Bought groceries',
      locationsCount: 1,
    });
    const meaningful = computeEventSignificance({
      ...base,
      title: 'Costco trip',
      summary: 'The highlight was that my Grandma Rose is still alive',
      peopleCount: 2,
      hasExplicitMeaning: true,
    });
    expect(meaningful.significanceScore).toBeGreaterThan(plain.significanceScore);
  });
});
