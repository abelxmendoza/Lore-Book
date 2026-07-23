import { MapPin, Clock, Users, ChevronRight, TrendingUp, TrendingDown, Star } from 'lucide-react';
import { shortDisplayName } from '../../lib/displayName';
import { classifyLocation, KIND_META, locationHierarchy, countNestedPlaces, isHouseholdLocation } from '../../lib/locationTaxonomy';
import { formatPlaceType, getPlaceTags, resolvePlaceType } from '../../lib/placeTypes';

export type LocationProfile = {
  id: string;
  name: string;
  type?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  ownerOperator?: string | null;
  operatingHours?: Record<string, unknown>;
  purpose?: string[];
  physicalAttributes?: Record<string, unknown>;
  reputation?: Record<string, unknown>;
  userRelationship?: Record<string, unknown>;
  timeline?: unknown[];
  currentState?: Record<string, unknown>;
  socialGraph?: Record<string, unknown>;
  root_type?: string | null;
  spatial_category?: string | null;
  spatial_subcategory?: string | null;
  parent_location_id?: string | null;
  visitCount: number;
  mentionCount?: number;
  attendanceCount?: number;
  sourceCount?: number;
  firstVisited?: string;
  lastVisited?: string;
  firstMentioned?: string;
  lastMentioned?: string;
  coordinates?: { lat: number; lng: number } | null;
  relatedPeople: {
    id: string;
    character_id?: string;
    name: string;
    total_mentions: number;
    entryCount: number;
    relationship_type?: string;
    link_kind?: 'verified' | 'participated' | 'co_mentioned';
  }[];
  tagCounts: { tag: string; count: number }[];
  intrinsicTags?: { tag: string; count: number }[];
  visitContextTags?: { tag: string; count: number }[];
  storyTags?: { tag: string; count: number }[];
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
  metadata?: Record<string, unknown> | null;
  description?: string | null;
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

type VisualAccent = { grad: string; chip: string; icon: string };

function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function visualAccent(location: LocationProfile): VisualAccent {
  const tags = location.tagCounts.map((t) => t.tag.toLowerCase());
  if (tags.some((t) => ['work', 'office', 'conference', 'meeting', 'professional', 'career'].includes(t))) {
    return {
      grad: 'from-blue-600/30 via-slate-900/40 to-blue-950/30',
      chip: 'text-blue-300 bg-blue-500/10 border-blue-500/25',
      icon: 'text-blue-300/80',
    };
  }
  if (tags.some((t) => ['nature', 'hiking', 'park', 'trail', 'beach', 'outdoor', 'mountain', 'walking'].includes(t))) {
    return {
      grad: 'from-emerald-600/30 via-teal-950/40 to-emerald-950/30',
      chip: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
      icon: 'text-emerald-300/80',
    };
  }
  if (tags.some((t) => ['travel', 'vacation', 'adventure', 'culture'].includes(t))) {
    return {
      grad: 'from-amber-600/30 via-orange-950/40 to-amber-950/30',
      chip: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
      icon: 'text-amber-300/80',
    };
  }
  if (tags.some((t) => ['coffee', 'social', 'restaurant', 'bar', 'nightlife', 'dancing', 'music'].includes(t))) {
    return {
      grad: 'from-rose-600/30 via-fuchsia-950/40 to-rose-950/30',
      chip: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
      icon: 'text-rose-300/80',
    };
  }
  if (tags.some((t) => ['home', 'studio', 'creative', 'writing', 'music-production'].includes(t))) {
    return {
      grad: 'from-purple-600/30 via-violet-950/40 to-purple-950/30',
      chip: 'text-purple-300 bg-purple-500/10 border-purple-500/25',
      icon: 'text-purple-300/80',
    };
  }
  return {
    grad: 'from-teal-600/30 via-cyan-950/40 to-teal-950/30',
    chip: 'text-teal-300 bg-teal-500/10 border-teal-500/25',
    icon: 'text-teal-300/80',
  };
}

function placeLocationLine(location: LocationProfile): string | null {
  const parts = [location.city, location.region, location.country].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  if (location.address) return location.address;
  const hierarchy = locationHierarchy(location);
  if (hierarchy.length > 0) return hierarchy.map((h) => h.name).join(' › ');
  return null;
}

function placeBlurb(location: LocationProfile): string | null {
  if (location.description?.trim()) return location.description.trim();
  const purposes = location.analytics?.primary_purpose;
  if (purposes?.length) return purposes.join(' · ');
  const intrinsic = location.intrinsicTags?.[0]?.tag;
  if (intrinsic) return intrinsic.replace(/-/g, ' ');
  const visitTag = location.visitContextTags?.[0]?.tag ?? location.tagCounts[0]?.tag;
  if (visitTag) return visitTag.replace(/-/g, ' ');
  // Moods are visit-context, not place identity — keep them out of the card blurb.
  return null;
}

type Props = {
  location: LocationProfile;
  onClick?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  allLocations?: LocationProfile[];
};

export const LocationProfileCard = ({ location, onClick, selectionMode, selected, allLocations = [] }: Props) => {
  const ago = relativeTime(location.lastVisited ?? location.lastMentioned);
  const accent = visualAccent(location);
  const trend = location.analytics?.trend;
  const importance = location.analytics?.importance_score;
  const verifiedPeople = location.relatedPeople.filter(
    (person) => person.character_id && person.link_kind !== 'co_mentioned',
  );
  const kindMeta = KIND_META[classifyLocation(location)];
  const placeType = resolvePlaceType(location.type, location.name);
  const placeTags = getPlaceTags(location);
  const nestedCount = allLocations.length > 0 ? countNestedPlaces(location, allLocations) : 0;
  const locationLine = placeLocationLine(location);
  const blurb = placeBlurb(location);
  const intrinsic = (location.intrinsicTags ?? []).map((t) => t.tag);
  const visitContext = (location.visitContextTags ?? location.tagCounts).map((t) => t.tag);
  const displayTags = [
    ...placeTags.slice(0, 2),
    ...intrinsic.filter((tag) => !placeTags.includes(tag)),
    ...visitContext.filter((tag) => !placeTags.includes(tag) && !intrinsic.includes(tag)),
  ].slice(0, 3);
  const mentionCount = location.mentionCount ?? 0;
  const visitLabel =
    location.visitCount > 0
      ? `${location.visitCount} ${location.visitCount === 1 ? 'visit' : 'visits'}`
      : mentionCount > 0
        ? `${mentionCount} ${mentionCount === 1 ? 'mention' : 'mentions'}`
        : '0 visits';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left rounded-xl border bg-gradient-to-br from-black/70 via-black/50 to-black/70 transition-all duration-200 overflow-hidden flex flex-col min-h-[10.5rem] sm:min-h-[12.5rem] touch-manipulation active:scale-[0.98] ${
        selected
          ? 'border-teal-500/50 bg-teal-500/10 ring-1 ring-teal-500/40'
          : 'border-white/10 hover:border-teal-500/35 hover:shadow-lg hover:shadow-teal-500/10'
      }`}
    >
      {selectionMode && (
        <span
          className={`absolute top-2 right-2 z-20 w-5 h-5 rounded border text-[10px] flex items-center justify-center ${
            selected ? 'bg-teal-500 border-teal-400 text-black' : 'border-white/25 text-transparent'
          }`}
        >
          ✓
        </span>
      )}

      {/* Header band */}
      <div className={`relative h-10 sm:h-11 shrink-0 bg-gradient-to-br ${accent.grad} flex items-center justify-between px-2.5 sm:px-3`}>
        <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors" />
        <MapPin className={`h-4 w-4 relative z-10 ${accent.icon}`} aria-hidden />
        <div className="relative z-10 flex items-center gap-1">
          {importance != null && importance >= 70 && (
            <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
              <Star className="h-2.5 w-2.5" aria-hidden />
              {importance}
            </span>
          )}
          {trend === 'increasing' && <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-label="Visits increasing" />}
          {trend === 'decreasing' && <TrendingDown className="h-3.5 w-3.5 text-red-400" aria-label="Visits decreasing" />}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3 min-h-0">
        <div className="flex items-start gap-1.5 min-w-0">
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] sm:text-sm font-semibold text-white group-hover:text-teal-200 transition-colors leading-snug line-clamp-2">
              {location.name}
            </h3>
            {locationLine && (
              <p className="text-[10px] text-white/40 truncate mt-0.5">{locationLine}</p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-teal-400 shrink-0 mt-0.5 transition-colors hidden sm:block" />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {placeType && (
            <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded border truncate max-w-full ${accent.chip}`}>
              {formatPlaceType(placeType)}
            </span>
          )}
          <span className={`text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded border ${kindMeta.color}`}>
            <span aria-hidden>{kindMeta.icon}</span> {kindMeta.label}
          </span>
          {nestedCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-300 border-purple-500/30">
              {nestedCount} {isHouseholdLocation(location) ? (nestedCount === 1 ? 'room' : 'rooms') : 'nested'}
            </span>
          )}
        </div>

        {blurb && (
          <p className="text-[10px] sm:text-[11px] text-white/50 leading-snug line-clamp-2">{blurb}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 text-[10px] text-white/40 pt-1">
          <span className="font-medium text-white/55 tabular-nums" title={
            mentionCount > location.visitCount
              ? `${mentionCount} mentions · ${location.visitCount} visits with presence language`
              : undefined
          }>
            {visitLabel}
            {location.visitCount > 0 && mentionCount > location.visitCount ? (
              <span className="text-white/35"> · {mentionCount} mentions</span>
            ) : null}
          </span>
          {ago && (
            <span className="inline-flex items-center gap-1 truncate">
              <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
              {ago}
            </span>
          )}
        </div>

        {verifiedPeople.length > 0 && (
          <div className="flex items-center gap-1 min-w-0 pt-0.5 border-t border-white/5">
            <Users className="h-3 w-3 text-white/25 shrink-0" aria-hidden />
            <span className="text-[10px] text-white/45 truncate">
              {verifiedPeople.slice(0, 2).map((p) => shortDisplayName(p.name)).join(', ')}
              {verifiedPeople.length > 2 && (
                <span className="text-white/30"> +{verifiedPeople.length - 2}</span>
              )}
            </span>
          </div>
        )}

        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 truncate max-w-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};
