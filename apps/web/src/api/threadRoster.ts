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
