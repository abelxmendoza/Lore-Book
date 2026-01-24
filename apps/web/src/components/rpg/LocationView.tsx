/**
 * Location View
 * Displays "Places That Matter" with memory collections
 * No discovery badges or levels - just meaningful places
 */

import { useEffect, useState } from 'react';
import { MapPin, Sparkles } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface Place {
  id: string;
  name: string;
  type: string | null;
  insights: Array<{
    text: string;
    type: string;
    suggestion?: string;
  }>;
}

interface LocationsResponse {
  places: Place[];
  summary: string;
}

export const LocationView = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const data = await fetchJson<LocationsResponse>('/api/rpg/locations');
        setPlaces(data.places || []);
        setSummary(data.summary || '');
      } catch (error) {
        console.error('Failed to load locations:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadLocations();
  }, []);

  if (loading) {
    return <div className="text-white/60">Loading your places...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MapPin className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-semibold text-white">Places That Matter</h2>
      </div>

      {summary && (
        <p className="text-white/70 text-lg">{summary}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {places.map((place) => (
          <Card key={place.id} className="border-border/40 bg-black/40">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {place.name}
                {place.type && (
                  <span className="text-xs text-white/40 font-normal">({place.type})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {place.insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-white/80 text-sm">{insight.text}</p>
                      {insight.suggestion && (
                        <p className="text-primary/70 text-xs mt-1 italic">{insight.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {places.length === 0 && (
        <div className="text-center py-12 text-white/40">
          <p>Keep journaling to discover the places in your story</p>
        </div>
      )}
    </div>
  );
};
