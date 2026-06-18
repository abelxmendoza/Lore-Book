import { describe, expect, it } from 'vitest';

import {
  extractLexicalSignals,
  lexicalBadgesFromSignals,
} from '../../src/lib/lexicalRelationshipLabels';

describe('lexicalRelationshipLabels', () => {
  it('builds badges from lexical_signals metadata', () => {
    const badges = lexicalBadgesFromSignals(
      extractLexicalSignals({
        lexical_signals: {
          social_roles: [{ role: 'close_friend', attributedToSelf: true }],
          romantic_signals: [{ status: 'ghosted', isSituationship: false, tags: ['soft_launch'] }],
          discourse_moves: [{ move: 'STORY_OPEN' }],
        },
      }),
    );
    expect(badges.some((b) => b.label === 'Close friend')).toBe(true);
    expect(badges.some((b) => b.label === 'Ghosted')).toBe(true);
    expect(badges.some((b) => b.label === 'Soft launch')).toBe(true);
  });
});
