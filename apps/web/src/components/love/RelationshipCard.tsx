// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Heart, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/cn';

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

interface RelationshipCardProps {
  relationship: RomanticRelationship;
  onClick?: () => void;
}

export const RelationshipCard = ({ relationship, onClick }: RelationshipCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'ended':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'on_break':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'complicated':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatRelationshipType = (type: string) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const getDuration = () => {
    if (!relationship.start_date) return null;
    const start = new Date(relationship.start_date);
    const end = relationship.end_date ? new Date(relationship.end_date) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 30) return `${diffDays} days`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
    return `${Math.floor(diffDays / 365)} years`;
  };

  const heartFill = relationship.affection_score;
  const isActive = relationship.is_current && relationship.status === 'active';

  return (
    <Card
      className={cn(
        "border-border/60 bg-gradient-to-br from-black/40 to-black/60 cursor-pointer transition-all duration-300 hover:border-pink-500/50 hover:shadow-xl hover:shadow-pink-500/20 hover:-translate-y-1 group",
        isActive && "border-pink-500/30 bg-gradient-to-br from-pink-950/10 to-purple-950/10"
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-white text-lg mb-1 group-hover:text-pink-300 transition-colors">
              {relationship.person_name || formatRelationshipType(relationship.relationship_type)}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", getStatusColor(relationship.status))}>
                {relationship.status}
              </Badge>
              {relationship.is_situationship && (
                <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                  Situationship
                </Badge>
              )}
              {relationship.rank_among_active && relationship.rank_among_active <= 3 && (
                <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                  #{relationship.rank_among_active}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Heart Fill Visualization */}
          <div className="relative">
            <Heart 
              className={cn(
                "w-8 h-8 transition-all group-hover:scale-110",
                isActive ? "text-pink-400" : "text-pink-400/50"
              )}
              style={{
                fill: `rgba(244, 114, 182, ${heartFill})`,
                stroke: 'currentColor',
                strokeWidth: 2
              }}
            />
            {isActive && (
              <div className="absolute inset-0 animate-ping">
                <Heart className="w-8 h-8 text-pink-400/30" />
              </div>
            )}
          </div>
        </div>

        {/* Relationship Type */}
        <p className="text-sm text-white/70 mb-4">
          {formatRelationshipType(relationship.relationship_type)}
          {relationship.exclusivity_status && ` · ${relationship.exclusivity_status}`}
        </p>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <p className="text-xs text-white/50 mb-1">Compatibility</p>
            <div className="flex items-center gap-1">
              <p className={cn("text-sm font-semibold", getScoreColor(relationship.compatibility_score))}>
                {Math.round(relationship.compatibility_score * 100)}%
              </p>
              {relationship.compatibility_score >= 0.7 ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : relationship.compatibility_score < 0.4 ? (
                <TrendingDown className="w-3 h-3 text-red-400" />
              ) : (
                <Minus className="w-3 h-3 text-yellow-400" />
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-1">Health</p>
            <div className="flex items-center gap-1">
              <p className={cn("text-sm font-semibold", getScoreColor(relationship.relationship_health))}>
                {Math.round(relationship.relationship_health * 100)}%
              </p>
              {relationship.relationship_health >= 0.7 ? (
                <TrendingUp className="w-3 h-3 text-green-400" />
              ) : relationship.relationship_health < 0.4 ? (
                <TrendingDown className="w-3 h-3 text-red-400" />
              ) : (
                <Minus className="w-3 h-3 text-yellow-400" />
              )}
            </div>
          </div>
        </div>

        {/* Duration */}
        {relationship.start_date && (
          <div className="flex items-center gap-2 text-xs text-white/60 mb-4">
            <Calendar className="w-3 h-3" />
            <span>{getDuration()}</span>
            {relationship.start_date && (
              <span className="text-white/40">
                · {new Date(relationship.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}

        {/* Flags Summary */}
        <div className="flex items-center gap-4 text-xs">
          {relationship.red_flags.length > 0 && (
            <div className="flex items-center gap-1 text-red-300">
              <AlertTriangle className="w-3 h-3" />
              <span>{relationship.red_flags.length}</span>
            </div>
          )}
          {relationship.green_flags.length > 0 && (
            <div className="flex items-center gap-1 text-green-300">
              <CheckCircle className="w-3 h-3" />
              <span>{relationship.green_flags.length}</span>
            </div>
          )}
          {relationship.pros.length > 0 && (
            <div className="flex items-center gap-1 text-green-400">
              <span className="text-white/50">Pros:</span>
              <span>{relationship.pros.length}</span>
            </div>
          )}
          {relationship.cons.length > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <span className="text-white/50">Cons:</span>
              <span>{relationship.cons.length}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
