import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, User, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, BookOpen, Users, Heart, GraduationCap, Briefcase, Palette, MessageSquare, Link2, UserX, Eye, DollarSign, Activity, Smile, Home, Heart as HeartIcon, Tag, Zap, LayoutGrid, LayoutList, Flame, Wind, Moon, GitBranch, AlertTriangle, GitMerge, Star } from 'lucide-react';
import { FamilyTreeView, createMockUserFamilyTree, createMockFamilyTreeForCharacter } from '../family/FamilyTreeView';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { MainCharacterProfileCard, buildSyntheticMainCharacter } from './MainCharacterProfileCard';
import { MainCharacterDetailModal } from './MainCharacterDetailModal';
import { CharacterBookPage } from './CharacterBookPage';
import { CharacterDetailModal } from './CharacterDetailModal';
import { UserProfile } from './UserProfile';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { Button } from '../ui/button';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { Card, CardContent } from '../ui/card';
import { CharacterCardSkeleton } from '../ui/skeleton';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { apiCache } from '../../lib/cache';
import { supabase, useAuth } from '../../lib/supabase';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { useCharacterExtraction } from '../../hooks/useCharacterExtraction';
import { useActiveChatMessages } from '../../contexts/ChatThreadContext';
import { generateNicknames } from '../../utils/nicknameGenerator';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';
import { getMockRomanticRelationships } from '../../mocks/romanticRelationships';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { DetectedCharacterSuggestions } from './DetectedCharacterSuggestions';
import { getMockCharacterSuggestionBookNames } from '../../mocks/characterSuggestions';
import { isSelfCharacter } from '../../lib/isSelfCharacter';
import { selfCharacterApi } from '../../api/selfCharacter';
import { CharacterAvatar } from './CharacterAvatar';

// ── Demo filter-field normalization ──────────────────────────────────────────
// Every category tab (proximity, mentioned, etc.) must have matches in demo
// mode. Explicit overrides put specific characters into the rarer buckets;
// everything else derives proximity/has_met/relationship_depth from archetype.
const DEMO_PROXIMITY_OVERRIDES: Record<string, { proximity_level: Character['proximity_level']; has_met?: boolean; relationship_depth?: Character['relationship_depth']; status?: Character['status'] }> = {
  'dummy-9':  { proximity_level: 'indirect' },                                              // Dr. Mitchell — friend-of-friend
  'dummy-17': { proximity_level: 'indirect' },                                              // Priya — met through Sam
  'dummy-19': { proximity_level: 'distant' },                                               // Oliver — rarely seen
  'dummy-21': { proximity_level: 'distant' },                                               // Jamie — drifted apart
  'dummy-15': { proximity_level: 'unmet', has_met: false, relationship_depth: 'mentioned_only', status: 'unmet' }, // Sam Taylor — online only
  'dummy-22': { proximity_level: 'unmet', has_met: false, relationship_depth: 'mentioned_only', status: 'unmet' },
  'dummy-23': { proximity_level: 'third_party' },                                           // talked about, never interacted
  'dummy-24': { proximity_level: 'third_party' },
};

function withFilterDefaults(char: Character): Character {
  const override = DEMO_PROXIMITY_OVERRIDES[char.id];
  return {
    ...char,
    proximity_level: override?.proximity_level ?? char.proximity_level ?? 'direct',
    has_met: override?.has_met ?? char.has_met ?? true,
    relationship_depth: override?.relationship_depth ?? char.relationship_depth ?? 'moderate',
    status: override?.status ?? char.status,
  };
}

type DemoRelationshipValue = {
  type?: string;
  closeness?: number;
};

function isDemoRelationshipMap(value: unknown): value is Record<string, DemoRelationshipValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withDemoRelationships(char: Character): Character {
  const relationshipMap = char.metadata?.relationships;
  if (char.relationships?.length || !isDemoRelationshipMap(relationshipMap)) return char;

  const relationships = Object.entries(relationshipMap)
    .map(([relatedId, relationship]) => {
      const relatedCharacter = dummyCharacters.find((candidate) => candidate.id === relatedId);
      if (!relatedCharacter) return null;
      const closenessScore = Math.max(1, Math.min(10, Math.round((relationship.closeness ?? 30) / 10)));

      return {
        id: `demo-${char.id}-${relatedId}`,
        character_id: relatedId,
        character_name: relatedCharacter.name,
        relationship_type: relationship.type ?? 'story_association',
        closeness_score: closenessScore,
        summary: `Demo inference: ${relatedCharacter.name} is connected to ${char.name} through shared memories, scenes, or social context.`,
        status: relationship.type === 'romantic' ? 'active' : 'inferred',
      };
    })
    .filter((relationship): relationship is NonNullable<typeof relationship> => Boolean(relationship));

  if (relationships.length === 0) return char;

  return {
    ...char,
    relationships,
    relationship_count: Math.max(char.relationship_count ?? 0, relationships.length),
    associated_with_character_ids: Array.from(new Set([
      ...(char.associated_with_character_ids ?? []),
      ...relationships.map((relationship) => relationship.character_id),
    ])),
  };
}

// ── Demo analytics normalization ─────────────────────────────────────────────
// Derives a full analytics object from metadata fields so demo cards render
// correctly without touching every mock character object individually.
function withDemoAnalytics(rawChar: Character): Character {
  const char = withDemoRelationships(withFilterDefaults(rawChar));
  if (char.analytics) return char;
  const closeness  = Number((char.metadata?.closeness_score as number | undefined) ?? (char.importance_score ?? 0));
  const importance = char.importance_score ?? 0;
  // Spread recency across characters so "Recently Active" row shows variety
  const recencyMap: Record<string, number> = {
    'dummy-1':          0.95, // Sarah  — seen last week
    'char-alex-boyfriend': 0.90, // Alex GF
    'dummy-2':          0.75, // Marcus
    'dummy-4':          0.80, // Jordan (sibling)
    'dummy-10':         0.70, // Luna
    'dummy-7':          0.65, // Sophia
    'dummy-3':          0.60, // Alex Rivera
    'dummy-12':         0.55, // Noah
    'dummy-5':          0.45, // Dr. Amara
    'dummy-9':          0.50, // Dr. Mitchell
  };
  const recency = recencyMap[char.id] ?? Math.max(0.1, (closeness / 100) * 0.5);
  const trend: 'deepening' | 'stable' | 'weakening' =
    importance > 80 ? 'deepening' : importance > 55 ? 'stable' : 'weakening';
  return {
    ...char,
    analytics: {
      closeness_score:              closeness,
      recency_score:                recency,
      importance_score:             importance,
      trend,
      character_influence_on_user:  importance,
      user_influence_over_character: importance * 0.8,
      relationship_depth:           closeness,
      interaction_frequency:        recency,
      priority_score:               importance,
      value_score:                  importance * 0.9,
      sentiment_score:              closeness / 100,
      trust_score:                  closeness / 100,
      support_score:                closeness / 100,
      conflict_score:               0,
      engagement_score:             recency,
      activity_level:               recency,
      shared_experiences:           char.memory_count ?? 0,
      relationship_duration_days:   365,
      relevance_score:              importance / 100,
    },
  };
}

type DuplicateGroup = {
  match_type: 'exact' | 'alias' | 'containment';
  confidence?: number;
  recommendation?: 'merge' | 'review';
  reason?: string;
  canonical_name: string;
  characters: Character[];
};

const mergeCharactersLocally = (
  currentCharacters: Character[],
  targetId: string,
  sourceIds: string[]
): Character[] => {
  const target = currentCharacters.find(character => character.id === targetId);
  if (!target) return currentCharacters;

  const sources = currentCharacters.filter(character => sourceIds.includes(character.id));
  const aliases = new Set([
    ...(target.alias ?? []),
    ...sources.flatMap(character => [character.name, ...(character.alias ?? [])]),
  ].filter(Boolean));
  aliases.delete(target.name);

  const mergedTarget: Character = {
    ...target,
    alias: Array.from(aliases),
    memory_count: (target.memory_count ?? 0) + sources.reduce((sum, character) => sum + (character.memory_count ?? 0), 0),
    relationship_count: (target.relationship_count ?? 0) + sources.reduce((sum, character) => sum + (character.relationship_count ?? 0), 0),
    summary: `${target.summary ?? ''} Demo merge preview: this card now keeps aliases, memories, facts, and relationship signals from ${sources.map(character => character.name).join(', ')}.`.trim(),
  };

  return currentCharacters
    .filter(character => !sourceIds.includes(character.id))
    .map(character => character.id === targetId ? withDemoAnalytics(mergedTarget) : character);
};

// Comprehensive mock character data showcasing all app capabilities
// Export for use in mock data service
export const dummyCharacters: Character[] = [
  {
    id: 'dummy-self',
    name: 'You',
    first_name: 'Alex',
    last_name: 'Morgan',
    pronouns: 'they/them',
    archetype: 'protagonist',
    role: 'Main Character · Creative in transition',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 100,
    proximity_level: 'direct',
    relationship_depth: 'close',
    has_met: true,
    is_nickname: false,
    summary:
      'The protagonist of your story — navigating the shift from tech into music, writing, and a more creative life. Your arcs, hopes, and growth anchor everything else in your lore.',
    tags: ['your story', 'creative renaissance', 'self-discovery'],
    metadata: {
      is_self: true,
      is_user: true,
      relationship_type: 'self',
    },
    memory_count: 42,
    relationship_count: 12,
  },
  {
    id: 'dummy-1',
    name: 'Sarah Chen',
    first_name: 'Sarah',
    last_name: 'Chen',
    alias: ['Sarah', 'Sara'],
    pronouns: 'she/her',
    archetype: 'ally',
    role: 'Best Friend',
    status: 'active',
    importance_level: 'major',
    importance_score: 87,
    proximity_level: 'direct',
    relationship_depth: 'close',
    has_met: true,
    is_nickname: false,
    summary: 'My closest friend and confidante since college. Sarah works in tech and was one of the first people I told about my decision to transition from software development to creative work. She\'s been incredibly supportive throughout my creative renaissance, often meeting me at coffee shops to work on our respective projects. We\'ve had 24 writing sessions together at the coffee shop. She knows Alex (my girlfriend) and Marcus (my mentor), and we all sometimes hang out together. Sarah is honest, loyal, and always knows how to make me laugh when I\'m stressed about my creative projects.',
    tags: ['friendship', 'support', 'honesty', 'loyalty'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 95,
      first_met: '2018-09-15',
      social_standing: { score: 0.84, tier: 'inner_circle', degree: 5, connector: true, computed_at: new Date().toISOString() },
      relationships: {
        'char-alex-boyfriend': { type: 'friend', closeness: 75 },
        'dummy-2': { type: 'friend', closeness: 70 }, // Marcus
        'dummy-3': { type: 'friend', closeness: 65 }, // Alex Rivera
      },
      locations: {
        'loc-coffee-shop': { visit_count: 24, first_visit: '2022-01-15T00:00:00Z', last_visit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-home-studio': { visit_count: 12, first_visit: '2022-08-01T00:00:00Z', last_visit: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-central-park': { visit_count: 8, first_visit: '2023-06-15T00:00:00Z', last_visit: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
      },
      skills: {
        'skill-creative-writing': { role: 'practiced_with', level_contribution: 7 },
      },
    },
    social_media: {
      email: 'sarah.chen@example.com',
      instagram: '@sarah_life'
    },
    memory_count: 24, // Matches 24 coffee shop visits
    relationship_count: 8
  },
  {
    id: 'dummy-2',
    name: 'Marcus Johnson',
    first_name: 'Marcus',
    last_name: 'Johnson',
    alias: ['Marcus', 'Marc'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Mentor & Coach',
    status: 'active',
    importance_level: 'major',
    importance_score: 82,
    proximity_level: 'direct',
    relationship_depth: 'moderate',
    has_met: true,
    is_nickname: false,
    summary: 'A wise mentor who has guided me through my career transition from tech to creative work. Marcus was the one who encouraged me to pursue my passion for music production and writing when I was stuck in my corporate job. He introduced me to Alex Rivera for music collaboration 1.5 years ago and has been a constant source of support. We\'ve had 20 mentorship meetings at the coffee shop. Marcus knows Sarah (my best friend) and we often discuss my creative projects and relationship journey. His decades of experience and thoughtful advice have been invaluable during this period of self-discovery.',
    tags: ['mentorship', 'wisdom', 'career', 'guidance'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 85,
      first_met: '2020-03-10',
      relationships: {
        'dummy-1': { type: 'friend', closeness: 70 }, // Sarah
        'dummy-3': { type: 'friend', closeness: 80 }, // Alex Rivera
        'char-alex-boyfriend': { type: 'friend', closeness: 70 },
      },
      locations: {
        'loc-coffee-shop': { visit_count: 20, first_visit: '2020-03-15T00:00:00Z', last_visit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
      },
    },
    social_media: {
      email: 'marcus@example.com',
      linkedin: 'marcus-johnson'
    },
    memory_count: 18, // Matches mentorship meetings
    relationship_count: 5
  },
  {
    id: 'dummy-3',
    name: 'Alex Rivera',
    first_name: 'Alex',
    last_name: 'Rivera',
    alias: ['Alex', 'A.R.'],
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Creative Collaborator',
    status: 'active',
    importance_level: 'major',
    importance_score: 78,
    proximity_level: 'direct',
    relationship_depth: 'moderate',
    has_met: true,
    is_nickname: false,
    summary: 'A talented music producer and creative collaborator. Alex Rivera and I work together on music production projects in my home studio. Marcus introduced us 1.5 years ago, and we\'ve been collaborating ever since. They\'ve been instrumental in helping me learn music production during my creative renaissance. We\'ve had 45 studio sessions together, and they helped me produce my first EP. Alex knows about my relationship with Alex (my girlfriend) and is supportive of my creative journey.',
    tags: ['collaboration', 'creativity', 'professional', 'innovation'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 78,
      first_met: '2022-07-20', // 1.5 years ago
      relationships: {
        'dummy-2': { type: 'friend', closeness: 80 }, // Marcus
        'dummy-1': { type: 'friend', closeness: 65 }, // Sarah
      },
      locations: {
        'loc-home-studio': { visit_count: 45, first_visit: '2022-07-20T00:00:00Z', last_visit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-coffee-shop': { visit_count: 8, first_visit: '2023-01-15T00:00:00Z', last_visit: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
      },
      skills: {
        'skill-music-production': { role: 'teacher', level_contribution: 8 },
        'skill-audio-engineering': { role: 'teacher', level_contribution: 5 },
      },
    },
    social_media: {
      github: 'alex-dev',
      website: 'alexrivera.dev'
    },
    memory_count: 45, // Updated to match 45 studio sessions
    relationship_count: 3
  },
  {
    id: 'char-alex-boyfriend',
    name: 'Alex',
    first_name: 'Alex',
    last_name: '',
    alias: ['Alex'],
    pronouns: 'she/her',
    archetype: 'romantic',
    role: 'Girlfriend',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 95,
    proximity_level: 'direct',
    relationship_depth: 'close',
    has_met: true,
    is_nickname: false,
    summary: 'My girlfriend of 6 months. We met through Sarah at a coffee shop a year ago. She\'s incredibly supportive of my creative journey, often visiting my home studio to listen to my music. She makes me laugh, remembers the little things, and we share a love for hiking and nature. Our relationship has been growing stronger, and she was the first person I called when I had the EP concept breakthrough.',
    tags: ['romantic', 'supportive', 'relationship', 'creative'],
    metadata: {
      relationship_type: 'romantic',
      closeness_score: 92,
      first_met: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year ago
      relationships: {
        'dummy-1': { type: 'friend', closeness: 75 }, // Sarah
        'dummy-2': { type: 'friend', closeness: 70 }, // Marcus
      },
      locations: {
        'loc-home-studio': { visit_count: 18, first_visit: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-coffee-shop': { visit_count: 15, first_visit: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-central-park': { visit_count: 6, first_visit: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        'loc-mountain-trail': { visit_count: 6, first_visit: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
      },
    },
    social_media: {},
    memory_count: 32, // Matches relationship timeline
    relationship_count: 5
  },
  {
    id: 'dummy-4',
    name: 'Jordan Kim',
    first_name: 'Jordan',
    last_name: 'Kim',
    alias: ['Jordan', 'J'],
    pronouns: 'they/them',
    archetype: 'family',
    role: 'Sibling',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 95,
    proximity_level: 'direct',
    relationship_depth: 'close',
    has_met: true,
    is_nickname: false,
    summary: 'My sibling and one of the most important people in my life. Jordan has been incredibly supportive of my transition from tech to creative work, often going on runs with me in Golden Gate Park when I need to clear my head. They know Sarah (my best friend) and have met Alex (my girlfriend) a few times. Jordan was there for me when my relationship with Taylor ended and has been a constant source of wisdom and support throughout my creative renaissance journey.',
    tags: ['family', 'sibling', 'support', 'connection'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 90,
      first_met: '1995-06-15',
      social_standing: { score: 0.78, tier: 'inner_circle', degree: 3, connector: true, computed_at: new Date().toISOString() }
    },
    memory_count: 32,
    relationship_count: 12
  },
  {
    id: 'dummy-5',
    name: 'Dr. Amara Wells',
    first_name: 'Amara',
    last_name: 'Wells',
    alias: ['Amara', 'Dr. Wells'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Life Coach',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 68,
    is_nickname: false,
    summary: 'A life coach who has helped me navigate personal challenges and develop better self-awareness. Her coaching style is gentle but direct, and she has a gift for asking the right questions.',
    tags: ['coaching', 'growth', 'self-awareness', 'wellness'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 80,
      first_met: '2022-01-15'
    },
    social_media: {
      website: 'mayacoaching.com',
      email: 'maya@coaching.com'
    },
    memory_count: 15,
    relationship_count: 4
  },
  {
    id: 'dummy-6',
    name: 'David Martinez',
    first_name: 'David',
    last_name: 'Martinez',
    alias: generateNicknames('David Martinez', 'A close friend from my photography class. David has an incredible eye for composition and always pushes me to see things from new angles.', 'Photography Partner', ['photography', 'creativity', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Photography Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 58,
    is_nickname: false,
    summary: 'A close friend from my photography class. David has an incredible eye for composition and always pushes me to see things from new angles. We often go on photo walks together in Golden Gate Park, and he\'s been supportive of my creative transition. He knows Sarah and we sometimes all hang out together. David\'s photography skills have inspired me to incorporate more visual elements into my creative work.',
    tags: ['photography', 'creativity', 'friendship', 'art'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 76,
      first_met: '2021-04-12'
    },
    social_media: {
      instagram: '@david_photography'
    },
    memory_count: 16,
    relationship_count: 3
  },
  {
    id: 'dummy-7',
    name: 'Sophia Anderson',
    first_name: 'Sophia',
    last_name: 'Anderson',
    alias: generateNicknames('Sophia Anderson', 'A brilliant writer I met at a workshop. Her feedback is always insightful and she\'s helped me improve my craft significantly.', 'Writing Mentor', ['writing', 'mentorship', 'creativity']),
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Writing Mentor',
    status: 'active',
    importance_level: 'major',
    importance_score: 79,
    is_nickname: false,
    summary: 'A brilliant writer I met at a workshop during my creative transition. Sophia\'s feedback on my writing has been incredibly insightful, and she\'s helped me improve my craft significantly. She introduced me to the writing group where I met Emma, and she\'s been a mentor figure in my creative renaissance. Sophia knows about my music production work and often encourages me to blend different creative mediums.',
    tags: ['writing', 'mentorship', 'creativity', 'feedback'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 81,
      first_met: '2020-11-20',
      public_figure: true,
      figure_type: 'creator',
      social_standing: { score: 0.46, tier: 'close', degree: 2, connector: false, computed_at: new Date().toISOString() }
    },
    social_media: {
      twitter: '@sophia_writes',
      website: 'sophiaanderson.com'
    },
    memory_count: 27,
    relationship_count: 2
  },
  {
    id: 'dummy-8',
    name: 'Emma Thompson',
    first_name: 'Emma',
    last_name: 'Thompson',
    alias: generateNicknames('Emma Thompson', 'A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other\'s work. Her perspective is always valuable.', 'Friend', ['friendship', 'writing', 'creativity', 'community']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Friend',
    status: 'active',
    importance_level: 'minor',
    importance_score: 42,
    is_nickname: false,
    summary: 'A friend from my writing group that Sophia introduced me to. Emma and I share a passion for storytelling and often exchange feedback on each other\'s work. We sometimes meet at coffee shops to write together, and her perspective is always valuable. She knows about my relationship with Alex and my creative projects.',
    tags: ['friendship', 'writing', 'creativity', 'community'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 70,
      first_met: '2021-11-05'
    },
    social_media: {
      twitter: '@emma_writes'
    },
    memory_count: 9,
    relationship_count: 2
  },
  {
    id: 'dummy-9',
    name: 'Dr. James Mitchell',
    first_name: 'James',
    last_name: 'Mitchell',
    alias: ['James', 'Dr. Mitchell'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Therapist',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 72,
    is_nickname: false,
    summary: 'My therapist who has helped me navigate anxiety and build emotional resilience during my career transition. Dr. Mitchell has been particularly helpful in processing my breakup with Taylor and the intense relationship I had with Morgan. His evidence-based and compassionate approach has supported me through the creative renaissance period. He knows about my relationship with Alex and has been encouraging about my creative pursuits.',
    tags: ['therapy', 'mental-health', 'growth', 'support'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 75,
      first_met: '2022-05-10'
    },
    social_media: {
      website: 'drjamesmitchell.com'
    },
    memory_count: 22,
    relationship_count: 1
  },
  {
    id: 'dummy-10',
    name: 'Luna Martinez',
    first_name: 'Luna',
    last_name: 'Martinez',
    alias: generateNicknames('Luna Martinez', 'A spontaneous friend who always pushes me out of my comfort zone. We\'ve gone on countless adventures together and she\'s taught me to embrace uncertainty.', 'Adventure Partner', ['adventure', 'spontaneity', 'friendship', 'growth']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Adventure Partner',
    status: 'active',
    importance_level: 'major',
    importance_score: 84,
    is_nickname: false,
    summary: 'A spontaneous friend who always pushes me out of my comfort zone. We\'ve gone on countless adventures together and she\'s taught me to embrace uncertainty.',
    tags: ['adventure', 'spontaneity', 'friendship', 'growth'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 80,
      first_met: '2020-08-20'
    },
    social_media: {
      instagram: '@luna_adventures'
    },
    memory_count: 31,
    relationship_count: 6
  },
  {
    id: 'dummy-11',
    name: 'River Song',
    first_name: 'River',
    last_name: 'Song',
    alias: generateNicknames('River Song', 'A brilliant artist and collaborator. We\'ve worked on several creative projects together and their vision always inspires me to think differently.', 'Creative Partner', ['art', 'creativity', 'collaboration', 'inspiration']),
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Creative Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 61,
    is_nickname: false,
    summary: 'A brilliant artist and collaborator. We\'ve worked on several creative projects together and their vision always inspires me to think differently.',
    tags: ['art', 'creativity', 'collaboration', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 72,
      first_met: '2021-03-15'
    },
    social_media: {
      instagram: '@river_creates',
      website: 'riversong.art'
    },
    memory_count: 18,
    relationship_count: 4
  },
  {
    id: 'dummy-12',
    name: 'Noah Thompson',
    first_name: 'Noah',
    last_name: 'Thompson',
    alias: generateNicknames('Noah Thompson', 'A thoughtful friend who always asks the deep questions. Our conversations about life, purpose, and meaning have been transformative.', 'Philosophy Friend', ['philosophy', 'deep-thoughts', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Philosophy Friend',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 63,
    is_nickname: false,
    summary: 'A thoughtful friend who always asks the deep questions. Our conversations about life, purpose, and meaning have been transformative.',
    tags: ['philosophy', 'deep-thoughts', 'friendship', 'conversation'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 83,
      first_met: '2021-08-30'
    },
    social_media: {
      email: 'noah.thompson@example.com'
    },
    memory_count: 20,
    relationship_count: 4
  },
  {
    id: 'dummy-13',
    name: 'Zoe Chen',
    first_name: 'Zoe',
    last_name: 'Chen',
    alias: generateNicknames('Zoe Chen', 'My cousin and childhood confidante. Even though we live far apart now, we still have the deepest conversations about life, dreams, and family.', 'Cousin', ['family', 'cousin', 'childhood', 'connection']),
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Cousin',
    status: 'active',
    importance_level: 'major',
    importance_score: 89,
    is_nickname: false,
    summary: 'My cousin and childhood confidante. Even though we live far apart now, we still have the deepest conversations about life, dreams, and family.',
    tags: ['family', 'cousin', 'childhood', 'connection'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 88,
      first_met: '1995-01-01'
    },
    social_media: {
      email: 'zoe.chen@example.com'
    },
    memory_count: 28,
    relationship_count: 10
  },
  {
    id: 'dummy-14',
    name: 'Professor Elena Rodriguez',
    first_name: 'Elena',
    last_name: 'Rodriguez',
    alias: ['Prof. Rodriguez', 'Elena'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Academic Advisor',
    status: 'active',
    importance_level: 'major',
    importance_score: 76,
    is_nickname: false,
    summary: 'My former professor who became a mentor. She saw potential in me when I didn\'t see it in myself and has guided my academic and career journey.',
    tags: ['education', 'mentorship', 'academic', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 82,
      first_met: '2019-09-01'
    },
    social_media: {
      email: 'elena.rodriguez@university.edu',
      linkedin: 'elena-rodriguez-phd'
    },
    memory_count: 26,
    relationship_count: 3
  },
  {
    id: 'dummy-15',
    name: 'Sam Taylor',
    first_name: 'Reese',
    last_name: 'Taylor',
    alias: generateNicknames('Sam Taylor', 'My workout partner and accountability buddy. We motivate each other to stay active and healthy, and our gym sessions are always filled with great conversations.', 'Gym Buddy', ['fitness', 'health', 'friendship', 'accountability']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gym Buddy',
    status: 'active',
    importance_level: 'minor',
    importance_score: 38,
    is_nickname: false,
    summary: 'My workout partner and accountability buddy. We motivate each other to stay active and healthy, and our gym sessions are always filled with great conversations.',
    tags: ['fitness', 'health', 'friendship', 'accountability'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 68,
      first_met: '2022-01-15'
    },
    social_media: {
      instagram: '@sam_fitness'
    },
    memory_count: 14,
    relationship_count: 2
  },
  {
    id: 'dummy-16',
    name: 'Isabella Garcia',
    first_name: 'Isabella',
    last_name: 'Garcia',
    alias: generateNicknames('Isabella Garcia', 'A yoga instructor who has become a close friend. Her calming presence and wisdom about mindfulness have deeply influenced my practice.', 'Yoga Instructor', ['yoga', 'mindfulness', 'wellness', 'friendship']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Yoga Instructor',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 69,
    is_nickname: false,
    summary: 'A yoga instructor who has become a close friend. Her calming presence and wisdom about mindfulness have deeply influenced my practice.',
    tags: ['yoga', 'mindfulness', 'wellness', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 78,
      first_met: '2022-02-14'
    },
    social_media: {
      instagram: '@isabella_yoga',
      website: 'isabellayoga.com'
    },
    memory_count: 25,
    relationship_count: 3
  },
  {
    id: 'dummy-17',
    name: 'Priya Nair',
    first_name: 'Priya',
    last_name: 'Nair',
    alias: generateNicknames('Priya Nair', 'The organizer of our monthly book club. Her thoughtful discussion questions always lead to deep conversations about literature, life, and everything in between.', 'Book Club Leader', ['books', 'discussion', 'friendship', 'intellectual']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Book Club Leader',
    status: 'active',
    importance_level: 'minor',
    importance_score: 45,
    is_nickname: false,
    summary: 'The organizer of our monthly book club. Her thoughtful discussion questions always lead to deep conversations about literature, life, and everything in between.',
    tags: ['books', 'discussion', 'friendship', 'intellectual'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 73,
      first_met: '2021-06-10'
    },
    social_media: {
      email: 'maya.bookclub@example.com'
    },
    memory_count: 19,
    relationship_count: 5
  },
  {
    id: 'dummy-18',
    name: 'Alex Kim',
    first_name: 'Alex',
    last_name: 'Kim',
    alias: generateNicknames('Alex Kim', 'My work best friend. We started at the company around the same time and have supported each other through projects, challenges, and career growth.', 'Work Best Friend', ['work', 'colleague', 'friendship', 'professional']),
    pronouns: 'he/him',
    archetype: 'colleague',
    role: 'Work Best Friend',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 56,
    is_nickname: false,
    summary: 'My work best friend. We started at the company around the same time and have supported each other through projects, challenges, and career growth.',
    tags: ['work', 'colleague', 'friendship', 'professional'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 77,
      first_met: '2021-02-01'
    },
    social_media: {
      linkedin: 'alex-kim-dev'
    },
    memory_count: 21,
    relationship_count: 3
  },
  {
    id: 'dummy-19',
    name: 'Oliver Bennett',
    first_name: 'Oliver',
    last_name: 'Bennett',
    alias: generateNicknames('Oliver Bennett', 'The owner of my favorite bookstore. He has an encyclopedic knowledge of literature and always recommends the perfect book for my mood.', 'Bookstore Owner', ['books', 'literature', 'knowledge', 'community']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Bookstore Owner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 35,
    is_nickname: false,
    summary: 'The owner of my favorite bookstore. He has an encyclopedic knowledge of literature and always recommends the perfect book for my mood.',
    tags: ['books', 'literature', 'knowledge', 'community'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 71,
      first_met: '2021-05-08'
    },
    social_media: {
      email: 'oliver@bookstore.com'
    },
    memory_count: 14,
    relationship_count: 1
  },
  {
    id: 'dummy-20',
    name: 'Dr. Sarah Williams',
    first_name: 'Sarah',
    last_name: 'Williams',
    alias: ['Dr. Williams', 'Sarah'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Research Supervisor',
    status: 'active',
    importance_level: 'major',
    importance_score: 74,
    is_nickname: false,
    summary: 'My research supervisor during grad school. Her rigorous standards and supportive guidance shaped my approach to research and critical thinking.',
    tags: ['research', 'academic', 'mentorship', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 79,
      first_met: '2020-09-15'
    },
    social_media: {
      email: 'sarah.williams@university.edu'
    },
    memory_count: 24,
    relationship_count: 2
  },
  {
    id: 'dummy-21',
    name: 'Jamie Park',
    first_name: 'Jamie',
    last_name: 'Park',
    alias: generateNicknames('Jamie Park', 'A fellow musician I met at an open mic. We\'ve jammed together countless times and they\'ve introduced me to genres I never would have explored.', 'Music Partner', ['music', 'creativity', 'friendship', 'collaboration']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Music Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 41,
    is_nickname: false,
    summary: 'A fellow musician I met at an open mic. We\'ve jammed together countless times and they\'ve introduced me to genres I never would have explored.',
    tags: ['music', 'creativity', 'friendship', 'collaboration'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 71,
      first_met: '2021-07-22'
    },
    social_media: {
      instagram: '@jamie_music',
      spotify: 'jamiepark'
    },
    memory_count: 17,
    relationship_count: 4
  },
  {
    id: 'dummy-22',
    name: 'Ethan Walker',
    first_name: 'Ethan',
    last_name: 'Walker',
    alias: generateNicknames('Ethan Walker', 'My hiking partner and outdoor enthusiast. We\'ve conquered many trails together and he\'s taught me to appreciate the wilderness.', 'Hiking Partner', ['hiking', 'outdoors', 'adventure', 'friendship']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Hiking Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 39,
    is_nickname: false,
    summary: 'My hiking partner and outdoor enthusiast. We\'ve conquered many trails together and he\'s taught me to appreciate the wilderness.',
    tags: ['hiking', 'outdoors', 'adventure', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 74,
      first_met: '2021-09-18'
    },
    social_media: {
      instagram: '@ethan_hikes'
    },
    memory_count: 19,
    relationship_count: 2
  },
  {
    id: 'dummy-23',
    name: 'Riley Chen',
    first_name: 'Riley',
    last_name: 'Chen',
    alias: generateNicknames('Riley Chen', 'A friend I met in a philosophy class. We have the most engaging late-night conversations about existence, ethics, and the meaning of life.', 'Philosophy Buddy', ['philosophy', 'discussion', 'friendship', 'intellectual']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Philosophy Buddy',
    status: 'active',
    importance_level: 'minor',
    importance_score: 33,
    is_nickname: false,
    summary: 'A friend I met in a philosophy class. We have the most engaging late-night conversations about existence, ethics, and the meaning of life.',
    tags: ['philosophy', 'discussion', 'friendship', 'intellectual'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 74,
      first_met: '2021-09-05'
    },
    social_media: {
      email: 'riley.thoughts@example.com'
    },
    memory_count: 13,
    relationship_count: 1
  },
  {
    id: 'dummy-24',
    name: 'Ava Foster',
    first_name: 'Ava',
    last_name: 'Foster',
    alias: generateNicknames('Ava Foster', 'A fellow artist at the shared studio. Her bold style and fearless experimentation inspire me to push my creative boundaries.', 'Studio Artist', ['art', 'creativity', 'inspiration', 'collaboration']),
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Studio Artist',
    status: 'active',
    importance_level: 'background',
    importance_score: 28,
    is_nickname: false,
    summary: 'A fellow artist at the shared studio. Her bold style and fearless experimentation inspire me to push my creative boundaries.',
    tags: ['art', 'creativity', 'inspiration', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 69,
      first_met: '2022-03-22'
    },
    social_media: {
      instagram: '@ava_creates',
      website: 'avafoster.art'
    },
    memory_count: 11,
    relationship_count: 1
  },
  {
    id: 'dummy-25',
    name: 'Dr. Michael Chen',
    first_name: 'Michael',
    last_name: 'Chen',
    alias: ['Dr. Chen', 'Michael'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Career Advisor',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 52,
    is_nickname: false,
    summary: 'A career advisor who helped me navigate job transitions and negotiate offers. His practical advice and industry insights have been invaluable.',
    tags: ['career', 'advice', 'professional', 'guidance'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 76,
      first_met: '2022-03-20'
    },
    social_media: {
      linkedin: 'michael-chen-career',
      email: 'michael@careeradvice.com'
    },
    memory_count: 12,
    relationship_count: 1
  },
  {
    id: 'dummy-26',
    name: 'Lucas Wright',
    first_name: 'Lucas',
    last_name: 'Wright',
    alias: generateNicknames('Lucas Wright', 'A beach volleyball partner I met during summer. His positive energy and love for the ocean are contagious.', 'Beach Volleyball Partner', ['sports', 'beach', 'friendship', 'fun']),
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Beach Volleyball Partner',
    status: 'active',
    importance_level: 'background',
    importance_score: 22,
    is_nickname: false,
    summary: 'A beach volleyball partner I met during summer. His positive energy and love for the ocean are contagious.',
    tags: ['sports', 'beach', 'friendship', 'fun'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 66,
      first_met: '2022-07-05'
    },
    social_media: {
      instagram: '@lucas_beach'
    },
    memory_count: 9,
    relationship_count: 1
  },
  {
    id: 'dummy-27',
    name: 'Casey Morgan',
    first_name: 'Casey',
    last_name: 'Morgan',
    alias: generateNicknames('Casey Morgan', 'My gaming partner and friend. We\'ve spent countless hours playing together and their strategic thinking always impresses me.', 'Gaming Buddy', ['gaming', 'friendship', 'strategy', 'fun']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gaming Buddy',
    status: 'active',
    importance_level: 'background',
    importance_score: 26,
    is_nickname: false,
    summary: 'My gaming partner and friend. We\'ve spent countless hours playing together and their strategic thinking always impresses me.',
    tags: ['gaming', 'friendship', 'strategy', 'fun'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 69,
      first_met: '2022-06-12'
    },
    social_media: {
      discord: 'casey_games#1234'
    },
    memory_count: 10,
    relationship_count: 2
  },
  {
    id: 'dummy-28',
    name: 'Grace Lee',
    first_name: 'Grace',
    last_name: 'Lee',
    alias: generateNicknames('Grace Lee', 'A fellow yoga practitioner who has become a close friend. Her dedication to the practice and gentle wisdom inspire me daily.', 'Yoga Friend', ['yoga', 'wellness', 'friendship', 'mindfulness']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Yoga Friend',
    status: 'active',
    importance_level: 'minor',
    importance_score: 44,
    is_nickname: false,
    summary: 'A fellow yoga practitioner who has become a close friend. Her dedication to the practice and gentle wisdom inspire me daily.',
    tags: ['yoga', 'wellness', 'friendship', 'mindfulness'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 72,
      first_met: '2022-01-28'
    },
    social_media: {
      email: 'grace.lee@example.com'
    },
    memory_count: 17,
    relationship_count: 2
  },
  {
    id: 'dummy-29',
    name: 'Taylor Kim',
    alias: generateNicknames('Taylor Kim', 'A friend I met while traveling. We\'ve explored several countries together and she\'s taught me to be more adventurous and open to new experiences.', 'Travel Companion', ['travel', 'adventure', 'friendship', 'exploration']),
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Travel Companion',
    status: 'active',
    summary: 'A friend I met while traveling. We\'ve explored several countries together and she\'s taught me to be more adventurous and open to new experiences.',
    tags: ['travel', 'adventure', 'friendship', 'exploration'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 78,
      first_met: '2021-05-18'
    },
    social_media: {
      instagram: '@taylor_travels'
    },
    memory_count: 23,
    relationship_count: 5
  },
  {
    id: 'dummy-30',
    name: 'Harper Davis',
    alias: generateNicknames('Harper Davis', 'A vendor at the farmer\'s market who always has the best produce and stories. We\'ve become friends over our weekly conversations about food and community.', 'Market Vendor', ['food', 'community', 'local', 'friendship']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Market Vendor',
    status: 'active',
    summary: 'A vendor at the farmer\'s market who always has the best produce and stories. We\'ve become friends over our weekly conversations about food and community.',
    tags: ['food', 'community', 'local', 'friendship'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 65,
      first_met: '2021-10-12'
    },
    social_media: {
      email: 'harper@localmarket.com'
    },
    memory_count: 10,
    relationship_count: 1
  },
  // Unmet characters - mentioned but not met
  {
    id: 'unmet-1',
    name: 'Dr. Elena Vasquez',
    alias: generateNicknames('Dr. Elena Vasquez', 'A renowned psychologist I\'ve been reading about. Her work on trauma recovery is fascinating and I\'d love to attend one of her workshops someday.', 'Future Mentor', ['psychology', 'trauma-recovery', 'inspiration']),
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Future Mentor',
    status: 'unmet',
    summary: 'A renowned psychologist I\'ve been reading about. Her work on trauma recovery is fascinating and I\'d love to attend one of her workshops someday.',
    tags: ['psychology', 'trauma-recovery', 'inspiration', 'future'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['chat', 'entries'],
      first_mentioned: '2024-11-15'
    },
    social_media: {
      website: 'elenavasquez.com',
      twitter: '@dr_vasquez'
    },
    memory_count: 3,
    relationship_count: 0
  },
  {
    id: 'unmet-2',
    name: 'Alex Morgan',
    alias: generateNicknames('Alex Morgan', 'A friend of a friend who sounds really interesting. Sarah keeps telling me I should meet them - they\'re into the same hobbies and seem like someone I\'d get along with.', 'Future Friend', ['mutual-friend', 'shared-interests', 'recommended']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Future Friend',
    status: 'unmet',
    summary: 'A friend of a friend who sounds really interesting. Sarah keeps telling me I should meet them - they\'re into the same hobbies and seem like someone I\'d get along with.',
    tags: ['mutual-friend', 'shared-interests', 'recommended', 'future'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 0,
      mentioned_in: ['chat'],
      first_mentioned: '2024-11-20',
      mutual_connection: 'Sarah Chen'
    },
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'unmet-3',
    name: 'The Wanderer',
    alias: ['Wanderer', 'The Traveler', 'Nomad'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Paracosm Character',
    status: 'unmet',
    summary: 'A character from my imagined world - a mysterious traveler who appears in my creative writing. They represent freedom and adventure.',
    tags: ['paracosm', 'creative', 'imagined', 'story'],
    metadata: {
      relationship_type: 'imagined',
      closeness_score: 0,
      mentioned_in: ['entries', 'creative-work'],
      first_mentioned: '2024-09-10',
      source: 'paracosm'
    },
    memory_count: 8,
    relationship_count: 0
  },
  {
    id: 'unmet-4',
    name: 'Professor James Chen',
    alias: generateNicknames('Professor James Chen', 'A professor at the university I want to transfer to. His research on cognitive science aligns perfectly with my interests. I\'ve been following his papers.', 'Future Academic Advisor', ['academic', 'research', 'future', 'inspiration']),
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Future Academic Advisor',
    status: 'unmet',
    summary: 'A professor at the university I want to transfer to. His research on cognitive science aligns perfectly with my interests. I\'ve been following his papers.',
    tags: ['academic', 'research', 'future', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-10-05'
    },
    social_media: {
      website: 'jameschen.research.edu',
      linkedin: 'james-chen-phd'
    },
    memory_count: 5,
    relationship_count: 0
  },
  {
    id: 'unmet-5',
    name: 'Sena Park',
    alias: generateNicknames('Sena Park', 'An artist whose work I discovered online. Their paintings capture emotions in a way that resonates deeply with me. I\'d love to collaborate with them someday.', 'Future Collaborator', ['art', 'collaboration', 'inspiration', 'future']),
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Future Collaborator',
    status: 'unmet',
    summary: 'An artist whose work I discovered online. Her paintings capture emotions in a way that resonates deeply with me. I\'d love to collaborate with her someday.',
    tags: ['art', 'collaboration', 'inspiration', 'future'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-11-01'
    },
    social_media: {
      instagram: '@maya_starling_art',
      website: 'mayastarling.art'
    },
    memory_count: 4,
    relationship_count: 0
  },
  // Additional diverse characters to showcase app capabilities
  
  // === FAMILY MEMBERS ===
  {
    id: 'family-1',
    name: 'Robert Chen',
    alias: ['Dad', 'Robert', 'Rob'],
    pronouns: 'he/him',
    archetype: 'family',
    role: 'Father',
    status: 'active',
    summary: 'My father. We have a complex relationship that has evolved over the years. He taught me the value of hard work and perseverance.',
    tags: ['family', 'father', 'mentor', 'support'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 75,
      first_met: '1990-01-01'
    },
    social_media: {
      email: 'robert.chen@example.com',
      phone: '+1-555-0101'
    },
    memory_count: 45,
    relationship_count: 15
  },
  {
    id: 'family-2',
    name: 'Linda Chen',
    alias: ['Mom', 'Linda'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Mother',
    status: 'active',
    summary: 'My mother. Her unconditional love and wisdom have shaped who I am today. She always knows how to make me feel better.',
    tags: ['family', 'mother', 'love', 'support', 'wisdom'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 92,
      first_met: '1990-01-01'
    },
    social_media: {
      email: 'linda.chen@example.com',
      phone: '+1-555-0102'
    },
    memory_count: 58,
    relationship_count: 20
  },
  
  // === FRIENDS (Diverse) ===
  {
    id: 'friend-1',
    name: 'Chris Park',
    alias: ['Chris', 'CP'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Childhood Friend',
    status: 'active',
    summary: 'We\'ve been friends since elementary school. Even though we live in different cities now, we still talk regularly and pick up right where we left off.',
    tags: ['friendship', 'childhood', 'long-term', 'loyalty'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 88,
      first_met: '2000-09-01'
    },
    social_media: {
      instagram: '@chris_park',
      email: 'chris.park@example.com'
    },
    memory_count: 42,
    relationship_count: 18
  },
  {
    id: 'friend-2',
    name: 'Morgan Lee',
    alias: generateNicknames('Morgan Lee', 'A friend I met at a coding bootcamp. We bonded over our shared struggles and now we\'re both working in tech. They\'re always up for a late-night coding session.', 'Coding Buddy', ['coding', 'tech', 'friendship', 'learning']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Coding Buddy',
    status: 'active',
    summary: 'A friend I met at a coding bootcamp. We bonded over our shared struggles and now we\'re both working in tech. They\'re always up for a late-night coding session.',
    tags: ['coding', 'tech', 'friendship', 'learning'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 76,
      first_met: '2022-03-15'
    },
    social_media: {
      github: 'morgan-lee-dev',
      linkedin: 'morgan-lee-tech'
    },
    memory_count: 28,
    relationship_count: 5
  },
  {
    id: 'friend-3',
    name: 'Quinn Anderson',
    alias: ['Quinn', 'Q'],
    pronouns: 'they/them',
    archetype: 'ally',
    role: 'Support System',
    status: 'active',
    summary: 'One of my most supportive friends. They always know what to say and when to just listen. I can be completely myself around them.',
    tags: ['support', 'friendship', 'trust', 'authenticity'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 91,
      first_met: '2019-05-20'
    },
    social_media: {
      email: 'quinn.anderson@example.com'
    },
    memory_count: 35,
    relationship_count: 12
  },
  {
    id: 'friend-4',
    name: 'Dakota Singh',
    alias: generateNicknames('Dakota Singh', 'A friend from my meditation retreat. Their calm presence and deep insights have been incredibly valuable.', 'Meditation Friend', ['meditation', 'mindfulness', 'friendship', 'peace']),
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Meditation Friend',
    status: 'active',
    summary: 'A friend from my meditation retreat. Their calm presence and deep insights have been incredibly valuable.',
    tags: ['meditation', 'mindfulness', 'friendship', 'peace'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 73,
      first_met: '2021-08-10'
    },
    memory_count: 15,
    relationship_count: 3
  },
  
  // === MENTORS (Diverse) ===
  {
    id: 'mentor-1',
    name: 'Dr. Patricia Wong',
    alias: ['Dr. Wong', 'Patricia', 'Pat'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Career Mentor',
    status: 'active',
    summary: 'A senior executive who took me under her wing. Her career advice and industry connections have been invaluable. She pushes me to aim higher.',
    tags: ['career', 'mentorship', 'leadership', 'professional'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 84,
      first_met: '2020-06-01'
    },
    social_media: {
      linkedin: 'patricia-wong-exec',
      email: 'patricia.wong@example.com'
    },
    memory_count: 31,
    relationship_count: 8
  },
  {
    id: 'mentor-2',
    name: 'Master Chen Wei',
    alias: ['Master Chen', 'Sifu'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Martial Arts Instructor',
    status: 'active',
    summary: 'My martial arts instructor for the past 5 years. He teaches me discipline, focus, and inner strength. His philosophy extends beyond the dojo.',
    tags: ['martial-arts', 'discipline', 'philosophy', 'mentorship'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 79,
      first_met: '2019-01-10'
    },
    social_media: {
      website: 'chenweimartialarts.com'
    },
    memory_count: 38,
    relationship_count: 2
  },
  {
    id: 'mentor-3',
    name: 'Dr. Rachel Kim',
    alias: ['Dr. Kim', 'Rachel'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Academic Advisor',
    status: 'active',
    summary: 'My PhD advisor. She\'s brilliant, demanding, and incredibly supportive. Her research guidance has shaped my academic journey.',
    tags: ['academic', 'research', 'mentorship', 'education'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 86,
      first_met: '2021-09-01'
    },
    social_media: {
      email: 'rachel.kim@university.edu',
      website: 'rachelkim.research.edu'
    },
    memory_count: 52,
    relationship_count: 6
  },
  
  // === PROFESSIONAL NETWORK ===
  {
    id: 'professional-1',
    name: 'Jessica Martinez',
    alias: ['Jess', 'Jessica'],
    pronouns: 'she/her',
    archetype: 'colleague',
    role: 'Team Lead',
    status: 'active',
    summary: 'My team lead at work. She\'s a great manager who balances high expectations with genuine care for her team. I\'ve learned a lot from her leadership style.',
    tags: ['work', 'leadership', 'professional', 'management'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 68,
      first_met: '2021-02-15'
    },
    social_media: {
      linkedin: 'jessica-martinez-lead',
      email: 'jessica.martinez@company.com'
    },
    memory_count: 24,
    relationship_count: 4
  },
  {
    id: 'professional-2',
    name: 'Ryan O\'Connor',
    alias: ['Ryan', 'RO'],
    pronouns: 'he/him',
    archetype: 'colleague',
    role: 'Senior Developer',
    status: 'active',
    summary: 'A senior developer on my team. He\'s always willing to help debug issues and share knowledge. His code reviews are thorough and educational.',
    tags: ['coding', 'work', 'professional', 'mentorship'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 71,
      first_met: '2021-03-01'
    },
    social_media: {
      github: 'ryan-oconnor-dev',
      linkedin: 'ryan-oconnor'
    },
    memory_count: 19,
    relationship_count: 3
  },
  {
    id: 'professional-3',
    name: 'Amara Patel',
    alias: ['Amara'],
    pronouns: 'she/her',
    archetype: 'colleague',
    role: 'Product Manager',
    status: 'active',
    summary: 'A product manager I work closely with. Her strategic thinking and user-focused approach inspire me. We collaborate well on cross-functional projects.',
    tags: ['product', 'strategy', 'professional', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 65,
      first_met: '2022-01-10'
    },
    social_media: {
      linkedin: 'amara-patel-pm',
      twitter: '@amara_product'
    },
    memory_count: 16,
    relationship_count: 2
  },
  
  // === CREATIVE CIRCLE ===
  {
    id: 'creative-1',
    name: 'Phoenix Black',
    alias: ['Phoenix', 'Nix'],
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Music Producer',
    status: 'active',
    summary: 'A talented music producer I collaborate with. Their production skills are incredible and they always bring fresh ideas to our projects.',
    tags: ['music', 'production', 'creativity', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 74,
      first_met: '2021-11-05'
    },
    social_media: {
      instagram: '@phoenix_black_music',
      spotify: 'phoenixblack',
      website: 'phoenixblackmusic.com'
    },
    memory_count: 22,
    relationship_count: 7
  },
  {
    id: 'creative-2',
    name: 'Sage Thompson',
    alias: generateNicknames('Sage Thompson', 'A writer I met at a workshop. We exchange manuscripts and provide feedback. Their writing style is poetic and powerful.', 'Writing Partner', ['writing', 'literature', 'creativity', 'feedback']),
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Writing Partner',
    status: 'active',
    summary: 'A writer I met at a workshop. We exchange manuscripts and provide feedback. Their writing style is poetic and powerful.',
    tags: ['writing', 'literature', 'creativity', 'feedback'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 77,
      first_met: '2022-04-20'
    },
    social_media: {
      twitter: '@sage_writes',
      website: 'sagethompson.com'
    },
    memory_count: 18,
    relationship_count: 4
  },
  {
    id: 'creative-3',
    name: 'Indigo Moon',
    alias: ['Indigo', 'Indy'],
    pronouns: 'she/her',
    archetype: 'collaborator',
    role: 'Visual Artist',
    status: 'active',
    summary: 'A visual artist whose work I admire. We\'ve collaborated on a few projects combining her illustrations with my writing. Her aesthetic is stunning.',
    tags: ['art', 'illustration', 'creativity', 'collaboration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 70,
      first_met: '2021-12-15'
    },
    social_media: {
      instagram: '@indigo_moon_art',
      website: 'indigomoon.art'
    },
    memory_count: 14,
    relationship_count: 3
  },
  
  // === MORE UNMET CHARACTERS ===
  {
    id: 'unmet-6',
    name: 'Dr. Aria Chen',
    alias: ['Dr. Chen', 'Aria'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Future Research Collaborator',
    status: 'unmet',
    summary: 'A researcher whose papers I\'ve been following. Her work on neural interfaces is groundbreaking. I\'d love to collaborate with her someday.',
    tags: ['research', 'neuroscience', 'future', 'inspiration'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 0,
      mentioned_in: ['entries', 'research'],
      first_mentioned: '2024-10-20'
    },
    social_media: {
      website: 'ariachen.research.edu',
      linkedin: 'aria-chen-phd'
    },
    memory_count: 6,
    relationship_count: 0
  },
  {
    id: 'unmet-7',
    name: 'Kai Storm',
    alias: ['Kai', 'Storm'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Future Adventure Partner',
    status: 'unmet',
    summary: 'Someone I met online in a hiking group. We\'ve been planning a backpacking trip together. They seem adventurous and fun.',
    tags: ['adventure', 'hiking', 'future', 'online-friend'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 0,
      mentioned_in: ['chat'],
      first_mentioned: '2024-11-10'
    },
    social_media: {
      instagram: '@kai_storm_adventures'
    },
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'unmet-8',
    name: 'The Oracle',
    alias: ['Oracle', 'The Guide'],
    pronouns: 'it/its',
    archetype: 'mentor',
    role: 'Paracosm Guide',
    status: 'unmet',
    summary: 'A wise entity from my imagined world who appears in my dreams and creative writing. Represents inner wisdom and guidance.',
    tags: ['paracosm', 'imagined', 'wisdom', 'creative'],
    metadata: {
      relationship_type: 'imagined',
      closeness_score: 0,
      mentioned_in: ['entries', 'creative-work', 'dreams'],
      first_mentioned: '2023-05-15',
      source: 'paracosm'
    },
    memory_count: 12,
    relationship_count: 0
  },
  
  // === EDGE CASES: Characters with minimal data ===
  {
    id: 'minimal-1',
    name: 'Alex Unknown',
    alias: [],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Acquaintance',
    status: 'active',
    summary: 'Someone I met briefly at an event. We exchanged contact info but haven\'t connected much yet.',
    tags: ['acquaintance'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 25,
      first_met: '2024-09-15'
    },
    memory_count: 1,
    relationship_count: 0
  },
  {
    id: 'minimal-2',
    name: 'Dr. Smith',
    alias: ['Dr. Smith'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Former Professor',
    status: 'inactive',
    summary: 'A professor from my undergraduate years. We haven\'t been in touch since graduation.',
    tags: ['academic', 'past'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 45,
      first_met: '2018-09-01'
    },
    memory_count: 8,
    relationship_count: 1
  },
  
  // === HIGH MEMORY COUNT CHARACTERS ===
  {
    id: 'high-memory-1',
    name: 'Samantha "Sam" Rodriguez',
    first_name: 'Samantha',
    last_name: 'Rodriguez',
    alias: ['Sam', 'Samantha', 'Sammy', 'S-Rod'],
    pronouns: 'she/her',
    archetype: 'ally',
    role: 'Best Friend',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 98,
    is_nickname: false,
    summary: 'My best friend since high school. We\'ve been through everything together - breakups, career changes, family drama, celebrations. She knows me better than anyone.',
    tags: ['friendship', 'best-friend', 'support', 'loyalty', 'history', 'trust'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 98,
      first_met: '2012-09-01'
    },
    social_media: {
      instagram: '@sam_rodriguez',
      twitter: '@sam_ro',
      facebook: 'samantha.rodriguez',
      email: 'sam.rodriguez@example.com',
      phone: '+1-555-0201'
    },
    memory_count: 127,
    relationship_count: 45
  },
  
  // === CHARACTERS WITH MANY TAGS ===
  {
    id: 'many-tags-1',
    name: 'Dr. Marcus "Marc" Thompson',
    first_name: 'Marcus',
    last_name: 'Thompson',
    alias: generateNicknames('Dr. Marcus Thompson', 'A renaissance person - doctor, musician, writer, and mentor. He\'s been a huge influence in multiple areas of my life.', 'Renaissance Mentor', ['medicine', 'music', 'writing', 'mentorship', 'multi-talented', 'inspiration', 'guidance', 'creativity']),
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Multi-Faceted Mentor',
    status: 'active',
    importance_level: 'major',
    importance_score: 91,
    is_nickname: false,
    summary: 'A renaissance person - doctor, musician, writer, and mentor. He\'s been a huge influence in multiple areas of my life.',
    tags: ['medicine', 'music', 'writing', 'mentorship', 'multi-talented', 'inspiration', 'guidance', 'creativity', 'wisdom'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 87,
      first_met: '2019-06-10'
    },
    social_media: {
      website: 'marcusthompson.com',
      linkedin: 'marcus-thompson-md',
      instagram: '@marcus_thompson_md',
      twitter: '@dr_marcus_t'
    },
    memory_count: 67,
    relationship_count: 15
  },
  
  // === CHARACTERS WITH NO SOCIAL MEDIA ===
  {
    id: 'no-social-1',
    name: 'Grandma Li',
    first_name: null,
    last_name: 'Li',
    alias: ['Grandma', 'Nai Nai'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Grandmother',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 96,
    is_nickname: false,
    summary: 'My grandmother. She doesn\'t use social media, but we talk on the phone weekly. Her stories and wisdom are priceless.',
    tags: ['family', 'grandmother', 'wisdom', 'tradition'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 89,
      first_met: '1990-01-01'
    },
    social_media: {},
    memory_count: 41,
    relationship_count: 8
  },
  
  // === CHARACTERS WITH NICKNAMES (AUTO-GENERATED) ===
  {
    id: 'nickname-1',
    name: 'The Coffee Shop Friend',
    first_name: null,
    last_name: null,
    alias: ['Coffee Friend', 'Barista Friend'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Coffee Shop Regular',
    status: 'active',
    importance_level: 'minor',
    importance_score: 31,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'acquaintance',
    likelihood_to_meet: 'likely',
    summary: 'A friendly person I see regularly at my favorite coffee shop. We always have brief but pleasant conversations. I don\'t know their real name yet.',
    tags: ['coffee', 'casual-friend', 'regular', 'auto-generated'],
    metadata: {
      relationship_type: 'acquaintance',
      closeness_score: 45,
      first_met: '2023-01-15',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 8,
    relationship_count: 0
  },
  {
    id: 'nickname-2',
    name: 'The Midnight Philosopher',
    first_name: null,
    last_name: null,
    alias: ['Philosophy Friend', 'Late Night Thinker'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Philosophy Discussion Partner',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 54,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: false,
    relationship_depth: 'casual',
    likelihood_to_meet: 'unlikely',
    summary: 'Someone I met online who shares my love for deep philosophical discussions. We have late-night conversations about existence, meaning, and consciousness. Real name unknown.',
    tags: ['philosophy', 'online-friend', 'deep-conversations', 'auto-generated'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 72,
      first_met: '2022-11-20',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 15,
    relationship_count: 1
  },
  {
    id: 'nickname-3',
    name: 'The Gym Buddy',
    first_name: null,
    last_name: null,
    alias: ['Workout Partner', 'Fitness Friend'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Gym Partner',
    status: 'active',
    importance_level: 'minor',
    importance_score: 36,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'casual',
    likelihood_to_meet: 'likely',
    summary: 'A person I work out with regularly at the gym. We motivate each other and spot each other during workouts. Haven\'t learned their real name yet.',
    tags: ['fitness', 'gym', 'workout', 'auto-generated'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 58,
      first_met: '2023-03-10',
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 11,
    relationship_count: 0
  },
  
  // === THIRD PARTY / INDIRECT CHARACTERS ===
  {
    id: 'third-party-1',
    name: 'Sarah\'s Ex-Boyfriend',
    first_name: null,
    last_name: null,
    alias: ['Sarah\'s Ex', 'The Ex'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Friend\'s Ex',
    status: 'active',
    importance_level: 'background',
    importance_score: 15,
    is_nickname: true,
    proximity_level: 'third_party',
    has_met: false,
    relationship_depth: 'mentioned_only',
    likelihood_to_meet: 'never',
    context_of_mention: 'Mentioned by Sarah when talking about her past relationships',
    associated_with_character_ids: ['dummy-1'], // Associated with Sarah Chen
    summary: 'Sarah\'s ex-boyfriend that she mentioned in conversation. I\'ve never met him and probably never will. Just mentioned in passing.',
    tags: ['third-party', 'mentioned-only', 'auto-generated'],
    metadata: {
      relationship_type: 'third_party',
      closeness_score: 0,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 2,
    relationship_count: 0
  },
  {
    id: 'third-party-2',
    name: 'Marcus\'s Wife',
    first_name: null,
    last_name: null,
    alias: ['Marcus\'s Spouse', 'The Wife'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Mentor\'s Spouse',
    status: 'active',
    importance_level: 'background',
    importance_score: 12,
    is_nickname: true,
    proximity_level: 'indirect',
    has_met: false,
    relationship_depth: 'mentioned_only',
    likelihood_to_meet: 'possible',
    context_of_mention: 'Mentioned by Marcus when talking about his family life',
    associated_with_character_ids: ['dummy-2'], // Associated with Marcus Johnson
    summary: 'Marcus\'s wife. He\'s mentioned her a few times but I\'ve never met her. Might meet her at some point if I visit Marcus.',
    tags: ['indirect', 'mentioned-only', 'auto-generated'],
    metadata: {
      relationship_type: 'indirect',
      closeness_score: 5,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 3,
    relationship_count: 1
  },
  {
    id: 'distant-1',
    name: 'The Neighbor Downstairs',
    first_name: null,
    last_name: null,
    alias: ['Downstairs Neighbor', 'The Neighbor'],
    pronouns: 'they/them',
    archetype: 'friend',
    role: 'Neighbor',
    status: 'active',
    importance_level: 'background',
    importance_score: 8,
    is_nickname: true,
    proximity_level: 'distant',
    has_met: true,
    relationship_depth: 'acquaintance',
    likelihood_to_meet: 'likely',
    summary: 'My neighbor who lives downstairs. We\'ve exchanged brief greetings in the hallway but I don\'t really know them. Just a casual acquaintance.',
    tags: ['neighbor', 'acquaintance', 'auto-generated'],
    metadata: {
      relationship_type: 'acquaintance',
      closeness_score: 20,
      autoGenerated: true,
      fromNickname: true
    },
    social_media: {},
    memory_count: 4,
    relationship_count: 0
  },
  
  // === INACTIVE CHARACTERS ===
  {
    id: 'inactive-1',
    name: 'Tom Wilson',
    first_name: 'Tom',
    last_name: 'Wilson',
    alias: ['Tom', 'Tommy'],
    pronouns: 'he/him',
    archetype: 'friend',
    role: 'Former Roommate',
    status: 'inactive',
    importance_level: 'background',
    importance_score: 18,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'moderate',
    likelihood_to_meet: 'unlikely',
    summary: 'A former roommate from college. We were close then but drifted apart after graduation. Haven\'t talked in years.',
    tags: ['past', 'college', 'roommate'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 30,
      first_met: '2016-09-01'
    },
    social_media: {
      facebook: 'tom.wilson'
    },
    memory_count: 12,
    relationship_count: 3
  },
  
  // === ROMANTIC RELATIONSHIPS ===
  {
    id: 'char-001',
    name: 'Alex',
    first_name: 'Alex',
    last_name: null,
    alias: ['Alex'],
    pronouns: 'she/her',
    archetype: 'romantic',
    role: 'Girlfriend',
    status: 'active',
    importance_level: 'protagonist',
    importance_score: 95,
    is_nickname: false,
    summary: 'My girlfriend of 6 months. We met at a coffee shop downtown when I was working on a writing project during my creative transition. Alex is incredibly supportive of my shift from tech to creative work - she even helped me set up my home studio. She\'s met Sarah (my best friend) and Jordan (my sibling), and they all get along well. We often go on walks in Golden Gate Park together, and she makes me laugh even when I\'m stressed about music production deadlines. Great communication, shares my values, and respects my creative process.',
    tags: ['romantic', 'girlfriend', 'active', 'love', 'relationship'],
    metadata: {
      relationship_type: 'girlfriend',
      closeness_score: 92,
      affection_score: 0.92,
      compatibility_score: 0.95,
      relationship_health: 0.90,
      first_met: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 45,
    relationship_count: 1
  },
  {
    id: 'char-002',
    name: 'Jordan',
    first_name: 'Jordan',
    last_name: null,
    alias: ['Jordan'],
    pronouns: 'they/them',
    archetype: 'romantic',
    role: 'Crush',
    status: 'active',
    importance_level: 'major',
    importance_score: 75,
    is_nickname: false,
    summary: 'Someone I have a crush on from the local art scene. We met at a gallery opening about a month ago where I was networking for my creative work. Jordan (they/them) is very attractive, creative, and we had an interesting conversation about art and music. I\'m not entirely sure if they feel the same way, but there\'s definitely chemistry. I\'ve seen them at a few more gallery events since then. Sarah knows about this crush and thinks I should just ask them out, but I\'m being cautious since I\'m in a relationship with Alex.',
    tags: ['romantic', 'crush', 'active', 'attraction'],
    metadata: {
      relationship_type: 'crush',
      closeness_score: 75,
      affection_score: 0.75,
      compatibility_score: 0.70,
      relationship_health: 0.65,
      first_met: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 18,
    relationship_count: 1
  },
  {
    id: 'char-003',
    name: 'Reese',
    first_name: 'Reese',
    last_name: null,
    alias: ['Sam'],
    pronouns: 'they/them',
    archetype: 'romantic',
    role: 'Situationship',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 65,
    is_nickname: false,
    summary: 'We\'re in a situationship that started about 3 months ago from a dating app. Sam is fun to be around and there\'s no pressure, which was refreshing after my intense relationship with Morgan. We\'ve hung out at coffee shops and gone to a few music events together. Good physical chemistry but there\'s a lack of emotional intimacy and unclear boundaries. I\'m not sure where it\'s going, especially now that I\'m with Alex. Sarah thinks I should end it, but part of me likes having something casual.',
    tags: ['romantic', 'situationship', 'active', 'casual'],
    metadata: {
      relationship_type: 'situationship',
      closeness_score: 65,
      affection_score: 0.65,
      compatibility_score: 0.60,
      relationship_health: 0.55,
      first_met: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 22,
    relationship_count: 1
  },
  {
    id: 'char-004',
    name: 'Taylor',
    first_name: 'Taylor',
    last_name: null,
    alias: ['Taylor'],
    pronouns: 'she/her',
    archetype: 'past_romantic',
    role: 'Ex-Girlfriend',
    status: 'inactive',
    importance_level: 'supporting',
    importance_score: 40,
    is_nickname: false,
    summary: 'My ex-girlfriend from 2 years ago. We had amazing adventures together - we traveled a lot and she pushed me out of my comfort zone. Great physical chemistry, but we had communication issues and different life goals. She wanted stability and a traditional career path, while I was starting to feel the pull toward creative work. The relationship ended about a year ago due to jealousy problems and different values about commitment. Jordan was there for me during the breakup. I learned a lot from that relationship about what I actually want.',
    tags: ['romantic', 'ex', 'past', 'ended'],
    metadata: {
      relationship_type: 'ex_girlfriend',
      closeness_score: 40,
      affection_score: 0.40,
      compatibility_score: 0.65,
      relationship_health: 0.45,
      first_met: new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 38,
    relationship_count: 1
  },
  {
    id: 'char-005',
    name: 'Morgan',
    first_name: 'Morgan',
    last_name: null,
    alias: ['Morgan'],
    pronouns: 'they/them',
    archetype: 'past_romantic',
    role: 'Ex-Lover',
    status: 'inactive',
    importance_level: 'supporting',
    importance_score: 55,
    is_nickname: false,
    summary: 'An ex-lover from 3 years ago, before my relationship with Taylor. We had the deepest emotional connection I\'ve ever felt - incredible intellectual conversations about philosophy, art, and life. We understood each other on a profound level and spent hours talking in coffee shops and parks. But it was too intense, with unhealthy codependency patterns. We were both working in tech then, and the relationship burned us both out. It ended when I realized I needed space to figure out who I was. That relationship taught me about boundaries and the importance of maintaining my own identity.',
    tags: ['romantic', 'ex', 'past', 'intense', 'ended'],
    metadata: {
      relationship_type: 'ex_lover',
      closeness_score: 55,
      affection_score: 0.55,
      compatibility_score: 0.70,
      relationship_health: 0.50,
      first_met: new Date(Date.now() - 1095 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 52,
    relationship_count: 1
  },
  {
    id: 'char-006',
    name: 'Casey',
    first_name: 'Casey',
    last_name: null,
    alias: ['Casey'],
    pronouns: 'they/them',
    archetype: 'romantic',
    role: 'Infatuation',
    status: 'active',
    importance_level: 'major',
    importance_score: 80,
    is_nickname: false,
    summary: 'Someone I\'m infatuated with. We met at a music event about 2 weeks ago where Alex Rivera was performing. Casey is extremely attractive, charismatic, and charming - they make me feel butterflies. They\'re also into music production, which is exciting. I don\'t really know them well yet, so it might just be infatuation rather than a real connection. Sarah thinks I have a pattern of getting infatuated with creative people. I\'m trying to focus on my relationship with Alex, but Casey keeps showing up at events I attend.',
    tags: ['romantic', 'infatuation', 'active', 'attraction', 'obsession'],
    metadata: {
      relationship_type: 'infatuation',
      closeness_score: 80,
      affection_score: 0.80,
      compatibility_score: 0.65,
      relationship_health: 0.60,
      first_met: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    },
    social_media: {},
    memory_count: 12,
    relationship_count: 1
  },
  {
    id: 'char-007',
    name: 'Nova',
    first_name: 'Nova',
    last_name: null,
    alias: ['Nova'],
    pronouns: 'she/her',
    archetype: 'past_romantic',
    role: 'Past romantic connection',
    status: 'inactive',
    importance_level: 'supporting',
    importance_score: 68,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'close',
    summary: 'A past romantic connection with a blocked/no-contact boundary. Demo Mode classifies Nova as Past, No Contact, and High Risk rather than active reconciliation.',
    tags: ['romantic', 'past', 'blocked', 'ghosted', 'high-risk'],
    metadata: {
      relationship_type: 'ex_lover',
      relationship_types: ['romantic', 'past'],
      categories: ['romantic'],
      closeness_score: 68,
      affection_score: 0.68,
      compatibility_score: 0.58,
      relationship_health: 0.18,
      no_contact: true
    },
    social_media: {},
    memory_count: 18,
    relationship_count: 1
  },
  {
    id: 'demo-family-aunt-maribel',
    name: 'Aunt Maribel',
    first_name: 'Maribel',
    last_name: null,
    alias: ['Aunt Maribel', 'Hallway Guardian'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Aunt',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 72,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'close',
    summary: 'Family member from the Whitmore-Chen side. Her contextual nickname, Hallway Guardian, demonstrates the app’s story-aware extra-name feature.',
    tags: ['family', 'aunt', 'whitmore-chen', 'nickname'],
    metadata: {
      relationship_type: 'family',
      relationship_types: ['family'],
      categories: ['family'],
      group_memberships: ['The Whitmore-Chen Family'],
      contextual_title: 'Hallway Guardian',
      closeness_score: 78
    },
    social_media: {},
    memory_count: 16,
    relationship_count: 5
  },
  {
    id: 'demo-family-nico',
    name: 'Nico',
    first_name: 'Nico',
    last_name: null,
    alias: ['Nico'],
    pronouns: 'he/him',
    archetype: 'family',
    role: 'Cousin',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 55,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'moderate',
    summary: 'Family member grouped under the Whitmore-Chen Family demo card.',
    tags: ['family', 'cousin', 'whitmore-chen'],
    metadata: {
      relationship_type: 'family',
      relationship_types: ['family'],
      categories: ['family'],
      group_memberships: ['The Whitmore-Chen Family'],
      closeness_score: 64
    },
    social_media: {},
    memory_count: 9,
    relationship_count: 4
  },
  {
    id: 'demo-family-nana-elena',
    name: 'Nana Elena',
    first_name: null,
    last_name: null,
    alias: ['Grandma', 'Nana'],
    pronouns: 'she/her',
    archetype: 'family',
    role: 'Grandmother',
    status: 'active',
    importance_level: 'major',
    importance_score: 90,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'close',
    summary: 'Family elder and memory keeper for the Whitmore-Chen Family demo group.',
    tags: ['family', 'grandmother', 'elder', 'whitmore-chen'],
    metadata: {
      relationship_type: 'family',
      relationship_types: ['family'],
      categories: ['family'],
      group_memberships: ['The Whitmore-Chen Family'],
      closeness_score: 88
    },
    social_media: {},
    memory_count: 32,
    relationship_count: 8
  },
  {
    id: 'demo-adrian-patel',
    name: 'Adrian Patel',
    first_name: 'Adrian',
    last_name: 'Patel',
    alias: ['Adrian', 'Code Harbor'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Teacher and mentor',
    status: 'active',
    importance_level: 'major',
    importance_score: 84,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'moderate',
    summary: 'Teacher and mentor from the Code Harbor Academy coding bootcamp. Demo Mode stores Adrian as the first name and Patel as the last name while also recognizing Code Harbor Academy as an organization/community.',
    tags: ['mentor', 'teacher', 'bootcamp', 'coding', 'professional', 'community'],
    metadata: {
      relationship_type: 'professional',
      relationship_types: ['mentor', 'teacher', 'professional'],
      categories: ['mentors', 'professional'],
      group_memberships: ['Code Harbor Academy'],
      group_role: 'Founder / teacher / mentor',
      closeness_score: 74
    },
    social_media: {},
    memory_count: 21,
    relationship_count: 3
  },
  {
    id: 'demo-summit-sloane',
    name: 'Sloane',
    first_name: 'Sloane',
    last_name: null,
    alias: ['Sloane from Summit Staffing'],
    pronouns: 'she/her',
    archetype: 'professional',
    role: 'Summit Staffing recruiting contact',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 63,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'casual',
    summary: 'Professional contact from Summit Staffing tied to onboarding paperwork and Northwind Logistics hiring.',
    tags: ['professional', 'recruiter', 'summit staffing', 'northwind logistics', 'onboarding'],
    metadata: {
      relationship_type: 'professional',
      relationship_types: ['professional', 'recruiter'],
      categories: ['professional'],
      group_memberships: ['Summit Staffing', 'Northwind Logistics'],
      group_role: 'Recruiting contact',
      closeness_score: 42
    },
    social_media: {},
    memory_count: 5,
    relationship_count: 2
  },
  {
    id: 'demo-summit-quinn',
    name: 'Quinn',
    first_name: 'Quinn',
    last_name: null,
    alias: ['Quinn from Summit Staffing'],
    pronouns: 'they/them',
    archetype: 'professional',
    role: 'Summit Staffing agency contact',
    status: 'active',
    importance_level: 'minor',
    importance_score: 46,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'casual',
    summary: 'Professional connection from the Summit Staffing hiring pipeline for Northwind Logistics.',
    tags: ['professional', 'agency', 'summit staffing', 'northwind logistics'],
    metadata: {
      relationship_type: 'professional',
      relationship_types: ['professional'],
      categories: ['professional'],
      group_memberships: ['Summit Staffing', 'Northwind Logistics'],
      group_role: 'Agency contact',
      closeness_score: 35
    },
    social_media: {},
    memory_count: 4,
    relationship_count: 2
  }
];

const findDemoCharacter = (id: string) => dummyCharacters.find(character => character.id === id);

const getDemoDuplicateGroups = (): DuplicateGroup[] => ([
  {
    match_type: 'exact',
    canonical_name: 'Alex',
    characters: ['char-001', 'char-alex-boyfriend']
      .map(findDemoCharacter)
      .filter((character): character is Character => Boolean(character))
      .map(withDemoAnalytics),
  },
  {
    match_type: 'containment',
    canonical_name: 'Alex / Alex Rivera',
    characters: ['dummy-3', 'char-alex-boyfriend']
      .map(findDemoCharacter)
      .filter((character): character is Character => Boolean(character))
      .map(withDemoAnalytics),
  },
] as DuplicateGroup[]).filter(group => group.characters.length >= 2);

const ITEMS_PER_PAGE = 18; // 3 columns × 6 rows on mobile, more on larger screens

type CharacterCategory = 'all' | 'family' | 'friends' | 'romantic' | 'mentors' | 'professional' | 'creative' | 'public_figure' | 'mentioned' | 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party';

// A public figure is an influencer/celebrity/artist/creator the user follows or
// encountered rather than an intimate connection. Flagged by the pipeline
// (entityFactsService sets metadata.public_figure / figure_type).
const isPublicFigure = (char: Character): boolean =>
  Boolean((char.metadata as any)?.public_figure) ||
  Boolean((char.metadata as any)?.figure_type) ||
  String(char.importance_level ?? '') === 'public_figure' ||
  (char.metadata as any)?.social_standing?.tier === 'public_figure';

const normalizeSignalText = (value: unknown): string => (
  typeof value === 'string' ? value.toLowerCase().replace(/[._@-]+/g, ' ').trim() : ''
);

const displayNameHasFamilyTitle = (name: string): boolean => {
  const normalized = normalizeSignalText(name);
  return /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother)(?:\s|$)/i.test(normalized);
};

const relationshipSignalsFor = (char: Character): Set<string> => {
  const signals = new Set<string>();
  const metadata = char.metadata ?? {};
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) signals.add(value.trim().toLowerCase());
  };
  const addMany = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(add);
    else add(value);
  };

  add(char.archetype);
  add(char.role);
  addMany(char.tags);
  add(metadata.relationship_type);
  addMany(metadata.relationship_types);
  addMany(metadata.categories);
  addMany((metadata as any).relationship_categories);
  addMany((metadata as any).confirmed_categories);
  addMany(metadata.group_types);

  if (displayNameHasFamilyTitle(char.name)) signals.add('family');

  // Deliberately exclude display name and aliases here. Stage names/handles can
  // contain kinship words ("Oscuri.dad", "Goth Tio", "Mom Jeans") without being
  // family. Family is inferred from relationship context, not arbitrary names.
  const text = [char.summary, char.role, char.context_of_mention, ...(char.tags ?? [])]
    .filter(Boolean)
    .map(normalizeSignalText)
    .join(' ');

  if (/\b(?:my|his|her|their|our)\s+(?:grandmother|grandfather|mom|dad|mother|father|sister|brother|cousin|aunt|uncle|grandma|grandpa|abuela|abuelo|t[ií]o|t[ií]a|family)\b/.test(text) || /\bfamily\s+(?:member|side|relative)\b/.test(text)) signals.add('family');
  if (/\b(dated|dating|date|romantic|girlfriend|boyfriend|situationship|crush|ex|hooked up|went out|partner|wife|husband)\b/.test(text)) signals.add('romantic');
  if (/\b(mentor|mentorship|teacher|instructor|bootcamp|coach|professor|advisor|taught me|guided me)\b/.test(text)) signals.add('mentor');
  if (/\b(summit staffing|northwind logistics|agency|recruiter|onboarding|hiring|background check|identity verification|paperwork|professional|colleague|coworker|co worker|job|career|client|manager|boss)\b/.test(text)) signals.add('professional');
  if (/\b(bandmate|creative|collaborator|collab|co founder|cofounder|artist|music|writing|producer|dj|show|set|song|studio|make music|record|perform)\b/.test(text)) signals.add('creative');
  if (/\b(friend|ally|buddy|roommate|homie|new friends?)\b/.test(text)) signals.add('friend');

  // Potential categories explain "maybe later" cases without promoting them to
  // confirmed filters too early.
  if (/\b(asked|might|could|potential(?:ly)?|want(?:ed)? to|trying to)\b.{0,40}\b(collab|collaborate|work together|make music|record|hire|book)\b/.test(text)) {
    signals.add('potential_professional');
    signals.add('creative');
  }

  return signals;
};

const characterMatchesRelationshipCategory = (char: Character, category: CharacterCategory): boolean => {
  const signals = relationshipSignalsFor(char);
  const met = char.status !== 'unmet';
  switch (category) {
    case 'family':
      return signals.has('family');
    case 'friends':
      return met && (signals.has('friend') || signals.has('ally'));
    case 'romantic':
      return met && (signals.has('romantic') || signals.has('past_romantic') || signals.has('dating') || signals.has('ex_girlfriend') || signals.has('ex_boyfriend') || signals.has('situationship') || signals.has('crush'));
    case 'mentors':
      return met && (signals.has('mentor') || signals.has('coach') || signals.has('teacher') || signals.has('instructor'));
    case 'professional':
      return met && (signals.has('professional') || signals.has('colleague') || signals.has('coworker') || signals.has('co-worker') || signals.has('recruiter'));
    case 'creative':
      return met && (signals.has('creative') || signals.has('collaborator') || signals.has('bandmate'));
    default:
      return true;
  }
};
type ImportanceFilter = 'all' | 'important' | 'high_impact' | 'protagonist' | 'major' | 'supporting' | 'minor' | 'background';
type SortOrder = 'role' | 'impact' | 'standing';

// Impact on the user: user-set override (metadata.impact_override) wins over
// computed analytics, so "minor in the story but big influence on me" sticks.
const impactOnUser = (c: Character): number => {
  const override = (c.metadata as any)?.impact_override;
  return typeof override === 'number' ? override : (c.analytics?.character_influence_on_user ?? 0);
};

// Romantic Relationship Type
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

export const CharacterBook = () => {
  const { user } = useAuth();
  const { useMockData: isMockDataEnabled, runtimeDataMode } = useMockData();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<CharacterCategory>('all');
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('role');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    minor: false,
    background: false
  });
  const [relationships, setRelationships] = useState<Map<string, RomanticRelationship>>(new Map());
  
  // Register mock data with service on mount — only for unauthenticated / demo sessions
  useEffect(() => {
    if (!user) {
      mockDataService.register.characters(dummyCharacters);
    }
  }, [user]);
  const [loading, setLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [mainCharacterModalOpen, setMainCharacterModalOpen] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { entries = [], chapters = [], refreshEntries } = useLoreKeeper();
  
  // Character extraction reads from the canonical chat-thread cache (not an isolated store).
  const chatMessages = useActiveChatMessages().map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp
  }));

  // Auto-extract characters from chat
  useCharacterExtraction(chatMessages, {
    enabled: !isMockDataEnabled && !!user?.id,
    onCharacterCreated: () => {
      void loadCharacters();
    }
  });

  // Realtime: refresh whenever the server-side ingestion pipeline promotes a
  // person entity to a character record (e.g. "uncle Nico" mentioned in chat).
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`characters:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `user_id=eq.${user.id}` },
        () => { void loadCharacters(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // loadCharacters is stable within a render; user.id is the only dep that matters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadCharacters = async () => {
    setLoading(true);

    if (isMockDataEnabled) {
      const result = mockDataService.getWithFallback.characters(null, true);
      setCharacters(result.data.map(withDemoAnalytics));
      setLoading(false);
      return;
    }
    
    try {
      const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
      const characterList = response?.characters || [];
      
      // Use mock data service to determine what to show - pass current toggle state
      const result = mockDataService.getWithFallback.characters(
        characterList.length > 0 ? characterList : null,
        isMockDataEnabled
      );
      // Normalize analytics for demo characters so cards render correctly
      const normalized = isMockDataEnabled
        ? result.data.map(withDemoAnalytics)
        : result.data;
      setCharacters(normalized);
    } catch {
      const result = mockDataService.getWithFallback.characters(null, isMockDataEnabled);
      const normalized = isMockDataEnabled ? result.data.map(withDemoAnalytics) : result.data;
      setCharacters(normalized);
    } finally {
      setLoading(false);
    }
  };

  const loadDuplicateGroups = async () => {
    if (isMockDataEnabled) {
      const activeIds = new Set(characters.length > 0 ? characters.map(character => character.id) : dummyCharacters.map(character => character.id));
      setDuplicateGroups(getDemoDuplicateGroups().map(group => ({
        ...group,
        characters: group.characters.filter(character => activeIds.has(character.id)),
      })).filter(group => group.characters.length >= 2));
      return;
    }
    if (!user?.id) {
      setDuplicateGroups([]);
      return;
    }
    try {
      const response = await fetchJson<{ duplicate_groups: DuplicateGroup[] }>('/api/characters/duplicates');
      setDuplicateGroups(response.duplicate_groups ?? []);
    } catch {
      setDuplicateGroups([]);
    }
  };

  const mergeDuplicateGroup = async (group: DuplicateGroup, targetId: string) => {
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const sources = group.characters.filter(character => character.id !== targetId);
      let lastMergedName = group.characters.find(character => character.id === targetId)?.name ?? 'the selected character';
      if (isMockDataEnabled) {
        setCharacters(prev => mergeCharactersLocally(prev, targetId, sources.map(source => source.id)));
        setDuplicateGroups(prev => prev.filter(existing => existing.canonical_name !== group.canonical_name));
        setMergeNotice(`Demo merge preview: consolidated ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'} into ${lastMergedName}. Aliases, memories, facts, relationships, and knowledge links are shown as combined locally.`);
        return;
      }
      for (const source of sources) {
        const result = await fetchJson<{ character?: Character | null; report?: { canonicalName?: string; memoriesMoved?: number; relationshipsMoved?: number; factsMoved?: number; aliases?: string[] } }>('/api/characters/merge', {
          method: 'POST',
          body: JSON.stringify({
            source_id: source.id,
            target_id: targetId,
            reason: `Merged from duplicate review (${group.match_type})`,
          }),
        });
        lastMergedName = result.character?.name ?? result.report?.canonicalName ?? lastMergedName;
      }
      apiCache.deletePattern(/\/api\/(characters|entity-resolution|omega-memory|knowledge)/);
      await loadCharacters();
      await loadDuplicateGroups();
      setMergeNotice(`Merged ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'} into ${lastMergedName}. Aliases, memories, facts, relationships, and knowledge links were consolidated.`);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge duplicate characters');
    } finally {
      setMergeBusy(false);
    }
  };

  const toggleSelectedForMerge = (characterId: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  const cancelManualMerge = () => {
    setSelectionMode(false);
    setSelectedForMerge(new Set());
    setMergeError(null);
  };

  const mergeSelectedCharacters = async (targetId: string) => {
    const sources = Array.from(selectedForMerge).filter(id => id !== targetId);
    if (sources.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      let mergedName = characters.find(character => character.id === targetId)?.name ?? 'the selected character';
      if (isMockDataEnabled) {
        setCharacters(prev => mergeCharactersLocally(prev, targetId, sources));
        cancelManualMerge();
        setDuplicateGroups(prev => prev
          .map(group => ({
            ...group,
            characters: group.characters.filter(character => character.id === targetId || !sources.includes(character.id)),
          }))
          .filter(group => group.characters.length >= 2)
        );
        setRecentlyUpdatedIds(new Set([targetId]));
        setTimeout(() => setRecentlyUpdatedIds(new Set()), 4000);
        setMergeNotice(`Demo merge preview: merged ${sources.length + 1} selected cards into ${mergedName}. The kept card now shows combined aliases, details, memories, facts, relationships, and knowledge links.`);
        return;
      }
      for (const sourceId of sources) {
        const result = await fetchJson<{ character?: Character | null; report?: { canonicalName?: string; memoriesMoved?: number; relationshipsMoved?: number; factsMoved?: number; aliases?: string[] } }>('/api/characters/merge', {
          method: 'POST',
          body: JSON.stringify({
            source_id: sourceId,
            target_id: targetId,
            reason: 'Merged from manual character selection',
          }),
        });
        mergedName = result.character?.name ?? result.report?.canonicalName ?? mergedName;
      }
      apiCache.deletePattern(/\/api\/(characters|entity-resolution|omega-memory|knowledge)/);
      cancelManualMerge();
      await loadCharacters();
      await loadDuplicateGroups();
      setRecentlyUpdatedIds(new Set([targetId]));
      setTimeout(() => setRecentlyUpdatedIds(new Set()), 4000);
      setMergeNotice(`Merged ${sources.length + 1} selected cards into ${mergedName}. The kept card now combines aliases, details, memories, facts, relationships, and knowledge links.`);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge selected characters');
    } finally {
      setMergeBusy(false);
    }
  };

  // Load romantic relationships
  const loadRelationships = async () => {
    try {
      let allRelationships: RomanticRelationship[] = [];
      
      if (isMockDataEnabled) {
        allRelationships = getMockRomanticRelationships() as RomanticRelationship[];
      } else {
        const data = await fetchJson<{ success: boolean; relationships: RomanticRelationship[] }>(
          '/api/conversation/romantic-relationships'
        );
        if (data.success) {
          allRelationships = data.relationships;
        }
      }

      // Create a map of character_id -> relationship
      const relationshipMap = new Map<string, RomanticRelationship>();
      allRelationships.forEach(rel => {
        if (rel.person_type === 'character') {
          relationshipMap.set(rel.person_id, rel);
        }
      });

      setRelationships(relationshipMap);
    } catch (error) {
      console.error('Failed to load relationships:', error);
    }
  };

  // Load on mount, when auth hydration completes (user?.id appears), and when
  // the mock toggle changes. The mount fetch can fire before the Supabase
  // session is hydrated → 401 → empty book; the user?.id dependency reloads
  // once the session is actually available.
  useEffect(() => {
    void loadCharacters();
    void loadRelationships();
    void loadDuplicateGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isMockDataEnabled]);

  // Ensure protagonist character exists and backfill from chat threads.
  useEffect(() => {
    if (!user?.id || isMockDataEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        await selfCharacterApi.ensureSelf();
        if (!cancelled) await loadCharacters();
        const sync = await selfCharacterApi.syncFromConversations({ limit: 80 });
        if (!cancelled && sync.processed > 0) {
          apiCache.deletePattern(/\/api\/(characters|knowledge)/);
          await loadCharacters();
          window.dispatchEvent(new CustomEvent('lk:characters-updated', { detail: {} }));
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isMockDataEnabled]);

  // Auto-open modal when navigated here from an entity chip (chat → characters).
  useEffect(() => {
    if (loading || characters.length === 0) return;
    const id = sessionStorage.getItem('highlightItem');
    if (!id) return;
    sessionStorage.removeItem('highlightItem');
    const match = characters.find(c => c.id === id);
    if (match) setSelectedCharacter(match);
  }, [loading, characters]);

  // Refresh + briefly highlight cards when the chat pipeline updates characters.
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem('lk_char_view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });
  const [showFamilyTree, setShowFamilyTree] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const ids: string[] = (e as CustomEvent<{ ids: string[] }>).detail?.ids ?? [];
      void loadCharacters();
      if (ids.length > 0) {
        setRecentlyUpdatedIds(new Set(ids));
        setTimeout(() => setRecentlyUpdatedIds(new Set()), 4000);
      }
    };
    window.addEventListener('lk:characters-updated', handler);
    return () => window.removeEventListener('lk:characters-updated', handler);
  }, []);

  // Convert entries to MemoryCard format for modal
  useEffect(() => {
    const memoryCards = entries.map(entry => memoryEntryToCard({
      id: entry.id,
      date: entry.date,
      content: entry.content,
      summary: entry.summary || null,
      tags: entry.tags || [],
      mood: entry.mood || null,
      chapter_id: entry.chapter_id || null,
      source: entry.source || 'manual',
      metadata: entry.metadata || {}
    }));
    setAllMemories(memoryCards);
  }, [entries]);

  const filteredCharacters = useMemo(() => {
    // Filter out places and the main character (shown in the dedicated card above).
    let filtered = characters.filter(char => char.archetype !== 'place' && !isSelfCharacter(char));
    
    // Filter by importance level
    if (importanceFilter !== 'all') {
      if (importanceFilter === 'important') {
        filtered = filtered.filter(char => {
          const level = char.importance_level || 'minor';
          return ['protagonist', 'major', 'supporting'].includes(level);
        });
      } else if (importanceFilter === 'high_impact') {
        filtered = filtered.filter(char => impactOnUser(char) >= 70);
      } else {
        filtered = filtered.filter(char => (char.importance_level || 'minor') === importanceFilter);
      }
    }
    
    // Filter by category. Relationship tabs match archetype OR
    // metadata.relationship_type consistently, so characters classified by
    // either signal (manual edit, promotion pipeline, or mock data) all land
    // in the right tab. Unmet people only appear under Mentioned / Unmet.
    if (activeCategory !== 'all') {
      filtered = filtered.filter(char => {
        switch (activeCategory) {
          case 'family':
          case 'friends':
          case 'romantic':
          case 'mentors':
          case 'professional':
          case 'creative':
            // Public figures belong in their own tab, not personal relationships.
            return !isPublicFigure(char) && characterMatchesRelationshipCategory(char, activeCategory);
          case 'public_figure':
            return isPublicFigure(char);
          case 'mentioned':
            return char.status === 'unmet' || char.relationship_depth === 'mentioned_only';
          case 'direct':
            return char.proximity_level === 'direct' && (char.has_met ?? true);
          case 'indirect':
            return char.proximity_level === 'indirect';
          case 'distant':
            return char.proximity_level === 'distant';
          case 'unmet':
            return !(char.has_met ?? true) || char.proximity_level === 'unmet';
          case 'third_party':
            return char.proximity_level === 'third_party';
          default:
            return true;
        }
      });
    }
    
    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (char) =>
          char.name.toLowerCase().includes(term) ||
          char.alias?.some((a) => a.toLowerCase().includes(term)) ||
          char.summary?.toLowerCase().includes(term) ||
          char.tags?.some((t) => t.toLowerCase().includes(term)) ||
          char.archetype?.toLowerCase().includes(term) ||
          char.role?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [characters, searchTerm, activeCategory, importanceFilter]);

  const mainCharacter = useMemo(() => {
    const self = characters.find(isSelfCharacter);
    if (self) return self;
    return buildSyntheticMainCharacter(user);
  }, [characters, user]);

  // Group characters by importance level (for "By role" view)
  const groupedByImportance = useMemo(() => {
    const groups: Record<string, Character[]> = {};
    filteredCharacters.forEach(char => {
      const level = isPublicFigure(char) ? 'public_figure' : char.importance_level || 'minor';
      if (!groups[level]) groups[level] = [];
      groups[level].push(char);
    });
    return groups;
  }, [filteredCharacters]);

  // Sorted by impact on you (for "By impact" view)
  const charactersByImpact = useMemo(() => {
    return [...filteredCharacters].sort((a, b) => impactOnUser(b) - impactOnUser(a));
  }, [filteredCharacters]);

  // Social standing (inner circle → peripheral), highest first. Tier ranks
  // first so a user-pinned tier outranks a higher raw score, then score
  // breaks ties within a tier.
  const charactersByStanding = useMemo(() => {
    const tierRank: Record<string, number> = {
      inner_circle: 4, close: 3, regular: 2, public_figure: 1.5, peripheral: 1,
    };
    const standing = (c: Character) => (c.metadata as any)?.social_standing as { tier?: string; score?: number } | undefined;
    const rank = (c: Character) => tierRank[standing(c)?.tier ?? ''] ?? 0;
    const score = (c: Character) => Number(standing(c)?.score ?? 0);
    return [...filteredCharacters].sort((a, b) => (rank(b) - rank(a)) || (score(b) - score(a)));
  }, [filteredCharacters]);

  const selectedCharacters = useMemo(
    () => characters.filter(character => selectedForMerge.has(character.id)),
    [characters, selectedForMerge]
  );

  const levelLabels: Record<string, string> = {
    protagonist: 'Protagonist',
    major: 'Major Characters',
    supporting: 'Supporting Characters',
    public_figure: 'Public Figures',
    minor: 'Minor Characters',
    background: 'Background Characters'
  };

  // Reset to page 1 when search, category, importance filter, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory, importanceFilter, sortOrder]);

  // Calculate pagination - always use grid pagination (multiple characters per page)
  const totalPages = Math.ceil(filteredCharacters.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCharacters = filteredCharacters.slice(startIndex, endIndex);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys if not typing in an input
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

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="character-book">
      <ChatFirstViewHint />
      <DetectedCharacterSuggestions
        demoMode={isMockDataEnabled}
        existingCharacterNames={
          isMockDataEnabled
            ? getMockCharacterSuggestionBookNames('general')
            : characters.flatMap(c => [c.name, ...(c.alias ?? [])])
        }
        onCharacterAdded={() => {
          if (isMockDataEnabled) {
            setMergeNotice('Demo: character added to your book preview — sign in to persist real suggestions.');
          }
          void loadCharacters();
        }}
      />
      {/* User Profile */}
      <div className="space-y-3 sm:space-y-4">
        <UserProfile characters={characters} />
      </div>

      {duplicateGroups.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-100">
                {duplicateGroups.length} possible duplicate character {duplicateGroups.length === 1 ? 'group' : 'groups'}
              </p>
              <p className="text-xs text-amber-100/65">
                Review before merging. Exact matches are usually safe; containment matches need judgment.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowMergeDialog(true)}
            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30"
          >
            Review duplicates
          </Button>
        </div>
      )}

      {mergeNotice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {mergeNotice}
        </div>
      )}

      {/* People On Your Mind Lately */}
      {(() => {
        const displayNameForMindChip = (character: Character) => {
          const structuredName = [character.first_name, character.last_name]
            .filter((part): part is string => Boolean(part?.trim()))
            .join(' ')
            .trim();
          return structuredName || character.name;
        };

        const recent = [...characters]
          .filter(c => !isSelfCharacter(c))
          .filter(c => (c.analytics?.recency_score ?? 0) > 0)
          .sort((a, b) => (b.analytics?.recency_score ?? 0) - (a.analytics?.recency_score ?? 0))
          .slice(0, 6);
        if (recent.length === 0) return null;
        return (
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2.5">
              People On Your Mind Lately
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {recent.map(c => {
                const closeness = c.analytics?.closeness_score ?? 0;
                const displayName = displayNameForMindChip(c);
                const phase = (() => {
                  const r = c.analytics?.recency_score ?? 0;
                  if (closeness >= 70 && r >= 0.6) return { label: 'Core',    cls: 'text-purple-300', icon: <Flame className="h-2.5 w-2.5" /> };
                  if (closeness >= 45 || r >= 0.4) return { label: 'Active',  cls: 'text-cyan-300',   icon: <Zap className="h-2.5 w-2.5" /> };
                  if (closeness >= 20 || r >= 0.2) return { label: 'Fading',  cls: 'text-amber-300',  icon: <Wind className="h-2.5 w-2.5" /> };
                  return                            { label: 'Dormant', cls: 'text-gray-400',   icon: <Moon className="h-2.5 w-2.5" /> };
                })();
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCharacter(c)}
                    className="flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20 transition-all w-28 text-center"
                    title={displayName}
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                      <CharacterAvatar
                        url={c.avatar_url}
                        characterId={c.id}
                        archetype={c.archetype}
                        role={c.role}
                        name={displayName}
                        size={36}
                      />
                    </div>
                    <span className="text-[10px] text-white/80 leading-tight line-clamp-2 w-full">{displayName}</span>
                    <span className={`flex items-center gap-0.5 text-[9px] ${phase.cls}`}>
                      {phase.icon}{phase.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Character Search Bar and Navigation Tabs */}
      <div className="space-y-3 sm:space-y-4">
        <SearchWithAutocomplete<Character>
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search characters..."
          items={characters}
          getSearchableText={(c) =>
            [c.name, ...(c.alias ?? []), c.summary, ...(c.tags ?? []), c.archetype, c.role].filter(Boolean).join(' ')
          }
          getDisplayLabel={(c) => c.name}
          maxSuggestions={8}
          className="w-full"
          inputClassName="bg-black/40 border-border/50 text-white placeholder:text-white/40"
          emptyHint="No matching characters"
        />
        
        {/* Importance & Impact Filters */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-white/60">Filter:</label>
            <select
              data-testid="character-book-filter"
              value={importanceFilter}
              onChange={(e) => setImportanceFilter(e.target.value as ImportanceFilter)}
              className="bg-black/40 border border-border/50 text-white text-sm px-3 py-1.5 rounded-md"
            >
              <option value="all">All Characters</option>
              <option value="important">Important Only</option>
              <option value="high_impact">High impact on me (70+)</option>
              <option value="protagonist">Protagonist</option>
              <option value="major">Major</option>
              <option value="supporting">Supporting</option>
              <option value="minor">Minor</option>
              <option value="background">Background</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-white/60">Sort by:</label>
            <select
              data-testid="character-book-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="bg-black/40 border border-border/50 text-white text-sm px-3 py-1.5 rounded-md"
            >
              <option value="role">By role in story</option>
              <option value="impact">By impact on me</option>
              <option value="standing">By standing</option>
            </select>
          </div>
          <div className="flex flex-col items-start gap-1">
            <p className="text-[11px] leading-tight text-white/45">
              If the app creates duplicate or incorrect character cards, select them here to merge their details.
              {isMockDataEnabled ? ' Demo Mode previews the consolidation locally.' : ''}
            </p>
            <Button
              size="sm"
              variant={selectionMode ? 'subtle' : 'outline'}
              leftIcon={<GitMerge className="h-3.5 w-3.5" />}
              onClick={() => {
                if (selectionMode) cancelManualMerge();
                else setSelectionMode(true);
              }}
              className="text-xs"
            >
              {selectionMode ? 'Cancel merge' : 'Select to merge'}
            </Button>
          </div>
        </div>

        {selectionMode && (
          <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-3 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Manual character merge</p>
                <p className="text-xs text-white/55">
                  Select duplicate cards, then choose which card keeps the combined aliases, details, memories, and knowledge.
                </p>
              </div>
              <span className="text-xs text-white/45">{selectedForMerge.size} selected</span>
            </div>
            <div className="grid gap-2 text-xs text-white/55 sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <span className="font-semibold text-white/75">Keeps one identity</span>
                <p>The card you choose becomes the survivor and gets a smarter display name.</p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <span className="font-semibold text-white/75">Combines knowledge</span>
                <p>Aliases, summaries, tags, facts, memories, perceptions, and timeline moments move together.</p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/20 p-2">
                <span className="font-semibold text-white/75">Refreshes learning</span>
                <p>The character card reloads with updated signals, facts, and connections after merge.</p>
              </div>
            </div>
            {mergeError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {mergeError}
              </div>
            )}
            {selectedCharacters.length >= 2 && (
              <div className="flex flex-wrap gap-2">
                {selectedCharacters.map(character => (
                  <Button
                    key={character.id}
                    size="sm"
                    disabled={mergeBusy}
                    onClick={() => void mergeSelectedCharacters(character.id)}
                    leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                    className="text-xs"
                  >
                    Keep {character.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50">
          Characters can appear in multiple filters based on context. Confirmed signals show in filters now; tentative signals like “might collaborate” are learned but won&apos;t become professional until the story confirms it.
        </div>
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as CharacterCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex flex-wrap gap-1 justify-center sm:justify-start">
            <TabsTrigger 
              value="all" 
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0"
            >
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>All</span>
            </TabsTrigger>
            <TabsTrigger 
              value="family"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Heart className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Family</span>
            </TabsTrigger>
            <TabsTrigger 
              value="friends"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Friends</span>
            </TabsTrigger>
            <TabsTrigger 
              value="romantic"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 text-xs sm:text-sm flex-shrink-0"
            >
              <HeartIcon className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Romantic</span>
            </TabsTrigger>
            <TabsTrigger 
              value="mentors"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm flex-shrink-0"
            >
              <GraduationCap className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Mentors</span>
            </TabsTrigger>
            <TabsTrigger 
              value="professional"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Briefcase className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Professional</span>
              <span className="sm:hidden">Pro</span>
            </TabsTrigger>
            <TabsTrigger 
              value="creative"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Palette className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Creative</span>
            </TabsTrigger>
            <TabsTrigger
              value="public_figure"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Star className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Public Figures</span>
              <span className="sm:hidden">Public</span>
            </TabsTrigger>
            <TabsTrigger 
              value="mentioned"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm flex-shrink-0"
            >
              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Mentioned</span>
            </TabsTrigger>
            <TabsTrigger 
              value="direct"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400 text-xs sm:text-sm flex-shrink-0"
            >
              <User className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Direct</span>
            </TabsTrigger>
            <TabsTrigger 
              value="indirect"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Link2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Indirect</span>
            </TabsTrigger>
            <TabsTrigger 
              value="unmet"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm flex-shrink-0"
            >
              <UserX className="h-3 w-3 sm:h-4 sm:w-4" />
              <span>Unmet</span>
            </TabsTrigger>
            <TabsTrigger 
              value="third_party"
              className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 text-xs sm:text-sm flex-shrink-0"
            >
              <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Third Party</span>
              <span className="sm:hidden">3rd</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Character Book</h2>
            <p className="text-xs sm:text-sm text-white/60 mt-1">
              {characters.length} total · {filteredCharacters.length} shown
              {loading && ' · Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Family Tree toggle — only shown in family category */}
            {activeCategory === 'family' && (
              <button
                type="button"
                onClick={() => setShowFamilyTree(f => !f)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showFamilyTree ? 'bg-pink-500/20 border-pink-500/40 text-pink-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}
                title={showFamilyTree ? 'Switch to character grid' : 'View family tree'}
              >
                <GitBranch className="h-3.5 w-3.5" />
                {showFamilyTree ? 'Grid' : 'Family Tree'}
              </button>
            )}
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => { setViewMode('grid'); try { localStorage.setItem('lk_char_view', 'grid'); } catch {} }}
                className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'}`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setViewMode('list'); try { localStorage.setItem('lk_char_view', 'list'); } catch {} }}
                className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/60'}`}
                title="List view"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              leftIcon={<RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />}
              onClick={() => void loadCharacters()}
              disabled={loading}
              size="sm"
              className="text-xs sm:text-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CharacterCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-white/60 px-4">
          <User className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-white/20" />
          {characters.length === 0 && runtimeDataMode === 'REAL' ? (
            <>
              <p className="text-base sm:text-lg font-medium mb-2">Your character graph is empty</p>
              <p className="text-xs sm:text-sm max-w-xs mx-auto">Mention people in your conversations and Lore Book will build your character graph from what you share</p>
            </>
          ) : (
            <>
              <p className="text-base sm:text-lg font-medium mb-2">No characters found</p>
              <p className="text-xs sm:text-sm">Try a different search term or filter</p>
            </>
          )}
        </div>
      ) : activeCategory === 'family' && showFamilyTree ? (
        /* ── Family Tree View ── */
        <div className="space-y-4">
          {/* Real users: conversation-inferred tree that grows as you mention family.
              Demo mode: the curated mock trees. */}
          {!isMockDataEnabled ? (
            <FamilyTreePanel
              scope="mine"
              title="No family tree yet"
              hint="Mention family members in chat (e.g. “my grandmother”, “my cousin Nico”) — LoreBook builds and grows your tree from your conversations, then fills in real names as you share them."
              onMemberClick={(memberId, memberName) => {
                const nameLc = memberName.toLowerCase();
                const match = characters.find(c =>
                  c.id === memberId ||
                  c.name.toLowerCase().includes(nameLc) ||
                  nameLc.includes(c.name.toLowerCase())
                );
                if (match) setSelectedCharacter(match);
              }}
            />
          ) : (
          <>
          {/* User's own family tree */}
          <div className="rounded-xl border border-pink-500/20 bg-pink-950/10 p-5">
            <p className="text-[10px] font-semibold text-pink-400/70 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Heart className="h-3.5 w-3.5" /> Your Family Tree
            </p>
            <FamilyTreeView
              tree={createMockUserFamilyTree()}
              onMemberClick={(member) => {
                const match = characters.find(c =>
                  c.name.toLowerCase().includes(member.first_name?.toLowerCase() ?? member.name.toLowerCase()) ||
                  member.name.toLowerCase().includes(c.name.toLowerCase())
                );
                if (match) setSelectedCharacter(match);
              }}
            />
          </div>

          {/* Individual trees for family members with their own data */}
          {filteredCharacters
            .filter(c => isMockDataEnabled && createMockFamilyTreeForCharacter(c.name) !== null)
            .map(c => {
              const tree = createMockFamilyTreeForCharacter(c.name);
              if (!tree) return null;
              return (
                <div key={c.id} className="rounded-xl border border-white/10 bg-white/4 p-5">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5" /> {c.name}&apos;s Family Tree
                  </p>
                  <FamilyTreeView
                    tree={tree}
                    compact={true}
                    onMemberClick={(member) => {
                      const match = characters.find(ch =>
                        ch.name.toLowerCase().includes(member.first_name?.toLowerCase() ?? member.name.toLowerCase())
                      );
                      if (match) setSelectedCharacter(match);
                    }}
                  />
                </div>
              );
            })}
          </>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* ── List View ── */
        <div className="space-y-4">
          <MainCharacterProfileCard
            character={mainCharacter}
            user={user}
            onClick={() => setMainCharacterModalOpen(true)}
          />
          <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden divide-y divide-white/6">
          {filteredCharacters.map(c => {
            const closeness = c.analytics?.closeness_score ?? 0;
            const recency   = c.analytics?.recency_score   ?? 0;
            const phase = closeness >= 70 && recency >= 0.6 ? { label: 'Core',    cls: 'text-purple-300 bg-purple-500/10', icon: <Flame className="h-2.5 w-2.5" /> }
                        : closeness >= 45 || recency >= 0.4 ? { label: 'Active',  cls: 'text-cyan-300   bg-cyan-500/10',   icon: <Zap   className="h-2.5 w-2.5" /> }
                        : closeness >= 20 || recency >= 0.2 ? { label: 'Fading',  cls: 'text-amber-300 bg-amber-500/10',   icon: <Wind  className="h-2.5 w-2.5" /> }
                        :                                      { label: 'Dormant', cls: 'text-gray-400   bg-gray-500/10',   icon: <Moon  className="h-2.5 w-2.5" /> };
            const closenessWidth = Math.min(100, closeness);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectionMode ? toggleSelectedForMerge(c.id) : setSelectedCharacter(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${
                  selectedForMerge.has(c.id) ? 'bg-primary/10 ring-1 ring-primary/40' : ''
                }`}
              >
                {selectionMode && (
                  <span
                    className={`h-5 w-5 rounded border flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      selectedForMerge.has(c.id)
                        ? 'border-primary bg-primary text-black'
                        : 'border-white/30 bg-black/50 text-white/50'
                    }`}
                    aria-hidden="true"
                  >
                    {selectedForMerge.has(c.id) ? '✓' : ''}
                  </span>
                )}
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <CharacterAvatar
                    url={c.avatar_url}
                    characterId={c.id}
                    archetype={c.archetype}
                    role={c.role}
                    name={c.name}
                    size={32}
                  />
                </div>

                {/* Name + role */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/90 truncate">{c.name}</p>
                  {c.role && <p className="text-xs text-white/45 truncate">{c.role}</p>}
                </div>

                {/* Closeness bar */}
                <div className="hidden sm:flex flex-col items-end gap-1 w-24 flex-shrink-0">
                  <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/60 rounded-full"
                      style={{ width: `${closenessWidth}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/30 tabular-nums">{Math.round(closeness)} closeness</span>
                </div>

                {/* Phase badge */}
                <span className={`hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${phase.cls} flex-shrink-0`}>
                  {phase.icon}{phase.label}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[72dvh] sm:min-h-[640px] lg:min-h-[720px] bg-gradient-to-br from-purple-950/20 via-black/40 to-purple-950/20 rounded-lg border border-purple-500/20 shadow-2xl overflow-hidden flex flex-col">
            {/* Page Content */}
            <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1 min-h-0">
              {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-white/10">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-purple-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      Character Book
                    </h3>
                    <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">
                      Page {currentPage}/{totalPages} · {filteredCharacters.length} characters
                    </p>
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs text-white/35 font-mono flex-shrink-0">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Main Character — full-width hero card at the top of the book */}
              <div className="mb-4 sm:mb-6 pb-4 sm:pb-5 border-b border-amber-500/15">
                <MainCharacterProfileCard
                  character={mainCharacter}
                  user={user}
                  onClick={() => setMainCharacterModalOpen(true)}
                />
              </div>

              {/* Character Grid - By impact or grouped by role */}
              <div className="flex-1 space-y-4 mb-4 sm:mb-6 min-h-0">
                {sortOrder === 'standing' ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-400" />
                      Your circle, closest first
                      <span className="text-xs font-normal text-white/40">({charactersByStanding.length})</span>
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {charactersByStanding.map((character, index) => {
                        try {
                          const isUpdated = character.id && recentlyUpdatedIds.has(character.id);
                          return (
                            <div
                              key={character.id || `char-${index}`}
                              className={isUpdated ? 'ring-2 ring-primary/70 rounded-lg transition-all duration-500' : ''}
                            >
                              <CharacterProfileCard
                                character={character}
                                relationship={relationships.get(character.id)}
                                selectionMode={selectionMode}
                                selected={selectedForMerge.has(character.id)}
                                onToggleSelected={() => toggleSelectedForMerge(character.id)}
                                onClick={() => {
                                  setSelectedCharacter(character);
                                }}
                              />
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })}
                    </div>
                  </div>
                ) : sortOrder === 'impact' ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-400" />
                      People by impact on you
                      <span className="text-xs font-normal text-white/40">({charactersByImpact.length})</span>
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {charactersByImpact.map((character, index) => {
                        try {
                          const isUpdated = character.id && recentlyUpdatedIds.has(character.id);
                          return (
                            <div
                              key={character.id || `char-${index}`}
                              className={isUpdated ? 'ring-2 ring-primary/70 rounded-lg transition-all duration-500' : ''}
                            >
                              <CharacterProfileCard
                                character={character}
                                relationship={relationships.get(character.id)}
                                selectionMode={selectionMode}
                                selected={selectedForMerge.has(character.id)}
                                onToggleSelected={() => toggleSelectedForMerge(character.id)}
                                onClick={() => {
                                  setSelectedCharacter(character);
                                }}
                              />
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })}
                    </div>
                  </div>
                ) : (
                  Object.entries(groupedByImportance)
                    .sort(([a], [b]) => {
                      const order: Record<string, number> = {
                        protagonist: 0,
                        major: 1,
                        supporting: 2,
                        public_figure: 3,
                        minor: 4,
                        background: 5
                      };
                      return (order[a] ?? 5) - (order[b] ?? 5);
                    })
                    .map(([level, chars]) => {
                      const isCollapsed = collapsedSections[level] ?? (['minor', 'background'].includes(level));
                      
                      // Skip empty groups
                      if (chars.length === 0) return null;
                      
                      return (
                        <div key={level} className="space-y-2">
                          <button
                            onClick={() => setCollapsedSections(prev => ({ ...prev, [level]: !prev[level] }))}
                            className="flex items-center gap-2 text-sm font-bold text-white hover:text-purple-300 transition-colors"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                            />
                            <span>{levelLabels[level] || level.charAt(0).toUpperCase() + level.slice(1)}</span>
                            <span className="text-xs font-normal text-white/40">({chars.length})</span>
                          </button>
                          {!isCollapsed && (
                            <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                              {chars.map((character, index) => {
                                try {
                                  const isUpdated = character.id && recentlyUpdatedIds.has(character.id);
                                  return (
                                    <div
                                      key={character.id || `char-${index}`}
                                      className={isUpdated ? 'ring-2 ring-primary/70 rounded-lg transition-all duration-500' : ''}
                                    >
                                      <CharacterProfileCard
                                        character={character}
                                        relationship={relationships.get(character.id)}
                                        selectionMode={selectionMode}
                                        selected={selectedForMerge.has(character.id)}
                                        onToggleSelected={() => toggleSelectedForMerge(character.id)}
                                        onClick={() => {
                                          setSelectedCharacter(character);
                                        }}
                                      />
                                    </div>
                                  );
                                } catch {
                                  return null;
                                }
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 pt-3 sm:pt-4 border-t border-white/10 mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-white/50 hover:text-white hover:bg-purple-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-1 sm:gap-2 flex-wrap justify-center">
                  {/* Page indicators */}
                  <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1 bg-black/40 rounded-lg border border-white/10 overflow-x-auto">
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
                          className={`px-1.5 sm:px-2 py-1 rounded text-xs sm:text-sm transition touch-manipulation ${
                            currentPage === pageNum
                              ? 'bg-purple-500 text-white'
                              : 'text-white/50 hover:text-white hover:bg-purple-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs sm:text-sm text-white/40 whitespace-nowrap">
                    {startIndex + 1}-{Math.min(endIndex, filteredCharacters.length)} of {filteredCharacters.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-white/50 hover:text-white hover:bg-purple-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                >
                  Next
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
          </div>
        </>
      )}

      {mainCharacterModalOpen && (
        <MainCharacterDetailModal
          character={mainCharacter}
          onClose={() => setMainCharacterModalOpen(false)}
          onUpdate={() => {
            void loadCharacters();
            setMainCharacterModalOpen(false);
          }}
        />
      )}

      {selectedCharacter && !isSelfCharacter(selectedCharacter) && (
        <CharacterDetailModal
          character={selectedCharacter}
          relationship={relationships.get(selectedCharacter.id)}
          onClose={() => {
            setSelectedCharacter(null);
          }}
          onUpdate={() => {
            void loadCharacters();
            void loadRelationships();
            setSelectedCharacter(null);
          }}
        />
      )}

      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-neutral-950 shadow-2xl max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Merge Duplicate Characters</h3>
                <p className="text-xs text-white/50">Choose the card to keep for each group. The survivor inherits the other card's aliases, memories, facts, relationships, and knowledge links.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeDialog(false)}
                className="text-white/50 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/55">
                Merging is for duplicate cards that describe the same real person. Use the name with the best official identity as the survivor. Lorekeeper keeps the other names as aliases and records merge history so the app keeps learning from the combined evidence.
              </div>
              {mergeError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {mergeError}
                </div>
              )}
              {duplicateGroups.map((group, index) => (
                <div key={`${group.canonical_name}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {group.match_type === 'exact'
                          ? 'Exact duplicate'
                          : group.match_type === 'alias'
                            ? 'Alias match'
                            : 'Review possible duplicate'}
                      </p>
                      <p className="text-xs text-white/45">
                        {group.canonical_name}
                        {typeof group.confidence === 'number' ? ` · ${Math.round(group.confidence * 100)}% confidence` : ''}
                        {group.reason ? ` · ${group.reason}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-white/35">
                      {group.characters.length} cards
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {group.characters.map(character => (
                      <div key={character.id} className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-white">{character.name}</p>
                          <p className="text-xs text-white/45">
                            {(character.alias ?? []).length > 0 ? `Aliases: ${(character.alias ?? []).join(', ')}` : 'No aliases'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          disabled={mergeBusy || group.characters.length < 2}
                          onClick={() => void mergeDuplicateGroup(group, character.id)}
                          leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                        >
                          Keep this
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {duplicateGroups.length === 0 && (
                <p className="text-sm text-white/55">No duplicate groups found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = allMemories.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};
