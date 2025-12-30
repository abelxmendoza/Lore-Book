import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Image as ImageIcon, Calendar, MapPin, User, Search, Filter, X, Loader2, ZoomIn } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { LazyImage } from '../ui/LazyImage';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import { useEntityModal } from '../../contexts/EntityModalContext';

interface PhotoEntry {
  id: string;
  date: string;
  content: string;
  summary?: string | null;
  tags: string[];
  metadata?: {
    photoUrl?: string;
    photoId?: string;
    locationName?: string;
    dateTime?: string;
    people?: string[];
    latitude?: number;
    longitude?: number;
  };
}

export const PhotoAlbum: React.FC = () => {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoEntry | null>(null);
  const [filterBy, setFilterBy] = useState<'all' | 'recent' | 'by-location' | 'by-date'>('all');
  const { openMemory } = useEntityModal();

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

      setPhotos(photoEntries);
    } catch (error) {
      console.error('Failed to fetch photos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

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

    return filtered;
  }, [photos, searchQuery, filterBy]);

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
    // Open memory modal with photo entry
    openMemory({
      id: photo.id,
      journal_entry_id: photo.id,
      content: photo.content,
      start_time: photo.date,
      timeline_memberships: []
    } as any);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Photo Album</h1>
          <p className="text-sm text-white/60 mt-1">
            {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''} 
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>
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
      </div>

      {/* Photo Grid */}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {locationPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative group cursor-pointer"
                    onClick={() => handlePhotoClick(photo)}
                  >
                    <div className="aspect-square rounded-lg overflow-hidden border border-border/60 bg-black/40">
                      <LazyImage
                        src={photo.metadata?.photoUrl || ''}
                        alt={photo.summary || photo.content.substring(0, 50)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-3 flex flex-col justify-end">
                      <p className="text-xs text-white line-clamp-2 mb-1">
                        {photo.summary || photo.content.substring(0, 100)}
                      </p>
                      <p className="text-[10px] text-white/60">
                        {new Date(photo.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {monthPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative group cursor-pointer"
                      onClick={() => handlePhotoClick(photo)}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden border border-border/60 bg-black/40">
                        <LazyImage
                          src={photo.metadata?.photoUrl || ''}
                          alt={photo.summary || photo.content.substring(0, 50)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-3 flex flex-col justify-end">
                        <p className="text-xs text-white line-clamp-2 mb-1">
                          {photo.summary || photo.content.substring(0, 100)}
                        </p>
                        <p className="text-[10px] text-white/60">
                          {new Date(photo.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="relative group cursor-pointer"
              onClick={() => handlePhotoClick(photo)}
            >
              <div className="aspect-square rounded-lg overflow-hidden border border-border/60 bg-black/40">
                <LazyImage
                  src={photo.metadata?.photoUrl || ''}
                  alt={photo.summary || photo.content.substring(0, 50)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-3 flex flex-col justify-end">
                <p className="text-xs text-white line-clamp-2 mb-1">
                  {photo.summary || photo.content.substring(0, 100)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {photo.metadata?.locationName && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-white/60" />
                      <p className="text-[10px] text-white/60 truncate">
                        {photo.metadata.locationName}
                      </p>
                    </div>
                  )}
                  <p className="text-[10px] text-white/60">
                    {new Date(photo.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
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
            className="relative max-w-4xl max-h-[90vh] bg-black/90 border border-border/60 rounded-2xl overflow-hidden"
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
                <Button
                  onClick={() => {
                    handlePhotoClick(selectedPhoto);
                    setSelectedPhoto(null);
                  }}
                  className="w-full"
                >
                  View Full Details
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
