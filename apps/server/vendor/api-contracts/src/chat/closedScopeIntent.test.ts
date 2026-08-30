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
  isHouseholdWriteRequest,
  isRomanceWriteRequest,
  isEventWriteRequest,
  isClosedScopeQuery,
  isFocusEntityRelevant,
  isPronounPersonQuery,
  parseTalkAboutSubject,
  parseNamedChatSubject,
  messageConflictsWithPinnedFocus,
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

  it('matches the new-vs-returning, mentioned, and recognize variants', () => {
    expect(isCastRosterQuery('new vs returning people in this story')).toBe(true);
    expect(isCastRosterQuery("who have i mentioned so far in this story")).toBe(true);
    expect(isCastRosterQuery('who do i recognize from this thread')).toBe(true);
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

describe('isLocationWriteRequest — aliases', () => {
  it('matches an alias addition', () => {
    expect(isLocationWriteRequest('also called The Depot')).toBe(true);
  });
});

describe('isProjectWriteRequest / isSkillWriteRequest / isQuestWriteRequest', () => {
  it('matches create phrasing', () => {
    expect(isProjectWriteRequest('add MemoVault as a project')).toBe(true);
    expect(isSkillWriteRequest('add Welding as a skill')).toBe(true);
    expect(isSkillWriteRequest('merge Prototyping into Hardware Prototyping')).toBe(true);
    expect(isQuestWriteRequest('add Ship MemoVault as a quest')).toBe(true);
    expect(isQuestWriteRequest('mark the quest Ship MemoVault as done')).toBe(true);
  });
});

describe('isFamilyWriteRequest / isRomanceWriteRequest', () => {
  it('matches kinship and romance status writes', () => {
    expect(isFamilyWriteRequest('mark Marcus as my cousin')).toBe(true);
    expect(isRomanceWriteRequest('mark Jamie as ended')).toBe(true);
    expect(isRomanceWriteRequest('we broke up with Jamie')).toBe(true);
    expect(isRomanceWriteRequest('delete the romance record for Jamie')).toBe(true);
  });

  it('matches the full canonical romance status vocabulary and free-form lifecycle phrasing', () => {
    expect(isRomanceWriteRequest('set Jamie as paused')).toBe(true);
    expect(isRomanceWriteRequest('mark Jamie as ghosted')).toBe(true);
    expect(isRomanceWriteRequest('mark Jamie as rekindled')).toBe(true);
    expect(isRomanceWriteRequest('Jamie and I are on a break')).toBe(true);
    expect(isRomanceWriteRequest('Jamie and I got back together')).toBe(true);
    expect(isRomanceWriteRequest('things with Jamie are complicated')).toBe(true);
  });

  it('matches a side-only correction', () => {
    expect(isFamilyWriteRequest("change Abuela's side to paternal")).toBe(true);
    expect(isFamilyWriteRequest('set Ralph side to maternal')).toBe(true);
  });

  it('matches a soft exclude (bare "remove X from my family tree")', () => {
    expect(isFamilyWriteRequest('remove Ralph from my family tree')).toBe(true);
    expect(isFamilyWriteRequest('exclude Ralph from family')).toBe(true);
  });

  it('matches a hard delete request', () => {
    expect(isFamilyWriteRequest('delete Uncle Ralph')).toBe(true);
    expect(isFamilyWriteRequest('delete Uncle Ralph from my family tree')).toBe(true);
    expect(isFamilyWriteRequest('remove Ralph entirely')).toBe(true);
    expect(isFamilyWriteRequest('remove Ralph as a character')).toBe(true);
  });

  it('does not confuse a hard delete with a character-book delete', () => {
    expect(isFamilyWriteRequest('delete Marcus from my character book')).toBe(false);
  });
});

describe('isEventWriteRequest', () => {
  it('matches an explicit event post', () => {
    expect(isEventWriteRequest('post an event')).toBe(true);
  });

  it('matches "we played/hosted ... at ..." and "save event ... at ..."', () => {
    expect(isEventWriteRequest('we played a backyard show at Northwind Depot')).toBe(true);
    expect(isEventWriteRequest('save event called House Show at Ritual Coffee')).toBe(true);
  });

  it('matches a named happening at a place', () => {
    expect(isEventWriteRequest('we went to a show at Ritual Coffee')).toBe(true);
  });
});

describe('isHouseholdWriteRequest', () => {
  it('matches create/add/remove/move/delete household commands', () => {
    expect(isHouseholdWriteRequest("create a household called Grandma's House")).toBe(true);
    expect(isHouseholdWriteRequest("add Ralph to the Mom and Dad's House household")).toBe(true);
    expect(isHouseholdWriteRequest("remove Ralph from the Mom and Dad's House household")).toBe(true);
    expect(isHouseholdWriteRequest("Ralph moved out of the Mom and Dad's House household")).toBe(true);
    expect(isHouseholdWriteRequest("move the Mom and Dad's House household to 456 Oak Ave")).toBe(true);
    expect(isHouseholdWriteRequest("delete the Mom and Dad's House household")).toBe(true);
  });

  it('does not match unrelated household mentions', () => {
    expect(isHouseholdWriteRequest('my parents live in a nice house')).toBe(false);
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

  it('matches manual hierarchy and connection edits', () => {
    expect(isOrganizationGroupWriteRequest('make Robotics a department under Vanguard Robotics')).toBe(true);
    expect(isOrganizationGroupWriteRequest('Studio Team is a subgroup of MemoVault')).toBe(true);
    expect(isOrganizationGroupWriteRequest('connect Vanguard Robotics with MemoVault')).toBe(true);
    expect(isOrganizationGroupWriteRequest('Robotics is a job at Vanguard Robotics')).toBe(true);
    expect(isOrganizationGroupWriteRequest('disconnect Robotics from Vanguard Robotics')).toBe(true);
    expect(isOrganizationGroupWriteRequest('make Field Crew a team at Northwind Depot under Northwind Logistics')).toBe(true);
    expect(isOrganizationGroupWriteRequest('add Northwind Depot as a location of Northwind Logistics')).toBe(true);
    expect(isOrganizationGroupWriteRequest('Jamie is going to the store')).toBe(false);
  });

  it('matches type and relationship classification corrections', () => {
    expect(isOrganizationGroupWriteRequest("Mom's House is a household")).toBe(true);
    expect(isOrganizationGroupWriteRequest("Abuela's Family is a family, not a household")).toBe(true);
    expect(isOrganizationGroupWriteRequest('I belong to Eastside BJJ')).toBe(true);
    expect(isOrganizationGroupWriteRequest('put Radiohead in mentioned')).toBe(true);
    expect(isOrganizationGroupWriteRequest("I'm close to Summit Staffing")).toBe(true);
  });

  it('defers wrong-book corrections to reclassify', () => {
    expect(isOrganizationGroupWriteRequest('Northwind Collective is a group, not a place')).toBe(false);
  });

  it('matches adding members and deleting from the groups book', () => {
    expect(isOrganizationGroupWriteRequest('add Jamie to the group')).toBe(true);
    expect(isOrganizationGroupWriteRequest('add Jamie and Alex to my org')).toBe(true);
    expect(isOrganizationGroupWriteRequest('delete Northwind Collective from my groups book')).toBe(true);
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

describe('named chat subject vs pinned focus', () => {
  it('parses a capture prompt subject', () => {
    expect(
      parseTalkAboutSubject(
        'I want to talk about Marcus. Help me capture who they are, how we know each other, and what matters about them right now. Please do not invent details I have not shared.',
      ),
    ).toBe('Marcus');
  });

  it('treats who-is-he as a pronoun query, not a named subject', () => {
    expect(isPronounPersonQuery('who is he')).toBe(true);
    expect(parseNamedChatSubject('who is he')).toBeNull();
  });

  it('flags a leftover pin when the message names someone else', () => {
    expect(
      messageConflictsWithPinnedFocus(
        'I want to talk about Marcus. Help me capture who they are.',
        'Jamie',
      ),
    ).toBe(true);
    expect(
      messageConflictsWithPinnedFocus(
        'I want to talk about Marcus. Help me capture who they are.',
        'Marcus',
      ),
    ).toBe(false);
  });
});
