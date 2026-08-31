import { describe, expect, it } from 'vitest';

import type { DetectedAttribute } from '../../src/services/conversationCentered/entityAttributeDetector';

function composeSelfBlurb(attributes: Array<{ attributeType: string; attributeValue: string }>): string {
  const occupation = attributes.find((a) => a.attributeType === 'occupation')?.attributeValue;
  const workplace = attributes.find((a) => a.attributeType === 'workplace')?.attributeValue;
  if (occupation && workplace) return `${occupation} at ${workplace}`;
  if (occupation) return occupation;
  return 'Your story grows with every chat.';
}

describe('character display enrichment', () => {
  it('builds a factual protagonist tagline from occupation and workplace', () => {
    const attrs: DetectedAttribute[] = [
      {
        entityId: 'c1',
        entityType: 'character',
        attributeType: 'occupation',
        attributeValue: 'Quality Assurance Technician',
        confidence: 0.95,
        isCurrent: true,
        evidence: 'resume',
        evidenceSourceIds: [],
      },
      {
        entityId: 'c1',
        entityType: 'character',
        attributeType: 'workplace',
        attributeValue: 'Vanguard Robotics',
        confidence: 0.94,
        isCurrent: true,
        evidence: 'resume',
        evidenceSourceIds: [],
      },
    ];

    const blurb = composeSelfBlurb(attrs);
    expect(blurb).toBe('Quality Assurance Technician at Vanguard Robotics');
    expect(blurb).not.toMatch(/main character energy|warehouse diagnostics/i);
  });
});
