/**
 * Organization / group "personality" model.
 *
 * LoreBook treats an organization almost like a character: a collection of
 * people, goals, power structures, and relationships — not a bag of random
 * facts. This module defines the structured profile we store, remember, and
 * display for every group type (family, company, band, club, crew, community,
 * military unit, fandom, …) and a deterministic generator that produces a
 * sensible starting profile from what we already know (type, members, context).
 *
 * Stored under `organization.metadata.profile`. Demo cards are fully derived;
 * real organizations start sparse and fill in over time (chat-first editing),
 * so empty sections render as prompts rather than fabricated facts.
 */

import type { GroupType } from '../components/organizations/OrganizationProfileCard';

export interface OrgRole {
  role: string;
  responsibility?: string;
}

export interface OrganizationProfile {
  // Mission & purpose
  purpose?: string; // why it exists / the problem it solves
  mission?: string; // mission statement
  short_term_goals?: string[];
  long_term_vision?: string;

  // Culture
  values?: string[];
  traditions?: string[]; // traditions + inside jokes
  norms?: string[]; // expected behavior
  taboos?: string[];

  // Structure
  structure?: {
    hierarchy?: string;
    decision_making?: string;
    roles?: OrgRole[];
  };

  // Reputation
  reputation?: {
    public_image?: string;
    community_perception?: string;
    achievements?: string[];
    controversies?: string[];
  };

  // Resources
  resources?: {
    funding?: string;
    assets?: string[];
    facilities?: string[];
    technology?: string[];
  };

  // Activities / operations
  activities?: string[];

  // Communication
  communication?: {
    website?: string;
    social_media?: string[];
    channels?: string[];
    meeting_schedule?: string;
  };
}

/** True when a profile has no meaningful content in any section. */
export function isProfileEmpty(p?: OrganizationProfile | null): boolean {
  if (!p) return true;
  const hasArr = (a?: unknown[]) => Array.isArray(a) && a.length > 0;
  return !(
    p.purpose || p.mission || p.long_term_vision ||
    hasArr(p.short_term_goals) || hasArr(p.values) || hasArr(p.traditions) ||
    hasArr(p.norms) || hasArr(p.taboos) || hasArr(p.activities) ||
    p.structure?.hierarchy || p.structure?.decision_making || hasArr(p.structure?.roles) ||
    p.reputation?.public_image || p.reputation?.community_perception ||
    hasArr(p.reputation?.achievements) || hasArr(p.reputation?.controversies) ||
    p.resources?.funding || hasArr(p.resources?.assets) || hasArr(p.resources?.facilities) ||
    hasArr(p.resources?.technology) || p.communication?.website ||
    hasArr(p.communication?.social_media) || hasArr(p.communication?.channels) ||
    p.communication?.meeting_schedule
  );
}

interface DeriveInput {
  name: string;
  group_type: GroupType;
  members?: string[];
  context?: string;
}

interface TypeTemplate {
  purpose: (n: string) => string;
  mission?: (n: string) => string;
  values: string[];
  traditions: string[];
  norms: string[];
  activities: string[];
  defaultRoles: OrgRole[];
  decision_making: string;
  publicImage: (n: string) => string;
}

const TEMPLATES: Partial<Record<GroupType, TypeTemplate>> = {
  family: {
    purpose: () => 'Bonds of kinship, shared history, and looking out for one another across generations.',
    values: ['Loyalty', 'Tradition', 'Showing up for each other'],
    traditions: ['Holiday gatherings', 'Shared meals and old stories', 'Passing down family photos'],
    norms: ['Family comes first', 'Everyone is welcome at the table'],
    activities: ['Family dinners', 'Holidays and milestones', 'Checking in on each other'],
    defaultRoles: [{ role: 'Elder', responsibility: 'Keeper of stories and tradition' }],
    decision_making: 'Consensus among the elders, with everyone heard',
    publicImage: () => 'A close-knit family known for warmth and tradition',
  },
  company: {
    purpose: (n) => `The work ${n} exists to do — the product or service it delivers and the problem it solves.`,
    mission: (n) => `${n} aims to build something people genuinely need and do it well.`,
    values: ['Move with intent', 'Quality of work', 'Take care of the people'],
    traditions: ['Team standups', 'Launch celebrations', 'Onboarding rituals'],
    norms: ['Bias toward action', 'Disagree and commit'],
    activities: ['Day-to-day operations', 'Projects and launches', 'Client and stakeholder work'],
    defaultRoles: [
      { role: 'Leadership', responsibility: 'Sets direction and priorities' },
      { role: 'Core team', responsibility: 'Builds and ships the work' },
    ],
    decision_making: 'Leadership sets direction; teams own execution',
    publicImage: (n) => `${n} is building a reputation in its space`,
  },
  band: {
    purpose: () => 'Making music together and building a sound that is theirs.',
    values: ['Creative honesty', 'Tight collaboration', 'Showing up for the set'],
    traditions: ['Pre-show rituals', 'Late-night studio sessions', 'Naming inside jokes'],
    norms: ['Everyone gets a say in the sound', 'The song serves the band'],
    activities: ['Rehearsals', 'Recording sessions', 'Gigs and shows'],
    defaultRoles: [{ role: 'Frontperson' }, { role: 'Rhythm section' }],
    decision_making: 'Creative decisions made together; logistics by whoever organizes',
    publicImage: () => 'A band with a growing local following',
  },
  sports_team: {
    purpose: () => 'Competing together and pushing each other to get better.',
    values: ['Discipline', 'Teamwork', 'Leave it all on the field'],
    traditions: ['Pre-game warmups', 'Post-win celebrations', 'Team chants'],
    norms: ['Show up on time', 'Support your teammates'],
    activities: ['Practices', 'Games and matches', 'Conditioning'],
    defaultRoles: [{ role: 'Captain', responsibility: 'Leads on and off the field' }, { role: 'Coach' }],
    decision_making: 'Coach and captains set strategy',
    publicImage: () => 'A competitive team with strong chemistry',
  },
  club: {
    purpose: () => 'A shared-interest space where people gather around something they love.',
    values: ['Inclusion', 'Curiosity', 'Showing up'],
    traditions: ['Regular meetups', 'Member spotlights'],
    norms: ['Everyone is welcome', 'Participation over perfection'],
    activities: ['Meetings', 'Group activities', 'Member events'],
    defaultRoles: [{ role: 'Organizer', responsibility: 'Runs meetups and keeps things going' }],
    decision_making: 'Organizers decide with member input',
    publicImage: () => 'A welcoming club open to newcomers',
  },
  nonprofit: {
    purpose: (n) => `The cause ${n} serves and the change it is working toward.`,
    mission: (n) => `${n} works to make a measurable difference for the people it serves.`,
    values: ['Service', 'Integrity', 'Impact over optics'],
    traditions: ['Annual fundraiser', 'Volunteer appreciation'],
    norms: ['Mission first', 'Steward resources carefully'],
    activities: ['Programs and services', 'Fundraising', 'Volunteer coordination'],
    defaultRoles: [{ role: 'Director' }, { role: 'Volunteers' }],
    decision_making: 'Board and director set strategy; staff execute',
    publicImage: (n) => `${n} is known for its commitment to its cause`,
  },
  martial_arts: {
    purpose: () => 'Training discipline, skill, and respect through practice.',
    values: ['Discipline', 'Respect', 'Perseverance'],
    traditions: ['Belt ceremonies', 'Bowing in and out', 'Sparring nights'],
    norms: ['Respect the instructor and your partners', 'Control over ego'],
    activities: ['Training sessions', 'Sparring', 'Belt testing'],
    defaultRoles: [{ role: 'Instructor / Sensei' }, { role: 'Senior students' }],
    decision_making: 'Instructor leads; tradition guides',
    publicImage: () => 'A respected school with a strong training culture',
  },
  crew: {
    purpose: () => 'A tight group that runs together and has each other’s backs.',
    values: ['Loyalty', 'Trust', 'Showing up'],
    traditions: ['Regular hangs', 'Shared inside jokes'],
    norms: ['Ride for the crew', 'No flaking'],
    activities: ['Hanging out', 'Shared projects and adventures'],
    defaultRoles: [{ role: 'The connector', responsibility: 'Keeps everyone together' }],
    decision_making: 'Loose and collective',
    publicImage: () => 'A tight-knit crew',
  },
  collective: {
    purpose: () => 'A group organized around shared work or a shared cause, run collaboratively.',
    values: ['Collaboration', 'Shared ownership', 'Mutual support'],
    traditions: ['Collective check-ins', 'Shared showcases'],
    norms: ['Decisions made together', 'Credit is shared'],
    activities: ['Collaborative projects', 'Shared events'],
    defaultRoles: [{ role: 'Members', responsibility: 'Equal contributors' }],
    decision_making: 'Collective / consensus-based',
    publicImage: () => 'A collaborative collective',
  },
  community: {
    purpose: () => 'A group of people connected by a shared place, interest, or experience.',
    values: ['Belonging', 'Mutual support', 'Openness'],
    traditions: ['Regular gatherings', 'Welcoming newcomers'],
    norms: ['Be respectful', 'Give back to the group'],
    activities: ['Meetups', 'Discussions', 'Shared events'],
    defaultRoles: [{ role: 'Organizers / moderators' }],
    decision_making: 'Organizers with broad community input',
    publicImage: () => 'An active, welcoming community',
  },
  institution: {
    purpose: (n) => `The role ${n} plays and the people it serves.`,
    values: ['Stewardship', 'Reliability', 'Standards'],
    traditions: ['Established rituals and ceremonies'],
    norms: ['Follow process', 'Uphold standards'],
    activities: ['Core operations', 'Programs and services'],
    defaultRoles: [{ role: 'Leadership' }, { role: 'Staff' }],
    decision_making: 'Formal, hierarchical process',
    publicImage: (n) => `${n} is an established institution`,
  },
  friend_group: {
    purpose: () => 'The people you choose — shared history, support, and good times.',
    values: ['Loyalty', 'Honesty', 'Being there'],
    traditions: ['Regular hangouts', 'Group trips', 'Running jokes'],
    norms: ['Show up for each other', 'No judgment'],
    activities: ['Hanging out', 'Trips and celebrations', 'Group chats'],
    defaultRoles: [{ role: 'The organizer', responsibility: 'Plans the hangs' }],
    decision_making: 'Group consensus, usually over text',
    publicImage: () => 'A close group of friends',
  },
  scene: {
    purpose: () => 'A loose community organized around a shared aesthetic, sound, or subculture.',
    values: ['Authenticity', 'Creative expression', 'Community'],
    traditions: ['Shows and gatherings', 'Shared style'],
    norms: ['Keep it real', 'Support the scene'],
    activities: ['Events and shows', 'Collaborations'],
    defaultRoles: [{ role: 'Scene connectors' }],
    decision_making: 'Organic and decentralized',
    publicImage: () => 'A recognizable local scene',
  },
};

const GENERIC: TypeTemplate = {
  purpose: (n) => `What ${n} is and why it matters to you.`,
  values: ['Trust', 'Shared purpose'],
  traditions: ['Regular gatherings'],
  norms: ['Show up', 'Look out for each other'],
  activities: ['Regular activities together'],
  defaultRoles: [{ role: 'Members' }],
  decision_making: 'Decided together',
  publicImage: (n) => `${n} is becoming known in its circle`,
};

/**
 * Build a starting profile from what we know. Used for demo cards and as the
 * scaffold a real organization's profile grows from.
 */
export function deriveOrganizationProfile(input: DeriveInput): OrganizationProfile {
  const t = TEMPLATES[input.group_type] ?? GENERIC;
  const members = (input.members ?? []).filter(Boolean);

  const roles: OrgRole[] = [...t.defaultRoles];
  // Attach the first detected members to leadership-ish roles for color.
  members.slice(0, 2).forEach((m, i) => {
    if (roles[i]) roles[i] = { ...roles[i], responsibility: `${roles[i].responsibility ?? roles[i].role} — e.g. ${m}` };
  });

  return {
    purpose: t.purpose(input.name),
    mission: t.mission?.(input.name),
    short_term_goals: [],
    long_term_vision: undefined,
    values: t.values,
    traditions: t.traditions,
    norms: t.norms,
    taboos: [],
    structure: {
      hierarchy: roles.map((r) => r.role).join(' → '),
      decision_making: t.decision_making,
      roles,
    },
    reputation: {
      public_image: t.publicImage(input.name),
      community_perception: undefined,
      achievements: [],
      controversies: [],
    },
    resources: { assets: [], facilities: [], technology: [] },
    activities: t.activities,
    communication: { social_media: [], channels: [] },
  };
}

/**
 * A 0-100 "influence on you" score. Prefers stored analytics; otherwise a
 * light heuristic from involvement signals so the card always shows something
 * meaningful.
 */
export function computeInfluenceScore(args: {
  analyticsInfluence?: number; // 0-100 if present
  memberCount?: number;
  usageCount?: number;
  userRelationship?: string;
}): number {
  if (typeof args.analyticsInfluence === 'number') return Math.round(args.analyticsInfluence);
  const relWeight: Record<string, number> = {
    founder: 1, leader: 0.95, member: 0.8, collaborator: 0.65, alumnus: 0.55,
    former_member: 0.45, adjacent: 0.4, fan: 0.35, aware_of: 0.2, referenced: 0.15,
  };
  const rel = relWeight[args.userRelationship ?? ''] ?? 0.3;
  const usage = Math.min((args.usageCount ?? 0) / 20, 1);
  const size = Math.min((args.memberCount ?? 0) / 10, 1);
  return Math.round(Math.min(100, (rel * 0.6 + usage * 0.25 + size * 0.15) * 100));
}
