/**
 * Social Projection Engine Type Definitions
 */

export type ProjectionType =
  | 'hypothetical_person'
  | 'anticipated_connection'
  | 'influencer'
  | 'public_figure'
  | 'archetype'
  | 'imagined_group';

export type ProjectionSource = 'thought' | 'memory' | 'prediction';

export type LinkType = 'friend_of' | 'associated_with' | 'archetype_match' | 'influenced_by';

export interface SocialProjection {
  id?: string;
  name: string | null;
  projectionType: ProjectionType;
  evidence: string;
  timestamp: string;
  confidence: number;
  source: ProjectionSource;
  tags?: string[];
  score?: number;
  embedding?: number[];
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface ProjectionLink {
  id?: string;
  projectionId: string;
  relatedTo: string | null;
  linkType: LinkType;
  confidence: number;
  user_id?: string;
  created_at?: string;
}

