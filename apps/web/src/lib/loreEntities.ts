import {
  type LucideIcon,
  User,
  MapPin,
  Users,
  Building2,
  Zap,
  Briefcase,
  Calendar,
  Heart,
  BookOpen,
  PawPrint,
  Package,
} from 'lucide-react';

import type { CertifiedEntityType, CharacterVariant } from '../types/certifiedEntity';

/** Core entity kinds LoreBook tracks across books, chat, and project links. */
export type LoreEntityKind =
  | 'person'
  | 'pet'
  | 'place'
  | 'group'
  | 'organization'
  | 'thing'
  | 'skill'
  | 'project'
  | 'event'
  | 'memory'
  | 'relationship';

export type LoreEntityDefinition = {
  kind: LoreEntityKind;
  label: string;
  shortLabel: string;
  description: string;
  /** Tailwind classes for bordered chips / badges */
  chip: string;
  /** Solid swatch for legend dots */
  swatch: string;
  icon: LucideIcon;
  /** App surface id when this entity has its own book */
  bookSurface?: string;
};

/** Single source of truth for book entity colors, labels, and navigation. */
export const MAIN_LORE_ENTITIES: LoreEntityDefinition[] = [
  {
    kind: 'person',
    label: 'People & Pets',
    shortLabel: 'People',
    description: 'Characters, family, friends, mentors',
    chip: 'border-blue-500/45 bg-blue-500/12 text-blue-200',
    swatch: 'bg-blue-500',
    icon: User,
    bookSurface: 'characters',
  },
  {
    kind: 'pet',
    label: 'Pets',
    shortLabel: 'Pets',
    description: 'Animal companions and pets that matter in your story',
    chip: 'border-sky-400/45 bg-sky-500/12 text-sky-100',
    swatch: 'bg-sky-400',
    icon: PawPrint,
    bookSurface: 'characters',
  },
  {
    kind: 'place',
    label: 'Places',
    shortLabel: 'Places',
    description: 'Cities, venues, homes, trails',
    chip: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-200',
    swatch: 'bg-emerald-500',
    icon: MapPin,
    bookSurface: 'locations',
  },
  {
    kind: 'group',
    label: 'Groups',
    shortLabel: 'Groups',
    description: 'Crews, bands, friend circles, teams',
    chip: 'border-violet-500/45 bg-violet-500/12 text-violet-200',
    swatch: 'bg-violet-500',
    icon: Users,
    bookSurface: 'organizations',
  },
  {
    kind: 'organization',
    label: 'Organizations',
    shortLabel: 'Orgs',
    description: 'Companies, schools, institutions',
    chip: 'border-green-500/45 bg-green-500/12 text-green-200',
    swatch: 'bg-green-500',
    icon: Building2,
    bookSurface: 'organizations',
  },
  {
    kind: 'thing',
    label: 'Things',
    shortLabel: 'Things',
    description: 'Objects, tools, possessions, and recurring symbols',
    chip: 'border-lime-500/45 bg-lime-500/12 text-lime-100',
    swatch: 'bg-lime-500',
    icon: Package,
  },
  {
    kind: 'skill',
    label: 'Skills',
    shortLabel: 'Skills',
    description: 'Practices, crafts, capabilities you level up',
    chip: 'border-cyan-500/45 bg-cyan-500/12 text-cyan-200',
    swatch: 'bg-cyan-500',
    icon: Zap,
    bookSurface: 'skills',
  },
  {
    kind: 'project',
    label: 'Projects',
    shortLabel: 'Projects',
    description: 'Named efforts, builds, and arcs you ship',
    chip: 'border-purple-500/45 bg-purple-500/12 text-purple-200',
    swatch: 'bg-purple-500',
    icon: Briefcase,
    bookSurface: 'projects',
  },
  {
    kind: 'event',
    label: 'Events',
    shortLabel: 'Events',
    description: 'Parties, milestones, trips, ceremonies',
    chip: 'border-orange-500/45 bg-orange-500/12 text-orange-200',
    swatch: 'bg-orange-500',
    icon: Calendar,
    bookSurface: 'events',
  },
  {
    kind: 'memory',
    label: 'Memories',
    shortLabel: 'Memories',
    description: 'Journal entries and chat moments',
    chip: 'border-amber-500/45 bg-amber-500/12 text-amber-200',
    swatch: 'bg-amber-500',
    icon: BookOpen,
    bookSurface: 'lorebook',
  },
  {
    kind: 'relationship',
    label: 'Relationships',
    shortLabel: 'Love',
    description: 'Partners, dynamics, romantic threads',
    chip: 'border-rose-500/45 bg-rose-500/12 text-rose-200',
    swatch: 'bg-rose-500',
    icon: Heart,
    bookSurface: 'love',
  },
];

const byKind = new Map(MAIN_LORE_ENTITIES.map((e) => [e.kind, e]));

export function getLoreEntity(kind: LoreEntityKind): LoreEntityDefinition {
  return byKind.get(kind)!;
}

export function loreEntityChipClass(kind: LoreEntityKind): string {
  return getLoreEntity(kind).chip;
}

/** Chip classes with match-status variants — used by composer and inline pills. */
export function loreEntityChipTriplet(kind: LoreEntityKind): {
  known: string;
  suggestion: string;
  draft: string;
} {
  const base = getLoreEntity(kind).chip;
  return {
    known: base,
    suggestion: `${base} border-dashed opacity-90`,
    draft: `${base} border-dashed opacity-80`,
  };
}

/** Map certified chat/book types to the LoreBook entity palette. */
export function certifiedTypeToLoreKind(
  type: CertifiedEntityType,
  characterVariant?: CharacterVariant,
): LoreEntityKind {
  if (type === 'character' && characterVariant === 'romantic') return 'relationship';
  if (type === 'character') return 'person';
  if (type === 'location') return 'place';
  if (type === 'organization') return 'organization';
  if (type === 'skill') return 'skill';
  if (type === 'project') return 'project';
  if (type === 'thing') return 'thing';
  if (type === 'event') return 'event';
  return 'person';
}

export function loreKindForChip(entity: {
  type: CertifiedEntityType;
  characterVariant?: CharacterVariant;
  loreKind?: LoreEntityKind;
}): LoreEntityKind {
  return entity.loreKind ?? certifiedTypeToLoreKind(entity.type, entity.characterVariant);
}

/** App route for a lore entity kind (when the book surface exists). */
export function routeForLoreKind(kind: LoreEntityKind): string | undefined {
  const surface = getLoreEntity(kind).bookSurface;
  if (!surface) return undefined;
  const routes: Record<string, string> = {
    characters: '/characters',
    locations: '/locations',
    organizations: '/organizations',
    skills: '/skills',
    projects: '/projects',
    events: '/events',
    lorebook: '/lorebook',
    love: '/love',
  };
  return routes[surface];
}
