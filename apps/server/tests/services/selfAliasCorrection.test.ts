import { describe, expect, it } from 'vitest';
import {
  buildPreferredSelfAliasUpdate,
  extractPreferredSelfAliasCorrection,
} from '../../src/services/selfCharacterService';

describe('preferred protagonist alias correction', () => {
  it('extracts the corrected spelling from timeline context', () => {
    expect(
      extractPreferredSelfAliasCorrection(
        'Show a timeline of my time as Midnight Harb0r, the correct spelling has a 0 at the end.',
      ),
    ).toBe('Midnight Harb0r');
  });

  it('preserves the previous spelling while preferring the correction', () => {
    const update = buildPreferredSelfAliasUpdate({
      aliases: ['Midnight Harbor'],
      metadata: {},
      correctedAlias: 'Midnight Harb0r',
      sourceMessageId: 'message-a',
      now: '2026-07-20T10:00:00.000Z',
    });
    expect(update.aliases).toEqual(['Midnight Harbor', 'Midnight Harb0r']);
    expect(update.metadata.preferred_self_alias).toBe('Midnight Harb0r');
    expect(update.metadata.self_alias_evidence).toHaveLength(1);
  });
});
