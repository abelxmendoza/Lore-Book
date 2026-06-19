import { describe, it, expect } from 'vitest';
import {
  getRomanticDemoProfile,
  enrichMockAnalytics,
  pickMetricValue,
} from './romanticDemoProfiles';
import { getMockRelationshipAnalytics } from './romanticRelationships';

describe('romanticDemoProfiles', () => {
  it('gives each demo relationship a distinct persona', () => {
    const alex = getRomanticDemoProfile('rel-001');
    const jordan = getRomanticDemoProfile('rel-002');
    const riley = getRomanticDemoProfile('rel-007');

    expect(alex?.headline).toMatch(/anchor/i);
    expect(jordan?.primaryMetrics).toHaveLength(2);
    expect(jordan?.showAttachmentDynamics).toBe(false);
    expect(riley?.overviewEmphasis).toBe('flags');
    expect(riley?.primaryMetrics).toEqual(['health']);
  });

  it('replaces generic analytics copy with tailored insights', () => {
    const analytics = getMockRelationshipAnalytics('rel-003');
    expect(analytics?.insights[0]).toMatch(/situationship/i);
    expect(analytics?.insights.some((i) => i.includes('red flag'))).toBe(false);
  });

  it('enriches base analytics without losing scores', () => {
    const base = enrichMockAnalytics('rel-001', {
      relationshipId: 'rel-001',
      personId: 'x',
      personName: 'Alex',
      affectionScore: 0.9,
      compatibilityScore: 0.9,
      healthScore: 0.9,
      intensityScore: 0.8,
      strengths: [],
      weaknesses: [],
      pros: [],
      cons: [],
      redFlags: [],
      greenFlags: [],
      insights: ['generic'],
      recommendations: [],
      affectionTrend: 'stable',
      healthTrend: 'stable',
      calculatedAt: new Date().toISOString(),
    });
    expect(pickMetricValue('affection', base)).toBe(0.9);
    expect(base.insights[0]).toMatch(/Alex/i);
  });
});
