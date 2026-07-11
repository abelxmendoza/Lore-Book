import { describe, it, expect } from 'vitest';

import {
  membershipsConcurrent,
  findCoMembershipsInRows,
} from './orgRosterDistinctnessGuard';

const member = (
  id: string,
  org: string,
  characterId: string | null,
  extra: Partial<{ status: string; joined_date: string | null; left_at: string | null }> = {},
) => ({
  id,
  organization_id: org,
  character_id: characterId,
  status: extra.status ?? 'active',
  joined_date: extra.joined_date ?? null,
  left_at: extra.left_at ?? null,
});

describe('orgRosterDistinctnessGuard', () => {
  describe('membershipsConcurrent', () => {
    it('open-ended stints overlap', () => {
      expect(membershipsConcurrent({ joined_date: null, left_at: null }, { joined_date: null, left_at: null })).toBe(true);
    });

    it('sequential stints do not overlap', () => {
      expect(
        membershipsConcurrent(
          { joined_date: '2024-01-01', left_at: '2024-06-01' },
          { joined_date: '2025-01-01', left_at: null },
        ),
      ).toBe(false);
    });

    it('interleaved stints overlap', () => {
      expect(
        membershipsConcurrent(
          { joined_date: '2024-01-01', left_at: '2024-06-01' },
          { joined_date: '2024-03-01', left_at: null },
        ),
      ).toBe(true);
    });
  });

  describe('findCoMembershipsInRows', () => {
    it('flags two characters on the same roster as a conflict', () => {
      const conflicts = findCoMembershipsInRows(
        [member('m1', 'band-heartbreak', 'char-a'), member('m2', 'band-heartbreak', 'char-b')],
        'char-a',
        'char-b',
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].organizationId).toBe('band-heartbreak');
      expect(conflicts[0].concurrent).toBe(true);
    });

    it('no conflict when memberships are in different orgs', () => {
      const conflicts = findCoMembershipsInRows(
        [member('m1', 'band-heartbreak', 'char-a'), member('m2', 'band-static', 'char-b')],
        'char-a',
        'char-b',
      );
      expect(conflicts).toHaveLength(0);
    });

    it('non-concurrent same-org stints are reported but not concurrent', () => {
      const conflicts = findCoMembershipsInRows(
        [
          member('m1', 'band', 'char-a', { joined_date: '2023-01-01', left_at: '2023-12-01' }),
          member('m2', 'band', 'char-b', { joined_date: '2024-06-01' }),
        ],
        'char-a',
        'char-b',
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].concurrent).toBe(false);
    });

    it('ignores rows without character ids', () => {
      const conflicts = findCoMembershipsInRows(
        [member('m1', 'band', null), member('m2', 'band', 'char-b')],
        'char-a',
        'char-b',
      );
      expect(conflicts).toHaveLength(0);
    });
  });
});
