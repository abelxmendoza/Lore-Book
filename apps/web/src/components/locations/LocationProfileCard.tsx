import { Calendar, MapPin, Users, Tag, Sparkles, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';

export type LocationProfile = {
  id: string;
  name: string;
  visitCount: number;
  firstVisited?: string;
  lastVisited?: string;
  coordinates?: { lat: number; lng: number } | null;
  relatedPeople: { id: string; name: string; total_mentions: number; entryCount: number }[];
  tagCounts: { tag: string; count: number }[];
  chapters: { id: string; title?: string; count: number }[];
  moods: { mood: string; count: number }[];
  entries: Array<{
    id: string;
    date: string;
    tags: string[];
    chapter_id?: string | null;
    mood?: string | null;
    summary?: string | null;
    source: string;
  }>;
  sources: string[];
};

type LocationProfileCardProps = {
  location: LocationProfile;
  onClick?: () => void;
};

export const LocationProfileCard = ({ location, onClick }: LocationProfileCardProps) => {
  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden"
      onClick={onClick}
    >
      {/* Header with Map Icon */}
      <div className="relative h-16 bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-teal-500/20 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <MapPin className="h-10 w-10 text-white/40 group-hover:text-primary/60 transition-colors relative z-10" />
        {location.coordinates && (
          <div className="absolute top-2 right-2 z-10">
            <Badge 
              variant="outline"
              className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs"
            >
              📍 GPS
            </Badge>
          </div>
        )}
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
              {location.name}
            </h3>
            {location.coordinates && (
              <p className="text-xs text-white/50 mt-0.5 truncate">
                {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
              </p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0 px-4 pb-3">
        {/* Visit Count */}
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <span>{location.visitCount} {location.visitCount === 1 ? 'visit' : 'visits'}</span>
        </div>

        {/* Date Range */}
        {(location.firstVisited || location.lastVisited) && (
          <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
            {location.firstVisited && (
              <div className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                <span>First: {new Date(location.firstVisited).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            {location.lastVisited && (
              <div className="flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" />
                <span>Last: {new Date(location.lastVisited).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        )}

        {/* Related People */}
        {location.relatedPeople.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
            <div className="flex items-center gap-1 text-[10px] text-white/50 w-full mb-1">
              <Users className="h-2.5 w-2.5" />
              <span>Visited with:</span>
            </div>
            {location.relatedPeople.slice(0, 3).map((person) => (
              <Badge
                key={person.id}
                variant="outline"
                className="px-2 py-0.5 text-xs bg-blue-500/5 text-blue-300 border-blue-500/20"
              >
                {person.name} ({person.entryCount})
              </Badge>
            ))}
            {location.relatedPeople.length > 3 && (
              <Badge variant="outline" className="px-2 py-0.5 text-xs text-white/40 border-border/30">
                +{location.relatedPeople.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Top Tags */}
        {location.tagCounts.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
            {location.tagCounts.slice(0, 3).map((tagCount) => (
              <Badge
                key={tagCount.tag}
                variant="outline"
                className="px-2 py-0.5 text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
              >
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tagCount.tag} ({tagCount.count})
              </Badge>
            ))}
            {location.tagCounts.length > 3 && (
              <Badge variant="outline" className="px-2 py-0.5 text-xs text-white/40 border-border/30">
                +{location.tagCounts.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Stats Row */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/30 text-[10px]">
          {location.chapters.length > 0 && (
            <div className="flex items-center gap-1 text-white/50">
              <Sparkles className="h-2.5 w-2.5" />
              <span>{location.chapters.length} {location.chapters.length === 1 ? 'chapter' : 'chapters'}</span>
            </div>
          )}
          {location.sources.length > 0 && (
            <div className="flex items-center gap-1 text-white/50">
              <Tag className="h-2.5 w-2.5" />
              <span>{location.sources.length} {location.sources.length === 1 ? 'source' : 'sources'}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

