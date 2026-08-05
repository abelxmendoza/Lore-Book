import { describe, expect, it } from 'vitest';

import { findTimelineSubjectCharacter } from './timelineCharacterSubject';

const characters = [
  {
    id: 'alex-collaborator',
    name: 'Alex Rivera',
    first_name: 'Alex',
    alias: ['Alex'],
    role: 'Creative Collaborator',
    importance_score: 78,
    metadata: { relationship_type: 'professional' },
  },
  {
    id: 'alex-partner',
    name: 'Alex',
    first_name: 'Alex',
    alias: ['Alex'],
    role: 'Girlfriend',
    importance_score: 95,
    metadata: { relationship_type: 'romantic' },
  },
  {
    id: 'jamie',
    name: 'Jamie Park',
    first_name: 'Jamie',
    alias: ['Jamie'],
    role: 'Friend',
    importance_score: 70,
    metadata: { relationship_type: 'friend' },
  },
];

describe('findTimelineSubjectCharacter', () => {
  it('resolves an exact full name before a shared first-name alias', () => {
    expect(findTimelineSubjectCharacter('Everything with Alex Rivera', null, characters)?.id)
      .toBe('alex-collaborator');
  });

  it('uses a romantic timeline lane to resolve an ambiguous first name', () => {
    expect(findTimelineSubjectCharacter(
      'Everything with Alex',
      { content: 'First date that felt easy.', timeline_names: ['Love'] },
      characters,
    )?.id).toBe('alex-partner');
  });

  it('does not guess a character when no known name or alias is present', () => {
    expect(findTimelineSubjectCharacter('My nightlife era', null, characters)).toBeNull();
  });
});
