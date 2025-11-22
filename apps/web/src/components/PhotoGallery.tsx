import { useState, useCallback, useRef, useEffect } from 'react';
import { Camera, Upload, Image as ImageIcon } from 'lucide-react';

import { Button } from './ui/button';
import { Card } from './ui/card';
import { LazyImage } from './ui/LazyImage';
import { config } from '../config/env';
import { supabase } from '../lib/supabase';

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

export const PhotoGallery = ({ onPhotoUploaded }: PhotoGalleryProps) => {
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      // If mock data is enabled, return mock photos
      if (config.dev.allowMockData) {
        if (config.dev.enableConsoleLogs) {
          console.log('[MOCK API] Fetching photos - Using mock data');
        }
        
        const mockPhotos: PhotoMetadata[] = [
          {
            photoId: 'mock-photo-1',
            url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
            metadata: {
              locationName: 'Mountain View',
              dateTime: new Date().toISOString(),
              latitude: 37.4219,
              longitude: -122.0840
            },
            autoEntry: {
              id: 'mock-entry-1',
              content: 'Beautiful mountain landscape captured during a hike. The view was breathtaking.',
              tags: ['nature', 'hiking', 'mountains']
            }
          },
          {
            photoId: 'mock-photo-2',
            url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400',
            metadata: {
              locationName: 'Beach Sunset',
              dateTime: new Date(Date.now() - 86400000).toISOString(),
            },
            autoEntry: {
              id: 'mock-entry-2',
              content: 'Stunning sunset at the beach. Perfect end to a wonderful day.',
              tags: ['beach', 'sunset', 'vacation']
            }
          }
        ];
        
        setPhotos(mockPhotos);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiBaseUrl = config.api.url;
      const response = await fetch(`${apiBaseUrl}/api/photos`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Backend returns empty array with message, but we handle it gracefully
        setPhotos(data.photos || []);
      }
    } catch (error) {
      if (config.dev.enableConsoleLogs) {
        console.error('Failed to fetch photos:', error);
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
        
        const mockPhotos: PhotoMetadata[] = Array.from(files).map((file, index) => ({
          photoId: `mock-photo-${Date.now()}-${index}`,
          url: URL.createObjectURL(file), // Use local object URL for preview
          metadata: {
            locationName: 'Mock Location',
            dateTime: new Date().toISOString(),
          },
          autoEntry: {
            id: `mock-entry-${Date.now()}-${index}`,
            content: `Auto-generated entry from photo: ${file.name}. This would be created from photo metadata in production.`,
            tags: ['photo', 'mock']
          }
        }));
        
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
        // Backend returns entries, not photos (photos aren't stored)
        // We'll show a success message and refresh
        if (data.entriesCreated > 0) {
          alert(`Successfully processed ${data.entriesCreated} photo(s)! Journal entries have been created.`);
          // Refresh to show any new entries
          await fetchPhotos();
        } else {
          alert('Photos processed but no entries were created (may have been filtered out).');
        }
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Upload failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      if (config.dev.enableConsoleLogs) {
        console.error('Upload error:', error);
      }
      alert('Failed to upload photos');
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

