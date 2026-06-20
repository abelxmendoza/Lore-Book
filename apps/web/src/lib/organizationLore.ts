// =====================================================
// ORGANIZATION LORE / WORLD LAYER
// Powers the differentiator tabs (Lore, Influence, Insights) and the archetype
// header/card. These fields are not yet produced by a backend AI generator, so
// we read curated demo content when present and otherwise DERIVE a deterministic
// "world" from the organization's existing fields. No network, no randomness —
// the same org always yields the same world.
// =====================================================

/** Structural slice of an Organization we read here (kept local to avoid coupling to the card component). */
export interface OrgWorldInput {
  name: string;
  group_type?: string;
  type?: string;
  user_relationship?: string;
  status?: string;
  description?: string;
  founded_date?: string;
  founded_year?: number;
  last_seen?: string;
  created_at?: string;
  member_count?: number;
  members?: Array<{ character_name: string; role?: string; status?: string }>;
  metadata?: Record<string, unknown> | null;
  profile?: { mission?: string; values?: string[] } | null;
  analytics?: {
    importance_score?: number;
    group_influence_on_user?: number;
    user_involvement_score?: number;
    trend?: 'increasing' | 'stable' | 'decreasing';
  } | null;
}

export interface OrganizationArchetype {
  /** Short evocative nickname, e.g. "The Forge". */
  nickname: string;
  /** One-line essence, e.g. "A place where skills were tempered." */
  essence: string;
  /** Story function, e.g. "Training Ground". */
  storyFunction: string;
  /** Narrative weight, e.g. "Major Chapter". */
  narrativeImportance: string;
}

export interface OrganizationInfluence {
  skillsGained: string[];
  skillsStrengthened: string[];
  opportunitiesCreated: string[];
  habitsFormed: string[];
  /** 0–100. How much this org shaped the user. */
  impactScore: number;
}

export type OrgInsightKind = 'impact' | 'trend' | 'prediction' | 'pattern';

export interface OrganizationInsight {
  id: string;
  kind: OrgInsightKind;
  text: string;
}

export interface OrganizationLore {
  archetype: OrganizationArchetype;
  roleInStory: string;
  themes: string[];
  symbols: string[];
  connectedArcs: string[];
}

export interface OrganizationWorld {
  archetype: OrganizationArchetype;
  lore: OrganizationLore;
  influence: OrganizationInfluence;
  insights: OrganizationInsight[];
  /** True when the content was derived rather than curated/AI-generated. */
  derived: boolean;
}

// ── Archetype presets by group type ───────────────────────────────────────────
const ARCHETYPES: Record<string, OrganizationArchetype> = {
  company: { nickname: 'The Forge', essence: 'A place where skills were tempered.', storyFunction: 'Training Ground', narrativeImportance: 'Major Chapter' },
  institution: { nickname: 'The Academy', essence: 'A place of learning and proving.', storyFunction: 'Mentor Realm', narrativeImportance: 'Major Chapter' },
  family: { nickname: 'The Root System', essence: 'Where the story begins and returns.', storyFunction: 'Sanctuary', narrativeImportance: 'Origin Point' },
  household: { nickname: 'The Hearth', essence: 'The everyday ground of the story.', storyFunction: 'Sanctuary', narrativeImportance: 'Recurring Location' },
  band: { nickname: 'The Stage', essence: 'Where a voice was found.', storyFunction: 'Battlefield', narrativeImportance: 'Major Chapter' },
  friend_group: { nickname: 'The Circle', essence: 'Chosen company through the seasons.', storyFunction: 'Sanctuary', narrativeImportance: 'Recurring Location' },
  crew: { nickname: 'The Crew', essence: 'Hands that built things together.', storyFunction: 'Training Ground', narrativeImportance: 'Recurring Location' },
  sports_team: { nickname: 'The Arena', essence: 'Where limits were tested.', storyFunction: 'Battlefield', narrativeImportance: 'Recurring Location' },
  martial_arts: { nickname: 'The Dojo', essence: 'Discipline shaped into instinct.', storyFunction: 'Training Ground', narrativeImportance: 'Major Chapter' },
  community: { nickname: 'The Commons', essence: 'A shared world held in common.', storyFunction: 'Crossroads', narrativeImportance: 'Recurring Location' },
  nonprofit: { nickname: 'The Cause', essence: 'Work in service of something larger.', storyFunction: 'Crossroads', narrativeImportance: 'Recurring Location' },
  other: { nickname: 'The Waypoint', essence: 'A marker along the path.', storyFunction: 'Crossroads', narrativeImportance: 'Minor Chapter' },
};

const THEMES: Record<string, string[]> = {
  company: ['Growth', 'Discipline', 'Technical Mastery'],
  institution: ['Learning', 'Discipline', 'Identity'],
  family: ['Belonging', 'Continuity', 'Care'],
  band: ['Expression', 'Collaboration', 'Risk'],
  friend_group: ['Loyalty', 'Play', 'Belonging'],
  crew: ['Craft', 'Trust', 'Momentum'],
  martial_arts: ['Discipline', 'Resilience', 'Focus'],
  other: ['Change', 'Connection'],
};

const SYMBOLS: Record<string, string[]> = {
  company: ['Tools', 'Blueprints', 'Workbench'],
  institution: ['Books', 'Halls', 'Lecterns'],
  family: ['Table', 'Home', 'Roots'],
  band: ['Stage', 'Strings', 'Lights'],
  martial_arts: ['Mat', 'Belt', 'Stance'],
  other: ['Doors', 'Roads'],
};

const SKILLS_BY_TYPE: Record<string, string[]> = {
  company: ['Operations', 'Problem Solving', 'Collaboration'],
  institution: ['Research', 'Writing', 'Critical Thinking'],
  band: ['Performance', 'Songwriting', 'Stage Presence'],
  martial_arts: ['Discipline', 'Conditioning', 'Sparring'],
  crew: ['Craftsmanship', 'Coordination', 'Tooling'],
  other: ['Communication', 'Adaptability'],
};

function pick<T>(map: Record<string, T>, key: string | undefined, fallbackKey = 'other'): T {
  return (key && map[key]) || map[fallbackKey]!;
}

/** Map a 0–100 importance/impact score to 1–5 stars. */
export function importanceStars(score: number | undefined | null): number {
  if (score == null || !Number.isFinite(score)) return 3;
  return Math.max(1, Math.min(5, Math.round((score / 100) * 5)));
}

/** Qualitative band for an impact score. */
export function impactBand(score: number): 'Foundational' | 'Significant' | 'Moderate' | 'Light' {
  if (score >= 80) return 'Foundational';
  if (score >= 60) return 'Significant';
  if (score >= 35) return 'Moderate';
  return 'Light';
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Deterministically derive a world from an organization's existing fields. */
export function deriveOrganizationWorld(org: OrgWorldInput): OrganizationWorld {
  const gt = (org.group_type || org.type || 'other').toLowerCase();
  const archetype = pick(ARCHETYPES, gt);
  const themes = pick(THEMES, gt);
  const symbols = pick(SYMBOLS, gt);
  const baseSkills = pick(SKILLS_BY_TYPE, gt);

  const impactScore =
    org.analytics?.group_influence_on_user ??
    org.analytics?.importance_score ??
    Math.min(100, 40 + (org.member_count ?? 0) * 4);

  const rel = org.user_relationship ? titleCase(org.user_relationship) : 'Connection';
  const roleInStory =
    org.profile?.mission ||
    org.description ||
    `${org.name} is a ${titleCase(gt)} in your story — your role here: ${rel}.`;

  const insights: OrganizationInsight[] = [];
  if (org.analytics?.importance_score != null) {
    insights.push({
      id: 'impact',
      kind: 'impact',
      text: `${org.name} ranks among your more influential groups (importance ${org.analytics.importance_score}/100).`,
    });
  }
  if (org.analytics?.trend) {
    const dir =
      org.analytics.trend === 'increasing'
        ? 'rising — interactions have been increasing'
        : org.analytics.trend === 'decreasing'
          ? 'cooling — interactions have slowed recently'
          : 'steady — a stable presence in your timeline';
    insights.push({ id: 'trend', kind: 'trend', text: `Momentum is ${dir}.` });
  }
  insights.push({
    id: 'pattern',
    kind: 'pattern',
    text: `Most ${themes[0]?.toLowerCase() ?? 'related'} moments in your story connect back through ${org.name}.`,
  });

  return {
    archetype,
    lore: {
      archetype,
      roleInStory,
      themes,
      symbols,
      connectedArcs: [`${archetype.nickname} Arc`],
    },
    influence: {
      skillsGained: baseSkills,
      skillsStrengthened: org.profile?.values?.slice(0, 3) ?? ['Communication'],
      opportunitiesCreated: [`${titleCase(gt)} connections`, 'New experiences'],
      habitsFormed: [themes[1] ?? 'Consistency'],
      impactScore: Math.round(impactScore),
    },
    insights,
    derived: true,
  };
}

/**
 * Read the world for an organization: explicit `metadata.world` wins, then a
 * curated demo world (by name), otherwise a derived world. Always returns a
 * fully-populated object so the tabs never render empty.
 */
export function readOrganizationWorld(org: OrgWorldInput): OrganizationWorld {
  const fromMeta = org.metadata?.world as OrganizationWorld | undefined;
  if (fromMeta?.archetype && fromMeta.influence && fromMeta.lore) {
    return { ...fromMeta, derived: fromMeta.derived ?? false };
  }
  const curated = DEMO_ORG_WORLDS[org.name.trim().toLowerCase()];
  if (curated) return curated;
  return deriveOrganizationWorld(org);
}

// ── Curated demo worlds ───────────────────────────────────────────────────────
// NOTE: "Vanguard Robotics" is the canonical demo employer org. Do NOT use the
// scrubbed/denylisted founder employer name here.
export const vanguardRoboticsWorld: OrganizationWorld = {
  derived: false,
  archetype: {
    nickname: 'The Forge',
    essence: 'A place where skills were tempered.',
    storyFunction: 'Training Ground',
    narrativeImportance: 'Major Chapter',
  },
  lore: {
    archetype: {
      nickname: 'The Forge',
      essence: 'A place where skills were tempered.',
      storyFunction: 'Training Ground',
      narrativeImportance: 'Major Chapter',
    },
    roleInStory:
      'Vanguard Robotics is where the Builder first proved he could operate in the world of autonomous machines — the bridge from service-industry work into professional robotics.',
    themes: ['Growth', 'Adaptation', 'Technical Mastery'],
    symbols: ['Robots', 'Kitchens', 'Tools'],
    connectedArcs: ['Robotics Awakening', 'Deployment Era', 'Career Transition'],
  },
  influence: {
    skillsGained: ['Robotics Operations', 'Customer Support', 'Deployment Logistics'],
    skillsStrengthened: ['Communication', 'Problem Solving', 'Spanish'],
    opportunitiesCreated: ['Industry Connections', 'Robotics Experience'],
    habitsFormed: ['Field Diagnostics', 'Robot Recovery'],
    impactScore: 88,
  },
  insights: [
    {
      id: 'bridge',
      kind: 'impact',
      text: 'Vanguard Robotics is the strongest bridge between your service-industry background and your robotics career.',
    },
    {
      id: 'skills',
      kind: 'pattern',
      text: 'Most robotics-related skills in your story emerged after joining Vanguard Robotics.',
    },
    {
      id: 'trend',
      kind: 'trend',
      text: 'Interactions increased significantly after March — momentum is rising.',
    },
    {
      id: 'future',
      kind: 'prediction',
      text: 'Several future career opportunities connect back to relationships formed here.',
    },
  ],
};

export const DEMO_ORG_WORLDS: Record<string, OrganizationWorld> = {
  'vanguard robotics': vanguardRoboticsWorld,
};
