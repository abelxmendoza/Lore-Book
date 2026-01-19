import { useState, useEffect } from 'react';
import { Layers, Star, Users, MapPin, Calendar, Tag, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { fetchJson } from '../../lib/api';

type MemoryComponent = {
  id: string;
  component_type: 'event' | 'thought' | 'reflection' | 'decision' | 'relationship_update' | 'worldbuilding' | 'lore_drop' | 'timeline_marker';
  text: string;
  characters_involved: string[];
  location?: string | null;
  timestamp?: string | null;
  tags: string[];
  importance_score: number;
  metadata?: Record<string, unknown>;
};

type MemoryComponentsProps = {
  entryId: string;
};

const componentTypeColors: Record<string, string> = {
  event: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  thought: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  reflection: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  decision: 'bg-green-500/20 text-green-300 border-green-500/30',
  relationship_update: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  worldbuilding: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  lore_drop: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  timeline_marker: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

const componentTypeIcons: Record<string, typeof Layers> = {
  event: Calendar,
  thought: Layers,
  reflection: Layers,
  decision: Star,
  relationship_update: Users,
  worldbuilding: MapPin,
  lore_drop: Tag,
  timeline_marker: Calendar,
};

export const MemoryComponents = ({ entryId }: MemoryComponentsProps) => {
  const [components, setComponents] = useState<MemoryComponent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComponents();
  }, [entryId]);

  const loadComponents = async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ components: MemoryComponent[] }>(
        `/api/memory-engine/entry/${entryId}/components`
      );
      setComponents(response.components || []);
    } catch (error) {
      console.error('Failed to load memory components:', error);
      setComponents([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (components.length === 0) {
    return (
      <div className="text-center py-4 text-white/60 text-sm">
        No memory components extracted yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {components.map((component) => {
        const Icon = componentTypeIcons[component.component_type] || Layers;
        const colorClass = componentTypeColors[component.component_type] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';

        return (
          <Card key={component.id} className="bg-black/40 border-border/60">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="outline" className={colorClass}>
                      {component.component_type.replace('_', ' ')}
                    </Badge>
                    {component.importance_score > 0 && (
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                        <Star className="h-3 w-3 mr-1" />
                        {component.importance_score}/10
                      </Badge>
                    )}
                  </div>
                  <p className="text-white text-sm mb-2">{component.text}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {component.characters_involved.length > 0 && (
                      <div className="flex items-center gap-1 text-white/70">
                        <Users className="h-3 w-3" />
                        <span>{component.characters_involved.join(', ')}</span>
                      </div>
                    )}
                    {component.location && (
                      <div className="flex items-center gap-1 text-white/70">
                        <MapPin className="h-3 w-3" />
                        <span>{component.location}</span>
                      </div>
                    )}
                    {component.tags.length > 0 && (
                      <div className="flex items-center gap-1 text-white/70">
                        <Tag className="h-3 w-3" />
                        <span>{component.tags.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

