/**
 * Skill Mock Data
 * 
 * Skills from "The Creative Renaissance" narrative with character/location/event
 * connections that match the unified narrative.
 */

import type { Skill } from '../types/skill';
import { ENTITY_IDS } from './unifiedNarrativeData';

const now = new Date();
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
const oneAndHalfYearsAgo = new Date(now.getTime() - 547 * 24 * 60 * 60 * 1000);
const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

export const narrativeSkills: Skill[] = [
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
    practice_count: 45, // matches studio sessions with Alex Rivera
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
        sagas: [
          {
            saga_id: 'saga-music-production',
            saga_title: 'The Music Production Saga',
            start_date: oneAndHalfYearsAgo.toISOString(),
          },
        ],
        eras: [
          {
            era_id: 'era-creative-renaissance',
            era_title: 'The Creative Renaissance',
            start_date: twoYearsAgo.toISOString(),
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
        eras: [
          {
            era_id: 'era-creative-renaissance',
            era_title: 'The Creative Renaissance',
            start_date: twoYearsAgo.toISOString(),
          },
        ],
      },
    },
    created_at: twoYearsAgo.toISOString(),
    updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: ENTITY_IDS.AUDIO_ENGINEERING,
    user_id: 'mock-user',
    skill_name: 'Audio Engineering',
    skill_category: 'technical',
    current_level: 5,
    total_xp: 1500,
    xp_to_next_level: 300,
    description: 'Technical aspects of audio production, mixing, and mastering',
    first_mentioned_at: oneAndHalfYearsAgo.toISOString(),
    last_practiced_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    practice_count: 45, // same sessions as music production
    auto_detected: true,
    confidence_score: 0.90,
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
      },
    },
    created_at: oneAndHalfYearsAgo.toISOString(),
    updated_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: ENTITY_IDS.SONGWRITING,
    user_id: 'mock-user',
    skill_name: 'Songwriting',
    skill_category: 'creative',
    current_level: 6,
    total_xp: 1800,
    xp_to_next_level: 300,
    description: 'Writing lyrics and composing songs',
    first_mentioned_at: oneYearAgo.toISOString(),
    last_practiced_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    practice_count: 24, // practiced at coffee shop with Sarah
    auto_detected: true,
    confidence_score: 0.85,
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
    created_at: oneYearAgo.toISOString(),
    updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default narrativeSkills;
