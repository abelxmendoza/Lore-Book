import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fetchJson } from '../lib/api';

import { PhotoGallery } from './PhotoGallery';

vi.mock('../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../lib/storyRefresh', () => ({
  dispatchStoryDataUpdated: vi.fn(),
}));

vi.mock('./ui/LazyImage', () => ({
  LazyImage: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt ?? ''} {...props} />
  ),
}));

vi.mock('../services/demoPhotoUpload', () => ({
  DEMO_PHOTO_GALLERY_STAGES: [],
  shouldSimulatePhotoUpload: () => false,
  simulateDemoPhotoGalleryUpload: vi.fn(),
}));

describe('PhotoGallery Documents handoff', () => {
  it('lets the user manually move a photo into a selected Documents folder', async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => {
      if (url === '/api/photos') {
        return {
          entries: [
            {
              id: 'entry-1',
              date: '2026-08-29T00:00:00.000Z',
              content: 'Vanguard Robotics archive photo',
              tags: ['photo'],
              metadata: {
                photoUrl: 'https://example.com/archive.jpg',
                photoId: 'photo-1',
              },
            },
          ],
        } as never;
      }
      return { success: true, fileId: 'file-1', category: 'family_history' } as never;
    });

    render(<PhotoGallery />);

    await screen.findByAltText('Photo');
    fireEvent.click(screen.getByRole('button', { name: 'Send this photo to Documents' }));
    fireEvent.change(screen.getByLabelText('Documents folder'), {
      target: { value: 'family_history' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Move to Documents' }));

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        '/api/photos/entry-1/send-to-documents',
        {
          method: 'POST',
          body: JSON.stringify({ category: 'family_history' }),
        },
      );
    });
    expect(await screen.findByText('Photo moved to Documents.')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo')).not.toBeInTheDocument();
  });
});
