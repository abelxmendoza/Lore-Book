import { describe, expect, it } from 'vitest';

import { resolveRelationshipToYou, relationshipToYouLabel } from './relationshipToYou';

describe('relationshipToYou', () => {
  it('prefers explicit metadata over You-link', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { relationship_to_user: 'coworker', relationship_to_user_source: 'user_confirmed' },
        relationships: [{ character_name: 'You', relationship_type: 'friend' }],
      }),
    ).toEqual({ value: 'coworker', source: 'user_confirmed' });
  });

  it('falls back to You relationship from chat', () => {
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'mentor', status: 'inferred' }],
      }),
    ).toEqual({ value: 'mentor', source: 'auto' });
  });

  it('normalizes kinship labels like Cousin / cousin_of onto option keys', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { kinship_label: 'Cousin' },
      }),
    ).toEqual({ value: 'cousin', source: 'chat' });
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'cousin_of', status: 'active' }],
      }),
    ).toEqual({ value: 'cousin', source: 'chat' });
  });

  it('labels known presets', () => {
    expect(relationshipToYouLabel('close_friend')).toBe('Close friend');
    expect(relationshipToYouLabel('step_parent')).toBe('Step-parent');
  });
});
