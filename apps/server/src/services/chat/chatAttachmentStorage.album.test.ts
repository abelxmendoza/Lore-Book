import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const ensurePhotoAlbumEntryMock = vi.fn();

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  },
}));

vi.mock('../photoService', () => ({
  photoService: {
    ensurePhotoAlbumEntry: (...args: unknown[]) => ensurePhotoAlbumEntryMock(...args),
  },
}));

import { storeChatImageAttachment } from './chatAttachmentStorage';

describe('storeChatImageAttachment album', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: 'https://cdn.example/photos/chat.jpg' },
    });
    ensurePhotoAlbumEntryMock.mockResolvedValue({ id: 'album-1', content: 'x', tags: ['photo'] });
  });

  it('uploads to photos bucket and creates album entry', async () => {
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const stored = await storeChatImageAttachment('user-1', 'session-1', {
      dataUrl: tinyPng,
      mimeType: 'image/png',
      detail: 'high',
    });

    expect(stored?.url).toBe('https://cdn.example/photos/chat.jpg');
    expect(stored?.photoId).toBeTruthy();
    expect(stored?.journalEntryId).toBe('album-1');
    expect(ensurePhotoAlbumEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        photoUrl: 'https://cdn.example/photos/chat.jpg',
        source: 'chat_attachment',
      }),
    );
  });
});
