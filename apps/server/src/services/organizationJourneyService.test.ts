import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./organizationService', () => ({
  organizationService: { getOrganization: vi.fn() },
}));

vi.mock('./timeline/subjectTimelineCompiler', () => ({
  compileSubjectTimelineForUser: vi.fn(),
}));

import { buildOrganizationJourney } from './organizationJourneyService';
import { supabaseAdmin } from './supabaseClient';
import { organizationService } from './organizationService';
import { compileSubjectTimelineForUser } from './timeline/subjectTimelineCompiler';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockGetOrganization = organizationService.getOrganization as ReturnType<typeof vi.fn>;
const mockCompile = compileSubjectTimelineForUser as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('buildOrganizationJourney', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the organization does not exist', async () => {
    mockGetOrganization.mockResolvedValue(null);
    const result = await buildOrganizationJourney('user-1', 'missing-org');
    expect(result).toBeNull();
  });

  it('combines relationship history, significant timeline events, and connected people into sorted milestones', async () => {
    mockGetOrganization.mockResolvedValue({
      id: 'org-1',
      name: 'Amazon',
      user_relationship: 'employee',
    });
    mockCompile.mockResolvedValue({
      events: [
        { start_time: '2026-03-01T00:00:00.000Z', title: 'Onboarding day', significance: 'high' },
        { start_time: '2026-01-01T00:00:00.000Z', title: 'irrelevant mention', significance: 'low' },
      ],
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'organization_relationship_history') {
        return chain([
          { to_relationship: 'applicant', changed_at: '2026-02-01T00:00:00.000Z' },
          { to_relationship: 'employee', changed_at: '2026-02-15T00:00:00.000Z' },
        ]);
      }
      if (table === 'characters') {
        return chain([
          {
            id: 'char-a',
            name: 'Sam',
            metadata: {
              connection_origins: {
                'char-b': {
                  entityId: 'org-1',
                  entityType: 'organization',
                  entityName: 'Amazon',
                  firstSeenAt: '2026-02-20T00:00:00.000Z',
                },
              },
            },
          },
          { id: 'char-b', name: 'Someone Else', metadata: {} },
        ]);
      }
      return chain([]);
    });

    const journey = await buildOrganizationJourney('user-1', 'org-1');

    expect(journey?.organizationName).toBe('Amazon');
    expect(journey?.currentRelationship).toBe('employee');
    // Low-significance events are filtered out.
    expect(journey?.milestones.some((m) => m.label === 'irrelevant mention')).toBe(false);
    expect(journey?.milestones.find((m) => m.label === 'Became employee')).toBeDefined();
    expect(journey?.milestones.find((m) => m.label === 'Onboarding day')).toBeDefined();
    // Milestones are chronologically sorted regardless of source order.
    const dates = journey!.milestones.map((m) => new Date(m.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(journey?.keyPeople).toEqual([
      { characterId: 'char-a', name: 'Sam', firstSeenAt: '2026-02-20T00:00:00.000Z' },
    ]);
  });

  it('is resilient to the timeline compiler failing', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'org-1', name: 'Amazon', user_relationship: 'employee' });
    mockCompile.mockRejectedValue(new Error('boom'));
    mockFrom.mockImplementation(() => chain([]));

    const journey = await buildOrganizationJourney('user-1', 'org-1');
    expect(journey).not.toBeNull();
    expect(journey?.milestones).toEqual([]);
  });
});
