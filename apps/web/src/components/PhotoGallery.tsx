import { useState, useCallback, useRef, useEffect } from 'react';
import { Camera, Upload, Image as ImageIcon } from 'lucide-react';

import { Button } from './ui/button';
import { Card } from './ui/card';
import { LazyImage } from './ui/LazyImage';
import { config } from '../config/env';
import { supabase } from '../lib/supabase';
import { fetchJson } from '../lib/api';

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
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
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
      // Fetch entries with source=photo
      const data = await fetchJson<{ entries: Array<{
        id: string;
        date: string;
        content: string;
        summary?: string | null;
        tags: string[];
        metadata?: Record<string, unknown>;
      }> }>('/api/entries/recent?sources=photo&limit=50', undefined, {
        useMockData: true,
        mockData: { entries: mockEntries }
      });

      const photoEntries = data.entries.map(entryToPhotoMetadata);
      setPhotos(photoEntries);
    } catch (error) {
      if (config.dev.enableConsoleLogs) {
        console.error('Failed to fetch photo entries:', error);
      }
      // On error, use empty array or mock data if enabled
      if (config.dev.allowMockData) {
        setPhotos(mockEntries.map(entryToPhotoMetadata));
      } else {
        setPhotos([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      // If mock data is enabled, simulate upload
      if (config.dev.allowMockData) {
        if (config.dev.enableConsoleLogs) {
          console.log('[MOCK API] Photo upload - Using mock data');
        }
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const mockPhotos: PhotoMetadata[] = Array.from(files).map((file, index) => {
          const entryId = `mock-entry-${Date.now()}-${index}`;
          const photoUrl = URL.createObjectURL(file);
          return {
            photoId: entryId,
            url: photoUrl,
            metadata: {
              locationName: 'Mock Location',
              dateTime: new Date().toISOString(),
            },
            autoEntry: {
              id: entryId,
              content: `Auto-generated entry from photo: ${file.name}. This would be created from photo metadata in production.`,
              tags: ['photo', 'mock']
            }
          };
        });
        
        setPhotos((prev) => [...mockPhotos, ...prev]);
        mockPhotos.forEach((photo) => {
          if (onPhotoUploaded) onPhotoUploaded(photo);
        });
        
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
          // Convert entries to photo metadata format
          const newPhotos = data.entries.map((entry: any) => entryToPhotoMetadata({
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

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
            <div key={photo.photoId} className="relative group">
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

