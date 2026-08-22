import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabaseAdmin } from '../supabaseClient';
import { persistOrganizationAttributionCorrection } from './organizationEventAttributionService';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('persistOrganizationAttributionCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only the requested user and event id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'evt-1',
        metadata: {
          organizationAttributions: [{
            organizationId: 'org-acme',
            organizationName: 'Acme',
            role: 'employer',
            evidence: 'started working',
            evidenceKind: 'explicit_work_phrase',
            confidence: 0.9,
            accepted: true,
            canonical: true,
            acceptedForOrganizationTimeline: true,
            direct: true,
            whyIncluded: 'Explicit work/employer context',
            protagonistRelation: true,
            unresolved: false,
          }],
        },
      },
      error: null,
    });
    const updateEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const selectEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle }),
    });
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table !== 'resolved_events') throw new Error(table);
      return {
        select: () => ({ eq: selectEq }),
        update: () => ({ eq: updateEq }),
      } as never;
    });

    const result = await persistOrganizationAttributionCorrection({
      userId: 'user-a',
      eventId: 'evt-1',
      fromOrganizationId: 'org-acme',
      toOrganizationId: 'org-acme-labs',
      toOrganizationName: 'Acme Labs',
    });

    expect(result?.eventId).toBe('evt-1');
    expect(result?.attributions[0]?.organizationId).toBe('org-acme-labs');
    expect(selectEq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(updateEq).toHaveBeenCalledWith('user_id', 'user-a');
  });
});
