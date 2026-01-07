import { Calendar, MapPin, Users, Tag, Sparkles, Instagram, Twitter, Linkedin, Github, Globe, Mail, Phone, ChevronRight, Star, Award, User, Hash, UserX, Link2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CharacterAvatar } from './CharacterAvatar';

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

type CharacterProfileCardProps = {
  character: Character;
  onClick?: () => void;
};

export const CharacterProfileCard = ({ character, onClick }: CharacterProfileCardProps) => {
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
      className={`group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden ${
        isUnmet ? 'opacity-75 border-dashed border-2' : ''
      }`}
      onClick={onClick}
    >
      {/* Header with Avatar */}
      <div className={`relative h-16 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center ${
        isUnmet ? 'opacity-60' : ''
      }`}>
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <div className="relative z-10">
          <CharacterAvatar url={character.avatar_url} name={character.name} size={40} />
        </div>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
          {character.importance_level && (
            <Badge 
              variant="outline"
              className={`${getImportanceColor(character.importance_level)} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
            >
              {getImportanceIcon(character.importance_level)}
              <span className="hidden sm:inline">{getImportanceLabel(character.importance_level)}</span>
            </Badge>
          )}
          {!hasMet && (
            <Badge 
              variant="outline"
              className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0.5 flex items-center gap-0.5"
              title="Never met in person"
            >
              <UserX className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">Unmet</span>
            </Badge>
          )}
          {proximity !== 'direct' && (
            <Badge 
              variant="outline"
              className={`${getProximityColor(proximity)} text-[10px] px-1.5 py-0.5 flex items-center gap-0.5`}
              title={`Connection: ${getProximityLabel(proximity)}`}
            >
              {proximity === 'indirect' && <Link2 className="h-2.5 w-2.5" />}
              {proximity === 'third_party' && <Eye className="h-2.5 w-2.5" />}
              <span className="hidden sm:inline">{getProximityLabel(proximity)}</span>
            </Badge>
          )}
          {character.status && character.status !== 'active' && (
            <Badge 
              variant="outline"
              className={`${
                character.status === 'inactive'
                  ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              } text-[10px] px-1.5 py-0.5`}
            >
              {character.status}
            </Badge>
          )}
          {character.analytics && (
            <>
              {/* Importance Badge */}
              <Badge 
                variant="outline"
                className={`${character.analytics.importance_score >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : character.analytics.importance_score >= 40 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} text-[10px] px-1.5 py-0.5 flex items-center gap-1`}
                title={`Importance: ${character.analytics.importance_score}/100`}
              >
                {character.analytics.importance_score >= 70 ? <Star className="h-2.5 w-2.5" /> : character.analytics.importance_score >= 40 ? <Award className="h-2.5 w-2.5" /> : null}
                {character.analytics.importance_score}
              </Badge>
              {/* Trend Indicator */}
              {character.analytics.trend === 'deepening' && (
                <TrendingUp className="h-3 w-3 text-green-400" title="Relationship deepening" />
              )}
              {character.analytics.trend === 'weakening' && (
                <TrendingDown className="h-3 w-3 text-red-400" title="Relationship weakening" />
              )}
              {character.analytics.trend === 'stable' && (
                <Minus className="h-3 w-3 text-gray-400" title="Stable relationship" />
              )}
            </>
          )}
        </div>
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
                {displayName}
              </h3>
              {character.is_nickname && (
                <Badge 
                  variant="outline" 
                  className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[9px] px-1.5 py-0"
                  title="Generated nickname"
                >
                  Nickname
                </Badge>
              )}
            </div>
            {character.first_name && character.last_name && character.name !== displayName && (
              <p className="text-xs text-white/40 mt-0.5 truncate">
                Also known as: {character.name}
              </p>
            )}
            {character.alias && character.alias.length > 0 && (
              <p className="text-xs text-white/50 mt-0.5 truncate">
                {character.alias.join(', ')}
              </p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0 px-4 pb-3">
        {character.summary && (
          <p className="text-xs text-white/70 line-clamp-2 leading-snug">{character.summary}</p>
        )}
        
        {/* Importance and Archetype Badges */}
        <div className="flex flex-wrap gap-1.5">
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
        
        {/* Metadata Row */}
        <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
          {character.pronouns && (
            <div className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              <span>{character.pronouns}</span>
            </div>
          )}
          {character.role && (
            <div className="flex items-center gap-1">
              <Tag className="h-2.5 w-2.5" />
              <span className="truncate max-w-[80px]">{character.role}</span>
            </div>
          )}
          {!hasMet && (
            <div className="flex items-center gap-1 text-orange-400/70" title="Never met in person">
              <UserX className="h-2.5 w-2.5" />
              <span>Unmet</span>
            </div>
          )}
          {proximity === 'third_party' && (
            <div className="flex items-center gap-1 text-purple-400/70" title="Mentioned by others, don't know personally">
              <Eye className="h-2.5 w-2.5" />
              <span>Third Party</span>
            </div>
          )}
          {relationshipDepth === 'mentioned_only' && (
            <div className="flex items-center gap-1 text-yellow-400/70" title="Only mentioned, no real relationship">
              <EyeOff className="h-2.5 w-2.5" />
              <span>Mentioned Only</span>
            </div>
          )}
          {character.first_appearance && (
            <div className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              <span>{new Date(character.first_appearance).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {character.tags && character.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
            {character.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="px-2 py-0.5 text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
              >
                {tag}
              </Badge>
            ))}
            {character.tags.length > 3 && (
              <Badge variant="outline" className="px-2 py-0.5 text-xs text-white/40 border-border/30">
                +{character.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {character.social_media && Object.keys(character.social_media).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/30">
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
    </Card>
  );
};

