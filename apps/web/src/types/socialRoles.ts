export type SocialDomain =
  | 'family' | 'workplace' | 'education' | 'sports'
  | 'community' | 'health' | 'creative' | 'social' | 'spiritual' | 'unknown';

export type HierarchyDirection = 'above' | 'below' | 'same' | 'lateral' | 'unknown';

export interface RelationshipRole {
  domain: SocialDomain;
  role: string;
  hierarchy: HierarchyDirection;
  confidence: number;
  inferred_from?: string;
  hierarchy_label?: string;
  hierarchy_icon?: string;
  domain_label?: string;
}

// ── Family tree types ────────────────────────────────────────────────────────

export type FamilyRelationType =
  | 'parent' | 'child' | 'sibling' | 'twin'
  | 'grandparent' | 'grandchild'
  | 'aunt' | 'uncle' | 'niece' | 'nephew'
  | 'cousin' | 'spouse' | 'in_law'
  | 'step_parent' | 'step_child' | 'step_sibling'
  | 'half_sibling' | 'adopted_parent' | 'adopted_child'
  | 'godparent' | 'godchild' | 'related';

export interface FamilyMember {
  id: string;
  name: string;
  first_name?: string;
  avatar_url?: string | null;
  relation: FamilyRelationType;
  relation_label: string;   // "Dad", "Grandma", "Half-sibling"
  generation: number;       // 0 = self, -1 = parents, -2 = grandparents, +1 = children
  birth_year?: number;
  deceased?: boolean;
  closeness?: number;       // 0-100
  is_self?: boolean;
  notes?: string;
  side?: 'maternal' | 'paternal' | 'both' | 'other';
}

export interface FamilyBranch {
  side: 'maternal' | 'paternal' | 'partner' | 'other';
  label: string;
  color: string;
}

export interface FamilyTree {
  members: FamilyMember[];
  branches: FamilyBranch[];
  self_id: string;
}

// ── Hierarchy system types ───────────────────────────────────────────────────

export interface HierarchyLevel {
  order: number;           // 1 = lowest rank
  title: string;
  abbreviation?: string;
  color?: string;          // CSS color for badge
  bg_color?: string;       // CSS background
  symbol?: string;         // emoji or text symbol
  description?: string;
  min_years?: number;      // minimum time at previous rank
}

export interface HierarchySystem {
  id: string;
  name: string;
  domain: SocialDomain | string;
  description?: string;
  progression: 'linear' | 'branching';
  levels: HierarchyLevel[];
}

export interface HierarchyMembership {
  person_id: string;
  person_name: string;
  avatar_url?: string | null;
  system_id: string;
  current_level: number;  // matches HierarchyLevel.order
  years_at_level?: number;
  promoted_on?: string;   // ISO date
  promotion_history?: Array<{ level: number; date: string; notes?: string }>;
  role?: string;          // e.g. "Head Instructor" in addition to their rank
  is_self?: boolean;
}
