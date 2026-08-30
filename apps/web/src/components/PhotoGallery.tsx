import { Camera, FolderInput, Image as ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';

import { config } from '../config/env';
import { useMockData } from '../contexts/MockDataContext';
import { fetchJson } from '../lib/api';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SUBTYPES,
  type DocumentCategory,
  type DocumentSubtype,
} from '../lib/documentCategories';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';
import { supabase } from '../lib/supabase';
import {
  DEMO_PHOTO_GALLERY_STAGES,
  shouldSimulatePhotoUpload,
  simulateDemoPhotoGalleryUpload,
} from '../services/demoPhotoUpload';

import { DemoUploadProgressPanel, type DemoUploadProgress } from './demo/DemoUploadProgressPanel';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { LazyImage } from './ui/LazyImage';

interface PhotoMetadata {
  photoId: string;
  url: string;
  metadata: {
    latitude?: number;
    longitude?: number;
    locationName?: string;
    dateTime?: string;
    people?: string[];
  };
  autoEntry?: {
    id: string;
    content: string;
    tags: string[];
  };
}

interface PhotoGalleryProps {
  onPhotoUploaded?: (photo: PhotoMetadata) => void;
}

// Convert journal entry to photo metadata format
const entryToPhotoMetadata = (entry: {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: Record<string, unknown>;
}): PhotoMetadata => {
  const metadata = (entry.metadata || {}) as {
    latitude?: number;
    longitude?: number;
    locationName?: string;
    dateTime?: string;
    people?: string[];
    photoUrl?: string;
  };

  return {
    photoId: entry.id,
    url: metadata.photoUrl || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    metadata: {
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      locationName: metadata.locationName,
      dateTime: metadata.dateTime || entry.date,
      people: metadata.people
    },
    autoEntry: {
      id: entry.id,
      content: entry.content,
      tags: entry.tags
    }
  };
};

export const PhotoGallery = ({ onPhotoUploaded }: PhotoGalleryProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<DemoUploadProgress | null>(null);
  const [newPhotoIds, setNewPhotoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sendPhotoId, setSendPhotoId] = useState<string | null>(null);
  const [sendCategory, setSendCategory] = useState<DocumentCategory>('photos_images');
  const [sendSubtype, setSendSubtype] = useState<DocumentSubtype>('other_id');
  const [sendingToDocuments, setSendingToDocuments] = useState(false);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    
    // Mock entries for fallback
    const mockEntries = [
      {
        id: 'mock-entry-1',
        date: new Date().toISOString(),
        content: 'Beautiful mountain landscape captured during a hike. The view was breathtaking.',
        summary: 'Mountain hike',
        tags: ['nature', 'hiking', 'mountains'],
        metadata: {
          locationName: 'Mountain View',
          dateTime: new Date().toISOString(),
          latitude: 37.4219,
          longitude: -122.0840,
          photoUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400'
        }
      },
      {
        id: 'mock-entry-2',
        date: new Date(Date.now() - 86400000).toISOString(),
        content: 'Stunning sunset at the beach. Perfect end to a wonderful day.',
        summary: 'Beach sunset',
        tags: ['beach', 'sunset', 'vacation'],
        metadata: {
          locationName: 'Beach Sunset',
          dateTime: new Date(Date.now() - 86400000).toISOString(),
          photoUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400'
        }
      }
    ];

    try {
      // Use the Photos endpoint because it excludes entries that were
      // manually moved into the Documents library.
      const data = await fetchJson<{ entries: Array<{
        id: string;
        date: string;
        content: string;
        summary?: string | null;
        tags: string[];
        metadata?: Record<string, unknown>;
      }>       }>('/api/photos', undefined, {
        useMockData: isMockDataEnabled,
        mockData: { entries: mockEntries }
      });

      const photoEntries = data.entries.map(entryToPhotoMetadata);
      // Only use mock data if toggle is enabled
      if (photoEntries.length === 0 && isMockDataEnabled) {
        setPhotos(mockEntries.map(entryToPhotoMetadata));
      } else {
        setPhotos(photoEntries);
      }
    } catch (error) {
      if (config.dev.enableConsoleLogs) {
        console.error('Failed to fetch photo entries:', error);
      }
      // On error, use empty array or mock data if enabled
      if (isMockDataEnabled) {
        setPhotos(mockEntries.map(entryToPhotoMetadata));
      } else {
        setPhotos([]);
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos, isMockDataEnabled]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(null);
    try {
      // Guest/demo: simulate upload with staged progress (no auth required)
      if (shouldSimulatePhotoUpload()) {
        if (config.dev.enableConsoleLogs) {
          console.log('[MOCK API] Photo upload - Using mock data');
        }

        const mockPhotos: PhotoMetadata[] = [];

        for (const file of Array.from(files)) {
          const result = await simulateDemoPhotoGalleryUpload(file, (progress) => {
            setUploadProgress(progress);
          });

          mockPhotos.push({
            photoId: result.photoId,
            url: result.url,
            metadata: {
              locationName: result.locationName,
              dateTime: new Date().toISOString(),
            },
            autoEntry: {
              id: result.photoId,
              content: result.content,
              tags: result.tags,
            },
          });
        }

        setNewPhotoIds(new Set(mockPhotos.map((photo) => photo.photoId)));
        setPhotos((prev) => [...mockPhotos, ...prev]);
        mockPhotos.forEach((photo) => {
          if (onPhotoUploaded) onPhotoUploaded(photo);
        });

        setTimeout(() => setNewPhotoIds(new Set()), 2500);
        setUploadProgress(null);
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Please sign in to upload photos');
        setUploading(false);
        return;
      }

      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('photos', file);
      });

      const apiBaseUrl = config.api.url;
      const response = await fetch(`${apiBaseUrl}/api/photos/upload/batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        // Backend returns entries created from photos
        if (data.entriesCreated > 0 && data.entries) {
          const resultPhotos = Array.isArray(data.results)
            ? data.results
                .filter((result: any) => result.entryId && result.photoUrl)
                .map((result: any) => ({
                  photoId: result.photoId || result.entryId,
                  url: result.photoUrl,
                  metadata: {
                    locationName: result.locationName,
                    dateTime: new Date().toISOString(),
                  },
                  autoEntry: {
                    id: result.entryId,
                    content: result.summary || 'Photo uploaded',
                    tags: ['photo', result.photoType || 'memory'],
                  },
                }))
            : [];

          const newPhotos = resultPhotos.length > 0
            ? resultPhotos
            : data.entries.map((entry: any) => entryToPhotoMetadata({
                id: entry.id,
                date: entry.date || new Date().toISOString(),
                content: entry.content,
                summary: entry.summary,
                tags: entry.tags || [],
                metadata: entry.metadata || {}
              }));
          
          setPhotos((prev) => [...newPhotos, ...prev]);
          newPhotos.forEach((photo) => {
            if (onPhotoUploaded) onPhotoUploaded(photo);
          });
          
          // Show success message
          if (data.entriesCreated === 1) {
            console.log('Successfully processed 1 photo! Journal entry created.');
          } else {
            console.log(`Successfully processed ${data.entriesCreated} photos! Journal entries created.`);
          }
        } else {
          console.log('Photos processed but no entries were created (may have been filtered out).');
        }
        
        // Refresh to get latest entries
        await fetchPhotos();
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Upload failed:', error.error || 'Unknown error');
        alert(`Upload failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      if (config.dev.enableConsoleLogs) {
        console.error('Upload error:', error);
      }
      alert('Failed to upload photos. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCameraClick = () => {
    // For mobile devices, this will trigger native camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: false, audio: false })
        .then(() => {
          // Camera access granted, but we'll use file input for photo capture
          fileInputRef.current?.click();
        })
        .catch(() => {
          // Fallback to file input
          fileInputRef.current?.click();
        });
    } else {
      fileInputRef.current?.click();
    }
  };

  const openSendToDocuments = (photoId: string) => {
    setSendPhotoId(photoId);
    setSendCategory('photos_images');
    setSendSubtype('other_id');
    setSendNotice(null);
  };

  const sendToDocuments = async () => {
    if (!sendPhotoId || sendingToDocuments) return;
    setSendingToDocuments(true);
    setSendNotice(null);
    try {
      if (!isMockDataEnabled) {
        await fetchJson(`/api/photos/${sendPhotoId}/send-to-documents`, {
          method: 'POST',
          body: JSON.stringify({
            category: sendCategory,
            ...(sendCategory === 'personal_identity'
              ? { documentSubtype: sendSubtype }
              : {}),
          }),
        });
      }
      setPhotos((previous) =>
        previous.filter((photo) => photo.photoId !== sendPhotoId),
      );
      setSendNotice('Photo moved to Documents.');
      setSendPhotoId(null);
      dispatchStoryDataUpdated({ scopes: ['all'] });
    } catch (error) {
      setSendNotice(
        error instanceof Error
          ? error.message
          : 'Could not move this photo to Documents.',
      );
    } finally {
      setSendingToDocuments(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Photo Gallery</h3>
          <p className="text-xs text-white/60 mt-1">
            Upload photos to auto-generate journal entries
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCameraClick}
            disabled={uploading}
          >
            <Camera className="h-4 w-4 mr-2" />
            Camera
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {sendNotice && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-white">
          {sendNotice}
        </div>
      )}

      {sendPhotoId && (
        <section className="mb-4 rounded-lg border border-primary/30 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-white">Send photo to Documents</h4>
              <p className="mt-1 text-xs text-white/55">
                This moves the original out of Photos and files it in Documents without analyzing it again.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSendPhotoId(null)}
              disabled={sendingToDocuments}
              aria-label="Cancel sending photo to Documents"
              className="text-white/40 hover:text-white disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs text-white/55">
              Documents folder
              <select
                value={sendCategory}
                onChange={(event) => setSendCategory(event.target.value as DocumentCategory)}
                disabled={sendingToDocuments}
                className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary/50 focus:outline-none"
              >
                {DOCUMENT_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </label>
            {sendCategory === 'personal_identity' && (
              <label className="flex-1 text-xs text-white/55">
                Record type
                <select
                  value={sendSubtype}
                  onChange={(event) => setSendSubtype(event.target.value as DocumentSubtype)}
                  disabled={sendingToDocuments}
                  className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-primary/50 focus:outline-none"
                >
                  {DOCUMENT_SUBTYPES.map((subtype) => (
                    <option key={subtype.id} value={subtype.id}>{subtype.label}</option>
                  ))}
                </select>
              </label>
            )}
            <Button
              size="sm"
              onClick={() => void sendToDocuments()}
              disabled={sendingToDocuments}
            >
              {sendingToDocuments ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderInput className="mr-2 h-4 w-4" />
              )}
              Move to Documents
            </Button>
          </div>
        </section>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {uploading && uploadProgress ? (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <DemoUploadProgressPanel
            progress={uploadProgress}
            stages={DEMO_PHOTO_GALLERY_STAGES}
            icon={ImageIcon}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="text-center py-8 text-white/60">Loading photos...</div>
      ) : photos.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No photos yet. Upload photos to get started!</p>
          <p className="text-xs mt-2">Photos will auto-generate journal entries with location and metadata.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {photos.map((photo) => (
            <div
              key={photo.photoId}
              className={`relative group ${
                newPhotoIds.has(photo.photoId)
                  ? 'animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-700'
                  : ''
              }`}
            >
              <button
                type="button"
                onClick={() => openSendToDocuments(photo.photoId)}
                className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Send this photo to Documents"
              >
                <FolderInput className="h-3.5 w-3.5" />
                Documents
              </button>
              <LazyImage
                src={photo.url}
                alt="Photo"
                className="w-full aspect-square object-cover rounded-lg border border-border/60"
                loading="lazy"
              />
              {photo.metadata.locationName && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 rounded-b-lg">
                  <p className="text-xs text-white truncate">📍 {photo.metadata.locationName}</p>
                </div>
              )}
              {photo.autoEntry && (
                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-2 flex items-center justify-center">
                  <p className="text-xs text-white text-center line-clamp-3">
                    {photo.autoEntry.content}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
