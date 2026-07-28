/**
 * Shared closed-scope intent predicates for chat CRUD routing.
 */
import { describe, expect, it } from 'vitest';
import {
  isCastRosterQuery,
  isCharacterBookWriteRequest,
  isOrganizationGroupFollowUpRequest,
  isOrganizationGroupWriteRequest,
  isEntityReclassifyWriteRequest,
  isLocationWriteRequest,
  isProjectWriteRequest,
  isSkillWriteRequest,
  isQuestWriteRequest,
  isFamilyWriteRequest,
  isRomanceWriteRequest,
  isClosedScopeQuery,
  isFocusEntityRelevant,
} from './closedScopeIntent';

describe('isCastRosterQuery', () => {
  it('matches the reported query shape', () => {
    expect(isCastRosterQuery("who's new and returning in this story, like the people/characters?")).toBe(true);
  });

  it('does not steal group roster provision lists', () => {
    expect(
      isCastRosterQuery('So far we have NeonPulse, VelvetFox, LumaJade, Star Bats, and Neon Pixie'),
    ).toBe(false);
  });
});

describe('isEntityReclassifyWriteRequest', () => {
  it('matches wrong-book place → group phrasing', () => {
    expect(isEntityReclassifyWriteRequest('Northwind Collective is a group, not a place')).toBe(true);
    expect(isEntityReclassifyWriteRequest('Northwind Collective is not a place')).toBe(true);
    expect(isEntityReclassifyWriteRequest('move Northwind Collective to my Groups book')).toBe(true);
    expect(isEntityReclassifyWriteRequest('MemoVault should be a project')).toBe(true);
  });

  it('does not match ordinary narrative', () => {
    expect(isEntityReclassifyWriteRequest('she is a person I met last week')).toBe(false);
    expect(isEntityReclassifyWriteRequest('make a group for that')).toBe(false);
  });
});

describe('isLocationWriteRequest', () => {
  it('matches create/rename/delete', () => {
    expect(isLocationWriteRequest('add Northwind Depot as a place')).toBe(true);
    expect(isLocationWriteRequest('rename the place Northwind Depot to Northwind Labs')).toBe(true);
    expect(isLocationWriteRequest('delete the place Northwind Depot')).toBe(true);
  });

  it('defers wrong-book corrections to reclassify', () => {
    expect(isLocationWriteRequest('Northwind Collective is a group, not a place')).toBe(false);
  });
});

describe('isProjectWriteRequest / isSkillWriteRequest / isQuestWriteRequest', () => {
  it('matches create phrasing', () => {
    expect(isProjectWriteRequest('add MemoVault as a project')).toBe(true);
    expect(isSkillWriteRequest('add Welding as a skill')).toBe(true);
    expect(isQuestWriteRequest('add Ship MemoVault as a quest')).toBe(true);
    expect(isQuestWriteRequest('mark the quest Ship MemoVault as done')).toBe(true);
  });
});

describe('isFamilyWriteRequest / isRomanceWriteRequest', () => {
  it('matches kinship and romance status writes', () => {
    expect(isFamilyWriteRequest('mark Marcus as my cousin')).toBe(true);
    expect(isRomanceWriteRequest('mark Jamie as dating')).toBe(true);
    expect(isRomanceWriteRequest('we broke up with Jamie')).toBe(true);
  });
});

describe('isCharacterBookWriteRequest', () => {
  it('matches an explicit character-book save request', () => {
    expect(isCharacterBookWriteRequest('make sure they are all in my character book please')).toBe(true);
    expect(isCharacterBookWriteRequest('add Marcus to my character book')).toBe(true);
    expect(isCharacterBookWriteRequest('delete Marcus from my character book')).toBe(true);
  });
});

describe('isOrganizationGroupWriteRequest', () => {
  it('matches make/create a group and delete', () => {
    expect(isOrganizationGroupWriteRequest('create a group for underground artists')).toBe(true);
    expect(isOrganizationGroupWriteRequest('delete the group Northwind Collective')).toBe(true);
  });

  it('defers wrong-book corrections to reclassify', () => {
    expect(isOrganizationGroupWriteRequest('Northwind Collective is a group, not a place')).toBe(false);
  });
});

describe('isOrganizationGroupFollowUpRequest', () => {
  const history = [
    { role: 'user', content: 'make a group for that' },
    { role: 'assistant', content: 'Send me the roster and I will update the group.' },
    { role: 'user', content: 'Members are Marcus, Jamie, and Nova Reed' },
  ];

  it('keeps retries inside the group-write workflow', () => {
    expect(isOrganizationGroupFollowUpRequest('well I just gave you a roster', history)).toBe(true);
  });
});

describe('isClosedScopeQuery', () => {
  it('tags reclassify ahead of group write', () => {
    expect(isClosedScopeQuery('Northwind Collective is a group, not a place')).toEqual({
      closedScope: true,
      reason: 'entity_reclassify_write_request',
    });
  });

  it('tags group writes', () => {
    expect(isClosedScopeQuery('make a group for that')).toEqual({
      closedScope: true,
      reason: 'organization_group_write_request',
    });
  });

  it('tags location writes', () => {
    expect(isClosedScopeQuery('add Northwind Depot as a place')).toEqual({
      closedScope: true,
      reason: 'location_write_request',
    });
  });

  it('tags event writes', () => {
    expect(isClosedScopeQuery('we played a backyard show at Northwind Depot')).toEqual({
      closedScope: true,
      reason: 'event_write_request',
    });
  });
});

describe('isFocusEntityRelevant', () => {
  it('matches name substring', () => {
    expect(isFocusEntityRelevant('tell me about Marcus', 'Marcus')).toBe(true);
    expect(isFocusEntityRelevant('how was lunch?', 'Marcus')).toBe(false);
  });
});
