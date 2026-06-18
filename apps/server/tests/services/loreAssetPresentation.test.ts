import { describe, expect, it } from 'vitest';

import type { ArtifactIndexEntry } from '../../src/services/artifactRegistry';
import {
  artifactTypeToAssetKind,
  countAssetsByKind,
  presentLoreAsset,
} from '../../src/services/loreAssetPresentation';

describe('loreAssetPresentation', () => {
  it('maps artifact types to asset kinds', () => {
    expect(artifactTypeToAssetKind('journal_entry')).toBe('moment');
    expect(artifactTypeToAssetKind('character')).toBe('portrait');
    expect(artifactTypeToAssetKind('user_file')).toBe('evidence');
    expect(artifactTypeToAssetKind('insight')).toBe('pattern');
    expect(artifactTypeToAssetKind('biography_snapshot')).toBe('chapter');
    expect(artifactTypeToAssetKind('timeline_event')).toBe('scene');
  });

  it('presents a moment with linked entity count', () => {
    const entry: ArtifactIndexEntry = {
      id: 'e1',
      type: 'journal_entry',
      title: 'Morning run',
      summary: 'Ran 5k in the park',
      truthState: 'CANONICAL',
      createdAt: '2024-01-02T00:00:00Z',
      sourceTable: 'journal_entries',
    };

    const asset = presentLoreAsset(entry, {
      metadata: { entities: [{ id: 'a' }, { id: 'b' }] },
      updated_at: '2024-01-03T00:00:00Z',
    });

    expect(asset).toMatchObject({
      assetKind: 'moment',
      displayName: 'Morning run',
      linkedCount: 2,
      lastUsedInChat: '2024-01-03T00:00:00Z',
    });
  });

  it('presents evidence files with thumbnail and derived counts', () => {
    const entry: ArtifactIndexEntry = {
      id: 'f1',
      type: 'user_file',
      title: 'resume.pdf',
      createdAt: '2024-01-01T00:00:00Z',
      sourceTable: 'user_files',
    };

    const asset = presentLoreAsset(entry, {
      filename: 'scan.png',
      mime_type: 'image/png',
      storage_url: 'https://cdn.example/scan.png',
      derived_counts: { moments: 2, facts: 5, entities: 1, relationships: 0, events: 0 },
    });

    expect(asset.assetKind).toBe('evidence');
    expect(asset.thumbnailUrl).toBe('https://cdn.example/scan.png');
    expect(asset.linkedCount).toBe(8);
  });

  it('counts assets by kind', () => {
    const counts = countAssetsByKind([
      presentLoreAsset(
        { id: '1', type: 'journal_entry', createdAt: '2024', sourceTable: 'journal_entries' },
        {}
      ),
      presentLoreAsset(
        { id: '2', type: 'character', title: 'Maya', createdAt: '2024', sourceTable: 'characters' },
        { name: 'Maya' }
      ),
    ]);

    expect(counts.moment).toBe(1);
    expect(counts.portrait).toBe(1);
    expect(counts.evidence).toBe(0);
  });
});
