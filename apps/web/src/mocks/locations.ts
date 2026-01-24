/**
 * Location Mock Data
 * 
 * Locations from "The Creative Renaissance" narrative with matching stats
 * that align with character visits and events.
 */

import type { LocationProfile } from '../components/locations/LocationProfileCard';
import { ENTITY_IDS } from './unifiedNarrativeData';

const now = new Date();
const oneAndHalfYearsAgo = new Date(now.getTime() - 547 * 24 * 60 * 60 * 1000);
const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

export const narrativeLocations: LocationProfile[] = [
  {
    id: ENTITY_IDS.HOME_STUDIO,
    name: 'Home Studio',
    visitCount: 75, // 45 with Alex Rivera + 18 with Alex + 12 with Sarah
    firstVisited: oneAndHalfYearsAgo.toISOString(),
    lastVisited: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    coordinates: { lat: 37.7749, lng: -122.4194 },
    relatedPeople: [
      { id: 'dummy-3', name: 'Alex Rivera', total_mentions: 45, entryCount: 45 },
      { id: ENTITY_IDS.ALEX_BOYFRIEND, name: 'Alex', total_mentions: 18, entryCount: 18 },
      { id: 'dummy-1', name: 'Sarah Chen', total_mentions: 12, entryCount: 12 },
    ],
    tagCounts: [
      { tag: 'music', count: 45 },
      { tag: 'creative', count: 75 },
      { tag: 'production', count: 45 },
      { tag: 'collaboration', count: 45 },
    ],
    chapters: [
      { id: 'arc-first-album', title: 'The First Album Arc', count: 15 },
    ],
    moods: [
      { mood: 'focused', count: 50 },
      { mood: 'inspired', count: 20 },
      { mood: 'excited', count: 5 },
    ],
    entries: [],
    sources: ['journal', 'chat'],
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
    relatedPeople: [
      { id: 'dummy-1', name: 'Sarah Chen', total_mentions: 24, entryCount: 24 },
      { id: 'dummy-2', name: 'Marcus Johnson', total_mentions: 20, entryCount: 20 },
      { id: ENTITY_IDS.ALEX_BOYFRIEND, name: 'Alex', total_mentions: 15, entryCount: 15 },
      { id: 'dummy-3', name: 'Alex Rivera', total_mentions: 8, entryCount: 8 },
    ],
    tagCounts: [
      { tag: 'writing', count: 24 },
      { tag: 'meeting', count: 43 },
      { tag: 'creative', count: 24 },
      { tag: 'mentorship', count: 20 },
      { tag: 'date', count: 15 },
    ],
    chapters: [
      { id: 'era-creative-renaissance', title: 'The Creative Renaissance', count: 30 },
    ],
    moods: [
      { mood: 'calm', count: 40 },
      { mood: 'focused', count: 20 },
      { mood: 'social', count: 7 },
    ],
    entries: [],
    sources: ['journal', 'chat'],
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
    relatedPeople: [
      { id: 'dummy-1', name: 'Sarah Chen', total_mentions: 8, entryCount: 8 },
      { id: ENTITY_IDS.ALEX_BOYFRIEND, name: 'Alex', total_mentions: 6, entryCount: 6 },
    ],
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
  {
    id: ENTITY_IDS.MOUNTAIN_TRAIL,
    name: 'Mountain Trail',
    visitCount: 6, // All with Alex (boyfriend)
    firstVisited: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    lastVisited: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    coordinates: { lat: 37.7549, lng: -122.4394 },
    relatedPeople: [
      { id: ENTITY_IDS.ALEX_BOYFRIEND, name: 'Alex', total_mentions: 6, entryCount: 6 },
    ],
    tagCounts: [
      { tag: 'hiking', count: 6 },
      { tag: 'nature', count: 6 },
      { tag: 'relationship', count: 6 },
    ],
    chapters: [],
    moods: [
      { mood: 'energetic', count: 4 },
      { mood: 'peaceful', count: 2 },
    ],
    entries: [],
    sources: ['journal'],
    analytics: {
      visit_frequency: 0.01,
      recency_score: 80,
      total_visits: 6,
      importance_score: 50,
      priority_score: 40,
      relevance_score: 55,
      value_score: 60,
      sentiment_score: 90,
      comfort_score: 85,
      productivity_score: 10,
      social_score: 100,
      activity_diversity: 20,
      engagement_score: 60,
      associated_people_count: 1,
      first_visited_days_ago: 120,
      trend: 'stable',
      primary_purpose: ['hiking', 'nature', 'relationship'],
      associated_activities: ['hiking', 'talking'],
    },
  },
];

export default narrativeLocations;
