import { ExternalEvent } from './types';

type PhotoItem = {
  captured_at: string;
  caption?: string;
  location?: string;
  people?: string[];
  url?: string;
};

type PhotosPayload = { photos: PhotoItem[] };

export function photosAdapter(payload: PhotosPayload): ExternalEvent[] {
  return (payload.photos ?? []).map((photo) => ({
    source: 'photos' as const,
    timestamp: photo.captured_at,
    type: 'photo',
    text: photo.caption ?? photo.location ?? 'Photo captured',
    imageUrl: photo.url,
    tags: photo.location ? ['photo', photo.location] : ['photo'],
    characters: photo.people,
  }));
}
