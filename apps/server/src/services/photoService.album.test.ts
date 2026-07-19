import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

vi.mock('./memoryService', () => ({
  memoryService: {
    saveEntry: vi.fn(),
    searchEntries: vi.fn(),
  },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: vi.fn(),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/p.jpg' } }),
        list: vi.fn(),
      }),
    },
  },
}));

import { memoryService } from './memoryService';
import { photoService } from './photoService';

describe('photoService album membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryService.saveEntry).mockResolvedValue({
      id: 'entry-1',
      content: 'Photo uploaded',
      tags: ['photo'],
    } as never);
  });

  it('ensurePhotoAlbumEntry writes photoUrl and photoId metadata', async () => {
    const result = await photoService.ensurePhotoAlbumEntry({
      userId: 'user-1',
      photoUrl: 'https://cdn.example/photos/a.jpg',
      photoId: 'photo-1',
      filename: 'a.jpg',
      source: 'chat_attachment',
      content: 'Photo shared in chat',
      tags: ['chat'],
    });

    expect(result?.id).toBe('entry-1');
    expect(memoryService.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        source: 'photo',
        metadata: expect.objectContaining({
          photoUrl: 'https://cdn.example/photos/a.jpg',
          photoId: 'photo-1',
          albumSource: 'chat_attachment',
          fromPhoto: true,
        }),
      }),
    );
  });

  it('ensurePhotoAlbumEntry skips when photoUrl missing', async () => {
    const result = await photoService.ensurePhotoAlbumEntry({
      userId: 'user-1',
      photoUrl: '',
      photoId: 'photo-1',
    });
    expect(result).toBeUndefined();
    expect(memoryService.saveEntry).not.toHaveBeenCalled();
  });

  it('generateEntryFromPhotoAnalysis still albums junk uploads', async () => {
    const result = await photoService.generateEntryFromPhotoAnalysis('user-1', {
      photoUrl: 'https://cdn.example/photos/junk.jpg',
      photoId: 'junk-1',
      filename: 'junk.jpg',
      metadata: {},
      analysis: {
        photoType: 'junk',
        confidence: 0.9,
        summary: 'receipt blur',
        detectedEntities: { characters: [], locations: [], organizations: [] },
        detectedSkills: [],
        detectedGroups: [],
        metadata: {},
      } as never,
    });

    expect(result?.id).toBe('entry-1');
    expect(memoryService.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          photoUrl: 'https://cdn.example/photos/junk.jpg',
          photoId: 'junk-1',
          albumSource: 'upload_junk',
        }),
      }),
    );
  });
});
