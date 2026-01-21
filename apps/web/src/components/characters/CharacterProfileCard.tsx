import { Calendar, MapPin, Users, Tag, Sparkles, Instagram, Twitter, Linkedin, Github, Globe, Mail, Phone, ChevronRight, Star, Award, User, Hash, UserX, Link2, Eye, EyeOff, Briefcase, DollarSign, Activity, Smile, Home, Heart as HeartIcon, Heart, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CharacterAvatar } from './CharacterAvatar';
import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';

export type SocialMedia = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
  phone?: string;
};

export type Character = {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  alias?: string[];
  pronouns?: string;
  archetype?: string;
  role?: string;
  status?: string;
  first_appearance?: string;
  summary?: string;
  tags?: string[];
  avatar_url?: string | null;
  social_media?: SocialMedia;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  memory_count?: number;
  relationship_count?: number;
  importance_level?: 'protagonist' | 'major' | 'supporting' | 'minor' | 'background' | null;
  importance_score?: number | null;
  is_nickname?: boolean | null;
  proximity_level?: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party' | null;
  has_met?: boolean | null;
  relationship_depth?: 'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only' | null;
  associated_with_character_ids?: string[] | null;
  mentioned_by_character_ids?: string[] | null;
  context_of_mention?: string | null;
  likelihood_to_meet?: 'likely' | 'possible' | 'unlikely' | 'never' | null;
  // Analytics
  analytics?: {
    closeness_score: number;
    relationship_depth: number;
    interaction_frequency: number;
    recency_score: number;
    character_influence_on_user: number;
    user_influence_over_character: number;
    importance_score: number;
    priority_score: number;
    relevance_score: number;
    value_score: number;
    sentiment_score: number;
    trust_score: number;
    support_score: number;
    conflict_score: number;
    engagement_score: number;
    activity_level: number;
    shared_experiences: number;
    relationship_duration_days: number;
    trend: 'deepening' | 'stable' | 'weakening';
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    risks?: string[];
  };
};

type CharacterAttribute = {
  id: string;
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  evidence?: string;
};

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
};

type CharacterProfileCardProps = {
  character: Character;
  onClick?: () => void;
  relationship?: RomanticRelationship;
};

export const CharacterProfileCard = ({ character, onClick, relationship }: CharacterProfileCardProps) => {
  const [attributes, setAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  // Load attributes for this character
  useEffect(() => {
    const loadAttributes = async () => {
      if (!character.id) return;
      setLoadingAttributes(true);
      try {
        const response = await fetchJson<{ attributes: CharacterAttribute[] }>(
          `/api/characters/${character.id}/attributes?currentOnly=true`
        );
        setAttributes(response.attributes || []);
      } catch (error) {
        console.error('Failed to load character attributes:', error);
        setAttributes([]);
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [character.id]);
  const getArchetypeColor = (archetype?: string) => {
    const colors: Record<string, string> = {
      'ally': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'mentor': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'family': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'friend': 'bg-green-500/20 text-green-400 border-green-500/30',
      'colleague': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'protagonist': 'bg-primary/20 text-primary border-primary/30',
      'collaborator': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
    return colors[archetype?.toLowerCase() || ''] || 'bg-primary/20 text-primary border-primary/30';
  };

  const getImportanceColor = (level?: string | null) => {
    const colors: Record<string, string> = {
      'protagonist': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      'major': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
      'supporting': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      'minor': 'bg-gray-500/20 text-gray-400 border-gray-500/40',
      'background': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return colors[level || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';
  };

  const getImportanceIcon = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return <Star className="h-3 w-3" />;
      case 'major':
        return <Award className="h-3 w-3" />;
      case 'supporting':
        return <User className="h-3 w-3" />;
      case 'minor':
        return <Hash className="h-3 w-3" />;
      default:
        return <Hash className="h-3 w-3" />;
    }
  };

  const getImportanceLabel = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return 'Protagonist';
      case 'major':
        return 'Major';
      case 'supporting':
        return 'Supporting';
      case 'minor':
        return 'Minor';
      case 'background':
        return 'Background';
      default:
        return 'Unknown';
    }
  };

  const isUnmet = character.status === 'unmet';
  const hasMet = character.has_met ?? true;
  const proximity = character.proximity_level || 'direct';
  const relationshipDepth = character.relationship_depth || 'moderate';
  
  // Display name: use first + last if available, otherwise use name
  const displayName = character.first_name && character.last_name
    ? `${character.first_name} ${character.last_name}`
    : character.name;

  const getProximityColor = (level?: string | null) => {
    const colors: Record<string, string> = {
      'direct': 'bg-green-500/20 text-green-400 border-green-500/40',
      'indirect': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      'distant': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      'unmet': 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      'third_party': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    };
    return colors[level || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';
  };

  const getProximityLabel = (level?: string | null) => {
    switch (level) {
      case 'direct':
        return 'Direct';
      case 'indirect':
        return 'Indirect';
      case 'distant':
        return 'Distant';
      case 'unmet':
        return 'Unmet';
      case 'third_party':
        return 'Third Party';
      default:
        return 'Unknown';
    }
  };
  
  return (
    <Card 
      className={`group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden h-full ${
        isUnmet ? 'opacity-75 border-dashed border-2' : ''
      }`}
      onClick={onClick}
    >
      {/* Full card layout - same for mobile and desktop */}
      <div>
        {/* Header with Avatar */}
        <div className={`relative h-10 sm:h-14 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center ${
          isUnmet ? 'opacity-60' : ''
        }`}>
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
          <div className="relative z-10">
            <CharacterAvatar url={character.avatar_url} name={character.name} size={28} className="sm:w-9 sm:h-9" />
          </div>
          <div className="absolute top-0.5 right-0.5 sm:top-1.5 sm:right-1.5 z-10 flex flex-col gap-0.5 items-end">
          {character.importance_level && (
            <Badge 
              variant="outline"
              className={`${getImportanceColor(character.importance_level)} text-[7px] sm:text-[10px] px-0.5 py-0 sm:px-1 sm:py-0.5 flex items-center gap-0 sm:gap-1`}
              title={`${getImportanceLabel(character.importance_level)}${character.importance_score !== null && character.importance_score !== undefined ? ` (${Math.round(character.importance_score)})` : ''}`}
            >
              {getImportanceIcon(character.importance_level)}
              <span className="hidden sm:inline">{getImportanceLabel(character.importance_level)}</span>
            </Badge>
          )}
          {/* Only show high importance analytics badge on mobile - too cluttered otherwise */}
          {character.analytics && character.analytics.importance_score >= 70 && (
            <Badge 
              variant="outline"
              className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[7px] sm:text-[10px] px-0.5 py-0 sm:px-1 sm:py-0.5 flex items-center gap-0 sm:gap-1"
              title={`High Importance: ${character.analytics.importance_score}/100`}
            >
              <Star className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="hidden sm:inline">{character.analytics.importance_score}</span>
            </Badge>
          )}
          {/* Hide other badges on mobile - too cluttered */}
          <div className="hidden sm:flex flex-col gap-0.5 items-end">
            {!hasMet && (
              <Badge 
                variant="outline"
                className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1 py-0.5 flex items-center gap-0"
                title="Never met in person"
              >
                <UserX className="h-2.5 w-2.5" />
                <span>Unmet</span>
              </Badge>
            )}
            {proximity !== 'direct' && (
              <Badge 
                variant="outline"
                className={`${getProximityColor(proximity)} text-[10px] px-1 py-0.5 flex items-center gap-0`}
                title={`Connection: ${getProximityLabel(proximity)}`}
              >
                {proximity === 'indirect' && <Link2 className="h-2.5 w-2.5" />}
                {proximity === 'third_party' && <Eye className="h-2.5 w-2.5" />}
                <span>{getProximityLabel(proximity)}</span>
              </Badge>
            )}
            {character.status && character.status !== 'active' && (
              <Badge 
                variant="outline"
                className={`${
                  character.status === 'inactive'
                    ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                    : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                } text-[10px] px-1 py-0.5`}
              >
                {character.status}
              </Badge>
            )}
            {character.analytics && character.analytics.importance_score < 70 && (
              <Badge 
                variant="outline"
                className={`${character.analytics.importance_score >= 40 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} text-[10px] px-1 py-0.5 flex items-center gap-1`}
                title={`Importance: ${character.analytics.importance_score}/100`}
              >
                {character.analytics.importance_score >= 40 ? <Award className="h-2.5 w-2.5" /> : null}
                {character.analytics.importance_score}
              </Badge>
            )}
            {/* Trend Indicator */}
            {character.analytics?.trend === 'deepening' && (
              <TrendingUp className="h-3 w-3 text-green-400" title="Relationship deepening" />
            )}
            {character.analytics?.trend === 'weakening' && (
              <TrendingDown className="h-3 w-3 text-red-400" title="Relationship weakening" />
            )}
            {character.analytics?.trend === 'stable' && (
              <Minus className="h-3 w-3 text-gray-400" title="Stable relationship" />
            )}
          </div>
        </div>
      </div>

      <CardHeader className="pb-1 pt-1.5 sm:pt-2 px-2 sm:px-4">
        <div className="flex items-start justify-between gap-1 sm:gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <h3 className="text-[10px] sm:text-sm md:text-base font-semibold text-white break-words group-hover:text-primary transition-colors leading-tight">
                {displayName}
              </h3>
              {character.is_nickname && (
                <Badge 
                  variant="outline" 
                  className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0"
                  title="Generated nickname"
                >
                  <span className="hidden sm:inline">Nickname</span>
                  <span className="sm:hidden">N</span>
                </Badge>
              )}
            </div>
            {/* Show role prominently on mobile */}
            {character.role && (
              <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 break-words">
                {character.role}
              </p>
            )}
            {character.first_name && character.last_name && character.name !== displayName && (
              <p className="text-[9px] sm:text-xs text-white/40 mt-0.5 truncate hidden sm:block">
                Also known as: {character.name}
              </p>
            )}
            {character.alias && character.alias.length > 0 && (
              <p className="text-[9px] sm:text-xs text-white/50 mt-0.5 truncate hidden sm:block">
                {character.alias.join(', ')}
              </p>
            )}
          </div>
          <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 mt-0.5" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-1 sm:space-y-2 pt-0 px-2 sm:px-4 pb-1.5 sm:pb-3">
        {character.summary && (
          <p className="text-[9px] sm:text-xs text-white/70 line-clamp-1 sm:line-clamp-2 leading-tight sm:leading-snug hidden sm:block">{character.summary}</p>
        )}
        
        {/* Importance and Archetype Badges - Hide on mobile, show on desktop */}
        <div className="hidden sm:flex flex-wrap gap-0.5 sm:gap-1.5">
          {character.importance_level && (
            <Badge 
              variant="outline" 
              className={`${getImportanceColor(character.importance_level)} text-xs w-fit flex items-center gap-1`}
            >
              {getImportanceIcon(character.importance_level)}
              {getImportanceLabel(character.importance_level)}
              {character.importance_score !== null && character.importance_score !== undefined && (
                <span className="text-[10px] opacity-70">({Math.round(character.importance_score)})</span>
              )}
            </Badge>
          )}
          {character.archetype && (
            <Badge 
              variant="outline" 
              className={`${getArchetypeColor(character.archetype)} text-xs w-fit`}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {character.archetype}
            </Badge>
          )}
        </div>
        
        {/* Relationship Badge */}
        {relationship && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
            <Badge 
              variant="outline" 
              className={`text-[10px] sm:text-xs ${
                relationship.status === 'active' 
                  ? 'bg-green-500/20 text-green-300 border-green-500/30' 
                  : relationship.status === 'ended'
                  ? 'bg-gray-500/20 text-gray-300 border-gray-500/30'
                  : relationship.status === 'on_break'
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                  : 'bg-white/10 text-white/70 border-white/20'
              }`}
            >
              <Heart 
                className="w-3 h-3 mr-1" 
                style={{
                  fill: relationship.is_current && relationship.status === 'active' 
                    ? `rgba(244, 114, 182, ${relationship.affection_score})` 
                    : 'transparent',
                  stroke: 'currentColor',
                  strokeWidth: 2
                }}
              />
              {relationship.relationship_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Badge>
            {relationship.is_situationship && (
              <Badge variant="outline" className="text-[10px] sm:text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                Situationship
              </Badge>
            )}
            {relationship.is_current && relationship.status === 'active' && (
              <div className="flex items-center gap-1 text-[9px] sm:text-[10px]">
                <span className="text-white/60">Compatibility:</span>
                <span className={`font-semibold ${
                  relationship.compatibility_score >= 0.7 ? 'text-green-400' :
                  relationship.compatibility_score >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {Math.round(relationship.compatibility_score * 100)}%
                </span>
                {relationship.compatibility_score >= 0.7 ? (
                  <TrendingUp className="w-2.5 h-2.5 text-green-400" />
                ) : relationship.compatibility_score < 0.4 ? (
                  <TrendingDown className="w-2.5 h-2.5 text-red-400" />
                ) : null}
              </div>
            )}
          </div>
        )}
        
        {/* Metadata Row */}
        <div className="flex flex-wrap gap-1 sm:gap-2 text-[8px] sm:text-[10px] text-white/50 hidden sm:flex">
          {character.pronouns && (
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Users className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span>{character.pronouns}</span>
            </div>
          )}
          {character.role && (
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Tag className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="truncate max-w-[60px] sm:max-w-[80px]">{character.role}</span>
            </div>
          )}
          {!hasMet && (
            <div className="flex items-center gap-0.5 sm:gap-1 text-orange-400/70" title="Never met in person">
              <UserX className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="hidden sm:inline">Unmet</span>
            </div>
          )}
          {proximity === 'third_party' && (
            <div className="flex items-center gap-0.5 sm:gap-1 text-purple-400/70" title="Mentioned by others, don't know personally">
              <Eye className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="hidden sm:inline">Third Party</span>
            </div>
          )}
          {relationshipDepth === 'mentioned_only' && (
            <div className="flex items-center gap-0.5 sm:gap-1 text-yellow-400/70" title="Only mentioned, no real relationship">
              <EyeOff className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span className="hidden sm:inline">Mentioned Only</span>
            </div>
          )}
          {character.first_appearance && (
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Calendar className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
              <span>{new Date(character.first_appearance).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {character.tags && character.tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5 sm:gap-1 pt-1 sm:pt-1.5 border-t border-border/30">
            {character.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="px-1 sm:px-2 py-0 sm:py-0.5 text-[8px] sm:text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {character.tags.length > 3 && (
              <Badge variant="outline" className="px-1 sm:px-2 py-0 sm:py-0.5 text-[8px] sm:text-xs text-white/40 border-border/30" title={`${character.tags.length - 3} more tags`}>
                +{character.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {character.social_media && Object.keys(character.social_media).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/30 hidden sm:flex">
            {character.social_media.instagram && (
              <a
                href={`https://instagram.com/${character.social_media.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-pink-400 transition-colors p-1 rounded hover:bg-pink-500/10"
                onClick={(e) => e.stopPropagation()}
                title="Instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {character.social_media.twitter && (
              <a
                href={`https://twitter.com/${character.social_media.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-blue-400 transition-colors p-1 rounded hover:bg-blue-500/10"
                onClick={(e) => e.stopPropagation()}
                title="Twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
            )}
            {character.social_media.linkedin && (
              <a
                href={character.social_media.linkedin.startsWith('http') ? character.social_media.linkedin : `https://linkedin.com/in/${character.social_media.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-blue-500 transition-colors p-1 rounded hover:bg-blue-500/10"
                onClick={(e) => e.stopPropagation()}
                title="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
            {character.social_media.github && (
              <a
                href={`https://github.com/${character.social_media.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
                onClick={(e) => e.stopPropagation()}
                title="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            )}
            {character.social_media.website && (
              <a
                href={character.social_media.website.startsWith('http') ? character.social_media.website : `https://${character.social_media.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10"
                onClick={(e) => e.stopPropagation()}
                title="Website"
              >
                <Globe className="h-4 w-4" />
              </a>
            )}
            {character.social_media.email && (
              <a
                href={`mailto:${character.social_media.email}`}
                className="text-white/50 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10"
                onClick={(e) => e.stopPropagation()}
                title="Email"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {character.social_media.phone && (
              <a
                href={`tel:${character.social_media.phone}`}
                className="text-white/50 hover:text-primary transition-colors p-1 rounded hover:bg-primary/10"
                onClick={(e) => e.stopPropagation()}
                title="Phone"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}

        {/* Character Attributes */}
        {attributes.length > 0 && (
          <div className="pt-1.5 border-t border-border/30">
            <div className="flex flex-wrap gap-1">
              {attributes.slice(0, 3).map((attr) => {
                const getAttributeIcon = (type: string) => {
                  switch (type) {
                    case 'employment_status':
                    case 'occupation':
                    case 'workplace':
                      return <Briefcase className="h-2.5 w-2.5" />;
                    case 'financial_status':
                      return <DollarSign className="h-2.5 w-2.5" />;
                    case 'lifestyle_pattern':
                      return <Activity className="h-2.5 w-2.5" />;
                    case 'personality_trait':
                      return <Smile className="h-2.5 w-2.5" />;
                    case 'relationship_status':
                      return <HeartIcon className="h-2.5 w-2.5" />;
                    case 'living_situation':
                      return <Home className="h-2.5 w-2.5" />;
                    default:
                      return <Tag className="h-2.5 w-2.5" />;
                  }
                };

                const getAttributeColor = (type: string) => {
                  switch (type) {
                    case 'employment_status':
                    case 'occupation':
                    case 'workplace':
                      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                    case 'financial_status':
                      return 'bg-green-500/20 text-green-400 border-green-500/30';
                    case 'lifestyle_pattern':
                      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
                    case 'personality_trait':
                      return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
                    case 'relationship_status':
                      return 'bg-red-500/20 text-red-400 border-red-500/30';
                    case 'living_situation':
                      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                    default:
                      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
                  }
                };

                return (
                  <Badge
                    key={attr.id}
                    variant="outline"
                    className={`${getAttributeColor(attr.attributeType)} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
                    title={`${attr.attributeType}: ${attr.attributeValue} (${Math.round(attr.confidence * 100)}% confidence)`}
                  >
                    {getAttributeIcon(attr.attributeType)}
                    <span className="truncate max-w-[60px]">{attr.attributeValue}</span>
                  </Badge>
                );
              })}
              {attributes.length > 3 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-white/40 border-border/30">
                  +{attributes.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {(character.memory_count !== undefined || character.relationship_count !== undefined) && (
          <div className="flex items-center justify-between pt-1.5 border-t border-border/30 text-[10px]">
            {character.memory_count !== undefined && (
              <div className="flex items-center gap-1 text-white/50">
                <Sparkles className="h-2.5 w-2.5" />
                <span>{character.memory_count} {character.memory_count === 1 ? 'memory' : 'memories'}</span>
              </div>
            )}
            {character.relationship_count !== undefined && (
              <div className="flex items-center gap-1 text-white/50">
                <Users className="h-2.5 w-2.5" />
                <span>{character.relationship_count} {character.relationship_count === 1 ? 'connection' : 'connections'}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
      </div>
      {/* End Desktop: Full card layout */}
    </Card>
  );
};

