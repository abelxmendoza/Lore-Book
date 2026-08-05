import { describe, expect, it } from 'vitest';
import {
  composeRomanticRelationshipBadgeLabel,
  formatExclusivityLabel,
  isRedundantRomanceIdentityLabel,
  resolveCharacterRomanceIdentity,
} from './romanticRelationshipLabel';
import {
  lexicalBadgesFromRelationship,
} from './lexicalRelationshipLabels';

describe('romanticRelationshipLabel', () => {
  it('uses Dating & Romance showcase tag for Sam situationship', () => {
    expect(
      composeRomanticRelationshipBadgeLabel({
        id: 'rel-003',
        relationship_type: 'situationship',
        status: 'active',
        is_situationship: true,
        exclusivity_status: 'not_exclusive',
      }),
    ).toBe('Situationship · Not exclusive');
  });

  it('does not repeat Situationship when type is already situationship', () => {
    const label = composeRomanticRelationshipBadgeLabel({
      relationship_type: 'situationship',
      status: 'active',
      is_situationship: true,
      exclusivity_status: 'not_exclusive',
    });
    expect(label).toBe('Situationship · Not exclusive');
    expect(label.match(/situationship/gi)?.length).toBe(1);
  });

  it('formats exclusivity tokens', () => {
    expect(formatExclusivityLabel('not_exclusive')).toBe('Not exclusive');
    expect(formatExclusivityLabel('exclusive')).toBe('Exclusive');
  });

  it('detects redundant identity labels', () => {
    expect(isRedundantRomanceIdentityLabel('Situationship', 'situationship')).toBe(true);
    expect(isRedundantRomanceIdentityLabel('Girlfriend', 'girlfriend')).toBe(true);
    expect(isRedundantRomanceIdentityLabel('Soft launch', 'situationship')).toBe(false);
  });

  it('resolves romance identity from character fields when no romance row is linked', () => {
    expect(
      resolveCharacterRomanceIdentity({
        role: 'Situationship',
        archetype: 'romantic',
        tags: ['romantic', 'situationship', 'active'],
        metadata: { relationship_type: 'situationship' },
        status: 'active',
      }),
    ).toBe('Situationship · Not exclusive');
  });
});

describe('lexicalBadgesFromRelationship', () => {
  it('does not emit duplicate Situationship badges for situationship rows', () => {
    const badges = lexicalBadgesFromRelationship({
      relationship_type: 'situationship',
      is_situationship: true,
      status: 'active',
    });
    expect(badges.filter((b) => /situationship/i.test(b.label))).toHaveLength(0);
  });
});
