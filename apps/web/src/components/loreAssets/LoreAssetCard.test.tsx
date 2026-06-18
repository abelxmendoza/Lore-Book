import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LoreAssetCard } from './LoreAssetCard';
import type { LoreAsset } from '../../api/loreAssets';

const baseAsset: LoreAsset = {
  id: 'a1',
  artifactType: 'journal_entry',
  assetKind: 'moment',
  displayName: 'Morning run',
  subtitle: 'Ran 5k',
  truthState: 'CANONICAL',
  linkedCount: 2,
  createdAt: '2024-01-02T00:00:00Z',
  sourceTable: 'journal_entries',
};

describe('LoreAssetCard', () => {
  it('renders display name and linked count', () => {
    render(<LoreAssetCard asset={baseAsset} />);
    expect(screen.getByText('Morning run')).toBeInTheDocument();
    expect(screen.getByText('2 linked')).toBeInTheDocument();
  });

  it('shows refresh action for stale projections', () => {
    const onRefresh = vi.fn();
    render(
      <LoreAssetCard
        asset={{
          ...baseAsset,
          artifactType: 'biography_snapshot',
          assetKind: 'chapter',
          displayName: 'Life chapter',
          stale: true,
        }}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });
});
