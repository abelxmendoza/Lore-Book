import { describe, expect, it } from 'vitest';
import {
  isCastRosterQuery,
  isCharacterBookWriteRequest,
  isOrganizationGroupWriteRequest,
  isClosedScopeQuery,
  isFocusEntityRelevant,
} from './closedScopeIntent';

describe('isCastRosterQuery', () => {
  it('matches the reported query shape', () => {
    expect(isCastRosterQuery("who's new and returning in this story, like the people/characters?")).toBe(true);
  });

  it('matches "who have I mentioned in this thread"', () => {
    expect(isCastRosterQuery('who have I mentioned so far in this thread?')).toBe(true);
  });

  it('does not match a plain whole-life roster query', () => {
    expect(isCastRosterQuery("who's in my story?")).toBe(false);
    expect(isCastRosterQuery('who are the people in my life?')).toBe(false);
  });

  it('does not match an unrelated message', () => {
    expect(isCastRosterQuery('what did I eat for lunch yesterday?')).toBe(false);
  });

  it('does not steal group roster provision lists', () => {
    expect(
      isCastRosterQuery('So far we have NeonPulse, VelvetFox, LumaJade, Star Bats, and Neon Pixie'),
    ).toBe(false);
  });
});

describe('isCharacterBookWriteRequest', () => {
  it('matches an explicit character-book save request', () => {
    expect(isCharacterBookWriteRequest('make sure they are all in my character book please')).toBe(true);
    expect(isCharacterBookWriteRequest('please add them all to my character book')).toBe(true);
  });

  it('does not match ordinary chat', () => {
    expect(isCharacterBookWriteRequest('tell me about my character book')).toBe(false);
  });
});

describe('isOrganizationGroupWriteRequest', () => {
  it('matches make/create a group', () => {
    expect(isOrganizationGroupWriteRequest('shes a popular egirl. make a group for that')).toBe(true);
    expect(isOrganizationGroupWriteRequest('create a group for underground artists')).toBe(true);
  });

  it('matches a roster provision list', () => {
    expect(
      isOrganizationGroupWriteRequest(
        'So far we have NeonPulse, VelvetFox, LumaJade, Star Bats, and Neon Pixie',
      ),
    ).toBe(true);
  });

  it('does not match ordinary chat', () => {
    expect(isOrganizationGroupWriteRequest('how was your day?')).toBe(false);
  });
});

describe('isClosedScopeQuery', () => {
  it('tags cast roster queries with the right reason', () => {
    expect(isClosedScopeQuery("who's new and returning in this story?")).toEqual({
      closedScope: true,
      reason: 'cast_roster_query',
    });
  });

  it('tags group writes ahead of cast queries', () => {
    expect(isClosedScopeQuery('make a group for that')).toEqual({
      closedScope: true,
      reason: 'organization_group_write_request',
    });
  });

  it('returns closedScope: false for ordinary chat', () => {
    expect(isClosedScopeQuery('how was your day?')).toEqual({ closedScope: false });
  });
});

describe('isFocusEntityRelevant', () => {
  it('is relevant when the message names the focus entity', () => {
    expect(isFocusEntityRelevant('tell me more about Marcus', 'Marcus')).toBe(true);
  });

  it('is not relevant when the message never mentions the focus entity', () => {
    expect(isFocusEntityRelevant("who's new and returning in this story?", 'Marcus')).toBe(false);
  });

  it('matches on an alias', () => {
    expect(isFocusEntityRelevant('what about Marc?', 'Marcus', ['Marc'])).toBe(true);
  });
});
