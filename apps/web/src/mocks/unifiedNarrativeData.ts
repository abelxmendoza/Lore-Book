/**
 * Unified Narrative Mock Data Generator
 * 
 * Creates a cohesive narrative ("The Creative Renaissance") with fully interconnected
 * entities where all stats match across relationships.
 * 
 * Core Narrative: A 28-year-old software engineer's 2-year journey transitioning
 * from tech to creative work.
 */

import type { Character } from '../components/characters/CharacterProfileCard';
import type { LocationProfile } from '../components/locations/LocationProfileCard';
import type { Skill } from '../types/skill';
import type { MemoryCard } from '../types/memory';

// ============================================================================
// Entity ID Constants (consistent across all mock data)
// ============================================================================

export const ENTITY_IDS = {
  // Characters (matching CharacterBook.tsx IDs)
  YOU: 'char-you',
  ALEX_BOYFRIEND: 'char-alex-boyfriend',
  ALEX_RIVERA: 'dummy-3', // Matches CharacterBook.tsx
  SARAH_CHEN: 'dummy-1', // Matches CharacterBook.tsx
  MARCUS_JOHNSON: 'dummy-2', // Matches CharacterBook.tsx
  EMMA_THOMPSON: 'dummy-8', // Matches CharacterBook.tsx
  MIKE: 'char-mike',
  ROBERT_CHEN: 'char-robert-chen',
  LINDA_CHEN: 'char-linda-chen',
  DAVID_CHEN: 'char-david-chen',
  JORDAN: 'dummy-4', // Matches CharacterBook.tsx
  TAYLOR: 'char-taylor',
  
  // Locations
  HOME_STUDIO: 'loc-home-studio',
  COFFEE_SHOP: 'loc-coffee-shop',
  CENTRAL_PARK: 'loc-central-park',
  MOUNTAIN_TRAIL: 'loc-mountain-trail',
  YOUR_APARTMENT: 'loc-your-apartment',
  TECH_OFFICE: 'loc-tech-office',
  MUSIC_STORE: 'loc-music-store',
  FANCY_RESTAURANT: 'loc-fancy-restaurant',
  
  // Skills
  MUSIC_PRODUCTION: 'skill-music-production',
  CREATIVE_WRITING: 'skill-creative-writing',
  AUDIO_ENGINEERING: 'skill-audio-engineering',
  SONGWRITING: 'skill-songwriting',
  JAVASCRIPT: 'skill-javascript',
  UI_UX_DESIGN: 'skill-ui-ux-design',
  GUITAR: 'skill-guitar',
  PUBLIC_SPEAKING: 'skill-public-speaking',
  PROJECT_MANAGEMENT: 'skill-project-management',
  PHOTOGRAPHY: 'skill-photography',
  
  // Events
  EP_CONCEPT_SESSION: 'event-ep-concept-session',
  FIRST_DATE_ALEX: 'event-first-date-alex',
  FIRST_KISS_ALEX: 'event-first-kiss-alex',
  I_LOVE_YOU_ALEX: 'event-i-love-you-alex',
  THREE_MONTH_ANNIVERSARY: 'event-three-month-anniversary',
  FIRST_COLLABORATION_SESSION: 'event-first-collaboration-session',
  MIDI_CONTROLLER_PURCHASE: 'event-midi-controller-purchase',
  FIRST_TRACK_COMPLETED: 'event-first-track-completed',
  FIRST_WRITING_SESSION: 'event-first-writing-session',
  CAREER_TRANSITION_SUPPORT: 'event-career-transition-support',
  MET_ALEX_THROUGH_SARAH: 'event-met-alex-through-sarah',
  EP_LISTENING_SESSION: 'event-ep-listening-session',
  FINAL_MIX_SESSION: 'event-final-mix-session',
} as const;

// ============================================================================
// Timeline Constants
// ============================================================================

const now = new Date();
const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
const oneAndHalfYearsAgo = new Date(now.getTime() - 547 * 24 * 60 * 60 * 1000);
const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
const threeYearsAgo = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);

// ============================================================================
// Types
// ============================================================================

export interface NarrativeEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  type: string;
  characters: string[]; // character IDs
  locations: string[]; // location IDs
  skills: string[]; // skill IDs
  memories: string[]; // memory IDs
  timeline_id?: string;
  summary: string;
}

export interface NarrativeLocation extends Omit<LocationProfile, 'relatedPeople'> {
  associated_characters: Array<{ character_id: string; visit_count: number }>;
  associated_skills: string[];
  associated_events: string[];
}

export interface NarrativeMemory extends MemoryCard {
  linked_characters: string[]; // character IDs
  linked_locations: string[]; // location IDs
  linked_events: string[]; // event IDs
  linked_skills: string[]; // skill IDs
  linked_memories: string[]; // related memory IDs
}

export interface UnifiedNarrativeData {
  characters: Character[];
  locations: NarrativeLocation[];
  skills: Skill[];
  events: NarrativeEvent[];
  memories: NarrativeMemory[];
  relationships: {
    characterCharacter: Map<string, Map<string, { type: string; closeness: number }>>;
    characterLocation: Map<string, Map<string, { visit_count: number; first_visit: string; last_visit: string }>>;
    characterSkill: Map<string, Map<string, { role: string; level_contribution?: number }>>;
    characterEvent: Map<string, Set<string>>;
    locationEvent: Map<string, Set<string>>;
    skillEvent: Map<string, Set<string>>;
    eventMemory: Map<string, Set<string>>;
  };
}

// ============================================================================
// Character Generators
// ============================================================================

function generateNarrativeCharacters(): Character[] {
  return [
    {
      id: ENTITY_IDS.ALEX_BOYFRIEND,
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
      is_nickname: false,
      summary: 'My girlfriend of 6 months. We met through Sarah at a coffee shop a year ago. She\'s incredibly supportive of my creative journey, often visiting my home studio to listen to my music. She makes me laugh, remembers the little things, and we share a love for hiking and nature. Our relationship has been growing stronger, and she was the first person I called when I had the EP concept breakthrough.',
      tags: ['romantic', 'supportive', 'relationship', 'creative'],
      metadata: {
        relationship_type: 'romantic',
        closeness_score: 92,
        first_met: oneYearAgo.toISOString().split('T')[0],
        relationships: {
          'dummy-1': { type: 'friend', closeness: 75 }, // Sarah
          'dummy-2': { type: 'friend', closeness: 70 }, // Marcus
        },
        locations: {
          [ENTITY_IDS.HOME_STUDIO]: { visit_count: 18, first_visit: sixMonthsAgo.toISOString(), last_visit: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString() },
          [ENTITY_IDS.COFFEE_SHOP]: { visit_count: 15, first_visit: oneYearAgo.toISOString(), last_visit: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() },
          [ENTITY_IDS.CENTRAL_PARK]: { visit_count: 6, first_visit: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() },
          [ENTITY_IDS.MOUNTAIN_TRAIL]: { visit_count: 6, first_visit: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString() },
        },
      },
      social_media: {},
      memory_count: 32,
      relationship_count: 5,
    },
    {
      id: 'dummy-3', // Alex Rivera (matches CharacterBook.tsx)
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
      is_nickname: false,
      summary: 'A talented music producer and creative collaborator. Alex Rivera and I work together on music production projects in my home studio. Marcus introduced us 1.5 years ago, and we\'ve been collaborating ever since. They\'ve been instrumental in helping me learn music production during my creative renaissance. We\'ve had 45 studio sessions together, and they helped me produce my first EP.',
      tags: ['collaboration', 'creativity', 'professional', 'innovation'],
      metadata: {
        relationship_type: 'professional',
        closeness_score: 78,
        first_met: oneAndHalfYearsAgo.toISOString().split('T')[0],
        relationships: {
          'dummy-2': { type: 'friend', closeness: 80 }, // Marcus
          'dummy-1': { type: 'friend', closeness: 65 }, // Sarah
        },
        locations: {
          [ENTITY_IDS.HOME_STUDIO]: { visit_count: 45, first_visit: oneAndHalfYearsAgo.toISOString(), last_visit: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString() },
          [ENTITY_IDS.COFFEE_SHOP]: { visit_count: 8, first_visit: new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString(), last_visit: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        },
        skills: {
          [ENTITY_IDS.MUSIC_PRODUCTION]: { role: 'teacher', level_contribution: 8 },
          [ENTITY_IDS.AUDIO_ENGINEERING]: { role: 'teacher', level_contribution: 5 },
        },
      },
      social_media: {
        github: 'alex-dev',
        website: 'alexrivera.dev',
      },
      memory_count: 45,
      relationship_count: 3,
    },
  ];
}

// ============================================================================
// Location Generators
// ============================================================================

function generateNarrativeLocations(): NarrativeLocation[] {
  return [
    {
      id: ENTITY_IDS.HOME_STUDIO,
      name: 'Home Studio',
      visitCount: 75, // 45 with Alex Rivera + 18 with Alex + 12 with Sarah
      firstVisited: oneAndHalfYearsAgo.toISOString(),
      lastVisited: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      coordinates: { lat: 37.7749, lng: -122.4194 },
      relatedPeople: [],
      tagCounts: [
        { tag: 'music', count: 45 },
        { tag: 'creative', count: 75 },
        { tag: 'production', count: 45 },
      ],
      chapters: [],
      moods: [
        { mood: 'focused', count: 50 },
        { mood: 'inspired', count: 20 },
        { mood: 'excited', count: 5 },
      ],
      entries: [],
      sources: ['journal', 'chat'],
      associated_characters: [
        { character_id: 'dummy-3', visit_count: 45 }, // Alex Rivera
        { character_id: ENTITY_IDS.ALEX_BOYFRIEND, visit_count: 18 }, // Alex (boyfriend)
        { character_id: 'dummy-1', visit_count: 12 }, // Sarah Chen
      ],
      associated_skills: [ENTITY_IDS.MUSIC_PRODUCTION, ENTITY_IDS.AUDIO_ENGINEERING],
      associated_events: [
        ENTITY_IDS.EP_CONCEPT_SESSION,
        ENTITY_IDS.FIRST_COLLABORATION_SESSION,
        ENTITY_IDS.FIRST_TRACK_COMPLETED,
        ENTITY_IDS.FINAL_MIX_SESSION,
        ENTITY_IDS.EP_LISTENING_SESSION,
      ],
      analytics: {
        visit_frequency: 0.14, // ~5 times per month
        recency_score: 85,
        total_visits: 75,
        importance_score: 90,
        priority_score: 88,
        relevance_score: 92,
        value_score: 90,
        sentiment_score: 85,
        comfort_score: 95,
        productivity_score: 95,
        social_score: 70,
        activity_diversity: 60,
        engagement_score: 90,
        associated_people_count: 3,
        first_visited_days_ago: 547,
        trend: 'increasing',
        primary_purpose: ['music production', 'creative work'],
        associated_activities: ['music production', 'collaboration', 'learning'],
      },
    },
    {
      id: ENTITY_IDS.COFFEE_SHOP,
      name: 'Coffee Shop Downtown',
      visitCount: 67, // 24 with Sarah + 20 with Marcus + 15 with Alex + 8 with Alex Rivera
      firstVisited: twoYearsAgo.toISOString(),
      lastVisited: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      coordinates: { lat: 37.7849, lng: -122.4094 },
      relatedPeople: [],
      tagCounts: [
        { tag: 'writing', count: 24 },
        { tag: 'meeting', count: 43 },
        { tag: 'creative', count: 24 },
      ],
      chapters: [],
      moods: [
        { mood: 'calm', count: 40 },
        { mood: 'focused', count: 20 },
        { mood: 'social', count: 7 },
      ],
      entries: [],
      sources: ['journal', 'chat'],
      associated_characters: [
        { character_id: 'dummy-1', visit_count: 24 }, // Sarah Chen
        { character_id: 'dummy-2', visit_count: 20 }, // Marcus Johnson
        { character_id: ENTITY_IDS.ALEX_BOYFRIEND, visit_count: 15 }, // Alex (boyfriend)
        { character_id: 'dummy-3', visit_count: 8 }, // Alex Rivera
      ],
      associated_skills: [ENTITY_IDS.CREATIVE_WRITING, ENTITY_IDS.SONGWRITING],
      associated_events: [
        ENTITY_IDS.FIRST_DATE_ALEX,
        ENTITY_IDS.FIRST_WRITING_SESSION,
        ENTITY_IDS.CAREER_TRANSITION_SUPPORT,
        ENTITY_IDS.MET_ALEX_THROUGH_SARAH,
      ],
      analytics: {
        visit_frequency: 0.09, // ~3 times per month
        recency_score: 90,
        total_visits: 67,
        importance_score: 85,
        priority_score: 80,
        relevance_score: 88,
        value_score: 85,
        sentiment_score: 80,
        comfort_score: 90,
        productivity_score: 75,
        social_score: 95,
        activity_diversity: 70,
        engagement_score: 85,
        associated_people_count: 4,
        first_visited_days_ago: 730,
        trend: 'stable',
        primary_purpose: ['writing', 'meetings', 'social'],
        associated_activities: ['creative writing', 'mentorship', 'dates'],
      },
    },
    {
      id: ENTITY_IDS.CENTRAL_PARK,
      name: 'Central Park',
      visitCount: 14, // 8 with Sarah + 6 with Alex
      firstVisited: new Date(now.getTime() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      lastVisited: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      coordinates: { lat: 37.7649, lng: -122.4294 },
      relatedPeople: [],
      tagCounts: [
        { tag: 'walking', count: 14 },
        { tag: 'nature', count: 14 },
        { tag: 'relationship', count: 6 },
      ],
      chapters: [],
      moods: [
        { mood: 'peaceful', count: 10 },
        { mood: 'romantic', count: 4 },
      ],
      entries: [],
      sources: ['journal'],
      associated_characters: [
        { character_id: 'dummy-1', visit_count: 8 }, // Sarah Chen
        { character_id: ENTITY_IDS.ALEX_BOYFRIEND, visit_count: 6 }, // Alex (boyfriend)
      ],
      associated_skills: [],
      associated_events: [ENTITY_IDS.FIRST_KISS_ALEX],
      analytics: {
        visit_frequency: 0.02,
        recency_score: 75,
        total_visits: 14,
        importance_score: 60,
        priority_score: 50,
        relevance_score: 65,
        value_score: 70,
        sentiment_score: 85,
        comfort_score: 90,
        productivity_score: 20,
        social_score: 100,
        activity_diversity: 30,
        engagement_score: 70,
        associated_people_count: 2,
        first_visited_days_ago: 200,
        trend: 'stable',
        primary_purpose: ['walking', 'nature', 'relationship'],
        associated_activities: ['walking', 'talking', 'dates'],
      },
    },
  ];
}

// ============================================================================
// Skill Generators
// ============================================================================

function generateNarrativeSkills(): Skill[] {
  return [
    {
      id: ENTITY_IDS.MUSIC_PRODUCTION,
      user_id: 'mock-user',
      skill_name: 'Music Production',
      skill_category: 'creative',
      current_level: 8,
      total_xp: 2400, // 300 per level
      xp_to_next_level: 300,
      description: 'Creating and producing music using digital audio workstations',
      first_mentioned_at: oneAndHalfYearsAgo.toISOString(),
      last_practiced_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      practice_count: 45, // matches studio sessions
      auto_detected: true,
      confidence_score: 0.95,
      is_active: true,
      metadata: {
        skill_details: {
          learned_from: [
            {
              character_id: 'dummy-3', // Alex Rivera
              character_name: 'Alex Rivera',
              relationship_type: 'teacher',
              first_mentioned: oneAndHalfYearsAgo.toISOString(),
              evidence_entry_ids: [],
            },
          ],
          practiced_at: [
            {
              location_id: ENTITY_IDS.HOME_STUDIO,
              location_name: 'Home Studio',
              practice_count: 45,
              last_practiced: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
              evidence_entry_ids: [],
            },
          ],
          arcs: [
            {
              arc_id: 'arc-first-album',
              arc_title: 'The First Album Arc',
              start_date: new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      },
      created_at: oneAndHalfYearsAgo.toISOString(),
      updated_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: ENTITY_IDS.CREATIVE_WRITING,
      user_id: 'mock-user',
      skill_name: 'Creative Writing',
      skill_category: 'creative',
      current_level: 7,
      total_xp: 2100,
      xp_to_next_level: 300,
      description: 'Writing creative stories, narratives, and prose',
      first_mentioned_at: twoYearsAgo.toISOString(),
      last_practiced_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      practice_count: 24, // matches coffee shop sessions with Sarah
      auto_detected: true,
      confidence_score: 0.90,
      is_active: true,
      metadata: {
        skill_details: {
          practiced_with: [
            {
              character_id: 'dummy-1', // Sarah Chen
              character_name: 'Sarah Chen',
              practice_count: 24,
              last_practiced: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              evidence_entry_ids: [],
            },
            {
              character_id: 'dummy-8', // Emma Thompson
              character_name: 'Emma Thompson',
              practice_count: 8,
              last_practiced: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
              evidence_entry_ids: [],
            },
          ],
          practiced_at: [
            {
              location_id: ENTITY_IDS.COFFEE_SHOP,
              location_name: 'Coffee Shop Downtown',
              practice_count: 24,
              last_practiced: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              evidence_entry_ids: [],
            },
          ],
        },
      },
      created_at: twoYearsAgo.toISOString(),
      updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

// ============================================================================
// Event Generators
// ============================================================================

function generateNarrativeEvents(): NarrativeEvent[] {
  const tenMonthsAgo = new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000);
  const fiveAndHalfMonthsAgo = new Date(now.getTime() - 165 * 24 * 60 * 60 * 1000);
  const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return [
    {
      id: ENTITY_IDS.EP_CONCEPT_SESSION,
      title: 'EP Concept Session',
      start_time: new Date(tenMonthsAgo.getTime() + 50 * 24 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(tenMonthsAgo.getTime() + 50 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
      type: 'creative_breakthrough',
      characters: ['dummy-3'], // Alex Rivera
      locations: [ENTITY_IDS.HOME_STUDIO],
      skills: [ENTITY_IDS.MUSIC_PRODUCTION],
      memories: ['mem-ep-concept-1', 'mem-ep-concept-2', 'mem-ep-concept-3', 'mem-ep-concept-4'],
      timeline_id: 'arc-first-album',
      summary: 'That late night when the EP concept fully crystallized. Sitting in my home studio at 2am, working with Alex Rivera, everything clicked into place.',
    },
    {
      id: ENTITY_IDS.FIRST_DATE_ALEX,
      title: 'First Date with Alex',
      start_time: sixMonthsAgo.toISOString(),
      end_time: new Date(sixMonthsAgo.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      locations: [ENTITY_IDS.COFFEE_SHOP],
      skills: [],
      memories: ['mem-first-date-1', 'mem-first-date-2', 'mem-first-date-3', 'mem-first-date-4'],
      summary: 'First date - we talked for 4 hours without noticing time pass. I knew this was something special.',
    },
    {
      id: ENTITY_IDS.FIRST_KISS_ALEX,
      title: 'First Kiss with Alex',
      start_time: fiveAndHalfMonthsAgo.toISOString(),
      end_time: fiveAndHalfMonthsAgo.toISOString(),
      type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      locations: [ENTITY_IDS.CENTRAL_PARK],
      skills: [],
      memories: ['mem-first-kiss-1', 'mem-first-kiss-2'],
      summary: 'First kiss under the stars in Central Park after our second date.',
    },
    {
      id: ENTITY_IDS.I_LOVE_YOU_ALEX,
      title: '"I Love You" with Alex',
      start_time: fourMonthsAgo.toISOString(),
      end_time: fourMonthsAgo.toISOString(),
      type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      locations: [ENTITY_IDS.YOUR_APARTMENT],
      skills: [],
      memories: ['mem-i-love-you-1', 'mem-i-love-you-2'],
      summary: 'He said "I love you" first. I felt the same way.',
    },
    {
      id: ENTITY_IDS.THREE_MONTH_ANNIVERSARY,
      title: '3-Month Anniversary',
      start_time: threeMonthsAgo.toISOString(),
      end_time: new Date(threeMonthsAgo.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      locations: [ENTITY_IDS.FANCY_RESTAURANT],
      skills: [],
      memories: ['mem-anniversary-1', 'mem-anniversary-2'],
      summary: '3 month anniversary dinner at a fancy restaurant.',
    },
    {
      id: ENTITY_IDS.FIRST_COLLABORATION_SESSION,
      title: 'First Collaboration Session with Alex Rivera',
      start_time: oneAndHalfYearsAgo.toISOString(),
      end_time: new Date(oneAndHalfYearsAgo.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      type: 'creative_collaboration',
      characters: ['dummy-3'], // Alex Rivera
      locations: [ENTITY_IDS.HOME_STUDIO],
      skills: [ENTITY_IDS.MUSIC_PRODUCTION],
      memories: ['mem-first-collab-1', 'mem-first-collab-2'],
      summary: 'First time working together in my home studio. Marcus introduced us and we clicked immediately.',
    },
    {
      id: ENTITY_IDS.FIRST_TRACK_COMPLETED,
      title: 'First Track Completed',
      start_time: oneYearAgo.toISOString(),
      end_time: oneYearAgo.toISOString(),
      type: 'creative_milestone',
      characters: ['dummy-3'], // Alex Rivera
      locations: [ENTITY_IDS.HOME_STUDIO],
      skills: [ENTITY_IDS.MUSIC_PRODUCTION, ENTITY_IDS.AUDIO_ENGINEERING],
      memories: ['mem-first-track-1', 'mem-first-track-2'],
      summary: 'Completed my first full track with Alex Rivera\'s help. A major milestone in my music production journey.',
    },
    {
      id: ENTITY_IDS.FINAL_MIX_SESSION,
      title: 'Final Mix Session for EP',
      start_time: twoWeeksAgo.toISOString(),
      end_time: new Date(twoWeeksAgo.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      type: 'creative_collaboration',
      characters: ['dummy-3'], // Alex Rivera
      locations: [ENTITY_IDS.HOME_STUDIO],
      skills: [ENTITY_IDS.MUSIC_PRODUCTION, ENTITY_IDS.AUDIO_ENGINEERING],
      memories: ['mem-final-mix-1', 'mem-final-mix-2'],
      summary: 'Final mixing session for the EP. Almost done!',
    },
    {
      id: ENTITY_IDS.EP_LISTENING_SESSION,
      title: 'EP Listening Session with Alex',
      start_time: twoWeeksAgo.toISOString(),
      end_time: new Date(twoWeeksAgo.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      type: 'relationship_milestone',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      locations: [ENTITY_IDS.HOME_STUDIO],
      skills: [],
      memories: ['mem-listening-1', 'mem-listening-2'],
      summary: 'Played the EP for Alex for the first time. She loved it and was so supportive.',
    },
  ];
}

// ============================================================================
// Memory Generators
// ============================================================================

function generateNarrativeMemories(): NarrativeMemory[] {
  const tenMonthsAgo = new Date(now.getTime() - 300 * 24 * 60 * 60 * 1000);
  const epConceptTime = new Date(tenMonthsAgo.getTime() + 50 * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'mem-ep-concept-1',
      title: 'That 2am moment when everything clicked',
      content: 'Sitting in my home studio at 2am, working with Alex Rivera, everything clicked into place. The concept would explore my transformation from tech to creative work, the relationships that shaped me, and finding my authentic voice.',
      date: epConceptTime.toISOString(),
      tags: ['ep', 'concept', 'breakthrough', 'creative'],
      mood: 'inspired',
      source: 'journal',
      sourceIcon: '📖',
      characters: ['dummy-3'], // Alex Rivera
      linked_characters: ['dummy-3'], // Alex Rivera
      linked_locations: [ENTITY_IDS.HOME_STUDIO],
      linked_events: [ENTITY_IDS.EP_CONCEPT_SESSION],
      linked_skills: [ENTITY_IDS.MUSIC_PRODUCTION],
      linked_memories: ['mem-ep-concept-2'],
    },
    {
      id: 'mem-ep-concept-2',
      title: 'Alex Rivera\'s excitement about the concept',
      content: 'Alex Rivera was so excited when I shared the EP concept. They immediately started brainstorming production ideas and ways to bring the vision to life.',
      date: epConceptTime.toISOString(),
      tags: ['ep', 'concept', 'collaboration'],
      mood: 'excited',
      source: 'journal',
      sourceIcon: '📖',
      characters: ['dummy-3'], // Alex Rivera
      linked_characters: ['dummy-3'], // Alex Rivera
      linked_locations: [ENTITY_IDS.HOME_STUDIO],
      linked_events: [ENTITY_IDS.EP_CONCEPT_SESSION],
      linked_skills: [ENTITY_IDS.MUSIC_PRODUCTION],
      linked_memories: ['mem-ep-concept-1', 'mem-ep-concept-3'],
    },
    {
      id: 'mem-ep-concept-3',
      title: 'Called Alex (boyfriend) to share the news',
      content: 'I called Alex (my girlfriend) right after the concept session to tell her about the breakthrough. She was so excited for me and immediately wanted to hear more.',
      date: new Date(epConceptTime.getTime() + 30 * 60 * 1000).toISOString(),
      tags: ['ep', 'concept', 'relationship'],
      mood: 'happy',
      source: 'journal',
      sourceIcon: '📖',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      linked_characters: [ENTITY_IDS.ALEX_BOYFRIEND],
      linked_locations: [ENTITY_IDS.HOME_STUDIO],
      linked_events: [ENTITY_IDS.EP_CONCEPT_SESSION],
      linked_skills: [],
      linked_memories: ['mem-ep-concept-2'],
    },
    {
      id: 'mem-ep-concept-4',
      title: 'The feeling of finally knowing what I wanted to create',
      content: 'After months of uncertainty, I finally knew what I wanted to create. This EP would be my story - my transformation, my relationships, my voice.',
      date: epConceptTime.toISOString(),
      tags: ['ep', 'concept', 'self-discovery'],
      mood: 'peaceful',
      source: 'journal',
      sourceIcon: '📖',
      characters: [],
      linked_characters: [],
      linked_locations: [ENTITY_IDS.HOME_STUDIO],
      linked_events: [ENTITY_IDS.EP_CONCEPT_SESSION],
      linked_skills: [ENTITY_IDS.MUSIC_PRODUCTION],
      linked_memories: ['mem-ep-concept-1'],
    },
    {
      id: 'mem-first-date-1',
      title: 'We talked for 4 hours without noticing time',
      content: 'First date with Alex. We met at the coffee shop and talked for 4 hours without noticing time pass. I knew this was something special.',
      date: sixMonthsAgo.toISOString(),
      tags: ['date', 'relationship', 'first'],
      mood: 'happy',
      source: 'journal',
      sourceIcon: '📖',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      linked_characters: [ENTITY_IDS.ALEX_BOYFRIEND],
      linked_locations: [ENTITY_IDS.COFFEE_SHOP],
      linked_events: [ENTITY_IDS.FIRST_DATE_ALEX],
      linked_skills: [],
      linked_memories: ['mem-first-date-2'],
    },
    {
      id: 'mem-first-date-2',
      title: 'His sense of humor made me laugh so much',
      content: 'Alex has such a great sense of humor. He made me laugh so much during our first date. I felt so comfortable with him.',
      date: sixMonthsAgo.toISOString(),
      tags: ['date', 'relationship', 'first'],
      mood: 'happy',
      source: 'journal',
      sourceIcon: '📖',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      linked_characters: [ENTITY_IDS.ALEX_BOYFRIEND],
      linked_locations: [ENTITY_IDS.COFFEE_SHOP],
      linked_events: [ENTITY_IDS.FIRST_DATE_ALEX],
      linked_skills: [],
      linked_memories: ['mem-first-date-1', 'mem-first-date-3'],
    },
    {
      id: 'mem-first-date-3',
      title: 'I knew this was something special',
      content: 'There was something different about Alex from the start. I knew this was something special, something I wanted to explore.',
      date: sixMonthsAgo.toISOString(),
      tags: ['date', 'relationship', 'first'],
      mood: 'hopeful',
      source: 'journal',
      sourceIcon: '📖',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      linked_characters: [ENTITY_IDS.ALEX_BOYFRIEND],
      linked_locations: [ENTITY_IDS.COFFEE_SHOP],
      linked_events: [ENTITY_IDS.FIRST_DATE_ALEX],
      linked_skills: [],
      linked_memories: ['mem-first-date-2', 'mem-first-date-4'],
    },
    {
      id: 'mem-first-date-4',
      title: 'The way he listened to my creative journey',
      content: 'Alex listened so intently when I told him about my transition from tech to creative work. He asked thoughtful questions and seemed genuinely interested.',
      date: sixMonthsAgo.toISOString(),
      tags: ['date', 'relationship', 'first'],
      mood: 'appreciated',
      source: 'journal',
      sourceIcon: '📖',
      characters: [ENTITY_IDS.ALEX_BOYFRIEND], // Alex (boyfriend)
      linked_characters: [ENTITY_IDS.ALEX_BOYFRIEND],
      linked_locations: [ENTITY_IDS.COFFEE_SHOP],
      linked_events: [ENTITY_IDS.FIRST_DATE_ALEX],
      linked_skills: [],
      linked_memories: ['mem-first-date-3'],
    },
  ];
}

// ============================================================================
// Relationship Matrix Builders
// ============================================================================

function buildRelationshipMatrices(data: {
  characters: Character[];
  locations: NarrativeLocation[];
  skills: Skill[];
  events: NarrativeEvent[];
  memories: NarrativeMemory[];
}): UnifiedNarrativeData['relationships'] {
  const characterCharacter = new Map<string, Map<string, { type: string; closeness: number }>>();
  const characterLocation = new Map<string, Map<string, { visit_count: number; first_visit: string; last_visit: string }>>();
  const characterSkill = new Map<string, Map<string, { role: string; level_contribution?: number }>>();
  const characterEvent = new Map<string, Set<string>>();
  const locationEvent = new Map<string, Set<string>>();
  const skillEvent = new Map<string, Set<string>>();
  const eventMemory = new Map<string, Set<string>>();

  // Build character-character relationships from character metadata
  for (const char of data.characters) {
    if (char.metadata?.relationships) {
      const charMap = new Map<string, { type: string; closeness: number }>();
      for (const [otherId, rel] of Object.entries(char.metadata.relationships)) {
        charMap.set(otherId, rel);
      }
      characterCharacter.set(char.id, charMap);
    }
  }

  // Build character-location relationships
  for (const char of data.characters) {
    if (char.metadata?.locations) {
      const locMap = new Map<string, { visit_count: number; first_visit: string; last_visit: string }>();
      for (const [locId, visit] of Object.entries(char.metadata.locations)) {
        locMap.set(locId, visit);
      }
      characterLocation.set(char.id, locMap);
    }
  }

  // Build character-skill relationships
  for (const char of data.characters) {
    if (char.metadata?.skills) {
      const skillMap = new Map<string, { role: string; level_contribution?: number }>();
      for (const [skillId, skillRel] of Object.entries(char.metadata.skills)) {
        skillMap.set(skillId, skillRel);
      }
      characterSkill.set(char.id, skillMap);
    }
  }

  // Build character-event relationships
  for (const event of data.events) {
    for (const charId of event.characters) {
      if (!characterEvent.has(charId)) {
        characterEvent.set(charId, new Set());
      }
      characterEvent.get(charId)!.add(event.id);
    }
  }

  // Build location-event relationships
  for (const event of data.events) {
    for (const locId of event.locations) {
      if (!locationEvent.has(locId)) {
        locationEvent.set(locId, new Set());
      }
      locationEvent.get(locId)!.add(event.id);
    }
  }

  // Build skill-event relationships
  for (const event of data.events) {
    for (const skillId of event.skills) {
      if (!skillEvent.has(skillId)) {
        skillEvent.set(skillId, new Set());
      }
      skillEvent.get(skillId)!.add(event.id);
    }
  }

  // Build event-memory relationships
  for (const event of data.events) {
    eventMemory.set(event.id, new Set(event.memories));
  }

  return {
    characterCharacter,
    characterLocation,
    characterSkill,
    characterEvent,
    locationEvent,
    skillEvent,
    eventMemory,
  };
}

// ============================================================================
// Main Generator Function
// ============================================================================

export function generateUnifiedNarrativeData(validate: boolean = false): UnifiedNarrativeData {
  const characters = generateNarrativeCharacters();
  const locations = generateNarrativeLocations();
  const skills = generateNarrativeSkills();
  const events = generateNarrativeEvents();
  const memories = generateNarrativeMemories();

  const relationships = buildRelationshipMatrices({
    characters,
    locations,
    skills,
    events,
    memories,
  });

  const data: UnifiedNarrativeData = {
    characters,
    locations,
    skills,
    events,
    memories,
    relationships,
  };

  // Validate stats match (always in development, optional in production)
  if (validate || (typeof window !== 'undefined' && process.env.NODE_ENV === 'development')) {
    // Dynamic import to avoid circular dependency
    import('./statsValidator').then(({ validateStatsMatch }) => {
      const result = validateStatsMatch(data);
      if (!result.valid) {
        console.warn('[UnifiedNarrativeData] Validation errors:', result.errors);
        if (result.warnings.length > 0) {
          console.warn('[UnifiedNarrativeData] Validation warnings:', result.warnings);
        }
      }
    }).catch(() => {
      // Silently fail if validator not available
    });
  }

  return data;
}
