import { Calendar, MapPin, Users, Tag, Sparkles, ChevronRight, TrendingUp, TrendingDown, Minus, Star, Award } from 'lucide-react';
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
  // Analytics
  analytics?: {
    visit_frequency: number;
    recency_score: number;
    total_visits: number;
    importance_score: number;
    priority_score: number;
    relevance_score: number;
    value_score: number;
    sentiment_score: number;
    comfort_score: number;
    productivity_score: number;
    social_score: number;
    activity_diversity: number;
    engagement_score: number;
    associated_people_count: number;
    first_visited_days_ago: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    primary_purpose?: string[];
    associated_activities?: string[];
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    considerations?: string[];
  };
};

type LocationProfileCardProps = {
  location: LocationProfile;
  onClick?: () => void;
};

export const LocationProfileCard = ({ location, onClick }: LocationProfileCardProps) => {
  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden flex flex-col aspect-square sm:aspect-auto min-h-0 sm:min-h-0"
      onClick={onClick}
    >
      {/* Header with Map Icon - compact on mobile */}
      <div className="relative h-10 sm:h-16 bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-teal-500/20 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <MapPin className="h-6 w-6 sm:h-10 sm:w-10 text-white/40 group-hover:text-primary/60 transition-colors relative z-10" />
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 flex items-center gap-1 hidden sm:flex">
          {location.analytics && (
            <>
              <Badge 
                variant="outline"
                className={`${location.analytics.importance_score >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : location.analytics.importance_score >= 40 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
                title={`Importance: ${location.analytics.importance_score}/100`}
              >
                {location.analytics.importance_score >= 70 ? <Star className="h-2.5 w-2.5" /> : location.analytics.importance_score >= 40 ? <Award className="h-2.5 w-2.5" /> : null}
                {location.analytics.importance_score}
              </Badge>
              {location.analytics.trend === 'increasing' && (
                <TrendingUp className="h-3 w-3 text-green-400" title="Increasing visits" />
              )}
              {location.analytics.trend === 'decreasing' && (
                <TrendingDown className="h-3 w-3 text-red-400" title="Decreasing visits" />
              )}
              {location.analytics.trend === 'stable' && (
                <Minus className="h-3 w-3 text-gray-400" title="Stable visits" />
              )}
            </>
          )}
          {location.coordinates && (
            <Badge 
              variant="outline"
              className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs"
            >
              📍 GPS
            </Badge>
          )}
        </div>
      </div>

      <CardHeader className="pb-0 sm:pb-1.5 pt-1.5 sm:pt-2.5 px-2 sm:px-4 flex-1 min-h-0 flex flex-col justify-center">
        <div className="flex items-start justify-between gap-1 sm:gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-xs sm:text-base font-semibold text-white line-clamp-2 sm:truncate group-hover:text-primary transition-colors break-words" title={location.name}>
              {location.name}
            </h3>
            {location.coordinates && (
              <p className="text-xs text-white/50 mt-0.5 truncate hidden sm:block">
                {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
              </p>
            )}
          </div>
          <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 hidden sm:block" />
        </div>
      </CardHeader>
      
      {/* Mobile: only name + visits (name is in header above; visits here) */}
      <CardContent className="space-y-2 pt-0 px-2 sm:px-4 pb-2 sm:pb-3 flex-shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-white/70">
          <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary flex-shrink-0" />
          <span>{location.visitCount} {location.visitCount === 1 ? 'visit' : 'visits'}</span>
          {location.analytics && (
            <>
              <span className="text-white/40 hidden sm:inline">•</span>
              <span className="text-green-400 hidden sm:inline" title={`Visit frequency: ${location.analytics.visit_frequency}%`}>
                {location.analytics.visit_frequency}% frequent
              </span>
            </>
          )}
        </div>

        {/* Date Range - hidden on mobile */}
        {(location.firstVisited || location.lastVisited) && (
          <div className="flex flex-wrap gap-2 text-[10px] text-white/50 hidden sm:flex">
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

        {/* Related People - hidden on mobile */}
        {location.relatedPeople.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30 hidden sm:block">
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

        {/* Top Tags - hidden on mobile */}
        {location.tagCounts.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30 hidden sm:flex">
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

        {/* Stats Row - hidden on mobile */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/30 text-[10px] hidden sm:flex">
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

