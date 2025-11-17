import { Calendar, MapPin, Users, Tag, Sparkles, Instagram, Twitter, Linkedin, Github, Globe, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';

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
  return (
    <Card 
      className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white">{character.name}</h3>
            {character.alias && character.alias.length > 0 && (
              <p className="text-sm text-white/60 mt-1">
                {character.alias.join(', ')}
              </p>
            )}
          </div>
          {character.status && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              character.status === 'active' 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
              {character.status}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {character.summary && (
          <p className="text-sm text-white/80 line-clamp-3">{character.summary}</p>
        )}
        
        <div className="flex flex-wrap gap-2 text-xs text-white/60">
          {character.pronouns && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{character.pronouns}</span>
            </div>
          )}
          {character.archetype && (
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              <span>{character.archetype}</span>
            </div>
          )}
          {character.role && (
            <div className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              <span>{character.role}</span>
            </div>
          )}
          {character.first_appearance && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{new Date(character.first_appearance).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {character.tags && character.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
            {character.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20"
              >
                {tag}
              </span>
            ))}
            {character.tags.length > 4 && (
              <span className="px-2 py-0.5 rounded text-xs text-white/40">
                +{character.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {character.social_media && Object.keys(character.social_media).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
            {character.social_media.instagram && (
              <a
                href={`https://instagram.com/${character.social_media.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {character.social_media.twitter && (
              <a
                href={`https://twitter.com/${character.social_media.twitter.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Twitter className="h-4 w-4" />
              </a>
            )}
            {character.social_media.linkedin && (
              <a
                href={character.social_media.linkedin.startsWith('http') ? character.social_media.linkedin : `https://linkedin.com/in/${character.social_media.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Linkedin className="h-4 w-4" />
              </a>
            )}
            {character.social_media.github && (
              <a
                href={`https://github.com/${character.social_media.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Github className="h-4 w-4" />
              </a>
            )}
            {character.social_media.website && (
              <a
                href={character.social_media.website.startsWith('http') ? character.social_media.website : `https://${character.social_media.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Globe className="h-4 w-4" />
              </a>
            )}
            {character.social_media.email && (
              <a
                href={`mailto:${character.social_media.email}`}
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="h-4 w-4" />
              </a>
            )}
            {character.social_media.phone && (
              <a
                href={`tel:${character.social_media.phone}`}
                className="text-white/60 hover:text-primary transition"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-white/50">
          {character.memory_count !== undefined && (
            <span>{character.memory_count} memories</span>
          )}
          {character.relationship_count !== undefined && (
            <span>{character.relationship_count} relationships</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

