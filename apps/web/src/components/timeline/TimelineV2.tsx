/**
 * Timeline V2 Component
 * Enhanced timeline view with improved UI
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Clock, MapPin, User } from 'lucide-react';

interface TimelineItem {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  location?: string;
  characters?: string[];
  tags?: string[];
}

interface TimelineV2Props {
  items?: TimelineItem[];
}

export function TimelineV2({ items: propItems }: TimelineV2Props) {
  const [items, setItems] = useState<TimelineItem[]>(propItems || []);
  const [loading, setLoading] = useState(!propItems);

  useEffect(() => {
    if (!propItems) {
      // Fetch timeline items from API
      fetch('/api/timeline-v2')
        .then(res => res.json())
        .then(data => {
          setItems(data.items || []);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch timeline items:', error);
          setLoading(false);
        });
    }
  }, [propItems]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="bg-black/40 border-border/60 animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-white/10 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-white/10 rounded w-full"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-white/60">No timeline items found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item) => (
        <Card key={item.id} className="bg-black/40 border-border/60 hover:border-primary/30 transition-colors">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-xl font-bold text-white mb-2">
                  {item.title}
                </CardTitle>
                <div className="flex items-center gap-4 text-sm text-white/60">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                  {item.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{item.location}</span>
                    </div>
                  )}
                  {item.characters && item.characters.length > 0 && (
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>{item.characters.length} {item.characters.length === 1 ? 'character' : 'characters'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-white/80 mb-4">{item.summary}</p>
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 text-xs bg-primary/20 text-primary rounded border border-primary/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

