import { Image as ImageIcon, Calendar, MapPin, Search, X, Loader2, Tag, FileText } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { photosApi, type PhotoQueryResult } from '../../api/photos';
import { useMockData } from '../../contexts/MockDataContext';
import { fetchJson } from '../../lib/api';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SUBTYPES,
  documentSubtypeLabel,
  type DocumentCategory,
} from '../../lib/documentCategories';
import { clipboardFilterLines } from '../../lib/listClipboard';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { buildPhotoAlbumClipboardText } from '../../lib/photoAlbumClipboard';
import { mockDataService, type PhotoEntry } from '../../services/mockDataService';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  GridListViewToolbar,
  readStoredCardViewMode,
  type CardViewMode,
} from '../ui/GridListViewToolbar';
import { LazyImage } from '../ui/LazyImage';

// Mock photo data
const dummyPhotos: PhotoEntry[] = [
  {
    id: 'photo-1',
    date: new Date().toISOString(),
    content: 'Beautiful mountain landscape captured during a hike. The view was breathtaking with snow-capped peaks in the distance.',
    summary: 'Mountain hike',
    tags: ['nature', 'hiking', 'mountains', 'adventure'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      photoId: 'photo-1',
      locationName: 'Mountain View Trail',
      dateTime: new Date().toISOString(),
      latitude: 37.4219,
      longitude: -122.0840,
      people: ['Sarah Chen']
    }
  },
  {
    id: 'photo-2',
    date: new Date(Date.now() - 86400000).toISOString(),
    content: 'Stunning sunset at the beach. Perfect end to a wonderful day spent with friends.',
    summary: 'Beach sunset',
    tags: ['beach', 'sunset', 'vacation', 'friends'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800',
      photoId: 'photo-2',
      locationName: 'Sunset Beach',
      dateTime: new Date(Date.now() - 86400000).toISOString(),
      latitude: 34.0522,
      longitude: -118.2437,
      people: ['Marcus Johnson', 'Alex Rivera']
    }
  },
  {
    id: 'photo-3',
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    content: 'City skyline at night. The lights create a mesmerizing pattern against the dark sky.',
    summary: 'City lights',
    tags: ['city', 'night', 'urban', 'photography'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800',
      photoId: 'photo-3',
      locationName: 'Downtown',
      dateTime: new Date(Date.now() - 2 * 86400000).toISOString(),
      latitude: 40.7128,
      longitude: -74.0060
    }
  },
  {
    id: 'photo-4',
    date: new Date(Date.now() - 3 * 86400000).toISOString(),
    content: 'Coffee shop morning. The perfect start to a productive day with a warm cup and good company.',
    summary: 'Morning coffee',
    tags: ['coffee', 'morning', 'cafe', 'lifestyle'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
      photoId: 'photo-4',
      locationName: 'Local Coffee Shop',
      dateTime: new Date(Date.now() - 3 * 86400000).toISOString(),
      latitude: 37.7749,
      longitude: -122.4194,
      people: ['Kai']
    }
  },
  {
    id: 'photo-5',
    date: new Date(Date.now() - 5 * 86400000).toISOString(),
    content: 'Forest trail during autumn. The colors were absolutely vibrant, a true feast for the eyes.',
    summary: 'Autumn hike',
    tags: ['forest', 'autumn', 'hiking', 'nature'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800',
      photoId: 'photo-5',
      locationName: 'Autumn Trail',
      dateTime: new Date(Date.now() - 5 * 86400000).toISOString(),
      latitude: 45.5017,
      longitude: -73.5673
    }
  },
  {
    id: 'photo-6',
    date: new Date(Date.now() - 7 * 86400000).toISOString(),
    content: 'Workspace setup. A clean, organized desk that inspires creativity and focus.',
    summary: 'Workspace',
    tags: ['workspace', 'productivity', 'setup', 'design'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
      photoId: 'photo-6',
      locationName: 'Home Office',
      dateTime: new Date(Date.now() - 7 * 86400000).toISOString()
    }
  },
  {
    id: 'photo-7',
    date: new Date(Date.now() - 10 * 86400000).toISOString(),
    content: 'Concert night. The energy was incredible, and the music was unforgettable.',
    summary: 'Concert',
    tags: ['music', 'concert', 'night', 'entertainment'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafdc?w=800',
      photoId: 'photo-7',
      locationName: 'Concert Hall',
      dateTime: new Date(Date.now() - 10 * 86400000).toISOString(),
      people: ['Emma', 'Mike']
    }
  },
  {
    id: 'photo-8',
    date: new Date(Date.now() - 14 * 86400000).toISOString(),
    content: 'Garden flowers in full bloom. Spring has arrived with all its beauty and colors.',
    summary: 'Spring garden',
    tags: ['garden', 'flowers', 'spring', 'nature'],
    metadata: {
      photoUrl: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800',
      photoId: 'photo-8',
      locationName: 'Botanical Garden',
      dateTime: new Date(Date.now() - 14 * 86400000).toISOString(),
      latitude: 37.5665,
      longitude: -122.3259
    }
  }
];

const PHOTO_VIEW_STORAGE_KEY = 'lk_photo_album_view';

const PRESET_PHOTO_CATEGORIES = ['selfie', 'group_photo', 'message_screenshot', 'event_flyer', 'meme'] as const;
const PRESET_CATEGORY_LABELS: Record<string, string> = {
  selfie: 'Selfies',
  group_photo: 'Group Photos',
  message_screenshot: 'Message Screenshots',
  event_flyer: 'Event Flyers',
  meme: 'Memes',
  other: 'Other',
};

function categoryDisplayLabel(category?: string, customLabel?: string): string {
  if (!category || category === 'other') return customLabel?.trim() || 'Other';
  if (PRESET_CATEGORY_LABELS[category]) return PRESET_CATEGORY_LABELS[category];
  if (customLabel?.trim()) return customLabel.trim();
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function PhotoCard({
  photo,
  onClick,
  onEditCategory,
}: {
  photo: PhotoEntry;
  onClick: () => void;
  onEditCategory: () => void;
}) {
  const categoryLabel = photo.metadata?.category
    ? categoryDisplayLabel(photo.metadata.category, photo.metadata.customCategoryLabel)
    : null;
  const suggestedDocLabel = documentSubtypeLabel(photo.metadata?.suggestedDocumentSubtype);

  return (
    <div className="relative group cursor-pointer" onClick={onClick}>
      <div className="aspect-square rounded-lg overflow-hidden border border-border/60 bg-black/40">
        <LazyImage
          src={photo.metadata?.photoUrl || ''}
          alt={photo.summary || photo.content.substring(0, 50)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      {categoryLabel && (
        <Badge
          variant="outline"
          className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0 bg-black/70 text-white/80 border-white/20"
        >
          {categoryLabel}
        </Badge>
      )}
      {suggestedDocLabel && (
        <Badge
          variant="outline"
          className="absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0 bg-amber-950/80 text-amber-200 border-amber-300/30 flex items-center gap-1"
        >
          <FileText className="w-2.5 h-2.5" /> {suggestedDocLabel}?
        </Badge>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditCategory();
        }}
        title="Set category"
        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/70 border border-white/20 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
      >
        <Tag className="w-3 h-3" />
      </button>
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-3 flex flex-col justify-end">
        <p className="text-xs text-white line-clamp-2 mb-1">
          {photo.summary || photo.content.substring(0, 100)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {photo.metadata?.locationName && (
            <div className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 text-white/60 shrink-0" />
              <p className="text-[10px] text-white/60 truncate">{photo.metadata.locationName}</p>
            </div>
          )}
          <p className="text-[10px] text-white/60 shrink-0">
            {new Date(photo.date).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function PhotoListRow({
  photo,
  onClick,
  onEditCategory,
}: {
  photo: PhotoEntry;
  onClick: () => void;
  onEditCategory: () => void;
}) {
  const people = photo.metadata?.people ?? [];
  const categoryLabel = photo.metadata?.category
    ? categoryDisplayLabel(photo.metadata.category, photo.metadata.customCategoryLabel)
    : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className="group relative w-full flex items-stretch gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left cursor-pointer"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditCategory();
        }}
        title="Set category"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded bg-black/60 border border-white/15 text-white/60 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
      >
        <Tag className="w-3 h-3" />
      </button>
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden border border-border/60 bg-black/40 shrink-0">
        <LazyImage
          src={photo.metadata?.photoUrl || ''}
          alt={photo.summary || photo.content.substring(0, 50)}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-white truncate">
            {photo.summary || photo.content.slice(0, 80) || 'Photo'}
          </p>
          <span className="text-[10px] text-white/45 shrink-0">
            {new Date(photo.date).toLocaleDateString()}
          </span>
        </div>
        <p className="text-xs text-white/55 line-clamp-2 mt-0.5">{photo.content}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px] text-white/45">
          {categoryLabel && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
              {categoryLabel}
            </Badge>
          )}
          {documentSubtypeLabel(photo.metadata?.suggestedDocumentSubtype) && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 bg-amber-950/60 text-amber-200 border-amber-300/30 flex items-center gap-1"
            >
              <FileText className="w-2.5 h-2.5" /> {documentSubtypeLabel(photo.metadata?.suggestedDocumentSubtype)}?
            </Badge>
          )}
          {photo.metadata?.locationName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {photo.metadata.locationName}
            </span>
          )}
          {people.length > 0 && <span>People: {people.join(', ')}</span>}
          {photo.tags?.length > 0 && (
            <span className="truncate">Tags: {photo.tags.slice(0, 6).join(', ')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export const PhotoAlbum: React.FC = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [photoQuery, setPhotoQuery] = useState('');
  const [photoQueryResults, setPhotoQueryResults] = useState<PhotoQueryResult | null>(null);
  const [photoQuerying, setPhotoQuerying] = useState(false);
  const [photoQueryError, setPhotoQueryError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<string>('other');
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);
  const [documentCategoryDraft, setDocumentCategoryDraft] =
    useState<DocumentCategory>('photos_images');
  const [documentSubtypeDraft, setDocumentSubtypeDraft] = useState<string>('');
  const [sendingToDocuments, setSendingToDocuments] = useState(false);
  const [sendToDocumentsError, setSendToDocumentsError] = useState<string | null>(null);
  const [filterBy, setFilterBy] = useState<'all' | 'recent' | 'by-location' | 'by-date'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<CardViewMode>(() =>
    readStoredCardViewMode(PHOTO_VIEW_STORAGE_KEY, 'grid'),
  );
  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.photos(dummyPhotos);
  }, []);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch entries that have photoUrl in metadata
      const data = await fetchJson<{ entries: PhotoEntry[] }>('/api/photos');
      
      // Filter entries that have photos
      const photoEntries = data.entries.filter(entry => {
        const metadata = entry.metadata || {};
        return metadata.photoUrl || metadata.photoId;
      });

      // Sort by date (newest first)
      photoEntries.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      // Use mock data service to determine what to show
      const result = mockDataService.getWithFallback.photos(
        photoEntries.length > 0 ? photoEntries : null,
        isMockDataEnabled
      );

      setPhotos(result.data);
    } catch (error) {
      console.error('Failed to fetch photos:', error);
      // On error, use mock data if enabled
      const result = mockDataService.getWithFallback.photos(null, isMockDataEnabled);
      setPhotos(result.data);
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    const photoId = searchParams.get('photoId');
    if (!photoId || !photos.length || selectedPhoto) return;
    const photo = photos.find((candidate) => candidate.id === photoId);
    if (!photo) return;
    setSelectedPhoto(photo);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('photoId');
    setSearchParams(nextParams, { replace: true });
  }, [photos, searchParams, selectedPhoto, setSearchParams]);

  useEffect(() => {
    if (!selectedPhoto) return;
    const cat = selectedPhoto.metadata?.category ?? 'other';
    const isPreset = cat === 'other' || (PRESET_PHOTO_CATEGORIES as readonly string[]).includes(cat);
    setCategoryDraft(isPreset ? cat : 'custom');
    setCustomCategoryDraft(isPreset ? '' : categoryDisplayLabel(cat, selectedPhoto.metadata?.customCategoryLabel));
    const suggestedSubtype = selectedPhoto.metadata?.suggestedDocumentSubtype;
    setDocumentCategoryDraft(suggestedSubtype ? 'personal_identity' : 'photos_images');
    setDocumentSubtypeDraft(suggestedSubtype || DOCUMENT_SUBTYPES[0].id);
    setSendToDocumentsError(null);
  }, [selectedPhoto]);

  const sendSelectedPhotoToDocuments = useCallback(async () => {
    if (
      !selectedPhoto ||
      (documentCategoryDraft === 'personal_identity' && !documentSubtypeDraft)
    ) return;
    setSendingToDocuments(true);
    setSendToDocumentsError(null);
    try {
      await fetchJson(`/api/photos/${selectedPhoto.id}/send-to-documents`, {
        method: 'POST',
        body: JSON.stringify({
          category: documentCategoryDraft,
          ...(documentCategoryDraft === 'personal_identity'
            ? { documentSubtype: documentSubtypeDraft }
            : {}),
        }),
      });
      setPhotos((prev) => prev.filter((p) => p.id !== selectedPhoto.id));
      setSelectedPhoto(null);
    } catch (error) {
      console.error('Failed to send photo to Documents:', error);
      setSendToDocumentsError('Could not send this photo to Documents. Try again.');
    } finally {
      setSendingToDocuments(false);
    }
  }, [selectedPhoto, documentCategoryDraft, documentSubtypeDraft]);

  const saveCategory = useCallback(async () => {
    if (!selectedPhoto) return;
    const category = categoryDraft === 'custom' ? customCategoryDraft.trim() : categoryDraft;
    if (!category) return;
    setCategorySaving(true);
    try {
      const { entry } = await fetchJson<{ entry: PhotoEntry }>(`/api/photos/${selectedPhoto.id}/category`, {
        method: 'PATCH',
        body: JSON.stringify({
          category,
          customLabel: categoryDraft === 'custom' ? customCategoryDraft.trim() : undefined,
        }),
      });
      setPhotos((prev) => prev.map((p) => (p.id === entry.id ? { ...p, ...entry } : p)));
      setSelectedPhoto((prev) => (prev && prev.id === entry.id ? { ...prev, ...entry } : prev));
    } catch (error) {
      console.error('Failed to update photo category:', error);
    } finally {
      setCategorySaving(false);
    }
  }, [selectedPhoto, categoryDraft, customCategoryDraft]);

  // Category chips: the fixed presets always show (even with zero photos yet,
  // so users know sorting exists), plus any custom category the user has set
  // via the detail-modal editor, plus a catch-all "Other" for uncategorized.
  const categoryOptions = useMemo(() => {
    const custom = new Map<string, string>();
    for (const photo of photos) {
      const cat = photo.metadata?.category;
      if (!cat || cat === 'other' || (PRESET_PHOTO_CATEGORIES as readonly string[]).includes(cat)) continue;
      if (!custom.has(cat)) custom.set(cat, categoryDisplayLabel(cat, photo.metadata?.customCategoryLabel));
    }
    return [
      ...PRESET_PHOTO_CATEGORIES.map((value) => ({ value, label: PRESET_CATEGORY_LABELS[value] })),
      ...Array.from(custom.entries()).map(([value, label]) => ({ value, label })),
      { value: 'other', label: 'Other' },
    ];
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    let filtered = photos;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(photo => {
        const content = photo.content.toLowerCase();
        const summary = photo.summary?.toLowerCase() || '';
        const tags = photo.tags.join(' ').toLowerCase();
        const location = photo.metadata?.locationName?.toLowerCase() || '';
        return content.includes(query) || summary.includes(query) || tags.includes(query) || location.includes(query);
      });
    }

    // Filter by type
    if (filterBy === 'recent') {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(photo => new Date(photo.date).getTime() > thirtyDaysAgo);
    } else if (filterBy === 'by-location') {
      filtered = filtered.filter(photo => photo.metadata?.locationName);
    }

    // Filter by category — orthogonal to the view-mode filter above.
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(photo => (photo.metadata?.category || 'other') === categoryFilter);
    }

    return filtered;
  }, [photos, searchQuery, filterBy, categoryFilter]);

  const clipboardText = useMemo(
    () =>
      buildPhotoAlbumClipboardText(filteredPhotos, {
        filters: clipboardFilterLines([
          searchQuery.trim() && `search="${searchQuery.trim()}"`,
          filterBy !== 'all' && `view=${filterBy}`,
          categoryFilter !== 'all' && `category=${categoryFilter}`,
        ]),
      }),
    [filteredPhotos, searchQuery, filterBy, categoryFilter],
  );

  const groupedByLocation = useMemo(() => {
    const groups: Record<string, PhotoEntry[]> = {};
    filteredPhotos.forEach(photo => {
      const location = photo.metadata?.locationName || 'Unknown Location';
      if (!groups[location]) {
        groups[location] = [];
      }
      groups[location].push(photo);
    });
    return groups;
  }, [filteredPhotos]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, PhotoEntry[]> = {};
    filteredPhotos.forEach(photo => {
      const date = new Date(photo.date);
      const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(photo);
    });
    return groups;
  }, [filteredPhotos]);

  const handlePhotoClick = (photo: PhotoEntry) => {
    setSelectedPhoto(photo);
  };

  const runPhotoQuery = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = photoQuery.trim();
    if (!query || photoQuerying) return;
    setPhotoQuerying(true);
    setPhotoQueryError(null);
    try {
      setPhotoQueryResults(await photosApi.query({ query, limit: 20 }));
    } catch (error) {
      setPhotoQueryResults(null);
      setPhotoQueryError(error instanceof Error ? error.message : 'Could not search your photos.');
    } finally {
      setPhotoQuerying(false);
    }
  };

  const openPhotoChat = () => {
    if (!selectedPhoto) return;
    openChatWithFocus({
      entityId: selectedPhoto.id,
      entityName: selectedPhoto.summary || 'Photo',
      entityType: 'memory',
      sourceSurface: 'photos',
      sourceLabel: 'Photo Album',
      knowledgeScope: 'this photo’s description, date, location, tags, people, and related memories',
      startNewThread: true,
    });
    setSelectedPhoto(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading photos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-white">Photo Album</h1>
            {isMockDataEnabled && (
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                Demo Data
              </Badge>
            )}
          </div>
          <p className="text-sm text-white/60 mt-1">
            {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>
        <GridListViewToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          copyText={clipboardText}
          copyDisabled={filteredPhotos.length === 0}
          storageKey={PHOTO_VIEW_STORAGE_KEY}
        />
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search photos by content, location, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-black/40 border border-border/60 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/40 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <form
          onSubmit={(event) => void runPhotoQuery(event)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            placeholder="Ask your photos: What photos include a beach or a trip?"
            value={photoQuery}
            onChange={(event) => setPhotoQuery(event.target.value)}
            aria-label="Ask your photos"
            className="min-w-0 flex-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-primary/50 focus:outline-none"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={photoQuerying || !photoQuery.trim()}
          >
            {photoQuerying ? 'Searching…' : 'Ask photos'}
          </Button>
        </form>
        {photoQueryError && (
          <p role="alert" className="text-sm text-red-300">{photoQueryError}</p>
        )}
        {photoQueryResults && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="mb-2 text-xs text-white/50">
              {photoQueryResults.total} matching photo{photoQueryResults.total === 1 ? '' : 's'}
            </p>
            {photoQueryResults.photos.length === 0 ? (
              <p className="text-sm text-white/50">No photos matched that question.</p>
            ) : (
              <ul className="space-y-1">
                {photoQueryResults.photos.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(photo)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-white/80 hover:bg-white/10"
                    >
                      <span className="font-medium">{photo.summary || 'Photo'}</span>
                      <span className="ml-2 text-xs text-white/45">
                        {new Date(photo.date).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/50">Filter:</span>
          {(['all', 'recent', 'by-location', 'by-date'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterBy(filter)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
                filterBy === filter
                  ? 'bg-primary/20 text-white border-primary/40'
                  : 'bg-black/40 text-white/60 border-border/60 hover:border-primary/40'
              }`}
            >
              {filter === 'all' ? 'All Photos' : filter === 'recent' ? 'Recent' : filter === 'by-location' ? 'By Location' : 'By Date'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/50">Category:</span>
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
              categoryFilter === 'all'
                ? 'bg-primary/20 text-white border-primary/40'
                : 'bg-black/40 text-white/60 border-border/60 hover:border-primary/40'
            }`}
          >
            All
          </button>
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setCategoryFilter(option.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
                categoryFilter === option.value
                  ? 'bg-primary/20 text-white border-primary/40'
                  : 'bg-black/40 text-white/60 border-border/60 hover:border-primary/40'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Photo grid / list */}
      {filteredPhotos.length === 0 ? (
        <Card className="p-12 text-center bg-black/40 border-border/60">
          <ImageIcon className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {searchQuery ? 'No photos found' : 'No photos yet'}
          </h3>
          <p className="text-sm text-white/60">
            {searchQuery
              ? 'Try a different search term'
              : 'Upload photos in the chat section to see them here'}
          </p>
        </Card>
      ) : filterBy === 'by-location' ? (
        <div className="space-y-6">
          {Object.entries(groupedByLocation).map(([location, locationPhotos]) => (
            <div key={location}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <h2 className="text-lg font-semibold text-white">{location}</h2>
                <Badge variant="outline" className="text-xs">
                  {locationPhotos.length} photo{locationPhotos.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {viewMode === 'list' ? (
                <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/6">
                  {locationPhotos.map((photo) => (
                    <PhotoListRow
                      key={photo.id}
                      photo={photo}
                      onClick={() => handlePhotoClick(photo)}
                      onEditCategory={() => setSelectedPhoto(photo)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {locationPhotos.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      onClick={() => handlePhotoClick(photo)}
                      onEditCategory={() => setSelectedPhoto(photo)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : filterBy === 'by-date' ? (
        <div className="space-y-6">
          {Object.entries(groupedByDate)
            .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
            .map(([monthYear, monthPhotos]) => (
              <div key={monthYear}>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h2 className="text-lg font-semibold text-white">{monthYear}</h2>
                  <Badge variant="outline" className="text-xs">
                    {monthPhotos.length} photo{monthPhotos.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                {viewMode === 'list' ? (
                  <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/6">
                    {monthPhotos.map((photo) => (
                      <PhotoListRow
                        key={photo.id}
                        photo={photo}
                        onClick={() => handlePhotoClick(photo)}
                        onEditCategory={() => setSelectedPhoto(photo)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {monthPhotos.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        onClick={() => handlePhotoClick(photo)}
                        onEditCategory={() => setSelectedPhoto(photo)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : viewMode === 'list' ? (
        <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/6">
          {filteredPhotos.map((photo) => (
            <PhotoListRow
              key={photo.id}
              photo={photo}
              onClick={() => handlePhotoClick(photo)}
              onEditCategory={() => setSelectedPhoto(photo)}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => handlePhotoClick(photo)}
              onEditCategory={() => setSelectedPhoto(photo)}
            />
          ))}
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-black/90 border border-border/60 rounded-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="flex flex-col md:flex-row">
              <div className="flex-1 p-6">
                <img
                  src={selectedPhoto.metadata?.photoUrl || ''}
                  alt={selectedPhoto.summary || ''}
                  className="w-full h-auto rounded-lg"
                />
              </div>
              <div className="w-full md:w-80 p-6 border-t md:border-t-0 md:border-l border-border/60 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {selectedPhoto.summary || 'Photo'}
                  </h3>
                  <p className="text-sm text-white/80 whitespace-pre-wrap">
                    {selectedPhoto.content}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-white/60">
                    <Calendar className="w-4 h-4" />
                    {new Date(selectedPhoto.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                  {selectedPhoto.metadata?.locationName && (
                    <div className="flex items-center gap-2 text-white/60">
                      <MapPin className="w-4 h-4" />
                      {selectedPhoto.metadata.locationName}
                    </div>
                  )}
                  {selectedPhoto.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPhoto.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/50 block">Category</label>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={categoryDraft}
                      onChange={(e) => setCategoryDraft(e.target.value)}
                      className="flex-1 min-w-[140px] px-2 py-1.5 bg-black/40 border border-border/60 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {PRESET_PHOTO_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {PRESET_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                      <option value="other">Other</option>
                      <option value="custom">Custom…</option>
                    </select>
                    {categoryDraft === 'custom' && (
                      <input
                        type="text"
                        value={customCategoryDraft}
                        onChange={(e) => setCustomCategoryDraft(e.target.value)}
                        placeholder="e.g. Recipes"
                        className="flex-1 min-w-[140px] px-2 py-1.5 bg-black/40 border border-border/60 rounded text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveCategory}
                      disabled={categorySaving || (categoryDraft === 'custom' && !customCategoryDraft.trim())}
                    >
                      {categorySaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3">
                  <label className="text-xs text-amber-200/80 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    {selectedPhoto.metadata?.suggestedDocumentSubtype
                      ? `Looks like a ${documentSubtypeLabel(selectedPhoto.metadata.suggestedDocumentSubtype)}. Choose where to file it.`
                      : 'File this photo in Documents'}
                  </label>
                  <div className="space-y-2">
                    <label className="block text-xs text-white/50" htmlFor="photo-document-folder">
                      Documents folder
                    </label>
                    <select
                      id="photo-document-folder"
                      value={documentCategoryDraft}
                      onChange={(e) => setDocumentCategoryDraft(e.target.value as DocumentCategory)}
                      className="w-full px-2 py-1.5 bg-black/40 border border-border/60 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {DOCUMENT_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    {documentCategoryDraft === 'personal_identity' && (
                      <>
                        <label className="block text-xs text-white/50" htmlFor="photo-document-subtype">
                          Identity record type
                        </label>
                        <select
                          id="photo-document-subtype"
                          value={documentSubtypeDraft}
                          onChange={(e) => setDocumentSubtypeDraft(e.target.value)}
                          className="w-full px-2 py-1.5 bg-black/40 border border-border/60 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {DOCUMENT_SUBTYPES.map((subtype) => (
                            <option key={subtype.id} value={subtype.id}>
                              {subtype.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={sendSelectedPhotoToDocuments}
                      disabled={
                        sendingToDocuments ||
                        (documentCategoryDraft === 'personal_identity' && !documentSubtypeDraft)
                      }
                    >
                      {sendingToDocuments ? 'Moving…' : 'Move to Documents'}
                    </Button>
                  </div>
                  {sendToDocumentsError && (
                    <p className="text-xs text-red-400">{sendToDocumentsError}</p>
                  )}
                </div>
                <Button
                  onClick={openPhotoChat}
                  className="w-full"
                >
                  Ask in focused chat
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
