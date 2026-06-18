import { describe, expect, it, vi } from 'vitest';

import { exportLorePack } from '../../src/services/lorePackExportService';

vi.mock('../../src/services/artifactRegistry', () => ({
  artifactRegistry: {
    get: vi.fn(async (_userId: string, id: string) => ({
      entry: {
        id,
        type: 'journal_entry',
        title: 'Morning run',
        createdAt: '2024-01-01T00:00:00Z',
        sourceTable: 'journal_entries',
      },
      record: { id, title: 'Morning run' },
    })),
    provenance: vi.fn().mockResolvedValue({ artifactId: 'e1', history: [], edges: [] }),
  },
}));

describe('lorePackExportService', () => {
  it('exports selected assets with provenance', async () => {
    const pack = await exportLorePack('user-1', [
      { id: 'e1', artifactType: 'journal_entry' },
    ]);

    expect(pack.version).toBe(1);
    expect(pack.assetCount).toBe(1);
    expect(pack.assets[0].asset.displayName).toBe('Morning run');
    expect(pack.assets[0].provenance).toBeDefined();
  });
});
