import { describe, expect, it } from 'vitest';

import {
  locationAliasesForDisplay,
  locationEvidenceSourcesForDisplay,
  locationMergeHistoryForDisplay,
} from './locationMergeMetadata';

describe('locationMergeMetadata', () => {
  it('returns aliases for the place modal', () => {
    expect(locationAliasesForDisplay({
      aliases: ['Anaheim Family Home', "Abuela's house", 'Abuelas House', 'Anaheim Family Home'],
    })).toEqual(['Anaheim Family Home', "Abuela's house", 'Abuelas House']);
  });

  it('normalizes merge history rows for display', () => {
    expect(locationMergeHistoryForDisplay({
      merge_history: [
        {
          source_id: 'loc-anaheim',
          source_name: 'Anaheim Family Home',
          target_id: 'loc-abuela',
          target_name_before: "Abuela's house",
          canonical_name_after: "Abuela's House",
          merged_at: '2026-06-24T00:00:00.000Z',
        },
      ],
    })).toEqual([
      {
        sourceId: 'loc-anaheim',
        sourceName: 'Anaheim Family Home',
        targetId: 'loc-abuela',
        targetNameBefore: "Abuela's house",
        canonicalNameAfter: "Abuela's House",
        mergedAt: '2026-06-24T00:00:00.000Z',
      },
    ]);
  });

  it('collects evidence source labels from merged metadata', () => {
    expect(locationEvidenceSourcesForDisplay({
      evidence: ['visit fact'],
      source_messages: ['chat line'],
      source_message_ids: ['msg-1'],
    })).toEqual(['visit fact', 'chat line', 'msg-1']);
  });
});
