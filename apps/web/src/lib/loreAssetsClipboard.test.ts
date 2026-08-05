import { describe, expect, it } from 'vitest';

import { buildLoreAssetsClipboardText, buildLoreAssetsAuditClipboardText } from './loreAssetsClipboard';
import type { LoreAsset } from '../api/loreAssets';

function asset(overrides: Partial<LoreAsset> = {}): LoreAsset {
  return {
    id: 'a1',
    artifactType: 'entity',
    assetKind: 'portrait',
    displayName: 'Maya',
    subtitle: 'person',
    truthState: 'CANONICAL',
    linkedCount: 3,
    createdAt: '2026-06-04T00:00:00.000Z',
    sourceTable: 'entities',
    ...overrides,
  };
}

describe('buildLoreAssetsClipboardText', () => {
  it('includes the tab label as the section title and each asset with its fields', () => {
    const text = buildLoreAssetsClipboardText(
      [asset(), asset({ id: 'a2', displayName: 'Dr. Chen', linkedCount: 1, createdAt: '2026-07-27T00:00:00.000Z' })],
      'portrait',
    );

    expect(text).toContain('Lore Assets / People (2 items)');
    expect(text).toContain('1. Maya');
    expect(text).toContain('Id: a1');
    expect(text).toContain('Type: People');
    expect(text).toContain('Subtitle: person');
    expect(text).toContain('Truth state: CANONICAL');
    expect(text).toContain('Linked: 3');
    expect(text).toContain('Source: entities');
    expect(text).toContain('2. Dr. Chen');
  });

  it('includes the summary as body text when present', () => {
    const text = buildLoreAssetsClipboardText(
      [asset({ assetKind: 'pattern', summary: 'You tend to do your best work at night.' })],
      'pattern',
    );
    expect(text).toContain('You tend to do your best work at night.');
  });

  it('reports (empty) when there are no assets for the tab', () => {
    const text = buildLoreAssetsClipboardText([], 'evidence');
    expect(text).toContain('Lore Assets / Files (0 items)');
    expect(text).toContain('(empty)');
  });
});

describe('buildLoreAssetsAuditClipboardText', () => {
  it('lists each mutation with its rationale as body text', () => {
    const text = buildLoreAssetsAuditClipboardText([
      {
        id: 'm1',
        artifact_type: 'entity',
        artifact_id: 'a1',
        mutation_type: 'REVISED',
        rationale: 'Corrected after new evidence.',
        created_at: '2026-07-01T00:00:00.000Z',
      },
    ]);

    expect(text).toContain('Lore Assets / Audit (1 item)');
    expect(text).toContain('1. REVISED');
    expect(text).toContain('Artifact type: entity');
    expect(text).toContain('Corrected after new evidence.');
  });
});
