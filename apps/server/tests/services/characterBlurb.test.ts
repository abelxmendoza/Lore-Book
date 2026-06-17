import { describe, expect, it } from 'vitest';

import type { DetectedAttribute } from '../../src/services/conversationCentered/entityAttributeDetector';

// Test blurb composition via a minimal inline mirror of the template logic
function composeSelfBlurb(
  name: string,
  attributes: Array<{ attributeType: string; attributeValue: string }>,
  hooks: string[]
): string {
  const occupation = attributes.find((a) => a.attributeType === 'occupation')?.attributeValue;
  const workplace = attributes.find((a) => a.attributeType === 'workplace')?.attributeValue;
  const core =
    occupation && workplace
      ? `${occupation} at ${workplace}`
      : occupation || 'builder of timelines and trouble';
  const hook = hooks[0] ? `${hooks[0]}.` : 'still collecting plot twists.';
  return `Main character energy: ${core} — ${hook}`;
}

describe('character display enrichment', () => {
  it('builds protagonist blurb from resume-style attributes', () => {
    const attrs: DetectedAttribute[] = [
      {
        entityId: 'c1',
        entityType: 'character',
        attributeType: 'occupation',
        attributeValue: 'Electronics Test & Validation Technician',
        confidence: 0.95,
        isCurrent: true,
        evidence: 'resume',
        evidenceSourceIds: [],
      },
      {
        entityId: 'c1',
        entityType: 'character',
        attributeType: 'workplace',
        attributeValue: 'RLH Industries, Inc.',
        confidence: 0.94,
        isCurrent: true,
        evidence: 'resume',
        evidenceSourceIds: [],
      },
    ];

    const blurb = composeSelfBlurb('Abel Mendoza', attrs, ['has an interview on the horizon']);
    expect(blurb).toContain('Electronics Test');
    expect(blurb).toContain('RLH Industries');
    expect(blurb).toContain('interview');
  });
});
