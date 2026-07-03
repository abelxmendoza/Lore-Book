import { Calendar, MapPin, Users, Tag, Sparkles, Instagram, Twitter, Linkedin, Github, Globe, Mail, Phone, ChevronRight, Star, Award, User, Hash, UserX, Link2, Eye, EyeOff, Briefcase, DollarSign, Activity, Smile, Home, Heart as HeartIcon, Heart, TrendingUp, TrendingDown, Minus, Zap, Flame, Wind, Moon, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LexicalSignalBadges } from '../shared/LexicalSignalBadges';
import { UnknownField } from '../ui/UnknownField';
import { CharacterAvatar } from './CharacterAvatar';
import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';
import { canCallAuthenticatedApi } from '../../lib/runtimeIdentity';
import { getCharacterWittyTagline } from '../../lib/characterDisplay';
import { getCharacterDisplayTitle, getCharacterSubtitle } from '../../lib/characterDisplayTitle';
import {
  CONNECTION_STAGE_LABELS,
  getPublicFigureConnection,
  impactOnUserWithPublicFigureCap,
  isPublicFigureCharacter,
} from '../../lib/publicFigure';

export type SocialMedia = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
  phone?: string;
  spotify?: string;
  discord?: string;
  tiktok?: string;
  youtube?: string;
};

export type Character = {
  id: string;
  name: string;
  first_name?: string | null;
  middle_name?: string | null;
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
  direct_memory_count?: number;
  knowledge_count?: number;
  relationship_count?: number;
  relationships?: Array<{
    id?: string;
    character_id: string;
    character_name?: string;
    relationship_type: string;
    closeness_score?: number;
    summary?: string;
    status?: string;
  }>;
  shared_memories?: Array<{
    id: string;
    entry_id: string;
    date: string;
    summary?: string;
  }>;
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

export type CharacterAttribute = {
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
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  /**
   * Pre-fetched attributes for this character. When provided (controlled mode),
   * the card renders these and skips its own per-card fetch — used by the grid
   * to batch all characters into a single request. When undefined, the card
   * self-fetches (backward compatible for standalone usages).
   */
  attributes?: CharacterAttribute[];
};

export const CharacterProfileCard = ({
  character,
  onClick,
  relationship,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  attributes: attributesProp,
}: CharacterProfileCardProps) => {
  const isControlled = attributesProp !== undefined;
  const [fetchedAttributes, setFetchedAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const attributes = isControlled ? attributesProp : fetchedAttributes;

  // Load attributes for this character only when not provided by the parent
  // (the grid batches them in a single request and passes them down).
  useEffect(() => {
    if (isControlled) return;
    const loadAttributes = async () => {
      if (!character.id) return;
      if (!canCallAuthenticatedApi()) {
        setFetchedAttributes([]);
        setLoadingAttributes(false);
        return;
      }
      setLoadingAttributes(true);
      try {
        const response = await fetchJson<{ attributes: CharacterAttribute[] }>(
          `/api/characters/${character.id}/attributes?currentOnly=true`
        );
        setFetchedAttributes(response.attributes || []);
      } catch {
        setFetchedAttributes([]);
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [character.id, isControlled]);
  const getArchetypeColor = (archetype?: string) => {
    const colors: Record<string, string> = {
      'ally': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'mentor': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'family': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'friend': 'bg-green-500/20 text-green-400 border-green-500/30',
      'colleague': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'protagonist': 'bg-primary/20 text-primary border-primary/30',
      'collaborator': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'romantic': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      'past_romantic': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
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
        return <Star className="h-2.5 w-2.5" />;
      case 'major':
        return <Award className="h-2.5 w-2.5" />;
      case 'supporting':
        return <User className="h-2.5 w-2.5" />;
      case 'minor':
        return <Hash className="h-2.5 w-2.5" />;
      default:
        return <Hash className="h-2.5 w-2.5" />;
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
  const hasMet = character.has_met ?? null;
  const proximity = character.proximity_level ?? null;
  const relationshipDepth = character.relationship_depth ?? null;
  
  const displayName = getCharacterDisplayTitle(character);
  const contextSubtitle = getCharacterSubtitle(character);

  const cardBlurb = contextSubtitle || getCharacterWittyTagline(character) || character.summary;

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

  type RelPhase = 'CORE' | 'ACTIVE' | 'WEAK' | 'DORMANT';
  const getRelationshipPhase = (): RelPhase | null => {
    if (!character.analytics) return null;
    const c = character.analytics.closeness_score ?? 0;
    const r = character.analytics.recency_score ?? 0;
    if (c >= 70 && r >= 0.6) return 'CORE';
    if (c >= 45 || r >= 0.4) return 'ACTIVE';
    if (c >= 20 || r >= 0.2) return 'WEAK';
    return 'DORMANT';
  };

  const phaseConfig: Record<RelPhase, { label: string; classes: string; icon: React.ReactNode; glow?: string }> = {
    CORE:    { label: 'Core',    icon: <Flame className="h-2.5 w-2.5" />, classes: 'bg-purple-500/20 text-purple-300 border-purple-500/60', glow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]' },
    ACTIVE:  { label: 'Active',  icon: <Zap   className="h-2.5 w-2.5" />, classes: 'bg-cyan-500/20   text-cyan-300   border-cyan-500/50' },
    WEAK:    { label: 'Weak',    icon: <Wind  className="h-2.5 w-2.5" />, classes: 'bg-amber-500/20  text-amber-300  border-amber-500/40' },
    DORMANT: { label: 'Dormant', icon: <Moon  className="h-2.5 w-2.5" />, classes: 'bg-gray-500/10   text-gray-400   border-gray-500/30' },
  };

  const phase = getRelationshipPhase();

  const impactOnUser = impactOnUserWithPublicFigureCap(character);

  return (
    <Card 
      className={`group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden h-full ${
        isUnmet ? 'opacity-75 border-dashed border-2' : ''
      } ${selected ? 'ring-2 ring-primary border-primary/60' : ''}`}
      onClick={selectionMode ? onToggleSelected : onClick}
      data-testid="character-card"
    >
      {/* Full card layout - same for mobile and desktop */}
      <div>
        {/* Header with Avatar */}
        <div className={`relative h-10 sm:h-14 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center ${
          isUnmet ? 'opacity-60' : ''
        }`}>
          {selectionMode && (
            <button
              type="button"
              className={`absolute top-1 left-1 z-20 h-5 w-5 rounded border text-[10px] font-bold transition-colors ${
                selected
                  ? 'border-primary bg-primary text-black'
                  : 'border-white/30 bg-black/60 text-white/60'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSelected?.();
              }}
              aria-label={selected ? `Deselect ${displayName}` : `Select ${displayName}`}
            >
              {selected ? '✓' : ''}
            </button>
          )}
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
          <div className="relative z-10">
            <CharacterAvatar
              url={character.avatar_url}
              characterId={character.id}
              archetype={character.archetype}
              role={character.role}
              name={character.name}
              size={28}
              className="sm:w-9 sm:h-9"
            />
          </div>
          {/* Consolidated badge — one primary signal + overflow count */}
          {(() => {
            // Primary: relationship phase
            const primaryBadge = phase ? (
              <Badge
                variant="outline"
                className={`${phaseConfig[phase].classes}${phaseConfig[phase].glow ? ` ${phaseConfig[phase].glow}` : ''} text-[8px] sm:text-[10px] px-1 py-0 sm:px-1.5 sm:py-0.5 flex items-center gap-0.5`}
                title={`Relationship phase: ${phaseConfig[phase].label}`}
              >
                {phaseConfig[phase].icon}
                <span className="hidden sm:inline">{phaseConfig[phase].label}</span>
              </Badge>
            ) : character.importance_level ? (
              <Badge
                variant="outline"
                className={`${getImportanceColor(character.importance_level)} text-[8px] sm:text-[10px] px-1 py-0 sm:px-1.5 sm:py-0.5 flex items-center gap-0.5`}
                title={getImportanceLabel(character.importance_level)}
              >
                {getImportanceIcon(character.importance_level)}
                <span className="hidden sm:inline">{getImportanceLabel(character.importance_level)}</span>
              </Badge>
            ) : null;

            // Social standing — computed organization signal (never judgmental copy)
            const standing = (character.metadata as any)?.social_standing as { tier?: string; connector?: boolean } | undefined;
            const isPublicFigure = isPublicFigureCharacter(character);
            const pfConnection = getPublicFigureConnection(character);
            const figureType = ((character.metadata as any)?.figure_type as string | undefined) ?? 'public figure';
            const cloutLevel = (character.metadata as any)?.clout_level as string | undefined;
            // Stars scale with clout so reach reads at a glance.
            const cloutStars: Record<string, string> = {
              local: '★', emerging: '★', rising: '★★', established: '★★★', prominent: '★★★★', global: '★★★★★',
            };
            const cloutMark = cloutLevel ? (cloutStars[cloutLevel] ?? '★') : '★';

            // Count secondary signals for "+N" badge
            const extras: string[] = [];
            if (standing?.tier === 'inner_circle') extras.push('Inner circle');
            if (standing?.connector) extras.push('Connector');
            if (hasMet === false) extras.push('Unmet');
            if (impactOnUser >= 70 &&
                (character.importance_level === 'minor' || character.importance_level === 'background'))
              extras.push('High impact');
            if (proximity && proximity !== 'direct') extras.push(getProximityLabel(proximity));
            if (character.status && character.status !== 'active') extras.push(character.status);
            if (character.analytics?.trend === 'deepening') extras.push('Deepening');
            if (character.analytics?.trend === 'weakening') extras.push('Weakening');

            return (
              <div className="absolute top-1 right-1 z-10 flex flex-col gap-0.5 items-end">
                {primaryBadge}
                {isPublicFigure && (
                  <Badge
                    variant="outline"
                    className="bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30 text-[8px] sm:text-[10px] px-1 py-0 sm:px-1.5 sm:py-0.5"
                    title={`Public figure: ${figureType}${cloutLevel ? ` · clout: ${cloutLevel}` : ''}${pfConnection?.stage ? ` · ${CONNECTION_STAGE_LABELS[pfConnection.stage] ?? pfConnection.stage}` : ''}`}
                  >
                    {cloutMark}
                    <span className="hidden sm:inline ml-0.5">
                      {pfConnection?.stage
                        ? CONNECTION_STAGE_LABELS[pfConnection.stage] ?? pfConnection.stage
                        : cloutLevel ? `${figureType} · ${cloutLevel}` : figureType}
                    </span>
                  </Badge>
                )}
                {extras.length > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-white/5 text-white/35 border-white/10 text-[7px] px-1 py-0"
                    title={extras.join(', ')}
                  >
                    +{extras.length}
                  </Badge>
                )}
              </div>
            );
          })()}
      </div>

      <CardHeader className="pb-1 pt-1.5 sm:pt-2 px-2 sm:px-4">
        <div className="flex items-start justify-between gap-1 sm:gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              <h3 className="text-[10px] sm:text-sm md:text-base font-semibold text-white break-words group-hover:text-primary transition-colors leading-tight">
                {displayName}
              </h3>
            </div>
            {/* Show role prominently on mobile; keep short on card, full text in modal */}
            {character.role ? (
              <p className="text-[9px] sm:text-xs text-white/70 mt-0.5 line-clamp-1 truncate" title={character.role}>
                {character.role.length > 60 ? `${character.role.slice(0, 60).trim()}…` : character.role}
              </p>
            ) : (
              <div className="mt-0.5 hidden sm:block">
                <UnknownField compact label="Role" />
              </div>
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
        {cardBlurb && (
          <p className="text-[9px] sm:text-xs text-white/70 line-clamp-2 leading-tight hidden sm:block italic" title={cardBlurb}>
            {cardBlurb.length > 100 ? `${cardBlurb.slice(0, 100).trim()}…` : cardBlurb}
          </p>
        )}
        
        {/* Importance and Archetype Badges - Hide on mobile, show on desktop */}
        <div className="hidden sm:flex flex-wrap gap-0.5 sm:gap-1.5 items-center">
          {character.importance_level && (
            <Badge
              variant="outline"
              className={`${getImportanceColor(character.importance_level)} text-[10px] px-1.5 py-0 w-fit flex items-center gap-1`}
              title={`${getImportanceLabel(character.importance_level)}${
                character.importance_score !== null && character.importance_score !== undefined
                  ? ` (${Math.round(character.importance_score)})`
                  : ''
              }`}
            >
              {getImportanceIcon(character.importance_level)}
              {getImportanceLabel(character.importance_level)}
            </Badge>
          )}
          {/* Distant but high impact: rare in your story, high impact on you */}
          {(character.importance_level === 'minor' || character.importance_level === 'background') &&
           impactOnUser >= 70 && (
            <Badge
              variant="outline"
              className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 w-fit flex items-center gap-1"
              title={typeof impactOverride === 'number'
                ? 'Rare in your story, but high impact on you (set by you)'
                : 'Rare in your story, but high impact on you'}
            >
              <Zap className="h-2.5 w-2.5" />
              High impact
            </Badge>
          )}
          {character.archetype && (
            <Badge
              variant="outline"
              className={`${getArchetypeColor(character.archetype)} text-[10px] px-1.5 py-0 w-fit`}
            >
              <Sparkles className="h-2.5 w-2.5 mr-0.5" />
              {character.archetype}
            </Badge>
          )}
        </div>
        
        {/* Relationship Badge (interest levels moved to modal) */}
        {relationship && (
          <div className="space-y-1.5 sm:space-y-2 pt-1 border-t border-border/30">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[9px] sm:text-[10px] px-1.5 py-0 ${
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
                  className="w-2.5 h-2.5 mr-1"
                  fill={relationship.is_current && relationship.status === 'active'
                    ? `rgba(244, 114, 182, ${relationship.affection_score})`
                    : 'transparent'}
                  stroke="currentColor"
                  strokeWidth={2}
                />
                {relationship.relationship_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Badge>
              {relationship.is_situationship && (
                <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                  Situationship
                </Badge>
              )}
              <LexicalSignalBadges relationship={relationship} />
            </div>
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
          {hasMet === false && (
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
                className="px-1 sm:px-1.5 py-0 text-[8px] sm:text-[9px] bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {character.tags.length > 3 && (
              <Badge variant="outline" className="px-1 sm:px-1.5 py-0 text-[8px] sm:text-[9px] text-white/40 border-border/30" title={`${character.tags.length - 3} more tags`}>
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
                    className={`${getAttributeColor(attr.attributeType)} text-[9px] px-1 py-0 flex items-center gap-1`}
                    title={`${attr.attributeType}: ${attr.attributeValue} (${Math.round(attr.confidence * 100)}% confidence)`}
                  >
                    {getAttributeIcon(attr.attributeType)}
                    <span className="truncate max-w-[60px]">{attr.attributeValue}</span>
                  </Badge>
                );
              })}
              {attributes.length > 3 && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-white/40 border-border/30">
                  +{attributes.length - 3}
                </Badge>
              )}
            </div>
          </div>
        )}

        {(character.memory_count !== undefined || character.relationship_count !== undefined || phase) && (
          <div className="flex items-center justify-between pt-1.5 border-t border-border/30 text-[10px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {character.memory_count !== undefined && (
                <div className="flex items-center gap-1 text-white/50">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>{character.memory_count} {character.memory_count === 1 ? 'signal' : 'signals'}</span>
                </div>
              )}
              {character.knowledge_count !== undefined && character.knowledge_count > 0 && (
                <div className="flex items-center gap-1 text-white/50">
                  <BookOpen className="h-2.5 w-2.5" />
                  <span>{character.knowledge_count} facts</span>
                </div>
              )}
              {character.relationship_count !== undefined && (
                <div className="flex items-center gap-1 text-white/50">
                  <Users className="h-2.5 w-2.5" />
                  <span>{character.relationship_count} {character.relationship_count === 1 ? 'connection' : 'connections'}</span>
                </div>
              )}
            </div>
            {phase && (
              <Badge
                variant="outline"
                className={`${phaseConfig[phase].classes} ${phaseConfig[phase].glow ?? ''} text-[10px] px-1.5 py-0.5 flex items-center gap-1 flex-shrink-0`}
                title={`Relationship phase: ${phaseConfig[phase].label}`}
              >
                {phaseConfig[phase].icon}
                <span className="hidden sm:inline">{phaseConfig[phase].label}</span>
              </Badge>
            )}
          </div>
        )}
      </CardContent>
      </div>
      {/* End Desktop: Full card layout */}
    </Card>
  );
};
