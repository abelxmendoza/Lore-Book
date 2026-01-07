import { User, MapPin, Building2, Lightbulb, AlertTriangle, ChevronRight, Users, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';

export type EntityType = 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ORG' | 'CONCEPT' | 'PERSON';
export type ResolutionTier = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

export type EntityCandidate = {
  entity_id: string;
  primary_name: string;
  aliases: string[];
  entity_type: EntityType;
  confidence: number;
  usage_count: number;
  last_seen: string;
  source_table: string; // 'characters', 'locations', 'entities', 'omega_entities'
  is_user_visible: boolean;
  resolution_tier: ResolutionTier;
  has_conflicts?: boolean;
  conflict_count?: number;
};

type EntityProfileCardProps = {
  entity: EntityCandidate;
  onClick?: () => void;
};

export const EntityProfileCard = ({ entity, onClick }: EntityProfileCardProps) => {
  const getEntityTypeIcon = (type: EntityType) => {
    switch (type) {
      case 'CHARACTER':
      case 'PERSON':
        return <User className="h-8 w-8 text-blue-400" />;
      case 'LOCATION':
        return <MapPin className="h-8 w-8 text-green-400" />;
      case 'ORG':
        return <Building2 className="h-8 w-8 text-purple-400" />;
      case 'CONCEPT':
        return <Lightbulb className="h-8 w-8 text-yellow-400" />;
      default:
        return <Hash className="h-8 w-8 text-primary" />;
    }
  };

  const getEntityTypeColor = (type: EntityType) => {
    switch (type) {
      case 'CHARACTER':
      case 'PERSON':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'LOCATION':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'ORG':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'CONCEPT':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-primary/20 text-primary border-primary/30';
    }
  };

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
      className={`group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden ${
        entity.has_conflicts ? 'border-orange-500/50' : ''
      }`}
      onClick={onClick}
    >
      {/* Header with Entity Type Icon */}
      <div className={`relative h-16 bg-gradient-to-br ${
        entity.entity_type === 'CHARACTER' || entity.entity_type === 'PERSON' 
          ? 'from-blue-500/20 via-blue-600/20 to-blue-500/20'
          : entity.entity_type === 'LOCATION'
          ? 'from-green-500/20 via-green-600/20 to-green-500/20'
          : entity.entity_type === 'ORG'
          ? 'from-purple-500/20 via-purple-600/20 to-purple-500/20'
          : 'from-yellow-500/20 via-yellow-600/20 to-yellow-500/20'
      } flex items-center justify-center`}>
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <div className="relative z-10">
          {getEntityTypeIcon(entity.entity_type)}
        </div>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
          {entity.has_conflicts && (
            <Badge 
              variant="outline"
              className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0.5 flex items-center gap-1"
              title={`${entity.conflict_count || 0} potential duplicate${(entity.conflict_count || 0) !== 1 ? 's' : ''}`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {entity.conflict_count || 0}
            </Badge>
          )}
          {!entity.is_user_visible && (
            <Badge 
              variant="outline"
              className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[10px] px-1.5 py-0.5"
              title={`${entity.resolution_tier} tier entity (internal)`}
            >
              {entity.resolution_tier}
            </Badge>
          )}
          <Badge 
            variant="outline"
            className={`${getConfidenceColor(entity.confidence)} text-[10px] px-1.5 py-0.5`}
            title={`${getConfidenceLabel(entity.confidence)} confidence (${Math.round(entity.confidence * 100)}%)`}
          >
            {getConfidenceLabel(entity.confidence)}
          </Badge>
        </div>
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
              {entity.primary_name}
            </h3>
            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-xs text-white/50 mt-0.5 truncate">
                {entity.aliases.slice(0, 2).join(', ')}
                {entity.aliases.length > 2 && ` +${entity.aliases.length - 2}`}
              </p>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0 px-4 pb-3">
        {/* Type and Usage Badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge 
            variant="outline" 
            className={`${getEntityTypeColor(entity.entity_type)} text-xs w-fit`}
          >
            {entity.entity_type}
          </Badge>
          {entity.usage_count > 0 && (
            <Badge 
              variant="outline" 
              className="bg-primary/10 text-primary/80 border-primary/20 text-xs"
            >
              <Users className="h-3 w-3 mr-1" />
              {entity.usage_count} {entity.usage_count === 1 ? 'use' : 'uses'}
            </Badge>
          )}
        </div>
        
        {/* Metadata Row */}
        <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
          <div className="flex items-center gap-1">
            <span>Last seen: {formatDate(entity.last_seen)}</span>
          </div>
          {entity.aliases && entity.aliases.length > 0 && (
            <div className="flex items-center gap-1">
              <span>{entity.aliases.length} {entity.aliases.length === 1 ? 'alias' : 'aliases'}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

