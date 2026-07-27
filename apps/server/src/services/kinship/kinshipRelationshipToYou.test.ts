import { describe, expect, it } from 'vitest';
import {
  decideRelationshipToYouFromKinship,
  mapKinshipToRelationshipToYou,
} from './kinshipRelationshipToYou';

describe('mapKinshipToRelationshipToYou', () => {
  it('maps common kin terms onto Relationship to you values', () => {
    expect(mapKinshipToRelationshipToYou('cousin')).toBe('cousin');
    expect(mapKinshipToRelationshipToYou('Uncle')).toBe('uncle');
    expect(mapKinshipToRelationshipToYou('stepdad')).toBe('step_parent');
    expect(mapKinshipToRelationshipToYou('hermana')).toBe('sibling');
  });
});

describe('decideRelationshipToYouFromKinship', () => {
  it('applies for title-leading real kin (Cousin James)', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'cousin',
      characterName: 'Cousin James',
      context: 'hanging out this weekend',
    });
    expect(d).toMatchObject({ apply: true, value: 'cousin' });
  });

  it('skips trailing/stage personas (Goth Tio)', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'uncle',
      characterName: 'Goth Tio',
      context: 'met him at the warehouse goth show',
    });
    expect(d.apply).toBe(false);
    expect(d.value).toBe('uncle');
  });

  it('skips title-looking stage names when scene context is present', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'uncle',
      characterName: 'Uncle Jeremy',
      context: 'DJ set at the goth club',
    });
    expect(d.apply).toBe(false);
    expect(d.reason).toMatch(/scene\/stage/i);
  });

  it('applies explicit "my cousin" claims even without a title-leading name', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'cousin',
      characterName: 'James',
      context: 'James is my cousin',
      explicitClaim: true,
    });
    expect(d).toMatchObject({ apply: true, value: 'cousin' });
  });

  it('never overwrites a user-confirmed relationship_to_user', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'cousin',
      characterName: 'Cousin James',
      explicitClaim: true,
      metadata: { relationship_to_user: 'friend', relationship_to_user_source: 'user_confirmed' },
    });
    expect(d.apply).toBe(false);
    expect(d.reason).toMatch(/user confirmed/i);
  });

  it('skips stage/public-figure metadata flags', () => {
    const d = decideRelationshipToYouFromKinship({
      kinship: 'uncle',
      characterName: 'Uncle Jeremy',
      explicitClaim: false,
      metadata: { name_kind: 'stage_name' },
    });
    expect(d.apply).toBe(false);
  });
});
