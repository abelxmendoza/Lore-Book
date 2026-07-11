import { fetchJson } from '../lib/api';

export type RosterRole = 'main' | 'supporting' | 'mentioned';
export type RosterStatus = 'active' | 'excluded';

export type RosterEntry = {
  entityId: string | null;
  name: string;
  kind: 'character' | 'location' | 'organization' | 'skill' | 'event' | 'unknown';
  role: RosterRole;
  status: RosterStatus;
  source: 'auto' | 'user';
  mentions: number;
  firstSeenRef: string | null;
  lastSeenRef: string | null;
  pinned: boolean;
};

export type ThreadRosterResponse = {
  success: boolean;
  threadNumber: number | null;
  entries: RosterEntry[];
};

/** Override key: entityId for linked entries, `name:<lowercase>` for name-only. */
export function rosterEntryKey(entry: Pick<RosterEntry, 'entityId' | 'name'>): string {
  return entry.entityId ?? `name:${entry.name.trim().toLowerCase()}`;
}

export async function fetchThreadRoster(threadId: string): Promise<ThreadRosterResponse> {
  return fetchJson<ThreadRosterResponse>(`/api/conversation/threads/${threadId}/roster`);
}

export async function updateThreadRosterEntry(
  threadId: string,
  key: string,
  override: { role?: RosterRole; status?: RosterStatus; pinned?: boolean },
): Promise<ThreadRosterResponse> {
  return fetchJson<ThreadRosterResponse>(`/api/conversation/threads/${threadId}/roster`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...override }),
  });
}

export type CastMemberActivity = {
  entityId: string;
  name: string;
  kind: string;
  threadCount: number;
  totalMentions: number;
  firstSeen: string;
  lastSeen: string;
};

export type CastTrendsResponse = {
  success: boolean;
  newFaces: CastMemberActivity[];
  rising: CastMemberActivity[];
  dormant: CastMemberActivity[];
};

export async function fetchCastTrends(): Promise<CastTrendsResponse> {
  return fetchJson<CastTrendsResponse>('/api/conversation/cast/trends');
}

export type CastThreadHit = { id: string; title: string | null; updatedAt: string; mentions: number };

export async function fetchCastThreads(entityId: string): Promise<{ success: boolean; threads: CastThreadHit[] }> {
  return fetchJson<{ success: boolean; threads: CastThreadHit[] }>(
    `/api/conversation/cast/${entityId}/threads`,
  );
}
