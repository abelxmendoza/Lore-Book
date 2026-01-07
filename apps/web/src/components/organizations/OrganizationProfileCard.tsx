import { Building2, Users, MapPin, Calendar, ChevronRight, Hash, BookOpen, CalendarDays, TrendingUp, TrendingDown, Minus, Star, Award } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';

export type OrganizationMember = {
  id: string;
  character_id?: string;
  character_name: string;
  role?: string;
  joined_date?: string;
  status: 'active' | 'former' | 'honorary';
  notes?: string;
};

export type OrganizationStory = {
  id: string;
  memory_id?: string;
  title: string;
  summary: string;
  date: string;
  related_members?: string[];
};

export type OrganizationEvent = {
  id: string;
  event_id?: string;
  title: string;
  date: string;
  type: 'meeting' | 'game' | 'social' | 'work' | 'other';
};

export type OrganizationLocation = {
  id: string;
  location_id?: string;
  location_name: string;
  visit_count: number;
  last_visited?: string;
};

export type Organization = {
  id: string;
  name: string;
  aliases: string[];
  type: 'friend_group' | 'company' | 'sports_team' | 'club' | 'nonprofit' | 'affiliation' | 'other';
  description?: string;
  location?: string;
  founded_date?: string;
  status: 'active' | 'inactive' | 'dissolved';
  
  // Rich metadata
  members?: OrganizationMember[];
  stories?: OrganizationStory[];
  events?: OrganizationEvent[];
  locations?: OrganizationLocation[];
  
  // Stats
  member_count: number;
  usage_count: number;
  confidence: number;
  last_seen: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
  
  // Analytics
  analytics?: {
    user_involvement_score: number;
    user_ranking: number;
    user_role_importance: number;
    relevance_score: number;
    priority_score: number;
    importance_score: number;
    value_score: number;
    group_influence_on_user: number;
    user_influence_over_group: number;
    cohesion_score: number;
    activity_level: number;
    engagement_score: number;
    recency_score: number;
    frequency_score: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
  };
};

type OrganizationProfileCardProps = {
  organization: Organization;
  onClick?: () => void;
};

export const OrganizationProfileCard = ({ organization, onClick }: OrganizationProfileCardProps) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (confidence >= 0.4) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.4) return 'Medium';
    return 'Low';
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden"
      onClick={onClick}
    >
      {/* Header with Building Icon */}
      <div className="relative h-16 bg-gradient-to-br from-purple-500/20 via-purple-600/20 to-purple-500/20 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <div className="relative z-10">
          <Building2 className="h-8 w-8 text-purple-400" />
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {organization.analytics && (
            <>
              {/* Importance Badge */}
              <Badge 
                variant="outline"
                className={`${organization.analytics.importance_score >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : organization.analytics.importance_score >= 40 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
                title={`Importance: ${organization.analytics.importance_score}/100`}
              >
                {organization.analytics.importance_score >= 70 ? <Star className="h-2.5 w-2.5" /> : organization.analytics.importance_score >= 40 ? <Award className="h-2.5 w-2.5" /> : null}
                {organization.analytics.importance_score}
              </Badge>
              {/* Trend Indicator */}
              {organization.analytics.trend === 'increasing' && (
                <TrendingUp className="h-3 w-3 text-green-400" title="Increasing activity" />
              )}
              {organization.analytics.trend === 'decreasing' && (
                <TrendingDown className="h-3 w-3 text-red-400" title="Decreasing activity" />
              )}
              {organization.analytics.trend === 'stable' && (
                <Minus className="h-3 w-3 text-gray-400" title="Stable activity" />
              )}
            </>
          )}
          <Badge 
            variant="outline"
            className={`${getConfidenceColor(organization.confidence)} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
            title={`${getConfidenceLabel(organization.confidence)} confidence (${Math.round(organization.confidence * 100)}%)`}
          >
            {getConfidenceLabel(organization.confidence)}
          </Badge>
        </div>
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors line-clamp-2">
              {organization.name}
            </h3>
            {organization.type && (
              <p className="text-xs text-white/50 mt-0.5 truncate capitalize">
                {organization.type}
              </p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0 px-4 pb-3">
        {organization.description && (
          <p className="text-xs text-white/70 line-clamp-2 leading-snug">{organization.description}</p>
        )}
        
        {/* Metadata Row */}
        <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
          {organization.analytics && (
            <>
              <div className="flex items-center gap-1" title={`Your ranking: #${organization.analytics.user_ranking}`}>
                <Award className="h-2.5 w-2.5 text-amber-400" />
                <span className="text-amber-400">Rank #{organization.analytics.user_ranking}</span>
              </div>
              <div className="flex items-center gap-1" title={`Involvement: ${organization.analytics.user_involvement_score}%`}>
                <Users className="h-2.5 w-2.5" />
                <span>{organization.analytics.user_involvement_score}% involved</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            <span>Last seen: {formatDate(organization.last_seen)}</span>
          </div>
          {organization.member_count !== undefined && organization.member_count > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              <span>{organization.member_count} {organization.member_count === 1 ? 'member' : 'members'}</span>
            </div>
          )}
          {organization.stories && organization.stories.length > 0 && (
            <div className="flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5" />
              <span>{organization.stories.length} {organization.stories.length === 1 ? 'story' : 'stories'}</span>
            </div>
          )}
          {organization.events && organization.events.length > 0 && (
            <div className="flex items-center gap-1">
              <CalendarDays className="h-2.5 w-2.5" />
              <span>{organization.events.length} {organization.events.length === 1 ? 'event' : 'events'}</span>
            </div>
          )}
          {organization.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              <span className="truncate max-w-[100px]">{organization.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Hash className="h-2.5 w-2.5" />
            <span>{organization.usage_count} {organization.usage_count === 1 ? 'mention' : 'mentions'}</span>
          </div>
        </div>

        {/* Aliases/Tags */}
        {organization.aliases && organization.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
            {organization.aliases.slice(0, 3).map((alias) => (
              <Badge
                key={alias}
                variant="outline"
                className="px-2 py-0.5 text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
              >
                {alias}
              </Badge>
            ))}
            {organization.aliases.length > 3 && (
              <Badge variant="outline" className="px-2 py-0.5 text-xs text-white/40 border-border/30">
                +{organization.aliases.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

