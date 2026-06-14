import { describe, expect, it } from 'vitest';

import {
  collapseAliasLinkedCandidates,
  collapseSameNameCandidates,
  dedupeCandidatesById,
  messageReferencesMention,
  normalizeDisambiguationCandidates,
  threadUserHistoryReferencesMention,
} from './disambiguationUtils';

describe('messageReferencesMention', () => {
  it('matches a bare token in the message', () => {
    expect(messageReferencesMention('I saw Fairy at the club', 'Fairy')).toBe(true);
  });

  it('matches when mention is part of a multi-word name', () => {
    expect(messageReferencesMention('Hell Fairy played last night', 'Fairy')).toBe(true);
  });

  it('does not match unrelated messages', () => {
    expect(
      messageReferencesMention(
        'Yesterday I stayed in to build LoreBook with Codex and Cursor',
        'Fairy'
      )
    ).toBe(false);
  });

  it('does not match substrings inside other words (features ≠ Fairy)', () => {
    expect(
      messageReferencesMention(
        'It got me getting features working better and doing what i want',
        'Fairy'
      )
    ).toBe(false);
  });

  it('does not match when user is complaining about an erroneous prompt', () => {
    expect(
      threadUserHistoryReferencesMention(
        [
          { role: 'user', content: 'Yesterday I stayed in to build LoreBook' },
          { role: 'assistant', content: 'Got it — you spent time on LoreBook.' },
        ],
        "I didn't even mention Hell Fairy in this convo",
        'Fairy'
      )
    ).toBe(true); // current message mentions Fairy — callers must gate on established history
  });

  it('threadUserHistoryReferencesMention is false when mention never appeared in user turns', () => {
    expect(
      threadUserHistoryReferencesMention(
        [
          { role: 'user', content: 'Testing LoreBook changes and finding bugs' },
          { role: 'assistant', content: 'Hell Fairy played at Club Metro last year.' },
        ],
        'Still testing features',
        'Fairy'
      )
    ).toBe(false);
  });

  it('matches multi-word mentions exactly', () => {
    expect(messageReferencesMention('We met Hell Fairy there', 'Hell Fairy')).toBe(true);
    expect(messageReferencesMention('We met Fairy there', 'Hell Fairy')).toBe(false);
  });
});

describe('normalizeDisambiguationCandidates', () => {
  it('dedupes by character id', () => {
    const result = dedupeCandidatesById([
      { character_id: 'a', name: 'Hell Fairy' },
      { character_id: 'a', name: 'Hell Fairy' },
      { character_id: 'b', name: 'Mr. Chino' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('collapses alias-linked characters', () => {
    const result = collapseAliasLinkedCandidates(
      [
        { character_id: 'daisy', name: 'Daisy' },
        { character_id: 'hell', name: 'Hell Fairy from the Underground Scene' },
      ],
      [
        { id: 'daisy', name: 'Daisy', alias: ['Hell Fairy'] },
        { id: 'hell', name: 'Hell Fairy from the Underground Scene', alias: [] },
      ]
    );
    expect(result).toHaveLength(1);
    expect(result[0].character_id).toBe('daisy');
  });

  it('collapses same normalized display names', () => {
    const result = collapseSameNameCandidates([
      { character_id: 'a', name: 'Hell Fairy' },
      { character_id: 'b', name: 'hell fairy' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('runs the full normalization pipeline', () => {
    const result = normalizeDisambiguationCandidates(
      [
        { character_id: 'daisy', name: 'Daisy' },
        { character_id: 'hell', name: 'Hell Fairy from the Underground Scene' },
        { character_id: 'hell', name: 'Hell Fairy from the Underground Scene' },
      ],
      [{ id: 'daisy', name: 'Daisy', alias: ['Hell Fairy'] }, { id: 'hell', name: 'Hell Fairy from the Underground Scene', alias: [] }]
    );
    expect(result).toHaveLength(1);
  });
});
