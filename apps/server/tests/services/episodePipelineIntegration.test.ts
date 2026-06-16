import { describe, expect, it } from 'vitest';

import { mergeThreadMetadata, emptyThreadMetadata } from '../../src/services/conversationCentered/threadIntelligenceService';

describe('ingestion → episode pipeline contract', () => {
  it('replaceEpisodes from segmentation matches continuity card shape', () => {
    let meta = emptyThreadMetadata();
    meta = mergeThreadMetadata(meta, {
      people: ['Grandma Rose'],
      places: ['Costco'],
      at: '2026-06-01T12:00:00Z',
    });
    meta = mergeThreadMetadata(meta, {
      replaceEpisodes: ['Thread start', 'Costco · Grandma Rose'],
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
      episodeLabel: 'Costco · Grandma Rose',
      at: '2026-06-01T13:00:00Z',
    });

    expect(meta.episodes).toEqual(['Thread start', 'Costco · Grandma Rose']);
    expect(meta.people).toContain('Grandma Rose');
  });

  it('episodeId alone appends without replacing prior labels', () => {
    let meta = mergeThreadMetadata(emptyThreadMetadata(), {
      episodeLabel: 'Morning chat',
      at: '2026-06-01T09:00:00Z',
    });
    meta = mergeThreadMetadata(meta, {
      episodeLabel: 'Costco · Grandma Rose',
      at: '2026-06-01T12:00:00Z',
    });
    expect(meta.episodes).toEqual(['Morning chat', 'Costco · Grandma Rose']);
  });
});
