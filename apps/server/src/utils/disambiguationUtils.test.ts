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

  it('does not match unrelated multi-word phrases as a bare mention', () => {
    expect(messageReferencesMention('Velvet Hour played last night', 'Fairy')).toBe(false);
  });

  it('does not match unrelated messages', () => {
    expect(
      messageReferencesMention(
        'Yesterday I stayed in to build LifeLedger with Codex and Cursor',
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
          { role: 'user', content: 'Yesterday I stayed in to build LifeLedger' },
          { role: 'assistant', content: 'Got it — you spent time on LifeLedger.' },
        ],
        "I didn't even mention Velvet Hour in this convo",
        'Fairy'
      )
    ).toBe(false);
  });

  it('threadUserHistoryReferencesMention is false when mention never appeared in user turns', () => {
    expect(
      threadUserHistoryReferencesMention(
        [
          { role: 'user', content: 'Testing LifeLedger changes and finding bugs' },
          { role: 'assistant', content: 'Velvet Hour played at Blue Room last year.' },
        ],
        'Still testing features',
        'Fairy'
      )
    ).toBe(false);
  });

  it('matches multi-word mentions exactly', () => {
    expect(messageReferencesMention('We met Velvet Hour there', 'Velvet Hour')).toBe(true);
    expect(messageReferencesMention('We met Fairy there', 'Velvet Hour')).toBe(false);
  });
});

describe('normalizeDisambiguationCandidates', () => {
  it('dedupes by character id', () => {
    const result = dedupeCandidatesById([
      { character_id: 'a', name: 'Velvet Hour' },
      { character_id: 'a', name: 'Velvet Hour' },
      { character_id: 'b', name: 'Mr. Chino' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('collapses alias-linked characters', () => {
    const result = collapseAliasLinkedCandidates(
      [
        { character_id: 'daisy', name: 'Daisy' },
        { character_id: 'hell', name: 'Velvet Hour from the Underground Scene' },
      ],
      [
        { id: 'daisy', name: 'Daisy', alias: ['Velvet Hour'] },
        { id: 'hell', name: 'Velvet Hour from the Underground Scene', alias: [] },
      ]
    );
    expect(result).toHaveLength(1);
    expect(result[0].character_id).toBe('daisy');
  });

  it('collapses same normalized display names', () => {
    const result = collapseSameNameCandidates([
      { character_id: 'a', name: 'Velvet Hour' },
      { character_id: 'b', name: 'velvet hour' },
    ]);
    expect(result).toHaveLength(1);
  });

  it('runs the full normalization pipeline', () => {
    const result = normalizeDisambiguationCandidates(
      [
        { character_id: 'daisy', name: 'Daisy' },
        { character_id: 'hell', name: 'Velvet Hour from the Underground Scene' },
        { character_id: 'hell', name: 'Velvet Hour from the Underground Scene' },
      ],
      [{ id: 'daisy', name: 'Daisy', alias: ['Velvet Hour'] }, { id: 'hell', name: 'Velvet Hour from the Underground Scene', alias: [] }]
    );
    expect(result).toHaveLength(1);
  });
});
