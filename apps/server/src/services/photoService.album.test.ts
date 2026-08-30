import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  list: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../lib/openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

vi.mock('./memoryService', () => ({
  memoryService: {
    saveEntry: vi.fn(),
    searchEntries: vi.fn(),
    getEntry: vi.fn(),
    updateEntry: vi.fn(),
  },
}));

vi.mock('./ingestion/userFileRegistry', () => ({
  userFileRegistry: {
    registerOrReuse: vi.fn(),
    updateMetadata: vi.fn(),
    setStatus: vi.fn(),
  },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: storageMocks.upload,
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/p.jpg' } }),
        list: storageMocks.list,
        download: storageMocks.download,
        remove: storageMocks.remove,
      }),
    },
  },
}));

import { userFileRegistry } from './ingestion/userFileRegistry';
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
    expect(vi.mocked(memoryService.saveEntry).mock.calls[0][0].date).toBeUndefined();
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

  it('moves a user-owned photo binary into the selected Documents folder', async () => {
    vi.mocked(memoryService.getEntry).mockResolvedValue({
      id: 'entry-1',
      metadata: {
        photoId: 'photo-1',
        photoFilename: 'Vanguard-Robotics-history.jpg',
        photoUrl: 'https://example.com/p.jpg',
      },
    } as never);
    storageMocks.download.mockResolvedValue({
      data: new Blob(['synthetic-photo']),
      error: null,
    });
    storageMocks.remove.mockResolvedValue({ data: null, error: null });
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-1',
      storage_url: 'user-1/file-1-Vanguard-Robotics-history.jpg',
    } as never);
    vi.mocked(memoryService.updateEntry).mockResolvedValue({ id: 'entry-1' } as never);

    const result = await photoService.sendToDocuments('user-1', 'entry-1', {
      category: 'family_history',
    });

    expect(result).toEqual({ fileId: 'file-1', category: 'family_history' });
    expect(userFileRegistry.registerOrReuse).toHaveBeenCalledWith(
      'user-1',
      expect.any(Buffer),
      expect.objectContaining({
        filename: 'Vanguard-Robotics-history.jpg',
        mimeType: 'image/jpeg',
        ingestKind: 'photo',
        storeBinary: true,
        documentCategory: 'family_history',
      }),
    );
    expect(userFileRegistry.updateMetadata).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({
        source_photo_entry_id: 'entry-1',
        moved_from_photo_album: true,
      }),
    );
    expect(vi.mocked(userFileRegistry.updateMetadata).mock.calls[0][1]).not.toHaveProperty('extracted_text');
    expect(storageMocks.remove).toHaveBeenCalledWith([
      'user-1/photo-1-Vanguard-Robotics-history.jpg',
    ]);
    expect(memoryService.updateEntry).toHaveBeenCalledWith(
      'user-1',
      'entry-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          movedToDocuments: true,
          documentFileId: 'file-1',
          documentCategory: 'family_history',
        }),
      }),
    );
  });

  it('uses the canonical storage path from the photo URL when filenames changed', async () => {
    vi.mocked(memoryService.getEntry).mockResolvedValue({
      id: 'entry-url',
      metadata: {
        photoId: 'photo-url',
        photoFilename: 'current-name.jpg',
        photoUrl: 'https://project.supabase.co/storage/v1/object/public/photos/user-1/photo-url-original-name.png',
      },
    } as never);
    storageMocks.download.mockResolvedValue({
      data: new Blob(['synthetic-photo']),
      error: null,
    });
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-url',
      storage_url: 'user-1/file-url-original-name.png',
    } as never);
    vi.mocked(memoryService.updateEntry).mockResolvedValue({ id: 'entry-url' } as never);

    await photoService.sendToDocuments('user-1', 'entry-url', {
      category: 'photos_images',
    });

    expect(storageMocks.download).toHaveBeenCalledWith(
      'user-1/photo-url-original-name.png',
    );
  });

  it('keeps the Photos source when private Documents storage fails', async () => {
    vi.mocked(memoryService.getEntry).mockResolvedValue({
      id: 'entry-2',
      metadata: { photoId: 'photo-2', photoFilename: 'Jamie-record.png' },
    } as never);
    storageMocks.download.mockResolvedValue({
      data: new Blob(['synthetic-photo']),
      error: null,
    });
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'file-failed',
      storage_url: null,
    } as never);

    await expect(
      photoService.sendToDocuments('user-1', 'entry-2', {
        category: 'photos_images',
      }),
    ).rejects.toThrow('could not be stored in Documents');

    expect(userFileRegistry.setStatus).toHaveBeenCalledWith(
      'file-failed',
      'failed',
      'The photo could not be stored in the Documents library.',
    );
    expect(storageMocks.remove).not.toHaveBeenCalled();
    expect(memoryService.updateEntry).not.toHaveBeenCalled();
  });
});
