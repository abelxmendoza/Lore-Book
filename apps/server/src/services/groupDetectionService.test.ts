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

  it('canonicalizes partial member mentions to existing character names', async () => {
    const groups = await groupDetectionService.detectGroupsInMessage(
      'user-1',
      'I was at First Street Pool and Billiards with Mr. Chino and Daisy after Velvet Hour played.'
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].members).toEqual(['Mr. Chino', 'Daisy']);
    expect(groups[0].members).not.toContain('Mr');
    expect(groups[0].members).not.toContain('Chino');
    expect(groups[0].members).not.toContain('First');
    expect(groups[0].members).not.toContain('Pool');
    expect(groups[0].members).not.toContain('Billiards');
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

    const kforce = groups.find(group => group.name === 'TechStaff');
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

    const kforce = groups.find(group => group.name === 'TechStaff');
    expect(kforce).toBeDefined();
    expect(kforce?.group_type).toBe('company');
    expect(kforce?.is_public_entity).toBe(false);
    expect(kforce?.members).toEqual(expect.arrayContaining(['Sam', 'Kelly']));
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
});
