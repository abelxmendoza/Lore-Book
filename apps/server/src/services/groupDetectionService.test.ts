import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { groupDetectionService } from './groupDetectionService';
import { supabaseAdmin } from './supabaseClient';

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
});
