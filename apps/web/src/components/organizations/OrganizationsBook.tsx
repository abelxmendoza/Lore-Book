// =====================================================
// ORGANIZATIONS BOOK
// Purpose: Full-page book component listing all organizations
// Enhanced with advanced filters and optimized for large datasets
// =====================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { Building2, Music, Zap, Globe, RefreshCw, ChevronLeft, ChevronRight, BookOpen, Users, Calendar, Hash, Sparkles, Plus, X, Heart, TreePine, Network } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { OrganizationProfileCard, type Organization, type OrganizationMember, type OrganizationStory, type OrganizationEvent, type OrganizationLocation } from './OrganizationProfileCard';
import { OrganizationDetailModal } from './OrganizationDetailModal';
import { OrganizationGroupNetwork } from './OrganizationGroupNetwork';
import { GroupSuggestions } from '../groups/GroupSuggestions';
import { deriveOrganizationProfile } from '../../lib/organizationProfile';
import { ErrorBoundary } from '../ErrorBoundary';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { Modal } from '../ui/modal';
import { subDays } from 'date-fns';

const ITEMS_PER_PAGE = 24;

type OrganizationCategory =
  | 'all' | 'recent'
  | 'crews' | 'bands' | 'scenes' | 'communities'
  | 'companies' | 'clubs' | 'nonprofits'
  | 'sports_teams' | 'family' | 'public_entities';

type SortOption = 'name_asc' | 'name_desc' | 'usage_desc' | 'usage_asc' | 'confidence_desc' | 'confidence_asc' | 'recent' | 'importance_desc' | 'involvement_desc' | 'priority_desc' | 'value_desc';

type GroupCandidate = {
  id: string;
  proposed_name?: string;
  detected_members?: string[];
  detected_member_ids?: string[];
  suggested_group_type?: Organization['group_type'];
  suggested_user_relationship?: Organization['user_relationship'];
  suggested_membership_model?: Organization['membership_model'];
  is_public_entity?: boolean;
  confidence?: number;
  occurrence_count?: number;
  context?: string;
  created_organization_id?: string;
  updated_at?: string;
  created_at?: string;
};

const GROUP_TYPES: Organization['group_type'][] = [
  'friend_group', 'band', 'sports_team', 'company', 'club', 'nonprofit',
  'family', 'martial_arts', 'scene', 'crew', 'collective', 'community',
  'institution', 'public_entity', 'other',
];

const LEGACY_TYPES: Organization['type'][] = [
  'friend_group', 'company', 'sports_team', 'club', 'nonprofit',
  'affiliation', 'family', 'martial_arts', 'other',
];

const MEMBERSHIP_MODELS: Organization['membership_model'][] = ['strict', 'fuzzy', 'none'];
const USER_RELATIONSHIPS: Organization['user_relationship'][] = [
  'founder', 'leader', 'member', 'former_member', 'collaborator',
  'adjacent', 'fan', 'aware_of', 'referenced', 'alumnus',
];
const ORG_STATUSES: Organization['status'][] = ['active', 'inactive', 'dissolved'];

const isGroupType = (value: unknown): value is Organization['group_type'] =>
  typeof value === 'string' && GROUP_TYPES.includes(value as Organization['group_type']);

const isLegacyType = (value: unknown): value is Organization['type'] =>
  typeof value === 'string' && LEGACY_TYPES.includes(value as Organization['type']);

const isMembershipModel = (value: unknown): value is Organization['membership_model'] =>
  typeof value === 'string' && MEMBERSHIP_MODELS.includes(value as Organization['membership_model']);

const isUserRelationship = (value: unknown): value is Organization['user_relationship'] =>
  typeof value === 'string' && USER_RELATIONSHIPS.includes(value as Organization['user_relationship']);

const isOrgStatus = (value: unknown): value is Organization['status'] =>
  typeof value === 'string' && ORG_STATUSES.includes(value as Organization['status']);

const groupTypeFrom = (org: Partial<Organization>): Organization['group_type'] => {
  if (isGroupType(org.group_type)) return org.group_type;
  if (isGroupType(org.type)) return org.type;
  if (org.is_public_entity) return 'public_entity';
  return 'other';
};

const normalizeOrganization = (raw: Partial<Organization>): Organization => {
  const now = new Date().toISOString();
  const groupType = groupTypeFrom(raw);
  const members = Array.isArray(raw.members) ? raw.members : [];
  const stories = Array.isArray(raw.stories) ? raw.stories : [];
  const events = Array.isArray(raw.events) ? raw.events : [];
  const locations = Array.isArray(raw.locations) ? raw.locations : [];
  const metadata = raw.metadata ?? {};
  let profile = raw.profile ?? metadata.profile;

  if (!profile) {
    try {
      profile = deriveOrganizationProfile({
        name: raw.name ?? 'Untitled Group',
        group_type: groupType,
        members: members.map(member => member.character_name),
        context: raw.description,
      });
    } catch {
      profile = undefined;
    }
  }

  return {
    id: raw.id ?? `org-${raw.name ?? 'unknown'}`,
    name: raw.name ?? 'Untitled Group',
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    type: isLegacyType(raw.type) ? raw.type : isLegacyType(groupType) ? groupType : 'other',
    group_type: groupType,
    membership_model: isMembershipModel(raw.membership_model) ? raw.membership_model : groupType === 'public_entity' ? 'none' : 'strict',
    user_relationship: isUserRelationship(raw.user_relationship) ? raw.user_relationship : groupType === 'public_entity' ? 'referenced' : 'member',
    is_public_entity: raw.is_public_entity ?? groupType === 'public_entity',
    founded_year: raw.founded_year,
    dissolved_year: raw.dissolved_year,
    generations: raw.generations,
    family_branches: raw.family_branches,
    hierarchy_system_id: raw.hierarchy_system_id,
    hierarchy_enabled: raw.hierarchy_enabled,
    description: raw.description,
    location: raw.location,
    founded_date: raw.founded_date,
    status: isOrgStatus(raw.status) ? raw.status : 'active',
    members,
    stories,
    events,
    locations,
    member_count: raw.member_count ?? members.length,
    usage_count: raw.usage_count ?? events.length + stories.length,
    confidence: raw.confidence ?? 1,
    last_seen: raw.last_seen ?? raw.updated_at ?? raw.created_at ?? now,
    created_at: raw.created_at ?? now,
    updated_at: raw.updated_at ?? raw.created_at ?? now,
    metadata,
    profile,
    analytics: raw.analytics,
  };
};

const candidateToPreviewOrganization = (candidate: GroupCandidate): Organization => {
  const now = new Date().toISOString();
  const groupType = isGroupType(candidate.suggested_group_type) ? candidate.suggested_group_type : 'other';
  const members = (candidate.detected_members ?? []).map((name, index): OrganizationMember => ({
    id: `candidate-${candidate.id}-member-${index}`,
    character_id: candidate.detected_member_ids?.[index],
    character_name: name,
    status: 'active',
  }));
  const fallbackName = members.length >= 2
    ? `${members.slice(0, 2).map(member => member.character_name.split(' ')[0]).join(' & ')} Group`
    : 'Detected Group';

  return normalizeOrganization({
    id: candidate.created_organization_id ?? `candidate-${candidate.id}`,
    name: candidate.proposed_name ?? fallbackName,
    aliases: [],
    type: 'other',
    group_type: groupType,
    membership_model: isMembershipModel(candidate.suggested_membership_model)
      ? candidate.suggested_membership_model
      : candidate.is_public_entity ? 'none' : 'fuzzy',
    user_relationship: isUserRelationship(candidate.suggested_user_relationship)
      ? candidate.suggested_user_relationship
      : candidate.is_public_entity ? 'referenced' : 'aware_of',
    is_public_entity: candidate.is_public_entity ?? groupType === 'public_entity',
    description: candidate.context,
    status: 'active',
    members,
    member_count: members.length,
    usage_count: candidate.occurrence_count ?? 0,
    confidence: candidate.confidence ?? 0.6,
    last_seen: candidate.updated_at ?? candidate.created_at ?? now,
    created_at: candidate.created_at ?? now,
    updated_at: candidate.updated_at ?? candidate.created_at ?? now,
    metadata: {
      preview_candidate: true,
      group_candidate_id: candidate.id,
    },
  });
};

const mergeOrganizationsAndCandidates = (
  organizations: Organization[],
  candidates: GroupCandidate[]
): Organization[] => {
  const normalizedOrgs = organizations.map(normalizeOrganization);
  const orgIds = new Set(normalizedOrgs.map(org => org.id));
  const orgNames = new Set(normalizedOrgs.map(org => org.name.toLowerCase()));
  const candidatePreviews = candidates
    .filter(candidate => !candidate.created_organization_id || !orgIds.has(candidate.created_organization_id))
    .map(candidateToPreviewOrganization)
    .filter(candidateOrg => !orgIds.has(candidateOrg.id) && !orgNames.has(candidateOrg.name.toLowerCase()));

  return [...normalizedOrgs, ...candidatePreviews];
};

// ── Mock analytics helpers ─────────────────────────────────────────────
const mkAnalytics = (
  involvement: number,
  importance: number,
  trend: 'increasing' | 'stable' | 'decreasing',
  strengths: string[],
  weaknesses: string[] = []
): Organization['analytics'] => ({
  user_involvement_score: involvement,
  user_ranking: involvement >= 80 ? 1 : involvement >= 60 ? 2 : 3,
  user_role_importance: Math.round(involvement * 0.9),
  relevance_score: Math.round(importance * 0.95),
  priority_score: Math.round(importance * 0.85),
  importance_score: importance,
  value_score: Math.round(importance * 0.9),
  group_influence_on_user: Math.round(importance * 0.7),
  user_influence_over_group: Math.round(involvement * 0.6),
  cohesion_score: involvement >= 70 ? 82 : 55,
  activity_level: trend === 'increasing' ? 88 : trend === 'stable' ? 65 : 38,
  engagement_score: Math.round((involvement + importance) / 2),
  recency_score: trend === 'increasing' ? 90 : trend === 'stable' ? 65 : 30,
  frequency_score: Math.round(importance * 0.75),
  trend,
  strengths,
  weaknesses,
  opportunities: ['Potential for deeper engagement'],
  threats: [],
});

const culturalAnalytics = (influence: number): Organization['analytics'] => ({
  user_involvement_score: 0,
  user_ranking: 0,
  user_role_importance: 0,
  relevance_score: influence,
  priority_score: 0,
  importance_score: influence,
  value_score: influence,
  group_influence_on_user: influence,
  user_influence_over_group: 0,
  cohesion_score: 0,
  activity_level: 0,
  engagement_score: 0,
  recency_score: 0,
  frequency_score: 0,
  trend: 'stable',
  strengths: [],
  weaknesses: [],
  opportunities: [],
  threats: [],
});

// ── Comprehensive mock organizations ──────────────────────────────────
const MOCK_ORGANIZATIONS: Organization[] = [

  // ── CREWS / FRIEND GROUPS ──────────────────────────────────────────

  {
    id: 'mock-1',
    name: 'The Thursday Crew',
    aliases: ['Thursday people', 'Thursday gang'],
    type: 'other', group_type: 'crew',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: "We started meeting at the diner every Thursday back in 2021 and never stopped. Sarah, Marcus, Jordan, and me — four people who don't know how to end a night early.",
    location: 'Rosie\'s Diner, East Side',
    status: 'active',
    member_count: 4,
    usage_count: 38,
    confidence: 0.94,
    last_seen: subDays(new Date(), 4).toISOString(),
    created_at: subDays(new Date(), 180).toISOString(),
    updated_at: subDays(new Date(), 4).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Sarah Chen', role: 'Instigator', status: 'active' },
      { id: 'm2', character_name: 'Marcus Johnson', role: 'Designated Driver (rotation)', status: 'active' },
      { id: 'm3', character_name: 'Jordan Kim', role: 'Menu critic', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'The Night the Power Went Out', summary: 'We stayed until 2am with just candles. Marcus kept doing shadow puppets. One of the best nights.', date: subDays(new Date(), 45).toISOString() },
      { id: 's2', title: 'Jordan\'s Birthday Ambush', summary: 'We told her it was just a normal Thursday. She had no idea. She cried. Then we all cried.', date: subDays(new Date(), 90).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Regular Thursday', date: subDays(new Date(), 4).toISOString(), type: 'social' },
      { id: 'e2', title: 'Holiday dinner', date: subDays(new Date(), 30).toISOString(), type: 'social' },
    ],
    locations: [{ id: 'l1', location_name: "Rosie's Diner", visit_count: 34, last_visited: subDays(new Date(), 4).toISOString() }],
    analytics: mkAnalytics(88, 91, 'stable', ['Core emotional anchor', 'Consistent frequency', 'Authentic space']),
  },

  {
    id: 'mock-2',
    name: 'College Friends',
    aliases: ['College crew', 'The originals'],
    type: 'friend_group', group_type: 'friend_group',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: 'Six people from the same dorm floor freshman year. Half of us ended up in the same city, the other half are scattered. We try to do a trip once a year.',
    location: 'Various',
    founded_year: 2018,
    status: 'active',
    member_count: 6,
    usage_count: 22,
    confidence: 0.88,
    last_seen: subDays(new Date(), 18).toISOString(),
    created_at: subDays(new Date(), 365 * 5).toISOString(),
    updated_at: subDays(new Date(), 18).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Emma Wilson', role: 'Group chat admin', status: 'active' },
      { id: 'm2', character_name: 'Chris Taylor', role: 'Trip planner', status: 'active' },
      { id: 'm3', character_name: 'Reese Martinez', role: 'Photographer', status: 'active' },
      { id: 'm4', character_name: 'Lisa Park', role: 'The responsible one', status: 'active' },
      { id: 'm5', character_name: 'David Lee', role: 'Chaos agent', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Portland Trip \'23', summary: 'Five days, three fights about restaurants, one perfect hike. Exactly what we needed.', date: subDays(new Date(), 120).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Annual trip planning call', date: subDays(new Date(), 18).toISOString(), type: 'meeting' },
    ],
    locations: [
      { id: 'l1', location_name: 'Portland, OR', visit_count: 1, last_visited: subDays(new Date(), 120).toISOString() },
    ],
    analytics: mkAnalytics(72, 84, 'stable', ['Long shared history', 'Annual reunion tradition'], ['Geographic distance']),
  },

  {
    id: 'mock-3',
    name: 'Neighbors on Maple',
    aliases: ['The block', 'Maple people'],
    type: 'friend_group', group_type: 'crew',
    membership_model: 'fuzzy', user_relationship: 'adjacent', is_public_entity: false,
    description: "The people on my street who know each other's names. Not close friends exactly, but we look out for each other's packages and share tools.",
    location: 'Maple Street',
    status: 'active',
    member_count: 8,
    usage_count: 9,
    confidence: 0.71,
    last_seen: subDays(new Date(), 12).toISOString(),
    created_at: subDays(new Date(), 400).toISOString(),
    updated_at: subDays(new Date(), 12).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Dave from across the street', role: 'Neighborhood watch', status: 'active' },
      { id: 'm2', character_name: 'Linda & Frank', role: 'The older couple', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Block party last summer', summary: 'Someone brought a smoker. It was actually a great afternoon. Talked to Dave for real for the first time.', date: subDays(new Date(), 200).toISOString() },
    ],
    events: [{ id: 'e1', title: 'Block cleanup day', date: subDays(new Date(), 12).toISOString(), type: 'social' }],
    locations: [{ id: 'l1', location_name: 'Maple Street', visit_count: 8, last_visited: subDays(new Date(), 12).toISOString() }],
    analytics: mkAnalytics(35, 42, 'stable', ['Low-maintenance proximity'], ['Not close enough to rely on']),
  },

  // ── BANDS / MUSIC ──────────────────────────────────────────────────

  {
    id: 'mock-4',
    name: 'The Midnight Circuit',
    aliases: ['Midnight Circuit', 'TMC'],
    type: 'other', group_type: 'band',
    membership_model: 'strict', user_relationship: 'founder', is_public_entity: false,
    description: 'The band I started with Marcus in 2021. Post-punk, sort of. We play about once a month at the Roxy. Working on our first proper EP right now.',
    location: 'The Roxy, East Side',
    founded_year: 2021,
    status: 'active',
    member_count: 4,
    usage_count: 47,
    confidence: 0.97,
    last_seen: subDays(new Date(), 2).toISOString(),
    created_at: subDays(new Date(), 365 * 3).toISOString(),
    updated_at: subDays(new Date(), 2).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Marcus Johnson', role: 'Lead guitar', status: 'active' },
      { id: 'm2', character_name: 'Riley Okonkwo', role: 'Drums', status: 'active' },
      { id: 'm3', character_name: 'Cam Reyes', role: 'Bass', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'First show at the Roxy', summary: 'Twenty people. Three of them were family. We still played like it was sold out. Something clicked that night.', date: subDays(new Date(), 300).toISOString() },
      { id: 's2', title: 'The EP argument', summary: 'Marcus wanted distortion everywhere. I wanted space. We compromised and the track is better for it.', date: subDays(new Date(), 30).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Rehearsal', date: subDays(new Date(), 2).toISOString(), type: 'meeting' },
      { id: 'e2', title: 'Roxy show', date: subDays(new Date(), 14).toISOString(), type: 'other' },
      { id: 'e3', title: 'EP recording session', date: subDays(new Date(), 21).toISOString(), type: 'work' },
    ],
    locations: [
      { id: 'l1', location_name: 'The Roxy', visit_count: 18, last_visited: subDays(new Date(), 14).toISOString() },
      { id: 'l2', location_name: 'Marcus\'s garage', visit_count: 40, last_visited: subDays(new Date(), 2).toISOString() },
    ],
    analytics: mkAnalytics(96, 94, 'increasing', ['Creative core of my week', 'High output right now', 'Real momentum building']),
  },

  {
    id: 'mock-5',
    name: 'Ghost Signal',
    aliases: ['Ghost Sig'],
    type: 'other', group_type: 'band',
    membership_model: 'strict', user_relationship: 'collaborator', is_public_entity: false,
    description: "Riley's other project. Ambient, mostly instrumental. I've played guest bass on two tracks. They don't really need a permanent bassist but I like being in the room.",
    location: 'Various studios',
    founded_year: 2020,
    status: 'active',
    member_count: 3,
    usage_count: 14,
    confidence: 0.82,
    last_seen: subDays(new Date(), 22).toISOString(),
    created_at: subDays(new Date(), 500).toISOString(),
    updated_at: subDays(new Date(), 22).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Riley Okonkwo', role: 'Synths / production', status: 'active' },
      { id: 'm2', character_name: 'Priya Nair', role: 'Violin, piano', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Session at Analog Sound', summary: "Riley let me sit in on the full recording day. Watched how she layers. Took a lot of notes.", date: subDays(new Date(), 60).toISOString() },
    ],
    events: [{ id: 'e1', title: 'Guest session', date: subDays(new Date(), 22).toISOString(), type: 'work' }],
    locations: [{ id: 'l1', location_name: 'Analog Sound Studio', visit_count: 3, last_visited: subDays(new Date(), 22).toISOString() }],
    analytics: mkAnalytics(28, 58, 'stable', ['Learning opportunity', 'Broadens my network']),
  },

  // ── SCENES ────────────────────────────────────────────────────────

  {
    id: 'mock-6',
    name: 'Local Punk Scene',
    aliases: ['The scene', 'Eastside punk'],
    type: 'other', group_type: 'scene',
    membership_model: 'fuzzy', user_relationship: 'adjacent', is_public_entity: false,
    description: 'The underground circuit of DIY venues, house shows, and basement gigs in this city. I go to shows regularly and know most of the faces. Nobody has a card but we all know who belongs.',
    location: 'East Side venues',
    founded_year: 2015,
    status: 'active',
    member_count: 0,
    usage_count: 31,
    confidence: 0.76,
    last_seen: subDays(new Date(), 7).toISOString(),
    created_at: subDays(new Date(), 365 * 4).toISOString(),
    updated_at: subDays(new Date(), 7).toISOString(),
    metadata: {},
    members: [],
    stories: [
      { id: 's1', title: 'The show at the warehouse on 5th', summary: 'No PA, no stage, just amps and a hundred people sweating. Exactly what a punk show should be.', date: subDays(new Date(), 60).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Show at The Pit', date: subDays(new Date(), 7).toISOString(), type: 'social' },
      { id: 'e2', title: 'House show on Elm', date: subDays(new Date(), 30).toISOString(), type: 'social' },
    ],
    locations: [
      { id: 'l1', location_name: 'The Pit (venue)', visit_count: 14, last_visited: subDays(new Date(), 7).toISOString() },
    ],
    analytics: mkAnalytics(42, 68, 'stable', ['Cultural identity anchor', 'Discovery channel for music'], ['No formal membership']),
  },

  {
    id: 'mock-7',
    name: 'Indie Film Scene',
    aliases: ['Film circle', 'The film people'],
    type: 'other', group_type: 'scene',
    membership_model: 'fuzzy', user_relationship: 'aware_of', is_public_entity: false,
    description: "The indie filmmakers and critics who rotate through the same festivals, screenings, and Letterboxd lists. I'm adjacent through a couple of people but not really embedded.",
    location: 'Various festivals & venues',
    status: 'active',
    member_count: 0,
    usage_count: 8,
    confidence: 0.63,
    last_seen: subDays(new Date(), 45).toISOString(),
    created_at: subDays(new Date(), 365 * 2).toISOString(),
    updated_at: subDays(new Date(), 45).toISOString(),
    metadata: {},
    members: [],
    stories: [],
    events: [{ id: 'e1', title: 'Screening at the Alamo', date: subDays(new Date(), 45).toISOString(), type: 'social' }],
    locations: [],
    analytics: culturalAnalytics(45),
  },

  // ── FAMILY ────────────────────────────────────────────────────────

  {
    id: 'mock-8',
    name: 'The Ashford-Luna Family',
    aliases: ['Family', 'Home', 'My family', 'Ashford Family', 'Luna Family'],
    type: 'family', group_type: 'family',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: 'Three generations across the Ashford and Luna sides. Aunt Maribel, Nico, Nana Elena, parents, cousins, and the relatives who turn ordinary family stories into lore.',
    location: 'Cedar Falls, CA',
    founded_year: 1968,
    generations: 3,
    family_branches: ['maternal', 'paternal'],
    status: 'active',
    member_count: 14,
    usage_count: 52,
    confidence: 1.0,
    last_seen: subDays(new Date(), 6).toISOString(),
    created_at: subDays(new Date(), 365 * 30).toISOString(),
    updated_at: subDays(new Date(), 6).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Nana Elena', role: 'Elder / family memory keeper', status: 'active' },
      { id: 'm2', character_name: 'Aunt Maribel', role: 'Aunt / Hallway Guardian', status: 'active' },
      { id: 'm3', character_name: 'Nico', role: 'Cousin', status: 'active' },
      { id: 'm4', character_name: 'Mom', role: 'Matriarch', status: 'active' },
      { id: 'm5', character_name: 'Dad', role: 'Patriarch', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Christmas dinner disaster, 2022', summary: 'The oven broke at 3pm. We pivoted to tamales from the neighbor. Honestly better than anything we planned.', date: subDays(new Date(), 365).toISOString() },
      { id: 's2', title: 'Dad\'s 60th', summary: 'The whole family in one backyard for the first time since before the pandemic. Complicated and loud and exactly right.', date: subDays(new Date(), 200).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Sunday call with Mom', date: subDays(new Date(), 6).toISOString(), type: 'social' },
    ],
    locations: [{ id: 'l1', location_name: 'Cedar Falls, CA', visit_count: 12, last_visited: subDays(new Date(), 60).toISOString() }],
    analytics: mkAnalytics(85, 97, 'stable', ['Unconditional foundation', 'Longest relationship of my life'], ['Distance', 'Old dynamics']),
  },

  // ── PROFESSIONAL / COMPANIES ───────────────────────────────────────

  {
    id: 'mock-19',
    name: 'BrightHire Staffing',
    aliases: ['BrightHire Staffing agency', 'BrightHire Staffing recruiting'],
    type: 'company', group_type: 'company',
    membership_model: 'fuzzy', user_relationship: 'adjacent', is_public_entity: false,
    description: 'Recruiting and staffing agency connected to the Northstar Logistics hiring process. Dana and Reese are professional contacts tied to onboarding, paperwork, identity verification, and background check updates.',
    location: 'Remote / recruiting pipeline',
    status: 'active',
    member_count: 2,
    usage_count: 14,
    confidence: 0.94,
    last_seen: subDays(new Date(), 2).toISOString(),
    created_at: subDays(new Date(), 60).toISOString(),
    updated_at: subDays(new Date(), 2).toISOString(),
    metadata: {
      hierarchy: [
        { name: 'Dana', role: 'Recruiting contact', importance: 'primary_contact' },
        { name: 'Reese', role: 'Agency contact', importance: 'supporting_contact' },
      ],
    },
    members: [
      { id: 'm1', character_name: 'Dana', role: 'Recruiting contact', status: 'active', notes: 'Sent paperwork and handled identity verification follow-up.' },
      { id: 'm2', character_name: 'Reese', role: 'Agency contact', status: 'active', notes: 'Professional connection from the BrightHire Staffing hiring pipeline.' },
    ],
    stories: [
      { id: 's1', title: 'Identity verification call', summary: 'Dana said the rest of the paperwork would come soon while the background check continued.', date: subDays(new Date(), 2).toISOString(), related_members: ['Dana'] },
    ],
    events: [{ id: 'e1', title: 'Identity verification video call', date: subDays(new Date(), 2).toISOString(), type: 'work' }],
    locations: [],
    analytics: mkAnalytics(62, 78, 'increasing', ['Clear professional context', 'Hiring pipeline signal'], ['Temporary relationship', 'Dependent on onboarding updates']),
  },

  {
    id: 'mock-20',
    name: 'Northstar Logistics',
    aliases: ['Northstar Logistics job', 'Northstar Logistics onboarding'],
    type: 'company', group_type: 'company',
    membership_model: 'fuzzy', user_relationship: 'adjacent', is_public_entity: false,
    description: 'The company tied to the expected start date, background check, and onboarding pipeline. Connected to BrightHire Staffing through the recruiting workflow.',
    location: 'Work / onboarding',
    status: 'active',
    member_count: 0,
    usage_count: 12,
    confidence: 0.92,
    last_seen: subDays(new Date(), 2).toISOString(),
    created_at: subDays(new Date(), 45).toISOString(),
    updated_at: subDays(new Date(), 2).toISOString(),
    metadata: {
      related_groups: ['BrightHire Staffing'],
      hiring_status: 'background_check_pending',
    },
    members: [],
    stories: [
      { id: 's1', title: 'Background check still processing', summary: 'Expected start date depends on the remaining paperwork and background check clearing.', date: subDays(new Date(), 2).toISOString() },
    ],
    events: [{ id: 'e1', title: 'Expected onboarding follow-up', date: subDays(new Date(), 7).toISOString(), type: 'work' }],
    locations: [],
    analytics: mkAnalytics(48, 82, 'increasing', ['Important career opportunity', 'Strong recency'], ['Unconfirmed start state']),
  },

  // ── COMMUNITIES / SCHOOLS ──────────────────────────────────────────

  {
    id: 'mock-21',
    name: 'Code Harbor Academy',
    aliases: ['Code Harbor', 'Code Harbor bootcamp', 'Adrian Patel community'],
    type: 'other', group_type: 'community',
    membership_model: 'fuzzy', user_relationship: 'alumnus', is_public_entity: false,
    description: 'Coding bootcamp, creator-led school, and developer community associated with Adrian Patel. The demo shows the hierarchy between core leadership, teachers/mentors, and broader community members.',
    location: 'Online',
    status: 'active',
    member_count: 1200,
    usage_count: 24,
    confidence: 0.96,
    last_seen: subDays(new Date(), 20).toISOString(),
    created_at: subDays(new Date(), 365 * 4).toISOString(),
    updated_at: subDays(new Date(), 20).toISOString(),
    metadata: {
      hierarchy: [
        { name: 'Adrian Patel', role: 'Founder / teacher / mentor', influence: 'core' },
        { name: 'Core team', role: 'Operations and curriculum', influence: 'core' },
        { name: 'Students and alumni', role: 'Developer community', influence: 'community' },
      ],
      community_type: 'developer_bootcamp',
    },
    members: [
      { id: 'm1', character_name: 'Adrian Patel', role: 'Founder / teacher / mentor', status: 'active', notes: 'Adrian is the first name; Patel is the last name.' },
      { id: 'm2', character_name: 'Core team', role: 'Bootcamp operations', status: 'active' },
      { id: 'm3', character_name: 'Students and alumni', role: 'Developer community', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Coding bootcamp chapter', summary: 'A school and community context where Adrian Patel was a teacher and mentor.', date: subDays(new Date(), 365 * 3).toISOString(), related_members: ['Adrian Patel'] },
    ],
    events: [{ id: 'e1', title: 'Bootcamp cohort', date: subDays(new Date(), 365 * 3).toISOString(), type: 'meeting' }],
    locations: [{ id: 'l1', location_name: 'Online bootcamp', visit_count: 40, last_visited: subDays(new Date(), 365 * 3).toISOString() }],
    analytics: mkAnalytics(74, 86, 'stable', ['Teacher/mentor relationship', 'Developer community identity', 'Clear hierarchy']),
  },

  // ── MARTIAL ARTS ──────────────────────────────────────────────────

  {
    id: 'mock-9',
    name: 'Eastside BJJ',
    aliases: ['The gym', 'BJJ crew'],
    type: 'martial_arts', group_type: 'martial_arts',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: 'Brazilian jiu-jitsu gym I started at six months ago. Coach Lima runs a tight ship. I show up Tuesday/Thursday nights and Saturday mornings.',
    location: 'Eastside, 3rd Ave',
    founded_year: 2012,
    status: 'active',
    member_count: 28,
    usage_count: 26,
    confidence: 0.91,
    last_seen: subDays(new Date(), 3).toISOString(),
    created_at: subDays(new Date(), 180).toISOString(),
    updated_at: subDays(new Date(), 3).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Coach Lima', role: 'Head instructor', status: 'active' },
      { id: 'm2', character_name: 'Andre', role: 'Training partner', status: 'active' },
      { id: 'm3', character_name: 'Tanya', role: 'Purple belt', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'First stripe on my white belt', summary: 'Six months of embarrassing myself on the mat. Felt like something finally clicked this week. Lima noticed.', date: subDays(new Date(), 14).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Tuesday class', date: subDays(new Date(), 3).toISOString(), type: 'other' },
      { id: 'e2', title: 'Saturday open mat', date: subDays(new Date(), 5).toISOString(), type: 'other' },
    ],
    locations: [{ id: 'l1', location_name: 'Eastside BJJ Gym', visit_count: 48, last_visited: subDays(new Date(), 3).toISOString() }],
    analytics: mkAnalytics(78, 82, 'increasing', ['Physical discipline', 'Consistent weekly structure', 'Humility practice']),
  },

  // ── COMPANIES ─────────────────────────────────────────────────────

  {
    id: 'mock-10',
    name: 'Pixel & Thread Studio',
    aliases: ['Pixel & Thread', 'P&T'],
    type: 'company', group_type: 'company',
    membership_model: 'strict', user_relationship: 'founder', is_public_entity: false,
    description: 'The design studio I co-founded with Emma two years ago. Brand identity, motion, some editorial. Small on purpose.',
    location: 'DTLA',
    founded_year: 2022,
    status: 'active',
    member_count: 4,
    usage_count: 61,
    confidence: 0.99,
    last_seen: subDays(new Date(), 1).toISOString(),
    created_at: subDays(new Date(), 365 * 2).toISOString(),
    updated_at: subDays(new Date(), 1).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Emma Wilson', role: 'Co-founder, Creative Director', status: 'active' },
      { id: 'm2', character_name: 'Kenji', role: 'Motion designer', status: 'active' },
      { id: 'm3', character_name: 'Priya', role: 'Account manager', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'First big client', summary: 'Signed a six-month retainer with a startup we actually believed in. That changed the whole energy in the studio.', date: subDays(new Date(), 180).toISOString() },
      { id: 's2', title: 'The pitch we lost', summary: 'Lost a large brand rebrand to a bigger agency. Good learning. We were too experimental for their comfort level.', date: subDays(new Date(), 60).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Studio standup', date: subDays(new Date(), 1).toISOString(), type: 'meeting' },
      { id: 'e2', title: 'Client presentation', date: subDays(new Date(), 7).toISOString(), type: 'work' },
    ],
    locations: [{ id: 'l1', location_name: 'Studio, DTLA', visit_count: 200, last_visited: subDays(new Date(), 1).toISOString() }],
    analytics: mkAnalytics(97, 98, 'increasing', ['Primary livelihood', 'Creative home', 'Equity stake']),
  },

  {
    id: 'mock-11',
    name: 'Novara Systems',
    aliases: ['Novara', 'Old job'],
    type: 'company', group_type: 'company',
    membership_model: 'strict', user_relationship: 'former_member', is_public_entity: false,
    description: 'The SaaS company I left eighteen months ago. Good people, wrong fit for where I wanted to go. Still in touch with a few people from there.',
    location: 'San Francisco, CA',
    founded_year: 2016,
    status: 'active',
    member_count: 120,
    usage_count: 7,
    confidence: 0.88,
    last_seen: subDays(new Date(), 40).toISOString(),
    created_at: subDays(new Date(), 365 * 4).toISOString(),
    updated_at: subDays(new Date(), 40).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Derek', role: 'Former manager', status: 'former' },
      { id: 'm2', character_name: 'Aisha Chen', role: 'Still there, senior PM', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'Leaving conversation with Derek', summary: 'He was more supportive than I expected. Said he saw it coming. Still keep in touch occasionally.', date: subDays(new Date(), 550).toISOString() },
    ],
    events: [],
    locations: [],
  },

  // ── CLUBS / COLLECTIVES ───────────────────────────────────────────

  {
    id: 'mock-12',
    name: 'Tuesday Writers\' Workshop',
    aliases: ['Writers\' group', 'Tuesday group'],
    type: 'club', group_type: 'club',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: 'Eight writers meeting every other Tuesday to share work in progress. Fiction and nonfiction. No egos (theoretically). I share drafts of my essays here before anywhere else.',
    location: 'Coffee shop on 9th',
    founded_year: 2020,
    status: 'active',
    member_count: 8,
    usage_count: 34,
    confidence: 0.93,
    last_seen: subDays(new Date(), 9).toISOString(),
    created_at: subDays(new Date(), 365 * 3).toISOString(),
    updated_at: subDays(new Date(), 9).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Helen Marsh', role: 'Facilitator', status: 'active' },
      { id: 'm2', character_name: 'Tobi', role: 'Fiction writer', status: 'active' },
      { id: 'm3', character_name: 'Rosa Fuentes', role: 'Poet', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'The essay they didn\'t like', summary: "Read a draft about my dad. Half the group found it too personal. Helen said that meant I was getting somewhere. I think she was right.", date: subDays(new Date(), 30).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Bi-weekly session', date: subDays(new Date(), 9).toISOString(), type: 'meeting' },
    ],
    locations: [{ id: 'l1', location_name: 'Groundwork Coffee, 9th Ave', visit_count: 28, last_visited: subDays(new Date(), 9).toISOString() }],
    analytics: mkAnalytics(80, 88, 'stable', ['Creative accountability', 'Trusted feedback loop']),
  },

  {
    id: 'mock-13',
    name: 'Rec Basketball League',
    aliases: ['Basketball', 'The league'],
    type: 'sports_team', group_type: 'sports_team',
    membership_model: 'strict', user_relationship: 'member', is_public_entity: false,
    description: 'Sunday morning rec league. We are not good. We are very enthusiastic about not being good. Marcus somehow convinced me to join last spring.',
    location: 'Community Center',
    founded_year: 2019,
    status: 'active',
    member_count: 10,
    usage_count: 19,
    confidence: 0.87,
    last_seen: subDays(new Date(), 6).toISOString(),
    created_at: subDays(new Date(), 365).toISOString(),
    updated_at: subDays(new Date(), 6).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Marcus Johnson', role: 'Point guard (self-appointed)', status: 'active' },
      { id: 'm2', character_name: 'Dex', role: 'The one who actually played in college', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'We won a game', summary: "Our first win. Not because we got better — the other team had three people. Still counts.", date: subDays(new Date(), 45).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Sunday game', date: subDays(new Date(), 6).toISOString(), type: 'game' },
    ],
    locations: [{ id: 'l1', location_name: 'Community Center, Court B', visit_count: 22, last_visited: subDays(new Date(), 6).toISOString() }],
    analytics: mkAnalytics(64, 61, 'stable', ['Physical outlet', 'Time with Marcus']),
  },

  // ── NONPROFITS ────────────────────────────────────────────────────

  {
    id: 'mock-14',
    name: 'City Harvest Volunteers',
    aliases: ['Food bank', 'City Harvest'],
    type: 'nonprofit', group_type: 'nonprofit',
    membership_model: 'strict', user_relationship: 'collaborator', is_public_entity: false,
    description: "The food distribution operation I volunteer with twice a month. I do logistics and some communication design for free. Not 'in' the org officially, but I show up.",
    location: 'Warehouse District',
    founded_year: 2008,
    status: 'active',
    member_count: 45,
    usage_count: 11,
    confidence: 0.84,
    last_seen: subDays(new Date(), 15).toISOString(),
    created_at: subDays(new Date(), 365 * 2).toISOString(),
    updated_at: subDays(new Date(), 15).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Fatima', role: 'Operations lead', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'The holiday push', summary: "300 families in one Saturday. I worked the intake table for six hours. Went home and couldn't talk for a while.", date: subDays(new Date(), 90).toISOString() },
    ],
    events: [
      { id: 'e1', title: 'Twice-monthly shift', date: subDays(new Date(), 15).toISOString(), type: 'work' },
    ],
    locations: [{ id: 'l1', location_name: 'Warehouse District site', visit_count: 18, last_visited: subDays(new Date(), 15).toISOString() }],
    analytics: mkAnalytics(44, 74, 'stable', ['Values alignment', 'Grounding practice']),
  },

  // ── INSTITUTIONS ─────────────────────────────────────────────────

  {
    id: 'mock-15',
    name: 'Cal Poly Pomona',
    aliases: ['CPP', 'School', 'College'],
    type: 'other', group_type: 'institution',
    membership_model: 'strict', user_relationship: 'alumnus', is_public_entity: false,
    description: "Where I spent four years studying graphic design. Still goes on my resume. I go back occasionally for portfolio reviews or to talk to students.",
    location: 'Pomona, CA',
    founded_year: 1938,
    status: 'active',
    member_count: 0,
    usage_count: 6,
    confidence: 0.95,
    last_seen: subDays(new Date(), 80).toISOString(),
    created_at: subDays(new Date(), 365 * 8).toISOString(),
    updated_at: subDays(new Date(), 80).toISOString(),
    metadata: {},
    members: [],
    stories: [
      { id: 's1', title: 'Guest critique at the design school', summary: 'Sat in on a junior portfolio review. Made me think about how much I didn\'t know at that age. And how much I still don\'t.', date: subDays(new Date(), 80).toISOString() },
    ],
    events: [],
    locations: [{ id: 'l1', location_name: 'Pomona, CA', visit_count: 4, last_visited: subDays(new Date(), 80).toISOString() }],
  },

  // ── PUBLIC ENTITIES ───────────────────────────────────────────────

  {
    id: 'mock-16',
    name: 'Radiohead',
    aliases: ['The band from Abingdon'],
    type: 'other', group_type: 'public_entity',
    membership_model: 'none', user_relationship: 'fan', is_public_entity: true,
    description: "I've listened to OK Computer more times than I could ever count. They're the reason I started taking music seriously. Not expecting to meet them.",
    location: 'Oxford, UK',
    founded_year: 1985,
    status: 'active',
    member_count: 5,
    usage_count: 22,
    confidence: 1.0,
    last_seen: subDays(new Date(), 3).toISOString(),
    created_at: subDays(new Date(), 365 * 10).toISOString(),
    updated_at: subDays(new Date(), 3).toISOString(),
    metadata: {},
    members: [
      { id: 'm1', character_name: 'Thom Yorke', role: 'Vocals, guitar, piano', status: 'active' },
      { id: 'm2', character_name: 'Jonny Greenwood', role: 'Guitar, keys, orchestration', status: 'active' },
    ],
    stories: [
      { id: 's1', title: 'The kid a era changed everything', summary: "Heard Everything in Its Right Place at 16. Had no idea music could sound like that. Direct line from there to The Midnight Circuit.", date: subDays(new Date(), 365 * 8).toISOString() },
    ],
    events: [],
    locations: [],
    analytics: culturalAnalytics(88),
  },

  {
    id: 'mock-17',
    name: 'The Criterion Collection',
    aliases: ['Criterion'],
    type: 'other', group_type: 'public_entity',
    membership_model: 'none', user_relationship: 'fan', is_public_entity: true,
    description: "The distributor behind my film education. Their supplements and essays taught me how to watch movies properly. I have an embarrassing number of their spines on the shelf.",
    location: 'New York, NY',
    founded_year: 1984,
    status: 'active',
    member_count: 0,
    usage_count: 18,
    confidence: 1.0,
    last_seen: subDays(new Date(), 11).toISOString(),
    created_at: subDays(new Date(), 365 * 5).toISOString(),
    updated_at: subDays(new Date(), 11).toISOString(),
    metadata: {},
    members: [],
    stories: [],
    events: [],
    locations: [],
    analytics: culturalAnalytics(62),
  },

  {
    id: 'mock-18',
    name: 'Apple',
    aliases: ['Apple Inc.'],
    type: 'other', group_type: 'public_entity',
    membership_model: 'none', user_relationship: 'referenced', is_public_entity: true,
    description: "A company that makes products I use and think about professionally as a designer. I reference them a lot when talking about craft, pricing, and taste.",
    location: 'Cupertino, CA',
    founded_year: 1976,
    status: 'active',
    member_count: 0,
    usage_count: 29,
    confidence: 1.0,
    last_seen: subDays(new Date(), 1).toISOString(),
    created_at: subDays(new Date(), 365 * 3).toISOString(),
    updated_at: subDays(new Date(), 1).toISOString(),
    metadata: {},
    members: [],
    stories: [],
    events: [],
    locations: [],
    analytics: culturalAnalytics(41),
  },

];

export const OrganizationsBook: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<OrganizationCategory>('all');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ primary_id: string; primary_name: string; duplicate_ids: string[]; names: string[]; reason: string }>>([]);
  const [dupChecking, setDupChecking] = useState(false);
  const [dupChecked, setDupChecked] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [newOrg, setNewOrg] = useState({ name: '', groupType: 'other' as Organization['group_type'], description: '' });
  const [showMyFamily, setShowMyFamily] = useState(false);
  const [showGroupNetwork, setShowGroupNetwork] = useState(false);
  const [myFamilyCount, setMyFamilyCount] = useState<number | null>(null);
  const [myFamilyRefreshKey, setMyFamilyRefreshKey] = useState(0);
  const isMockDataEnabled = useShouldUseMockData();
  // Groups accepted from suggestions this session — kept so they survive the
  // periodic reloads (in demo mode the backend has no record to refetch).
  const createdOrgsRef = useRef<Organization[]>([]);

  useEffect(() => {
    void loadOrganizations();
  }, [isMockDataEnabled]);

  useEffect(() => {
    if (isMockDataEnabled) return;
    fetchJson<{ success: boolean; tree: { members: unknown[] } }>('/api/family-trees/mine')
      .then(r => { if (r.success) setMyFamilyCount(r.tree.members?.length ?? 0); })
      .catch(() => setMyFamilyCount(null));
  }, [isMockDataEnabled, myFamilyRefreshKey]);

  useEffect(() => {
    return onStoryDataUpdated(() => setMyFamilyRefreshKey(k => k + 1), 'family');
  }, []);

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);

    const mergeCreated = (base: Organization[]) => {
      const created = createdOrgsRef.current;
      if (created.length === 0) return base;
      const createdById = new Map(created.map(o => [o.id, normalizeOrganization(o)]));
      // For orgs present in both, enrich the backend row with locally-known
      // members/profile when richer — so a reload never wipes detected members
      // that the backend may have failed to persist.
      const enriched = base.map(o => {
        const local = createdById.get(o.id);
        if (!local) return o;
        const members = (o.members?.length ?? 0) >= (local.members?.length ?? 0) ? o.members : local.members;
        return normalizeOrganization({
          ...o,
          members,
          member_count: members?.length ?? o.member_count,
          profile: o.profile ?? o.metadata?.profile ?? local.profile,
        });
      });
      const baseIds = new Set(base.map(o => o.id));
      const createdOnly = created.filter(o => !baseIds.has(o.id));
      return [...createdOnly.map(normalizeOrganization), ...enriched];
    };

    // Single try/finally so `loading` ALWAYS resolves — a throw in the demo
    // branch or in profile derivation must never leave the UI on skeletons.
    try {
      if (isMockDataEnabled) {
        const withProfiles = MOCK_ORGANIZATIONS.map(o => {
          let profile = o.profile ?? o.metadata?.profile;
          if (!profile) {
            try {
              profile = deriveOrganizationProfile({
                name: o.name,
                group_type: o.group_type,
                members: o.members?.map(m => m.character_name),
                context: o.description,
              });
            } catch {
              profile = undefined; // never block the card on a bad profile
            }
          }
          return normalizeOrganization({ ...o, profile });
        });
        setOrganizations(mergeCreated(withProfiles));
        return;
      }

      const [orgResult, candidateResult] = await Promise.allSettled([
        fetchJson<{ success: boolean; organizations: Organization[] }>('/api/organizations'),
        fetchJson<{ success: boolean; candidates: GroupCandidate[] }>('/api/group-candidates?status=pending')
          .catch(() => ({ success: false, candidates: [] })),
      ]);
      const organizationsResult =
        orgResult.status === 'fulfilled' && orgResult.value.success ? (orgResult.value.organizations || []) : [];
      const candidatesResult =
        candidateResult.status === 'fulfilled' && candidateResult.value.success ? (candidateResult.value.candidates || []) : [];
      const merged = mergeOrganizationsAndCandidates(
        organizationsResult,
        candidatesResult
      );
      setOrganizations(mergeCreated(merged));
      if (orgResult.status === 'rejected') {
        const message = orgResult.reason instanceof Error ? orgResult.reason.message : 'Failed to load accepted organizations';
        const cleanMessage = message.replace(/[.]+$/, '');
        if (merged.length > 0) {
          setScanNote(`${cleanMessage}. Showing detected group suggestions instead.`);
        } else {
          setError(message);
        }
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setOrganizations(mergeCreated([]));
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    if (isMockDataEnabled) {
      // Demo mode has no backend threads — suggestions are already seeded.
      setScanNote('Demo mode: suggestions are pre-loaded above.');
      window.dispatchEvent(new Event('group-candidates-updated'));
      return;
    }
    setScanning(true);
    setScanNote(null);
    try {
      const res = await fetchJson<{ success: boolean; candidates: unknown[] }>(
        '/api/group-candidates/scan',
        { method: 'POST', body: JSON.stringify({ days: 180, cap: 160 }) }
      );
      const found = res.candidates?.length ?? 0;
      setScanNote(
        found > 0
          ? `Found ${found} group suggestion${found === 1 ? '' : 's'} — review them above.`
          : 'No new groups found yet. Keep journaling and chatting — detection runs automatically too.'
      );
      // Refresh the suggestions surface and the org list.
      window.dispatchEvent(new Event('group-candidates-updated'));
      await loadOrganizations();
    } catch {
      setScanNote('Scan failed — please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleFindDuplicates = async () => {
    if (isMockDataEnabled) {
      setDupChecked(true);
      setDuplicates([]);
      return;
    }
    setDupChecking(true);
    try {
      const res = await fetchJson<{ success: boolean; clusters: typeof duplicates }>(
        '/api/organizations/duplicates'
      );
      setDuplicates(res.clusters ?? []);
      setDupChecked(true);
    } catch {
      setDuplicates([]);
      setDupChecked(true);
    } finally {
      setDupChecking(false);
    }
  };

  const handleMerge = async (cluster: { primary_id: string; duplicate_ids: string[] }) => {
    setMerging(cluster.primary_id);
    try {
      await fetchJson('/api/organizations/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: cluster.primary_id, duplicate_ids: cluster.duplicate_ids }),
      });
      setDuplicates(prev => prev.filter(c => c.primary_id !== cluster.primary_id));
      await loadOrganizations();
    } catch {
      // keep the cluster visible so the user can retry
    } finally {
      setMerging(null);
    }
  };

  const handleCreate = async () => {
    if (!newOrg.name.trim()) return;
    setCreating(true);
    try {
      await fetchJson('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: newOrg.name.trim(),
          type: ['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'family', 'martial_arts', 'other'].includes(newOrg.groupType)
            ? newOrg.groupType
            : 'other',
          group_type: newOrg.groupType,
          description: newOrg.description.trim() || undefined,
          status: 'active',
        }),
      });
      setShowCreateForm(false);
      setNewOrg({ name: '', groupType: 'other', description: '' });
      await loadOrganizations();
    } catch (err: any) {
      console.error('Failed to create organization:', err);
    } finally {
      setCreating(false);
    }
  };

  // Categories derived from canonical group_type field
  const availableCategories = useMemo((): OrganizationCategory[] => {
    return [
      'all',
      'crews',
      'bands',
      'scenes',
      'communities',
      'companies',
      'sports_teams',
      'clubs',
      'nonprofits',
      'family',
      'public_entities',
      'recent',
    ];
  }, []);

  const filteredOrganizations = useMemo(() => {
    let filtered = [...organizations];

    if (activeCategory !== 'all') {
      filtered = filtered.filter(org => {
        const gt = org.group_type;
        switch (activeCategory) {
          case 'crews':          return gt === 'friend_group' || gt === 'crew';
          case 'bands':          return gt === 'band';
          case 'scenes':         return gt === 'scene';
          case 'communities':    return gt === 'community';
          case 'companies':      return gt === 'company';
          case 'clubs':          return gt === 'club' || gt === 'collective';
          case 'sports_teams':   return gt === 'sports_team' || gt === 'martial_arts';
          case 'nonprofits':     return gt === 'nonprofit';
          case 'family':         return gt === 'family';
          case 'public_entities':return gt === 'public_entity' || gt === 'institution';
          case 'recent': {
            const cutoff = subDays(new Date(), 30);
            return new Date(org.last_seen) >= cutoff;
          }
          default: return true;
        }
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(org =>
        org.name.toLowerCase().includes(term) ||
        org.aliases.some(a => a.toLowerCase().includes(term)) ||
        (org.description && org.description.toLowerCase().includes(term)) ||
        org.group_type.toLowerCase().includes(term)
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'importance_desc':
          const importanceA = a.analytics?.importance_score || 0;
          const importanceB = b.analytics?.importance_score || 0;
          if (importanceB !== importanceA) return importanceB - importanceA;
          return b.usage_count - a.usage_count; // Tie-breaker
        case 'involvement_desc':
          const involvementA = a.analytics?.user_involvement_score || 0;
          const involvementB = b.analytics?.user_involvement_score || 0;
          if (involvementB !== involvementA) return involvementB - involvementA;
          return b.usage_count - a.usage_count;
        case 'priority_desc':
          const priorityA = a.analytics?.priority_score || 0;
          const priorityB = b.analytics?.priority_score || 0;
          if (priorityB !== priorityA) return priorityB - priorityA;
          return b.usage_count - a.usage_count;
        case 'value_desc':
          const valueA = a.analytics?.value_score || 0;
          const valueB = b.analytics?.value_score || 0;
          if (valueB !== valueA) return valueB - valueA;
          return b.usage_count - a.usage_count;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'usage_desc':
          return b.usage_count - a.usage_count;
        case 'usage_asc':
          return a.usage_count - b.usage_count;
        case 'confidence_desc':
          return b.confidence - a.confidence;
        case 'confidence_asc':
          return a.confidence - b.confidence;
        case 'recent':
          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [organizations, searchTerm, activeCategory, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory, sortBy]);

  const totalPages = Math.ceil(filteredOrganizations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedOrganizations = filteredOrganizations.slice(startIndex, endIndex);
  const visibleStart = filteredOrganizations.length === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, filteredOrganizations.length);

  // Auto-open modal when navigated here from an entity chip (chat → organizations).
  useEffect(() => {
    if (organizations.length === 0) return;
    const id = sessionStorage.getItem('highlightItem');
    if (!id) return;
    sessionStorage.removeItem('highlightItem');
    const match = organizations.find(o => o.id === id);
    if (match) setSelectedOrganization(match);
  }, [organizations]);

  // Refresh when chat pipeline creates/updates organizations.
  useEffect(() => {
    const handler = () => { void loadOrganizations(); };
    window.addEventListener('lk:organizations-updated', handler);
    return () => window.removeEventListener('lk:organizations-updated', handler);
  }, []);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        setCurrentPage(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        setCurrentPage(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <Building2 className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={() => void loadOrganizations()} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group Suggestions — surfaces detected group candidates for review */}
      <GroupSuggestions
        categoryFilter={activeCategory}
        searchTerm={searchTerm}
        demoMode={isMockDataEnabled}
        onGroupCreated={(created) => {
          if (created) {
            const normalizedCreated = normalizeOrganization(created);
            createdOrgsRef.current = [
              normalizedCreated,
              ...createdOrgsRef.current.filter(o => o.id !== created.id),
            ];
            setOrganizations(prev => [normalizedCreated, ...prev.filter(o => o.id !== created.id)]);
            // Guarantee the new card is visible: clear filters, sort newest-first,
            // jump to page 1. Otherwise it can land off the current tab/page.
            setActiveCategory('all');
            setSearchTerm('');
            setSortBy('recent');
            setCurrentPage(1);
            setSelectedOrganization(normalizedCreated); // also open it in the modal
          } else {
            void loadOrganizations();
          }
        }}
      />

      {!isMockDataEnabled && (
        <>
        <Card
          className="bg-gradient-to-r from-emerald-950/50 via-black/40 to-black/40 border-emerald-500/35 cursor-pointer hover:border-emerald-400/55 transition-colors"
          onClick={() => setShowMyFamily(true)}
        >
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 shrink-0">
                <TreePine className="h-6 w-6 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">My Family</h2>
                <p className="text-xs text-white/45 mt-0.5">
                  {myFamilyCount != null && myFamilyCount > 0
                    ? `${myFamilyCount} relative${myFamilyCount !== 1 ? 's' : ''} inferred from your conversations`
                    : 'Your personal family tree — grows as you share stories in chat'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-500/40 text-emerald-200 shrink-0"
              onClick={e => { e.stopPropagation(); setShowMyFamily(true); }}
            >
              View tree
            </Button>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-r from-indigo-950/50 via-black/40 to-black/40 border-indigo-500/35 cursor-pointer hover:border-indigo-400/55 transition-colors"
          onClick={() => setShowGroupNetwork(true)}
        >
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 shrink-0">
                <Network className="h-6 w-6 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-white">Group Network</h2>
                <p className="text-xs text-white/45 mt-0.5">
                  Subgroups, inner circles, and affiliations — learned from your conversations
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-500/40 text-indigo-200 shrink-0"
              onClick={e => { e.stopPropagation(); setShowGroupNetwork(true); }}
            >
              View network
            </Button>
          </CardContent>
        </Card>
        </>
      )}

      {/* Search and Controls — two rows on mobile: row 1 = search, row 2 = sort + refresh */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1 w-full min-w-0">
            <SearchWithAutocomplete<Organization>
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search organizations by name, alias, or type..."
              items={organizations}
              getSearchableText={(o) =>
                [o.name, ...(o.aliases ?? []), o.type, o.group_type, o.description].filter(Boolean).join(' ')
              }
              getDisplayLabel={(o) => o.name}
              maxSuggestions={8}
              className="w-full"
              inputClassName="bg-black/40 border-border/50 text-white placeholder:text-white/40"
              emptyHint="No matching groups"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Sort */}
            <select
              aria-label="Sort organizations"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 flex-1 sm:flex-none min-w-0 w-full sm:w-auto max-w-full px-3 py-2 bg-black/40 border border-border/50 rounded-lg text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
            >
              <option value="importance_desc">Most Important</option>
              <option value="involvement_desc">Most Involved</option>
              <option value="usage_desc">Most Mentioned</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="confidence_desc">High Confidence</option>
              <option value="recent">Recently Seen</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadOrganizations()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {loading ? 'Loading...' : 'Refresh'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleScan()}
              disabled={scanning}
              title="Scan your conversations and journal for groups"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {scanning ? 'Scanning...' : 'Scan for groups'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleFindDuplicates()}
              disabled={dupChecking}
              title="Find and merge duplicate groups"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {dupChecking ? 'Checking...' : 'Find duplicates'}
            </Button>

            <Button
              size="sm"
              onClick={() => setShowCreateForm(v => !v)}
            >
              {showCreateForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              {showCreateForm ? 'Cancel' : 'New'}
            </Button>
          </div>
        </div>

        {scanNote && (
          <p className="text-xs text-white/60 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            {scanNote}
          </p>
        )}

        {dupChecked && (
          <div className="space-y-2">
            {duplicates.length === 0 ? (
              <p className="text-xs text-white/50">No duplicate groups found.</p>
            ) : (
              duplicates.map(cluster => (
                <Card key={cluster.primary_id} className="bg-black/60 border border-amber-500/30">
                  <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-white/85">
                        {cluster.names.join(' · ')}
                      </p>
                      <p className="text-[11px] text-white/45">
                        {cluster.duplicate_ids.length + 1} likely the same group
                        {cluster.reason === 'member_overlap' ? ' (shared members)' : ' (same name)'} — keeping
                        “{cluster.primary_name}”.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleMerge(cluster)}
                      disabled={merging === cluster.primary_id}
                    >
                      {merging === cluster.primary_id ? 'Merging...' : 'Merge'}
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <Card className="bg-black/60 border border-purple-500/40">
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-sm font-semibold text-purple-300">New Organization</p>
              <div className="flex gap-3 flex-wrap">
                <Input
                  placeholder="Name *"
                  value={newOrg.name}
                  onChange={e => setNewOrg(v => ({ ...v, name: e.target.value }))}
                  className="flex-1 min-w-[160px] bg-black/60 border-border/50 text-white"
                  onKeyDown={e => e.key === 'Enter' && void handleCreate()}
                />
                <select
                  value={newOrg.groupType}
                  onChange={e => setNewOrg(v => ({ ...v, groupType: e.target.value as Organization['group_type'] }))}
                  className="px-3 py-2 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="friend_group">Friend Group</option>
                  <option value="crew">Crew</option>
                  <option value="band">Band</option>
                  <option value="scene">Scene</option>
                  <option value="community">Community</option>
                  <option value="company">Company</option>
                  <option value="sports_team">Sports Team</option>
                  <option value="club">Club</option>
                  <option value="collective">Collective</option>
                  <option value="nonprofit">Nonprofit</option>
                  <option value="affiliation">Affiliation</option>
                  <option value="family">Family</option>
                  <option value="martial_arts">Martial Arts</option>
                  <option value="institution">Institution</option>
                  <option value="public_entity">Public Entity</option>
                  <option value="other">Other</option>
                </select>
                <Input
                  placeholder="Description (optional)"
                  value={newOrg.description}
                  onChange={e => setNewOrg(v => ({ ...v, description: e.target.value }))}
                  className="flex-1 min-w-[160px] bg-black/60 border-border/50 text-white"
                />
                <Button
                  size="sm"
                  onClick={() => void handleCreate()}
                  disabled={creating || !newOrg.name.trim()}
                >
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category Tabs - Dynamically generated based on available types. On mobile, wrap to second row so all are visible without horizontal scroll. */}
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as OrganizationCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex flex-wrap gap-1 sm:gap-2 justify-start">
            {availableCategories.includes('all') && (
              <TabsTrigger 
                value="all" 
                className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
              >
                <Hash className="h-4 w-4" />
                All
              </TabsTrigger>
            )}
            {availableCategories.includes('crews') && (
              <TabsTrigger
                value="crews"
                className="flex items-center gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
              >
                <Users className="h-4 w-4" />
                Crews
              </TabsTrigger>
            )}
            {availableCategories.includes('bands') && (
              <TabsTrigger
                value="bands"
                className="flex items-center gap-2 data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-400"
              >
                <Music className="h-4 w-4" />
                Bands
              </TabsTrigger>
            )}
            {availableCategories.includes('scenes') && (
              <TabsTrigger
                value="scenes"
                className="flex items-center gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"
              >
                <Zap className="h-4 w-4" />
                Scenes
              </TabsTrigger>
            )}
            {availableCategories.includes('communities') && (
              <TabsTrigger
                value="communities"
                className="flex items-center gap-2 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
              >
                <Users className="h-4 w-4" />
                Communities
              </TabsTrigger>
            )}
            {availableCategories.includes('companies') && (
              <TabsTrigger 
                value="companies" 
                className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
              >
                <Building2 className="h-4 w-4" />
                Companies
              </TabsTrigger>
            )}
            {availableCategories.includes('sports_teams') && (
              <TabsTrigger 
                value="sports_teams" 
                className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
              >
                <Users className="h-4 w-4" />
                Sports Teams
              </TabsTrigger>
            )}
            {availableCategories.includes('clubs') && (
              <TabsTrigger 
                value="clubs" 
                className="flex items-center gap-2 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400"
              >
                <Users className="h-4 w-4" />
                Clubs
              </TabsTrigger>
            )}
            {availableCategories.includes('nonprofits') && (
              <TabsTrigger 
                value="nonprofits" 
                className="flex items-center gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400"
              >
                <Building2 className="h-4 w-4" />
                Nonprofits
              </TabsTrigger>
            )}
            {availableCategories.includes('family') && (
              <TabsTrigger
                value="family"
                className="flex items-center gap-2 data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400"
              >
                <Heart className="h-4 w-4" />
                Families
              </TabsTrigger>
            )}
            {availableCategories.includes('public_entities') && (
              <TabsTrigger
                value="public_entities"
                className="flex items-center gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
              >
                <Globe className="h-4 w-4" />
                Public Entities
              </TabsTrigger>
            )}
            {availableCategories.includes('recent') && (
              <TabsTrigger 
                value="recent" 
                className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
              >
                <Calendar className="h-4 w-4" />
                Recent
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-white/60">
          <div>
            Showing {visibleStart}-{visibleEnd} of {filteredOrganizations.length} organizations
            {filteredOrganizations.length !== organizations.length && (
              <span className="ml-2 text-primary">({organizations.length} total)</span>
            )}
          </div>
        </div>
      </div>

      {/* Organizations Display */}
      {loading ? (
        <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No organizations found</p>
          <p className="text-sm">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <>
          {/* Book Page Container */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-purple-50/5 via-purple-100/5 to-purple-50/5 rounded-lg border-2 border-purple-800/30 shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-8 flex flex-col">
              {/* Page Header — visible on mobile */}
              <div className="flex items-center justify-between mb-4 sm:mb-6 pb-4 border-b border-purple-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-purple-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-purple-900/40 uppercase tracking-wider">
                      Organizations Book
                    </h3>
                    <p className="text-xs text-purple-700/50 mt-0.5">
                      Page {currentPage} of {totalPages} · {filteredOrganizations.length} organizations
                    </p>
                  </div>
                </div>
                <div className="text-xs text-purple-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Organizations Grid — two columns on mobile; List stays single column */}
              <ErrorBoundary
                fallback={
                  <div className="flex-1 text-center py-12 text-white/60">
                    <p className="text-sm mb-3">Something went wrong displaying these cards.</p>
                    <Button variant="outline" size="sm" onClick={() => void loadOrganizations()}>
                      Reload
                    </Button>
                  </div>
                }
              >
                <div className="flex-1 grid gap-2 sm:gap-4 mb-4 sm:mb-6 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {paginatedOrganizations.map((org) => (
                    <OrganizationProfileCard
                      key={org.id}
                      organization={org}
                      onClick={() => setSelectedOrganization(normalizeOrganization(org))}
                    />
                  ))}
                </div>
              </ErrorBoundary>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-purple-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-purple-800/30">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (currentPage <= 4) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = currentPage - 3 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`px-2 py-1 rounded text-sm transition ${
                            currentPage === pageNum
                              ? 'bg-purple-600 text-white'
                              : 'text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm text-purple-700/50">
                    {visibleStart}-{visibleEnd} of {filteredOrganizations.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900/40 via-purple-800/30 to-purple-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900/40 via-purple-800/30 to-purple-900/40" />
          </div>
        </>
      )}

      {/* Timeline at bottom */}
      {filteredOrganizations.length > 0 && (
        <div className="mt-8">
          <ColorCodedTimeline />
        </div>
      )}

      {/* Organization Detail Modal */}
      {selectedOrganization && (
        <OrganizationDetailModal
          organization={selectedOrganization}
          onClose={() => setSelectedOrganization(null)}
          onUpdate={() => {
            void loadOrganizations();
            setSelectedOrganization(null);
          }}
        />
      )}

      {showMyFamily && (
        <Modal isOpen onClose={() => setShowMyFamily(false)} title="My Family" size="3xl">
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[75vh]">
            <p className="text-xs text-white/45 mb-4">
              Positions inferred from kinship mentioned in your conversations. Updates automatically after you chat.
            </p>
            <FamilyTreePanel
              scope="mine"
              refreshKey={myFamilyRefreshKey}
              title="No family tree yet"
              hint="Tell LoreBook about your parents, siblings, partner, or kids — the tree builds from what you share."
            />
          </div>
        </Modal>
      )}

      {showGroupNetwork && (
        <Modal isOpen onClose={() => setShowGroupNetwork(false)} title="Group Network" size="3xl">
          <div className="p-4 sm:p-6 overflow-y-auto max-h-[80vh]">
            <OrganizationGroupNetwork
              onOrgClick={(id) => {
                void fetchJson<{ success: boolean; organization: Organization }>(`/api/organizations/${id}`)
                  .then(r => {
                    if (r.success && r.organization) {
                      setShowGroupNetwork(false);
                      setSelectedOrganization(r.organization);
                    }
                  })
                  .catch(() => {});
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
