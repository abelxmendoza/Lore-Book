import { MapPin, Clock, Users, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

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

function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1)  return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function accentClass(location: LocationProfile): string {
  const tags = location.tagCounts.map(t => t.tag.toLowerCase());
  if (tags.some(t => ['work', 'office', 'conference', 'meeting', 'professional'].includes(t)))
    return 'text-blue-400 bg-blue-500/10 border-blue-500/25';
  if (tags.some(t => ['nature', 'hiking', 'park', 'trail', 'beach', 'outdoor', 'mountain'].includes(t)))
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
  if (tags.some(t => ['travel', 'vacation', 'adventure', 'culture'].includes(t)))
    return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  if (tags.some(t => ['coffee', 'social', 'restaurant', 'bar', 'gallery', 'art'].includes(t)))
    return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
  if (tags.some(t => ['home', 'studio', 'creative', 'music', 'writing'].includes(t)))
    return 'text-purple-400 bg-purple-500/10 border-purple-500/25';
  return 'text-teal-400 bg-teal-500/10 border-teal-500/25';
}

type Props = { location: LocationProfile; onClick?: () => void };

export const LocationProfileCard = ({ location, onClick }: Props) => {
  const ago    = relativeTime(location.lastVisited);
  const accent = accentClass(location);
  const trend  = location.analytics?.trend;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-white/8 bg-black/40 hover:border-teal-500/30 hover:bg-teal-500/5 transition-all duration-200 p-4 flex flex-col gap-3"
    >
      {/* Name row */}
      <div className="flex items-start gap-3">
        <div className={`rounded-lg border p-2 shrink-0 mt-0.5 ${accent}`}>
          <MapPin className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white group-hover:text-teal-300 transition-colors leading-snug line-clamp-2">
            {location.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-white/50">
              {location.visitCount} {location.visitCount === 1 ? 'visit' : 'visits'}
            </span>
            {ago && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-xs text-white/35 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {ago}
                </span>
              </>
            )}
            {trend === 'increasing' && <TrendingUp className="h-3 w-3 text-emerald-400" />}
            {trend === 'decreasing' && <TrendingDown className="h-3 w-3 text-red-400" />}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-teal-400 shrink-0 mt-1 transition-colors" />
      </div>

      {/* People */}
      {location.relatedPeople.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3 text-white/25 shrink-0" />
          <span className="text-xs text-white/45 truncate">
            {location.relatedPeople.slice(0, 3).map(p => p.name.split(' ')[0]).join(', ')}
            {location.relatedPeople.length > 3 && (
              <span className="text-white/30"> +{location.relatedPeople.length - 3}</span>
            )}
          </span>
        </div>
      )}

      {/* Tags */}
      {location.tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {location.tagCounts.slice(0, 3).map(t => (
            <span
              key={t.tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40"
            >
              {t.tag}
            </span>
          ))}
          {location.tagCounts.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/25">
              +{location.tagCounts.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
};
