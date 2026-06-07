import { fetchJson } from '../lib/api';

export type WhatChangedSummary = {
  since: string;
  gapDays: number;
  newMemoryCount: number;
  newCharacters: Array<{ id: string; name: string }>;
  newTimelineEventCount: number;
  strongestTheme: string | null;
  reinforcedEntities: Array<{ name: string; newMentionCount: number }>;
  hasChanges: boolean;
};

export type WhatChangedResponse = {
  success: boolean;
  summary: WhatChangedSummary;
  lines: string[];
};

/**
 * Fetch the factual "what changed since you were last here" diff.
 * `since` is an ISO timestamp the caller owns (e.g. the last thread's updatedAt).
 */
export const fetchWhatChanged = (since: string) =>
  fetchJson<WhatChangedResponse>(`/api/conversation/what-changed?since=${encodeURIComponent(since)}`);
