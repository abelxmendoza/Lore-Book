import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, MapPin, RefreshCw } from 'lucide-react';
import { LocationProfileCard, type LocationProfile } from './LocationProfileCard';
import { LocationDetailModal } from './LocationDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';

// Dummy location data for display
// Export for use in mock data service
export const dummyLocations: LocationProfile[] = [
  {
    id: 'dummy-loc-1',
    name: 'San Francisco Tech Hub',
    visitCount: 12,
    firstVisited: '2024-01-15T10:00:00Z',
    lastVisited: '2024-03-20T14:30:00Z',
    coordinates: { lat: 37.7749, lng: -122.4194 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 8 },
      { id: 'person-2', name: 'Marcus', total_mentions: 30, entryCount: 5 }
    ],
    tagCounts: [
      { tag: 'work', count: 8 },
      { tag: 'meeting', count: 5 },
      { tag: 'networking', count: 3 }
    ],
    chapters: [
      { id: 'ch-1', title: 'Tech Adventures', count: 6 },
      { id: 'ch-2', title: 'Career Growth', count: 4 }
    ],
    moods: [
      { mood: 'excited', count: 5 },
      { mood: 'focused', count: 4 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-2',
    name: 'Golden Gate Park',
    visitCount: 8,
    firstVisited: '2024-02-01T09:00:00Z',
    lastVisited: '2024-03-15T16:00:00Z',
    coordinates: { lat: 37.7694, lng: -122.4862 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 6 }
    ],
    tagCounts: [
      { tag: 'nature', count: 6 },
      { tag: 'relaxation', count: 4 },
      { tag: 'exercise', count: 3 }
    ],
    chapters: [
      { id: 'ch-3', title: 'Weekend Escapes', count: 5 }
    ],
    moods: [
      { mood: 'peaceful', count: 5 },
      { mood: 'energized', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-3',
    name: 'Home Office',
    visitCount: 45,
    firstVisited: '2024-01-01T08:00:00Z',
    lastVisited: '2024-03-25T18:00:00Z',
    coordinates: null,
    relatedPeople: [],
    tagCounts: [
      { tag: 'work', count: 30 },
      { tag: 'focus', count: 25 },
      { tag: 'productivity', count: 20 }
    ],
    chapters: [
      { id: 'ch-1', title: 'Tech Adventures', count: 20 },
      { id: 'ch-2', title: 'Career Growth', count: 15 }
    ],
    moods: [
      { mood: 'focused', count: 20 },
      { mood: 'productive', count: 15 }
    ],
    entries: [],
    sources: ['journal', 'task']
  }
];

export const Locations = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);

  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.locations(dummyLocations);
  }, []);

  const loadLocations = async () => {
    setLoading(true);
    
    try {
      const response = await fetchJson<{ locations: LocationProfile[] }>('/api/locations');
      const locationList = response?.locations || [];
      
      // Use mock data service to determine what to show
      const result = mockDataService.getWithFallback.locations(
        locationList.length > 0 ? locationList : null,
        isMockDataEnabled
      );
      
      setLocations(result.data);
    } catch {
      // On error, use mock data if enabled
      const result = mockDataService.getWithFallback.locations(null, isMockDataEnabled);
      setLocations(result.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations();
  }, []);

  // Refresh when mock data toggle changes
  useEffect(() => {
    void loadLocations();
  }, [isMockDataEnabled]);

  const filteredLocations = useMemo(() => {
    if (!searchTerm.trim()) return locations;
    const term = searchTerm.toLowerCase();
    return locations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.relatedPeople.some((person) => person.name.toLowerCase().includes(term)) ||
        loc.tagCounts.some((tag) => tag.tag.toLowerCase().includes(term)) ||
        loc.chapters.some((chapter) => chapter.title?.toLowerCase().includes(term))
    );
  }, [locations, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search locations by name, people, tags, or chapters..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Locations</h2>
            <p className="text-sm text-white/60 mt-1">
              {locations.length} locations · {filteredLocations.length} shown
              {loading && ' · Loading...'}
            </p>
          </div>
          <Button 
            leftIcon={<Plus className="h-4 w-4" />} 
            onClick={() => void loadLocations()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/60">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p>Loading locations...</p>
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <MapPin className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No locations found</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredLocations.map((location, index) => {
            try {
              return (
                <LocationProfileCard
                  key={location.id || `loc-${index}`}
                  location={location}
                  onClick={() => setSelectedLocation(location)}
                />
              );
            } catch (error) {
              console.error('Error rendering location card:', error, location);
              return null;
            }
          })}
        </div>
      )}

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
};

