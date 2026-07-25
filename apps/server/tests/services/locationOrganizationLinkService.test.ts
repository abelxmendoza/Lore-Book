import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables, fromMock, invalidateOrganizations } = vi.hoisted(() => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    locations: [],
    organizations: [],
    organization_locations: [],
  };
  const invalidateOrganizations = vi.fn();

  const fromMock = vi.fn((table: string) => {
    let operation: 'select' | 'insert' | 'delete' = 'select';
    let insertValue: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    let inFilter: [string, unknown[]] | null = null;
    let limitValue: number | null = null;

    const execute = () => {
      let rows = [...(tables[table] ?? [])];
      rows = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
      if (inFilter) {
        const [column, values] = inFilter;
        rows = rows.filter((row) => values.includes(row[column]));
      }
      if (limitValue != null) rows = rows.slice(0, limitValue);

      if (operation === 'insert' && insertValue) {
        const inserted = { id: 'link-new', ...insertValue };
        tables[table] = [inserted, ...(tables[table] ?? [])];
        rows = [inserted];
      } else if (operation === 'delete') {
        const removedIds = new Set(rows.map((row) => row.id));
        tables[table] = (tables[table] ?? []).filter((row) => !removedIds.has(row.id));
      }

      return { data: rows, error: null };
    };

    const query: any = {
      select: vi.fn(() => query),
      insert: vi.fn((value: Record<string, unknown>) => {
        operation = 'insert';
        insertValue = value;
        return query;
      }),
      delete: vi.fn(() => {
        operation = 'delete';
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        inFilter = [column, values];
        return query;
      }),
      limit: vi.fn((value: number) => {
        limitValue = value;
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        const result = execute();
        return { data: result.data[0] ?? null, error: result.error };
      }),
      single: vi.fn(async () => {
        const result = execute();
        return { data: result.data[0] ?? null, error: result.error };
      }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve(execute())),
    };
    return query;
  });

  return { tables, fromMock, invalidateOrganizations };
});

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: fromMock },
}));
vi.mock('../../src/services/organizationService', () => ({
  organizationService: { invalidateOrganizations },
}));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { locationOrganizationLinkService } from '../../src/services/locationOrganizationLinkService';

describe('locationOrganizationLinkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tables.locations = [{ id: 'loc-1', user_id: 'user-1', name: 'Vanguard Lab' }];
    tables.organizations = [
      {
        id: 'org-1',
        user_id: 'user-1',
        name: 'Vanguard Robotics',
        group_type: 'company',
        status: 'active',
      },
      { id: 'org-other', user_id: 'user-2', name: 'Other Org' },
    ];
    tables.organization_locations = [];
  });

  it('creates one shared link that is readable from the location side', async () => {
    const linked = await locationOrganizationLinkService.link('user-1', 'loc-1', 'org-1');
    const listed = await locationOrganizationLinkService.list('user-1', 'loc-1');

    expect(linked).toMatchObject({
      id: 'link-new',
      organization_id: 'org-1',
      location_id: 'loc-1',
      location_name: 'Vanguard Lab',
      organization: { id: 'org-1', name: 'Vanguard Robotics' },
    });
    expect(listed).toHaveLength(1);
    expect(invalidateOrganizations).toHaveBeenCalledWith('user-1');
  });

  it('returns an existing link instead of creating a duplicate', async () => {
    tables.organization_locations = [
      {
        id: 'link-existing',
        user_id: 'user-1',
        organization_id: 'org-1',
        location_id: 'loc-1',
        location_name: 'Vanguard Lab',
        visit_count: 2,
      },
    ];

    const linked = await locationOrganizationLinkService.link('user-1', 'loc-1', 'org-1');

    expect(linked.id).toBe('link-existing');
    expect(tables.organization_locations).toHaveLength(1);
    expect(invalidateOrganizations).not.toHaveBeenCalled();
  });

  it('rejects cross-user organizations and removes only user-owned links', async () => {
    await expect(
      locationOrganizationLinkService.link('user-1', 'loc-1', 'org-other'),
    ).rejects.toThrow('Organization not found');

    tables.organization_locations = [
      {
        id: 'link-owned',
        user_id: 'user-1',
        organization_id: 'org-1',
        location_id: 'loc-1',
      },
      {
        id: 'link-other',
        user_id: 'user-2',
        organization_id: 'org-other',
        location_id: 'loc-1',
      },
    ];

    await expect(
      locationOrganizationLinkService.unlink('user-1', 'loc-1', 'link-other'),
    ).resolves.toBe(false);
    await expect(
      locationOrganizationLinkService.unlink('user-1', 'loc-1', 'link-owned'),
    ).resolves.toBe(true);
    expect(tables.organization_locations.map((row) => row.id)).toEqual(['link-other']);
  });
});
