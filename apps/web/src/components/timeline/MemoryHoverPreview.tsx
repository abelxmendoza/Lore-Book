import { useEffect, useState } from 'react';
import { Calendar, Tag, Users } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type MemoryHoverPreviewProps = {
  entry: TimelineEntry;
  x: number;
  y: number;
  visible: boolean;
};

const moodColors: Record<string, string> = {
  happy: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sad: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  angry: 'bg-red-500/20 text-red-300 border-red-500/30',
  anxious: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  calm: 'bg-green-500/20 text-green-300 border-green-500/30',
  excited: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  default: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
};

export const MemoryHoverPreview = ({ entry, x, y, visible }: MemoryHoverPreviewProps) => {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Position above the dot, avoiding screen edges
      const cardWidth = 280;
      const cardHeight = 120;
      const padding = 10;
      
      let posX = x - cardWidth / 2;
      let posY = y - cardHeight - 20;

      // Adjust for screen edges
      if (posX < padding) posX = padding;
      if (posX + cardWidth > window.innerWidth - padding) {
        posX = window.innerWidth - cardWidth - padding;
      }
      if (posY < padding) {
        posY = y + 30; // Show below instead
      }

      setPosition({ x: posX, y: posY });
    } else {
      // Delay unmount for fade-out animation
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [visible, x, y]);

  if (!mounted) return null;

  const moodColor = entry.mood 
    ? moodColors[entry.mood.toLowerCase()] || moodColors.default 
    : moodColors.default;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        pointerEvents: 'none'
      }}
    >
      <Card className="bg-black/95 border-primary/50 shadow-xl w-[280px]">
        <CardContent className="p-3">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-white text-sm line-clamp-1">{entry.title}</h4>
              {entry.mood && (
                <span className={`px-2 py-0.5 rounded text-xs ${moodColor}`}>
                  {entry.mood}
                </span>
              )}
            </div>
            
            <p className="text-xs text-white/70 line-clamp-2">{entry.summary}</p>
            
            <div className="flex items-center gap-3 text-xs text-white/50">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(entry.timestamp)}</span>
              </div>
              
              {entry.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  <span>{entry.tags.length}</span>
                </div>
              )}
              
              {entry.character_ids.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{entry.character_ids.length}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

