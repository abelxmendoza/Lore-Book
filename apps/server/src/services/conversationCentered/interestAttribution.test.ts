import { describe, it, expect } from 'vitest';
import {
  mergeAttributionLinksIntoMetadata,
  markCharacterDismissedInMetadata,
  restoreCharacterInMetadata,
  readCharacterAttributions,
  readDismissedCharacterIds,
} from './interestAttribution';

describe('interestAttribution', () => {
  it('merges attach links into metadata with an event trail', () => {
    const meta = mergeAttributionLinksIntoMetadata(
      {},
      [
        {
          characterId: 'self-1',
          reason: 'first_person_self',
          stance: 'self',
          evidence: "I'm into anime",
        },
      ],
      { sourceMessageId: 'msg-1', now: '2026-07-24T00:00:00.000Z' },
    );

    const attrs = readCharacterAttributions(meta);
    expect(attrs['self-1']?.reason).toBe('first_person_self');
    expect(attrs['self-1']?.stance).toBe('self');
    expect(attrs['self-1']?.evidence).toBe("I'm into anime");
    expect(Array.isArray(meta.attribution_events)).toBe(true);
    expect((meta.attribution_events as unknown[]).length).toBe(1);
  });

  it('records dismissals so re-ingest cannot silently reattach', () => {
    const attached = mergeAttributionLinksIntoMetadata(
      {},
      [
        {
          characterId: 'mom-1',
          reason: 'explicit_attribution',
          stance: 'other_person',
          evidence: 'Mom loves knitting',
        },
      ],
      { now: '2026-07-24T00:00:00.000Z' },
    );

    const dismissed = markCharacterDismissedInMetadata(attached, 'mom-1', 'user_dismissed', {
      now: '2026-07-24T01:00:00.000Z',
    });

    expect(readDismissedCharacterIds(dismissed)).toContain('mom-1');
    expect(readCharacterAttributions(dismissed)['mom-1']?.stance).toBe('dismissed');
    expect(
      mergeAttributionLinksIntoMetadata(dismissed, [
        {
          characterId: 'mom-1',
          reason: 'explicit_attribution',
          stance: 'other_person',
          evidence: 'Mom loves knitting',
        },
      ]).character_attributions,
    ).toEqual(readCharacterAttributions(dismissed));
  });

  it('restores a dismissed character and clears the learn-not-to-reattach block', () => {
    const dismissed = markCharacterDismissedInMetadata(
      {},
      'mom-1',
      'user_dismissed',
      { now: '2026-07-24T01:00:00.000Z' },
    );
    const restored = restoreCharacterInMetadata(dismissed, 'mom-1', {
      now: '2026-07-24T02:00:00.000Z',
      stance: 'other_person',
    });

    expect(readDismissedCharacterIds(restored)).not.toContain('mom-1');
    expect(readCharacterAttributions(restored)['mom-1']?.reason).toBe('user_restored');
    expect(readCharacterAttributions(restored)['mom-1']?.stance).toBe('other_person');
  });
});
