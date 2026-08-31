import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./organizationService', async () => {
  const actual = await vi.importActual<typeof import('./organizationService')>('./organizationService');
  return { ...actual, organizationService: { getOrganization: vi.fn() } };
});

import { groupDetectionService } from './groupDetectionService';
import { supabaseAdmin } from './supabaseClient';
import { organizationService } from './organizationService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('groupDetectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          { id: 'mr-chino', name: 'Mr. Chino', alias: ['Chino'] },
          { id: 'daisy', name: 'Daisy', alias: ['Velvet Hour'] },
        ]);
      }
      return chain([]);
    });
  });

  it('does not turn pool or billiards venue words into group members', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'First Street Pool and Billiards was packed before the show.'
    );

    expect(groups).toEqual([]);
  });

  it('does not create a group from a simple two-person co-mention', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I was at First Street Pool and Billiards with Mr. Chino and Daisy after Velvet Hour played.'
    );

    expect(groups).toEqual([]);
  });

  it('classifies recruiter + onboarding language as a company, not a friend group', () => {
    const type = groupDetectionService.suggestGroupType(
      'I am in contact with Sam the recruiter and Kelly is working the onboarding',
      ['Sam', 'Kelly']
    );
    expect(type).toBe('company');
  });

  it('detects a hyphenated agency name (K-force) as a non-public company group', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I was contacted about my I-9 and background check for the agency K-force thats hiring me for the Amazon job.'
    );

    const kforce = groups.find(group => group.name === 'Kforce');
    expect(kforce).toBeDefined();
    expect(kforce?.group_type).toBe('company');
    // Even though "Amazon" appears in the same sentence, the agency is not a
    // public-fan entity.
    expect(kforce?.is_public_entity).toBe(false);
  });

  it('treats a workplace the user works at as a company employer, not a public-fan entity', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I am so excited to start working at Amazon next month.'
    );

    const amazon = groups.find(group => group.name === 'Amazon');
    expect(amazon).toBeDefined();
    expect(amazon?.group_type).toBe('company');
    expect(amazon?.is_public_entity).toBe(false);
  });

  it('places coworkers who work for the same agency under that company', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          { id: 'sam', name: 'Sam', alias: [] },
          { id: 'kelly', name: 'Kelly', alias: [] },
        ]);
      }
      return chain([]);
    });

    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-kforce',
      'Sam the recruiter and Kelly both work for TechStaff and are handling my onboarding.'
    );

    const agency = groups.find(group => group.name === 'TechStaff');
    expect(agency).toBeDefined();
    expect(agency?.group_type).toBe('company');
    expect(agency?.is_public_entity).toBe(false);
    expect(agency?.members).toEqual(expect.arrayContaining(['Sam', 'Kelly']));
  });

  it('classifies suppliers and contractors as vendors', () => {
    expect(groupDetectionService.suggestGroupType(
      'Our print vendor delivered the new merch run yesterday.',
      [],
      'PrintCo',
    )).toBe('vendor');
  });

  it('classifies product brands separately from employers', () => {
    expect(groupDetectionService.suggestGroupType(
      'I wear Nike almost every day — huge fan of the brand.',
      [],
      'Nike',
    )).toBe('brand');
  });

  it('rejects person-pair group names', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          { id: 'leslie', name: 'Leslie', alias: [] },
          { id: 'tio-ralph', name: 'Tio Ralph', alias: [] },
          { id: 'mom', name: 'Mom', alias: [] },
          { id: 'ben', name: 'Ben', alias: [] },
          { id: 'daisy', name: 'Daisy', alias: [] },
          { id: 'juan', name: 'Juan', alias: [] },
        ]);
      }
      return chain([]);
    });

    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Leslie and Tio Ralph were both there.')).resolves.toEqual([]);
    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Mom and Ben talked today.')).resolves.toEqual([]);
    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Daisy and Juan went too.')).resolves.toEqual([]);
    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Leslie & Tio Family')).resolves.toEqual([]);
    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Mom & Ben Group')).resolves.toEqual([]);
    await expect(groupDetectionService.detectGroupsInMessage('user-1', 'Daisy and Juan Group')).resolves.toEqual([]);
  });

  it('infers households from owner-anchored residence evidence', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          { id: 'leslie', name: 'Leslie', alias: [] },
          { id: 'tio-ralph', name: 'Tio Ralph', alias: [] },
        ]);
      }
      return chain([]);
    });

    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      "my cousin Leslie's graduation party was at my Tio Ralph's house."
    );

    const household = groups.find(group => group.name === 'Tio Ralph Household');
    expect(household).toBeDefined();
    expect(household?.group_type).toBe('household');
    expect(household?.metadata).toMatchObject({
      lexical_group_type: 'household',
      anchor_name: 'Tio Ralph',
    });
    expect(household?.name).not.toMatch(/Leslie.*Tio/i);
  });

  it('infers school communities and school subgroups', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I went to Whittier Christian Middle School and played in the Whittier Christian Middle School band.'
    );

    expect(groups.find(group => group.name === 'Whittier Christian Middle School Community')).toMatchObject({
      group_type: 'community',
      metadata: expect.objectContaining({ lexical_group_type: 'school_community' }),
    });
    expect(groups.find(group => group.name === 'Whittier Christian Middle School Band')).toMatchObject({
      group_type: 'band',
      metadata: expect.objectContaining({
        lexical_group_type: 'school_subgroup',
        parent_group_name: 'Whittier Christian Middle School Community',
      }),
    });
  });

  it('infers organization, music scene, club, and class groups from structure', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I worked at Vanguard Robotics. The LA ska scene mattered to me. Coding club and Japanese class were big too.'
    );

    expect(groups.find(group => group.name === 'Vanguard Robotics Organization')).toMatchObject({
      group_type: 'company',
      metadata: expect.objectContaining({ lexical_group_type: 'organization' }),
    });
    expect(groups.find(group => group.name === 'LA Ska Scene')).toMatchObject({
      group_type: 'scene',
      metadata: expect.objectContaining({ lexical_group_type: 'music_scene' }),
    });
    expect(groups.find(group => group.name === 'Coding Club')).toMatchObject({
      group_type: 'club',
    });
    expect(groups.find(group => group.name === 'Japanese Class')).toMatchObject({
      group_type: 'club',
    });
  });

  it('does not leak members or relationship words from an unrelated conversation turn into an org candidate', async () => {
    // Regression test for a conversation-level scan (see
    // groupCandidateService.processConversation) where an org mentioned in
    // one turn was picking up members and "leader" language from a totally
    // unrelated turn elsewhere in the same session, because the whole
    // session text was being treated as a single scoping "line".
    const orgTurn = 'I worked at Vanguard Robotics.';
    const unrelatedTurn = 'Mr. Chino leads the trip. Daisy is coming too.';

    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      '',
      [orgTurn, unrelatedTurn]
    );

    const org = groups.find(group => group.name === 'Vanguard Robotics Organization');
    expect(org).toBeDefined();
    expect(org?.members).toEqual([]);
    expect(org?.user_relationship).toBe('member');
  });

  it('does not attach members from an unrelated turn to an EXISTING org via session-wide co-mention', async () => {
    // Regression test for the residual leak in findExistingGroupsByMembers:
    // the new-candidate line-scoping fix (test above) doesn't cover attaching
    // members to an org that already exists — that path used to scan the
    // whole session's detected member list instead of one line.
    const mockGetOrganization = organizationService.getOrganization as ReturnType<typeof vi.fn>;
    mockGetOrganization.mockResolvedValue({
      id: 'rivian-1',
      name: 'Rivian',
      group_type: 'company',
      membership_model: 'strict',
      user_relationship: 'member',
      is_public_entity: false,
      metadata: {},
      members: [
        { character_name: 'Connor', status: 'active' },
        { character_name: 'Priya', status: 'active' },
      ],
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          { id: 'connor', name: 'Connor', alias: [] },
          { id: 'priya', name: 'Priya', alias: [] },
          { id: 'daisy', name: 'Daisy', alias: ['Velvet Hour'] },
          { id: 'mr-chino', name: 'Mr. Chino', alias: ['Chino'] },
        ]);
      }
      if (table === 'organizations') {
        return chain([{ id: 'rivian-1' }]);
      }
      if (table === 'organization_members') {
        return chain([
          { organization_id: 'rivian-1', character_name: 'Connor' },
          { organization_id: 'rivian-1', character_name: 'Priya' },
        ]);
      }
      return chain([]);
    });

    const orgTurn = 'Connor and Priya talked about Rivian recruiting.';
    const unrelatedTurn = 'Mr. Chino leads the trip. Daisy is coming too.';

    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      '',
      [orgTurn, unrelatedTurn]
    );

    const rivianAttachment = groups.find(group => group.name === 'Rivian');
    expect(rivianAttachment).toBeUndefined();
  });

  it('links a department/team candidate to its parent company by name', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      "Amazon's Failure Analysis Team is where I work now."
    );

    const team = groups.find(group => group.name === 'Amazon Failure Analysis Team');
    expect(team).toBeDefined();
    expect(team?.group_type).toBe('team');
    expect(team?.metadata?.parent_group_name).toBe('Amazon');
  });

  it('classifies AI coding assistants as software, not company', () => {
    const type = groupDetectionService.suggestGroupType(
      'I used Cursor, my AI coding assistant, to fix the bug at work today.',
      []
    );
    expect(type).toBe('software');
  });

  it('classifies a known dev tool name as software even without explicit signal phrasing', () => {
    const type = groupDetectionService.suggestGroupType('', [], 'Cursor');
    expect(type).toBe('software');
  });

  it('classifies kin households as Mine and named-roster groups without first person as Their world', () => {
    expect(
      groupDetectionService.suggestUserRelationship('', false, "Mom's House", 'household'),
    ).toBe('member');
    expect(
      groupDetectionService.suggestUserRelationship('', false, "Abuela's Family", 'family'),
    ).toBe('member');
    expect(
      groupDetectionService.suggestUserRelationship('Jamie is in that crew', true, 'Eastside Crew', 'crew'),
    ).toBe('aware_of');
    expect(
      groupDetectionService.suggestUserRelationship('I worked at Vanguard Robotics.', true, 'Vanguard Robotics Organization', 'company'),
    ).toBe('member');
    expect(
      groupDetectionService.suggestUserRelationship('radiohead came up in conversation', false, 'Radiohead', 'band'),
    ).toBe('referenced');
  });
});
