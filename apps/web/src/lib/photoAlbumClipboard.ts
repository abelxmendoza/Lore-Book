import { buildListClipboardText } from './listClipboard';
import type { PhotoEntry } from '../services/mockDataService';

function metaRecord(photo: PhotoEntry): Record<string, unknown> {
  return (photo.metadata ?? {}) as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return out.length ? out : undefined;
}

export function buildPhotoAlbumClipboardText(photos: PhotoEntry[]): string {
  return buildListClipboardText({
    title: 'Photo Album',
    items: photos.map((photo) => {
      const meta = metaRecord(photo);
      const people =
        asStringArray(meta.people) ??
        asStringArray(meta.visionPeople);
      const places =
        asStringArray(meta.visionPlaces) ??
        (typeof meta.locationName === 'string' && meta.locationName ? [meta.locationName] : undefined);
      const mediaKinds = asStringArray(meta.mediaKinds);
      const platforms = asStringArray(meta.platforms);
      const linkedCharacters = asStringArray(meta.linkedCharacterIds);
      const linkedLocations = asStringArray(meta.linkedLocationIds);
      const relatedPhotos = asStringArray(meta.relatedSessionPhotoIds);

      return {
        heading: photo.summary?.trim() || photo.content.slice(0, 80) || 'Photo',
        fields: [
          { label: 'Id', value: photo.id },
          { label: 'Date', value: photo.date ? new Date(photo.date).toLocaleString() : null },
          { label: 'Location', value: typeof meta.locationName === 'string' ? meta.locationName : null },
          { label: 'People', value: people },
          { label: 'Places', value: places },
          { label: 'Tags', value: photo.tags },
          { label: 'Media kinds', value: mediaKinds },
          { label: 'Platforms', value: platforms },
          { label: 'Photo ID', value: typeof meta.photoId === 'string' ? meta.photoId : null },
          { label: 'URL', value: typeof meta.photoUrl === 'string' ? meta.photoUrl : null },
          { label: 'Session', value: typeof meta.sessionId === 'string' ? meta.sessionId : null },
          { label: 'Chat message', value: typeof meta.chatMessageId === 'string' ? meta.chatMessageId : null },
          { label: 'Linked character IDs', value: linkedCharacters },
          { label: 'Linked location IDs', value: linkedLocations },
          { label: 'Related session photos', value: relatedPhotos },
          {
            label: 'Coordinates',
            value:
              typeof meta.latitude === 'number' && typeof meta.longitude === 'number'
                ? `${meta.latitude}, ${meta.longitude}`
                : null,
          },
        ],
        body: photo.content?.trim() || undefined,
      };
    }),
  });
}
