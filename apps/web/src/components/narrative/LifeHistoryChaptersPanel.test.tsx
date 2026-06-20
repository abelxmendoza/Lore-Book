import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { LifeHistoryChaptersPanel } from './LifeHistoryChaptersPanel';

vi.mock('../../api/lifeHistory', () => ({
  lifeHistoryApi: {
    getLifeChapters: vi.fn(),
  },
}));

import { lifeHistoryApi } from '../../api/lifeHistory';

describe('LifeHistoryChaptersPanel', () => {
  beforeEach(() => {
    vi.mocked(lifeHistoryApi.getLifeChapters).mockReset();
  });

  it('renders life chapters from the history API', async () => {
    vi.mocked(lifeHistoryApi.getLifeChapters).mockResolvedValue({
      success: true,
      generatedAt: new Date().toISOString(),
      eventCount: 4,
      chapters: [{
        id: 'chapter-1',
        title: 'Career · 2024',
        summary: 'Started at Amazon; Promoted to senior',
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        dominantCategory: 'career',
        themes: ['Career'],
        significance: 0.82,
        eventCount: 2,
        turningPointCount: 1,
        events: [],
      }],
    });

    render(<LifeHistoryChaptersPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('life-history-chapters-panel')).toBeInTheDocument();
    });

    expect(screen.getByText('Career · 2024')).toBeInTheDocument();
  });
});
