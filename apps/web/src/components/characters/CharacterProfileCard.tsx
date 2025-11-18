import { Calendar, MapPin, Users, Tag, Sparkles, Instagram, Twitter, Linkedin, Github, Globe, Mail, Phone, UserCircle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

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
  alias?: string[];
  pronouns?: string;
  archetype?: string;
  role?: string;
  status?: string;
  first_appearance?: string;
  summary?: string;
  tags?: string[];
  social_media?: SocialMedia;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  memory_count?: number;
  relationship_count?: number;
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

  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden"
      onClick={onClick}
    >
      {/* Header with Avatar Placeholder */}
      <div className="relative h-16 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <UserCircle className="h-10 w-10 text-white/40 group-hover:text-primary/60 transition-colors relative z-10" />
        {character.status && (
          <div className="absolute top-2 right-2 z-10">
            <Badge 
              variant="outline"
              className={`${
                character.status === 'active' 
                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              } text-xs`}
            >
              {character.status}
            </Badge>
          </div>
        )}
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
              {character.name}
            </h3>
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
        
        {/* Archetype Badge */}
        {character.archetype && (
          <Badge 
            variant="outline" 
            className={`${getArchetypeColor(character.archetype)} text-xs w-fit`}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            {character.archetype}
          </Badge>
        )}
        
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

