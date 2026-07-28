/**
 * Sparse Places Book cards (missing tagCounts/moods/etc.) must not crash the modal.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: true }),
}));
vi.mock('../memory-explorer/MemoryCard', () => ({ MemoryCardComponent: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({ MemoryDetailModal: () => null }));
vi.mock('../../features/chat/composer/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../../features/chat/message/ChatMessage', () => ({ ChatMessage: () => null }));

import { LocationDetailModal } from './LocationDetailModal';

describe('LocationDetailModal — sparse profile', () => {
  it('renders overview when array fields are missing', () => {
    render(
      <LocationDetailModal
        location={
          {
            id: 'dummy-sparse-loc',
            name: 'Corner Cafe',
            visitCount: 1,
          } as any
        }
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Corner Cafe').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /overview/i }).length).toBeGreaterThan(0);
  });
});
