/**
 * Org-roster distinctness guard.
 *
 * An organization roster (organization_members) that lists two characters as
 * SEPARATE members is curated evidence that they are two different people —
 * whoever recorded the lineup saw them side by side. Merging two concurrent
 * co-members of the same roster is therefore almost always a false merge
 * (the classic band-lineup conflation: two members of Ex Lover collapsing
 * into one card).
 *
 * Policy: SYSTEM merges are blocked outright. USER merges proceed (the user
 * may be intentionally fixing a duplicate row) but the conflict is surfaced
 * so the caller can log it into the merge ledger.
 */

import { supabaseAdmin } from '../supabaseClient';

export type OrgCoMembership = {
  organizationId: string;
  sourceMemberId: string;
  targetMemberId: string;
  sourceStatus: string;
  targetStatus: string;
  concurrent: boolean;
};

type MemberRow = {
  id: string;
  organization_id: string;
  character_id: string | null;
  status: string | null;
  joined_date: string | null;
  left_at: string | null;
};

/** Two stints overlap unless one verifiably ended before the other began. Pure. */
export function membershipsConcurrent(
  a: Pick<MemberRow, 'joined_date' | 'left_at'>,
  b: Pick<MemberRow, 'joined_date' | 'left_at'>,
): boolean {
  const aEnd = a.left_at ? new Date(a.left_at).getTime() : Infinity;
  const bEnd = b.left_at ? new Date(b.left_at).getTime() : Infinity;
  const aStart = a.joined_date ? new Date(a.joined_date).getTime() : -Infinity;
  const bStart = b.joined_date ? new Date(b.joined_date).getTime() : -Infinity;
  return aStart <= bEnd && bStart <= aEnd;
}

/** Pure grouping over member rows — exported for tests. */
export function findCoMembershipsInRows(
  rows: MemberRow[],
  sourceCharacterId: string,
  targetCharacterId: string,
): OrgCoMembership[] {
  const byOrg = new Map<string, MemberRow[]>();
  for (const row of rows) {
    if (!row.character_id) continue;
    const group = byOrg.get(row.organization_id) ?? [];
    group.push(row);
    byOrg.set(row.organization_id, group);
  }

  const conflicts: OrgCoMembership[] = [];
  for (const [organizationId, members] of byOrg) {
    const sources = members.filter((m) => m.character_id === sourceCharacterId);
    const targets = members.filter((m) => m.character_id === targetCharacterId);
    for (const s of sources) {
      for (const t of targets) {
        conflicts.push({
          organizationId,
          sourceMemberId: s.id,
          targetMemberId: t.id,
          sourceStatus: s.status ?? 'active',
          targetStatus: t.status ?? 'active',
          concurrent: membershipsConcurrent(s, t),
        });
      }
    }
  }
  return conflicts;
}

/** Concurrent co-memberships of both characters on the same org roster. */
export async function findConcurrentCoMemberships(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
): Promise<OrgCoMembership[]> {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('id, organization_id, character_id, status, joined_date, left_at')
    .eq('user_id', userId)
    .in('character_id', [sourceCharacterId, targetCharacterId]);
  if (error || !data) return [];
  return findCoMembershipsInRows(data as MemberRow[], sourceCharacterId, targetCharacterId).filter(
    (c) => c.concurrent,
  );
}

export class OrgRosterDistinctnessError extends Error {
  code = 'ORG_ROSTER_DISTINCT' as const;
  conflicts: OrgCoMembership[];
  constructor(conflicts: OrgCoMembership[]) {
    super(
      'Merge blocked: both characters are listed as separate, concurrent members of the same organization roster — curated evidence they are different people. Remove one from the lineup first if this is really a duplicate.',
    );
    this.conflicts = conflicts;
  }
}
