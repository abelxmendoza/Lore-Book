import { describe, expect, it } from 'vitest';
import { extractKinshipMentions } from '../../src/services/kinship/kinshipGlossary';

describe('familyGraphService kinship coverage', () => {
  it('detects all kinship roles in a rich family sentence', () => {
    const text =
      "Visited Abuela and Mom at Dad's apartment with Tío Rafa, Tía Grace, and cousin Marco";
    const mentions = extractKinshipMentions(text);
    const roles = mentions.map((m) => m.role);
    expect(roles).toContain('GRANDMOTHER');
    expect(roles).toContain('MOTHER');
    expect(roles).toContain('FATHER');
    expect(roles.some((r) => r === 'UNCLE' || r === 'AUNT' || r === 'COUSIN')).toBe(true);
  });
});
