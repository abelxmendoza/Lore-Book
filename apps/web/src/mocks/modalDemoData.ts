/**
 * Demo-mode content for detail modals — keeps empty states out of /demo UX.
 */

import { subDays } from 'date-fns';
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import type {
  Organization,
  OrganizationRelationship,
  OrgRelationshipType,
} from '../components/organizations/OrganizationProfileCard';
import type { Character } from '../components/characters/CharacterProfileCard';
import type { Achievement } from '../types/achievement';
import type { Skill, SkillMetadata, SkillProgress } from '../types/skill';
import { enrichSkillProfileForStory } from './skillStoryDemoData';
import type { MemoryCard, LinkedMemory } from '../types/memory';
import type { QuestHistory } from '../types/quest';
import { getMockQuestHistory } from './quests';
import type { Quest } from '../types/quest';
import {
  deriveOrganizationProfile,
  type OrganizationProfile,
} from '../lib/organizationProfile';

export type ModalFact = {
  id: string;
  category: string;
  fact: string;
  confidence?: number;
  status?: string;
  previous_value?: string;
};

export type MockOrganizationMentionTrace = {
  labels: string[];
  total_mentions: number;
  source_counts: Record<string, number>;
  mentions: Array<{
    id: string;
    source: 'chat_messages' | 'conversation_messages' | 'entity_facts';
    source_id: string;
    session_id?: string | null;
    thread_title?: string | null;
    role?: string | null;
    matched_label: string;
    occurrence_count: number;
    snippet: string;
    created_at?: string | null;
  }>;
  facts: ModalFact[];
};

export function getMockLocationFacts(location: LocationProfile): ModalFact[] {
  const tags = location.tagCounts.slice(0, 3).map((t) => t.tag);
  const people = location.relatedPeople.slice(0, 2).map((p) => p.name);
  return [
    {
      id: `${location.id}-exp-1`,
      category: 'experience',
      fact: `You've visited ${location.name} ${Math.max(location.visitCount, 1)} time${location.visitCount === 1 ? '' : 's'} in your story.`,
      confidence: 0.88,
      status: 'updated',
    },
    {
      id: `${location.id}-assoc-1`,
      category: 'association',
      fact:
        people.length > 0
          ? `${location.name} is linked to ${people.join(' and ')} in your lore.`
          : `${location.name} shows up when you talk about routines and places that matter.`,
      confidence: 0.82,
      status: 'updated',
    },
    {
      id: `${location.id}-sent-1`,
      category: 'sentiment',
      fact:
        location.moods?.[0]?.mood != null
          ? `Recent visits feel ${location.moods[0].mood}.`
          : 'Overall tone around this place is warm and familiar.',
      confidence: 0.76,
      status: 'updated',
    },
    ...(tags.length
      ? [
          {
            id: `${location.id}-pat-1`,
            category: 'pattern',
            fact: `Common themes: ${tags.join(', ')}.`,
            confidence: 0.8,
            status: 'updated',
          },
        ]
      : []),
    ...(location.description
      ? [
          {
            id: `${location.id}-prac-1`,
            category: 'practical',
            fact: location.description,
            confidence: 0.9,
            status: 'updated',
          },
        ]
      : []),
  ];
}

export function getMockLocationPeople(
  location: LocationProfile,
  characters: Character[],
): LocationProfile['relatedPeople'] {
  if (location.relatedPeople.length > 0) return location.relatedPeople;
  return characters.slice(0, 3).map((c, i) => ({
    id: `person-${c.id}`,
    character_id: c.id,
    name: c.name,
    total_mentions: 3 - i,
    entryCount: 2 - i,
    relationship_type: i === 0 ? 'friend' : 'acquaintance',
  }));
}

const DEMO_ORG_RELATIONSHIP_LINKS: Record<
  string,
  Array<{ toId: string; type: OrgRelationshipType; notes?: string }>
> = {
  'mock-1': [
    { toId: 'mock-2', type: 'collaborated_with', notes: 'Occasional crossover hangs with college friends.' },
    { toId: 'mock-4', type: 'affiliated_with', notes: 'Marcus bridges the diner crew and the band.' },
  ],
  'mock-2': [{ toId: 'mock-1', type: 'collaborated_with' }],
  'mock-4': [
    { toId: 'mock-1', type: 'affiliated_with', notes: 'Shared members show up in both groups.' },
    { toId: 'mock-5', type: 'part_of', notes: 'Plays regularly at the venue collective.' },
  ],
  'mock-5': [{ toId: 'mock-4', type: 'affiliated_with' }],
  'mock-6': [{ toId: 'mock-7', type: 'rival_of', notes: 'Friendly gym rivalry.' }],
  'mock-7': [{ toId: 'mock-6', type: 'rival_of' }],
};

function defaultDemoAnalytics(org: Organization): NonNullable<Organization['analytics']> {
  const rel = org.user_relationship ?? 'member';
  const involvement =
    rel === 'founder' ? 96
      : rel === 'leader' ? 88
        : rel === 'member' ? 74
          : rel === 'collaborator' ? 52
            : rel === 'former_member' || rel === 'alumnus' ? 38
              : rel === 'adjacent' ? 36
                : rel === 'fan' || rel === 'aware_of' ? 22
                  : 30;
  const importance = Math.min(
    100,
    Math.round(involvement * 0.55 + (org.confidence ?? 0.7) * 35 + Math.min(org.usage_count, 40))
  );
  return {
    user_involvement_score: involvement,
    user_ranking: involvement >= 80 ? 1 : involvement >= 55 ? 2 : 3,
    user_role_importance: Math.round(involvement * 0.85),
    relevance_score: importance,
    priority_score: Math.round(importance * 0.9),
    importance_score: importance,
    value_score: Math.round(importance * 0.88),
    group_influence_on_user: Math.round(importance * 0.72),
    user_influence_over_group: Math.round(involvement * 0.55),
    cohesion_score: org.member_count >= 4 ? 78 : 52,
    activity_level: org.usage_count >= 20 ? 82 : 48,
    engagement_score: Math.round((involvement + importance) / 2),
    recency_score: 65,
    frequency_score: Math.round(Math.min(org.usage_count * 2, 90)),
    trend: 'stable',
    strengths: org.description ? [org.description.split('.')[0].slice(0, 60)] : ['Part of your social graph'],
    weaknesses: [],
    opportunities: ['Deepen through chat'],
    threats: [],
  };
}

function buildRichDemoProfile(org: Organization): OrganizationProfile {
  const base = deriveOrganizationProfile({
    name: org.name,
    group_type: org.group_type ?? 'other',
    members: org.members?.map((m) => m.character_name),
    context: org.description,
  });

  const storyAchievements = (org.stories ?? []).slice(0, 3).map((s) => s.title);
  const eventActivities = (org.events ?? []).slice(0, 3).map((e) => e.title);
  const memberRoles = (org.members ?? [])
    .slice(0, 4)
    .map((m) => ({ role: m.character_name, responsibility: m.role ?? 'Member' }));

  const hierarchyMeta = org.metadata?.hierarchy as Array<{ name: string; role: string }> | undefined;
  const structureRoles =
    hierarchyMeta?.map((h) => ({ role: h.name, responsibility: h.role })) ??
    (memberRoles.length > 0 ? memberRoles : base.structure?.roles);

  return {
    ...base,
    mission: org.description?.split(/[.!?]/)[0]?.trim() || base.mission,
    short_term_goals:
      org.metadata?.hiring_status === 'background_check_pending'
        ? ['Clear background check', 'Finish onboarding paperwork', 'Confirm start date']
        : org.group_type === 'band'
          ? ['Finish the EP', 'Book the next Roxy show', 'Tighten the setlist']
          : org.group_type === 'family'
            ? ['Stay connected across branches', 'Plan the next gathering']
            : ['Show up consistently', 'Capture what matters in chat'],
    long_term_vision:
      org.group_type === 'company'
        ? `Grow ${org.name} without losing what made it worth building.`
        : org.group_type === 'crew' || org.group_type === 'friend_group'
          ? 'Keep this circle intact as life gets busier.'
          : base.long_term_vision,
    structure: {
      hierarchy:
        hierarchyMeta?.map((h) => `${h.name} (${h.role})`).join(' → ') ??
        base.structure?.hierarchy,
      decision_making: base.structure?.decision_making,
      roles: structureRoles,
    },
    reputation: {
      ...base.reputation,
      achievements: storyAchievements.length > 0 ? storyAchievements : base.reputation?.achievements,
      community_perception:
        org.description?.slice(0, 140) ?? base.reputation?.community_perception,
    },
    resources: {
      ...base.resources,
      facilities: org.location
        ? [org.location, ...(base.resources?.facilities ?? [])].slice(0, 3)
        : base.resources?.facilities,
    },
    activities: [...new Set([...(base.activities ?? []), ...eventActivities])].slice(0, 6),
    communication: {
      ...base.communication,
      channels:
        org.group_type === 'crew'
          ? ['Group text thread', 'Thursday diner table']
          : org.group_type === 'band'
            ? ['Band group chat', 'Rehearsal calendar']
            : base.communication?.channels,
      meeting_schedule:
        org.group_type === 'crew'
          ? 'Every Thursday night'
          : org.group_type === 'club'
            ? 'Bi-weekly workshop sessions'
            : org.group_type === 'martial_arts'
              ? 'Tue / Thu evenings + Saturday open mat'
              : base.communication?.meeting_schedule,
    },
  };
}

/** Fill profiles, analytics, and member counts for demo cards + modals. */
export function enrichOrganizationForDemo(org: Organization): Organization {
  const profile = buildRichDemoProfile(org);
  const members = org.members ?? [];
  const analytics = org.analytics ?? defaultDemoAnalytics(org);

  return {
    ...org,
    profile,
    analytics,
    members,
    member_count: org.member_count ?? members.length,
    metadata: {
      ...org.metadata,
      profile,
      demo_enriched: true,
    },
  };
}

export function getMockOrganizationRelationships(
  org: Organization,
  allOrgs: Organization[],
): { relationships: OrganizationRelationship[]; relatedOrgs: Organization[] } {
  const now = new Date().toISOString();
  const peers = allOrgs.filter((o) => o.id !== org.id);
  const configured = DEMO_ORG_RELATIONSHIP_LINKS[org.id];
  const links =
    configured ??
    peers.slice(0, 2).map((peer, i) => ({
      toId: peer.id,
      type: (['affiliated_with', 'collaborated_with'] as OrgRelationshipType[])[i % 2],
    }));

  const relationships: OrganizationRelationship[] = links
    .filter((link) => peers.some((p) => p.id === link.toId))
    .map((link, i) => ({
      id: `${org.id}-rel-${i}`,
      user_id: 'demo',
      from_org_id: org.id,
      to_org_id: link.toId,
      relationship_type: link.type,
      notes: link.notes,
      created_at: now,
    }));

  return { relationships, relatedOrgs: peers };
}

export function getMockMemberAffiliations(
  org: Organization,
  allOrgs: Organization[],
): Record<string, Array<{ id: string; name: string; group_type?: string }>> {
  const affiliations: Record<string, Array<{ id: string; name: string; group_type?: string }>> = {};
  for (const member of org.members ?? []) {
    const matches = allOrgs
      .filter(
        (other) =>
          other.id !== org.id &&
          (other.members ?? []).some((m) => m.character_name === member.character_name),
      )
      .map((other) => ({
        id: other.id,
        name: other.name,
        group_type: other.group_type ?? other.type,
      }));
    if (matches.length > 0) {
      affiliations[member.id] = matches;
    }
  }
  return affiliations;
}

export function getMockOrganizationFacts(org: Organization): ModalFact[] {
  const facts: ModalFact[] = [];
  facts.push({
    id: `${org.id}-identity`,
    category: 'identity',
    fact: `${org.name} is a ${String(org.group_type ?? org.type ?? 'group').replace(/_/g, ' ')}${org.is_public_entity ? ' and official/public entity' : ''}.`,
    confidence: org.confidence ?? 0.88,
    status: org.metadata?.identity_locked_by_user ? 'corrected' : 'updated',
  });
  facts.push({
    id: `${org.id}-relationship`,
    category: 'relationship',
    fact: `Your relationship to ${org.name} is ${String(org.user_relationship ?? 'referenced').replace(/_/g, ' ')}.`,
    confidence: 0.82,
    status: org.metadata?.identity_locked_by_user ? 'corrected' : 'updated',
  });
  if (org.description) {
    facts.push({
      id: `${org.id}-desc`,
      category: 'general',
      fact: org.description,
      confidence: org.confidence ?? 0.9,
      status: 'updated',
    });
  }
  for (const member of (org.members ?? []).slice(0, 4)) {
    facts.push({
      id: `${org.id}-mem-${member.id}`,
      category: 'association',
      fact: `${member.character_name}${member.role ? ` (${member.role})` : ''} is part of ${org.name}.`,
      confidence: 0.86,
      status: 'updated',
    });
  }
  for (const story of (org.stories ?? []).slice(0, 2)) {
    facts.push({
      id: `${org.id}-story-${story.id}`,
      category: 'experience',
      fact: story.summary ? `${story.title}: ${story.summary}` : story.title,
      confidence: 0.84,
      status: 'updated',
    });
  }
  return facts.length > 0
    ? facts
    : [
        {
          id: `${org.id}-fallback`,
          category: 'general',
          fact: `${org.name} appears in your social graph as a ${org.group_type ?? org.type ?? 'group'}.`,
          confidence: 0.75,
          status: 'updated',
        },
      ];
}

export function getMockOrganizationMentionTrace(org: Organization): MockOrganizationMentionTrace {
  const labels = [...new Set([org.name, ...(org.aliases ?? [])].filter(Boolean))];
  const facts = getMockOrganizationFacts(org);
  const now = new Date();
  const primary = labels[0] ?? org.name;
  const secondary = labels[1] ?? primary;
  const typeLabel = String(org.group_type ?? org.type ?? 'group').replace(/_/g, ' ');
  const snippets = [
    {
      source: 'chat_messages' as const,
      role: 'user',
      title: org.group_type === 'band' ? 'Music identity thread' : 'Group context thread',
      label: primary,
      count: Math.max(1, Math.min(4, org.usage_count || 2)),
      text:
        org.group_type === 'band'
          ? `Actually ${primary} is a band, not a person. I want LoreBook to remember that when it comes up in my story.`
          : `We talked about ${primary} and where it fits in my life, including who belongs and why it matters.`,
      daysAgo: 3,
    },
    {
      source: 'chat_messages' as const,
      role: 'assistant',
      title: org.group_type === 'band' ? 'Music identity thread' : 'Group context thread',
      label: primary,
      count: 1,
      text: `Noted: ${primary} should be treated as a ${typeLabel}. I will use your correction as the canonical identity in demo mode.`,
      daysAgo: 3,
    },
    {
      source: 'conversation_messages' as const,
      role: 'user',
      title: org.group_type === 'band' ? 'Older band memories' : 'Older group memories',
      label: secondary,
      count: 2,
      text:
        org.stories?.[0]?.summary ??
        `${secondary} came up while you were reviewing old story context and deciding what the card should preserve.`,
      daysAgo: 36,
    },
    ...facts.slice(0, 4).map((fact, idx) => ({
      source: 'entity_facts' as const,
      role: null,
      title: 'Extracted identity facts',
      label: labels.find((label) => fact.fact.toLowerCase().includes(label.toLowerCase())) ?? primary,
      count: 1,
      text: fact.fact,
      daysAgo: 8 + idx,
    })),
  ];

  const mentions = snippets.map((snippet, idx) => ({
    id: `${org.id}-mock-mention-${idx}`,
    source: snippet.source,
    source_id: `${org.id}-mock-source-${idx}`,
    session_id: snippet.source === 'entity_facts' ? null : `${org.id}-mock-session-${idx < 2 ? 1 : 2}`,
    thread_title: snippet.title,
    role: snippet.role,
    matched_label: snippet.label,
    occurrence_count: snippet.count,
    snippet: snippet.text,
    created_at: subDays(now, snippet.daysAgo).toISOString(),
  }));

  const source_counts = mentions.reduce<Record<string, number>>(
    (acc, mention) => {
      acc[mention.source] = (acc[mention.source] ?? 0) + mention.occurrence_count;
      return acc;
    },
    { chat_messages: 0, conversation_messages: 0, entity_facts: 0 },
  );

  return {
    labels,
    total_mentions: mentions.reduce((sum, mention) => sum + mention.occurrence_count, 0),
    source_counts,
    mentions,
    facts,
  };
}

export function enrichSkillForDemo(skill: Skill): Skill {
  const withDetails = skill.metadata?.skill_details
    ? skill
    : {
        ...skill,
        metadata: {
          ...skill.metadata,
          skill_details: {
            years_practiced: 2,
            why_started: {
              reason: skill.description ?? `You picked up ${skill.skill_name} through practice and curiosity.`,
              entry_id: 'demo',
              extracted_at: skill.created_at,
            },
            learned_from: [
              {
                character_id: 'dummy-1',
                character_name: 'Alex',
                relationship_type: 'peer' as const,
                first_mentioned: skill.first_mentioned_at,
                evidence_entry_ids: [],
              },
            ],
            practiced_at: [
              {
                location_id: 'dummy-loc-1',
                location_name: 'Home studio',
                practice_count: Math.max(skill.practice_count, 3),
                last_practiced: skill.last_practiced_at ?? skill.updated_at,
                evidence_entry_ids: [],
              },
            ],
          } satisfies SkillMetadata,
        },
      };

  return enrichSkillProfileForStory(withDetails);
}

export function getMockSkillConnections(
  skill: Skill,
  characters: Character[],
): {
  relatedCharacters: Array<{ id: string; name: string; role?: string; relationship?: string }>;
  relatedOrganizations: Array<{ id: string; name: string; type?: string }>;
} {
  const details = skill.metadata?.skill_details as SkillMetadata | undefined;
  const fromDetails = [
    ...(details?.learned_from ?? []).map((t) => ({
      id: t.character_id,
      name: t.character_name,
      role: t.relationship_type,
      relationship: 'Learned from',
    })),
    ...(details?.practiced_with ?? []).map((p) => ({
      id: p.character_id,
      name: p.character_name,
      role: 'Practice partner',
      relationship: `${p.practice_count} sessions`,
    })),
  ];
  if (fromDetails.length > 0) {
    return {
      relatedCharacters: fromDetails,
      relatedOrganizations: [
        { id: 'mock-org-work', name: 'Side projects circle', type: 'crew' },
      ],
    };
  }
  return {
    relatedCharacters: characters.slice(0, 3).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role ?? undefined,
      relationship: 'Mentioned together',
    })),
    relatedOrganizations: [{ id: 'mock-org-1', name: 'The Thursday Crew', type: 'crew' }],
  };
}

export function getMockSkillMilestones(skill: Skill): Achievement[] {
  const now = new Date();
  return [
    {
      id: `mock-ach-${skill.id}-1`,
      user_id: 'demo',
      achievement_name: `${skill.skill_name} streak`,
      achievement_type: 'streak',
      description: 'Practiced consistently for two weeks.',
      icon_name: 'flame',
      criteria_met: {},
      unlocked_at: subDays(now, 14).toISOString(),
      xp_reward: 50,
      skill_xp_rewards: { [skill.id]: 35 },
      rarity: 'uncommon',
      metadata: {},
      created_at: subDays(now, 14).toISOString(),
    },
    {
      id: `mock-ach-${skill.id}-2`,
      user_id: 'demo',
      achievement_name: `Level ${skill.current_level} reached`,
      achievement_type: 'skill_level',
      description: `Crossed level ${skill.current_level} in ${skill.skill_name}.`,
      icon_name: 'star',
      criteria_met: {},
      unlocked_at: subDays(now, 30).toISOString(),
      xp_reward: 100,
      skill_xp_rewards: { [skill.id]: 60 },
      rarity: 'rare',
      metadata: {},
      created_at: subDays(now, 30).toISOString(),
    },
  ];
}

export function getMockSkillTimeline(skill: Skill): Array<{
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
}> {
  const details = skill.metadata?.skill_details;
  const events: Array<{ id: string; type: string; title: string; description: string; date: string }> = [];

  if (details?.why_started) {
    events.push({
      id: `tl-${skill.id}-why`,
      type: 'journal_entry',
      title: 'Why you started',
      description: details.why_started.reason,
      date: details.why_started.extracted_at ?? skill.first_mentioned_at,
    });
  }

  if (details?.learned_when) {
    events.push({
      id: `tl-${skill.id}-learned`,
      type: 'journal_entry',
      title: `Started learning ${skill.skill_name}`,
      description: details.learned_when.context ?? skill.description ?? 'First serious practice logged.',
      date: details.learned_when.date,
    });
  } else {
    events.push({
      id: `tl-${skill.id}-first`,
      type: 'journal_entry',
      title: `First mention of ${skill.skill_name}`,
      description: skill.description ?? 'Showed up in your journal for the first time.',
      date: skill.first_mentioned_at,
    });
  }

  if (skill.last_practiced_at) {
    events.push({
      id: `tl-${skill.id}-practice`,
      type: 'journal_entry',
      title: 'Recent practice',
      description: `${skill.practice_count} total sessions — last one logged recently.`,
      date: skill.last_practiced_at,
    });
  }

  events.push({
    id: `tl-${skill.id}-level`,
    type: 'achievement',
    title: `Level ${skill.current_level} reached`,
    description: `${skill.total_xp.toLocaleString()} XP total · ${skill.xp_to_next_level} XP to next level.`,
    date: skill.updated_at,
  });

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMockSkillPhotos(skill: Skill): Array<{
  id: string;
  photoUrl: string;
  thumbnailUrl?: string;
  date: string;
  summary?: string;
  locationName?: string;
  people?: string[];
}> {
  const seed = encodeURIComponent(skill.skill_name);
  return [
    {
      id: `photo-${skill.id}-1`,
      photoUrl: `https://picsum.photos/seed/${seed}a/480/320`,
      thumbnailUrl: `https://picsum.photos/seed/${seed}a/240/160`,
      date: skill.last_practiced_at ?? skill.updated_at,
      summary: `Practice session for ${skill.skill_name}`,
      locationName: 'Home studio',
    },
  ];
}

export function buildMockMemoryModalData(
  memory: MemoryCard,
  allMemories: MemoryCard[] = [],
): {
  fullContent: string;
  linkedMemories: LinkedMemory[];
  temporalMemories: MemoryCard[];
  similarMemories: MemoryCard[];
  insights: Record<string, unknown>;
} {
  const fullContent =
    memory.content ||
    `${memory.title}. ${memory.tags.length ? `Tagged: ${memory.tags.join(', ')}.` : ''}`;

  const others = allMemories.filter((m) => m.id !== memory.id);
  const linkedMemories: LinkedMemory[] = others.slice(0, 4).map((entry, idx) => ({
    id: entry.id,
    title: entry.title,
    date: entry.date,
    linkType: idx === 0 ? 'tag' : 'temporal',
    linkLabel: idx === 0 && memory.tags[0] ? `Tagged: ${memory.tags[0]}` : 'Nearby in time',
    daysDiff: idx + 1,
  }));

  const temporalMemories = others
    .filter((m) => Math.abs(new Date(m.date).getTime() - new Date(memory.date).getTime()) < 8 * 86400000)
    .slice(0, 5);

  const similarMemories = others
    .filter((m) => m.tags.some((t) => memory.tags.includes(t)))
    .slice(0, 4);

  return {
    fullContent,
    linkedMemories,
    temporalMemories: temporalMemories.length ? temporalMemories : others.slice(0, 3),
    similarMemories: similarMemories.length ? similarMemories : others.slice(0, 3),
    insights: {
      themes: memory.tags.slice(0, 3),
      mood: memory.mood ?? 'reflective',
      people: memory.characters ?? [],
      summary: memory.content?.slice(0, 180) ?? memory.title,
    },
  };
}

export function mergeQuestHistoryWithReflections(
  quest: Quest,
  reflections: QuestHistory[],
): QuestHistory[] {
  return [...getMockQuestHistory(quest), ...reflections].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
