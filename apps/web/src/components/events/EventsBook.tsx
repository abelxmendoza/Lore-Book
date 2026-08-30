// =====================================================
// LIFE LOG (EventsBook)
// Purpose: Browse life as moments — scenes from conversations with evidence
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar, Clock, MapPin, Users, Sparkles, AlertCircle, Search,
  RefreshCw, ChevronLeft, ChevronRight, Filter, X, Cake, PartyPopper,
  Music2, Building2, Briefcase, Plane, Heart, Crown, Trophy,
  Gem, GraduationCap, Church, Gift, Handshake, Landmark,
  Repeat2, Star, TrendingUp, BookOpen, ArrowLeft, ArrowRight, Plus,
} from 'lucide-react';
import {
  formatDistanceToNow,
  isWithinInterval,
  parseISO,
  parseISO as dfParseISO,
  startOfDay,
  subDays,
  endOfDay,
} from 'date-fns';
import { StorySurfaceLinks } from '../story/StorySurfaceLinks';
import { buildEventsBookClipboardText } from '../../lib/eventsBookClipboard';
import {
  CATEGORY_SUB_TABS,
  eventMatchesCategory,
  type EventCategory,
} from '../../lib/eventsBookCategories';
import { clipboardFilterLines } from '../../lib/listClipboard';
import { patternContinuityLabel, buildPatternsClipboardText } from '../../lib/patternsClipboard';
import { formatEventTime } from '../../lib/formatEventTime';
import { fetchJson } from '../../lib/api';
import { getDisplayTitle } from '../../utils/displayTitle';
import { useEventsBookData } from '../../store/hooks/useEntityBooks';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { MemoryExplorer } from '../memory-explorer/MemoryExplorer';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  GridListViewToolbar,
  readStoredCardViewMode,
  type CardViewMode,
} from '../ui/GridListViewToolbar';
import { Input } from '../ui/input';
import { EventDetailModal } from './EventDetailModal';
import { EventProfileCard, type Event } from './EventProfileCard';
import { PostEventComposer } from './PostEventComposer';
import { listDemoUserPostedEvents } from '../../mocks/userPostedEventsDemo';

const ITEMS_PER_PAGE = 18;
const EVENTS_CARD_VIEW_STORAGE_KEY = 'lorebook.eventsBook.cardViewMode';
const PATTERNS_CARD_VIEW_STORAGE_KEY = 'lorebook.eventsBook.patternsViewMode';

// ─── Types ───────────────────────────────────────────────────────────────────

type RecurringScene = {
  id: string;
  canonical_title: string;
  dominant_entity_names?: string[];
  recurring_activities?: string[];
  emotional_tone?: string;
  occurrence_count: number;
  continuity_strength: number;
  first_seen_at: string;
  last_seen_at: string;
  source_event_ids?: string[];
  timeline_candidate?: boolean;
};

type ViewMode = 'events' | 'recurring';
type MomentsLayout = 'grid' | 'facts';
type ImpactFilter = 'all' | 'direct_participant' | 'indirect_affected' | 'related_person_affected' | 'observer' | 'ripple_effect';
type SignificanceFilter = 'all' | 'major' | 'moderate' | 'minor';
type SortOption = 'date_desc' | 'date_asc' | 'confidence_desc' | 'confidence_asc' | 'title_asc' | 'title_desc' | 'people_desc';
type DateRange = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

interface FilterState {
  dateRange: DateRange;
  customStartDate?: string;
  customEndDate?: string;
  types: string[];
  confidenceMin: number;
  confidenceMax: number;
  peopleCountMin: number;
  peopleCountMax: number;
  locations: string[];
  hasLocation: boolean | null;
  hasPeople: boolean | null;
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_CHIPS: { value: EventCategory; label: string; icon: React.ElementType; shortLabel?: string }[] = [
  { value: 'all', label: 'All', icon: Calendar },
  { value: 'recent', label: 'Recent', icon: Clock },
  { value: 'birthdays', label: 'Birthdays', icon: Cake, shortLabel: 'Bdays' },
  { value: 'quinceaneras', label: 'Quinceañeras', icon: Crown, shortLabel: 'Quince' },
  { value: 'weddings', label: 'Weddings', icon: Gem },
  { value: 'parties', label: 'Parties', icon: PartyPopper },
  { value: 'concerts_shows', label: 'Concerts & Shows', icon: Music2, shortLabel: 'Shows' },
  { value: 'conventions', label: 'Conventions', icon: Building2, shortLabel: 'Cons' },
  { value: 'sports', label: 'Sports', icon: Trophy },
  { value: 'festivals', label: 'Festivals', icon: Sparkles },
  { value: 'graduations', label: 'Graduations', icon: GraduationCap, shortLabel: 'Grads' },
  { value: 'religious_milestones', label: 'Religious & Cultural', icon: Church, shortLabel: 'Religious' },
  { value: 'work', label: 'Work', icon: Briefcase },
  { value: 'travel', label: 'Travel', icon: Plane },
  { value: 'family', label: 'Family', icon: Heart },
  { value: 'holidays', label: 'Holidays', icon: Gift },
  { value: 'community', label: 'Community', icon: Handshake },
  { value: 'government_civic', label: 'Government & Civic', icon: Landmark, shortLabel: 'Civic' },
  { value: 'with_people', label: 'With People', icon: Users },
  { value: 'with_locations', label: 'With Location', icon: MapPin },
];

const IMPACT_CHIPS: { value: ImpactFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All', activeClass: 'bg-white/10 text-white border-white/25' },
  { value: 'direct_participant', label: 'I Was There', activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { value: 'indirect_affected', label: 'Affects Me', activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { value: 'related_person_affected', label: 'Affects Someone Close', activeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  { value: 'observer', label: 'I Observed', activeClass: 'bg-gray-500/20 text-gray-300 border-gray-500/40' },
  { value: 'ripple_effect', label: 'Ripple Effects', activeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
];

const SIGNIFICANCE_CHIPS: { value: SignificanceFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All Scale', activeClass: 'bg-white/10 text-white border-white/25' },
  { value: 'major', label: '★ Major', activeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  { value: 'moderate', label: 'Moderate', activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { value: 'minor', label: 'Minor', activeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
];

const VIEWS: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: 'events', label: 'Moments', icon: Sparkles },
  { value: 'recurring', label: 'Patterns', icon: Repeat2 },
];

function getSignificanceScore(event: Event): number {
  return Math.round(
    (event.confidence * 40) +
    Math.min(30, (event.source_count ?? 0) * 5) +
    Math.min(20, (event.impact?.impactIntensity ?? 0) * 20) +
    Math.min(10, event.people.length * 2)
  );
}

// ─── Mock data ────────────────────────────────────────────────────────────────

type ImpactType = 'direct_participant' | 'indirect_affected' | 'related_person_affected' | 'observer' | 'ripple_effect';

// 20-slot cycle → precise distribution across all 5 impact types for 60 events
const IMPACT_CYCLE: ImpactType[] = [
  'direct_participant', 'direct_participant', 'direct_participant', 'direct_participant', 'direct_participant',
  'direct_participant', 'direct_participant',
  'indirect_affected', 'indirect_affected', 'indirect_affected', 'indirect_affected',
  'related_person_affected', 'related_person_affected', 'related_person_affected', 'related_person_affected',
  'observer', 'observer', 'observer',
  'ripple_effect', 'ripple_effect',
];

const IMPACT_DESCRIPTIONS: Record<ImpactType, string[]> = {
  direct_participant: [
    'You were actively there — this is a first-hand memory.',
    'You participated directly and shaped how this unfolded.',
    'This is yours. You were in the room when it happened.',
    'You showed up and this became part of your story.',
  ],
  indirect_affected: [
    'This event changed your situation even though you weren\'t physically there.',
    'The outcome reached you indirectly but it landed hard.',
    'This affected your life through the circumstances it set in motion.',
    'You felt the effects of this without being at the center of it.',
  ],
  related_person_affected: [
    'Someone close to you was at the center of this. You cared because they did.',
    'This mattered to you because of your relationship with the person involved.',
    'You weren\'t the subject — but someone who matters to you was.',
    'This shaped someone in your life, and by extension, shaped you.',
  ],
  observer: [
    'You witnessed this and noted it, even as a bystander.',
    'This entered your awareness from the outside — you heard or saw it happen.',
    'You observed this without being involved, but it stayed with you.',
    'You mentioned this in passing but something about it registered.',
  ],
  ripple_effect: [
    'The downstream effects of this moment reached you later.',
    'This set off a chain of events that eventually touched your life.',
    'The consequences rippled out — you weren\'t the target, but you felt the wave.',
    'This happened elsewhere, but its effects eventually found you.',
  ],
};

const CONNECTION_TYPES = ['close friend', 'family member', 'partner', 'colleague', 'roommate', 'mentor'];

const generateMockEvents = (): Event[] => {
  // Each bucket's titles/summaries are written to contain the same keywords
  // eventsBookCategories.ts's CATEGORY_KEYWORDS matches on, so every Life Log
  // category filter (birthdays, quinceañeras, weddings, parties, concerts &
  // shows, conventions, sports, festivals, graduations, religious milestones,
  // work, travel, family, holidays, community, government & civic) has demo
  // events that actually show up when that filter is selected.
  // health/education/personal/social/recreation are general "day-to-day"
  // flavor with no dedicated category — they still surface under
  // All/Recent/With People/With Location. None of the title-array lengths
  // below (4-8) divide the bucket count (21), so every bucket's 4
  // occurrences land on different title-array indices — no accidental
  // duplicate titles within a category. typeIdx's step (5) is coprime with
  // 21 so it still cycles through every bucket evenly.
  const eventTypes = [
    'birthday', 'quinceañera', 'wedding', 'party', 'concert', 'convention', 'sports',
    'festival', 'graduation', 'religious milestone', 'work', 'travel', 'family', 'holiday',
    'community event', 'civic event',
    'health', 'education', 'personal', 'social', 'recreation',
  ];
  const locations = ['Home', 'The Office', 'Corner Café', 'Riverside Park', 'The Gym', 'Cinema', 'Italian Place', 'Library', 'The Beach', 'Mountain Trail', 'Airport', 'Hotel Bar', 'Campus', 'Hospital', 'Museum of Art', 'The Venue', 'The Stadium', 'Community Hall'];
  const peopleNames = ['Maya', 'Jordan', 'Sarah', 'Marcus', 'Elena', 'Tom', 'Priya', 'Chris', 'Nadia', 'Sam', 'Alex', 'Lena', 'Mom', 'Dad', 'my sister', 'my brother'];
  const activities = ['meeting', 'coffee', 'hiking', 'workout', 'dinner', 'movie', 'talking', 'coding', 'traveling', 'learning', 'celebrating', 'cooking', 'drinking', 'dancing', 'running'];
  const events: Event[] = [];
  const now = Date.now();

  const titles: Record<string, string[]> = {
    birthday: [
      "Maya's Birthday Rooftop Party", 'Surprise Birthday Dinner for Jordan', 'My Birthday, Alone This Year',
      "Dad's 60th Birthday Bash", "Kid's Birthday Party at the Park", 'Turning Thirty Party That Got Wild',
      'Quiet Birthday With Just Family', 'Best Birthday in Years',
    ],
    quinceañera: [
      "Elena's Quinceañera at the Ballroom", "My Cousin's Quinceañera Court Rehearsal", 'Sofia\'s Quince Años Celebration',
      "Best Friend's Quinceañera Weekend", "My Sister's Quinceañera Photoshoot", 'Quinceañera Mass Followed by the Party',
      "My Niece's Quinceañera", 'Quinceañera Court Dance Rehearsal',
    ],
    wedding: [
      "Priya's Wedding Day", "Best Friend's Wedding in the Mountains", "My Cousin's Backyard Wedding",
      "Officiating My Brother's Wedding", 'Destination Wedding in Mexico', 'Courthouse Wedding, Just the Two of Us',
      'Dancing at the Wedding Reception Until 2am', 'Vows Under String Lights',
    ],
    party: [
      'House Party Into the Next Morning', "Jamie and Taylor's Wedding Reception", 'Baby Shower for Alex',
      "Game Night at Jordan's", 'Underground Rave Until Sunrise', "Afters at Sam's Place",
      'Backyard Wedding, Small and Perfect', 'Bridal Shower Brunch',
    ],
    concert: [
      'Concert at The Venue', 'Punk Show at the Basement', 'Open Mic Night',
      'Backyard Show at Northwind', 'Comedy Night Downtown', 'Fight Night Downtown',
      'Broadway Theater Night', 'Local Scene Gig at the Dive Bar',
    ],
    convention: [
      'Conference in Austin', 'Anime Expo Convention', 'Networking Meetup Downtown',
      'Comic Con Weekend', 'Industry Summit', 'Startup Expo Booth Duty',
      'Fan Con Weekend', 'Tech Meetup Mixer',
    ],
    sports: [
      'Rangers Baseball Game with Dad', 'Rec League Basketball Championship', 'Watching the Super Bowl With Friends',
      'Pickup Soccer Tournament', "My Team's Playoff Game", 'Little League Game Day',
      'Tailgate Before the Football Game', 'Watch Party for the World Cup Final',
    ],
    festival: [
      'Desert Rave Festival', 'Weekend Music Festival', 'Food Festival Downtown',
      'Art Fair in the Park', 'Multi-Day Camping Festival', 'Three-Day Arts Festival',
      'Neighborhood Food Fest', 'Electronic Festival Weekend',
    ],
    graduation: [
      'Walking at Graduation', 'College Graduation Ceremony', 'High School Graduation Day',
      'Grad School Commencement', "My Sister's Graduation", 'Graduation Dinner With the Whole Family',
      'Diploma in Hand, Finally', 'Cap and Gown Photos Before the Ceremony',
    ],
    'religious milestone': [
      "My Nephew's Baptism", 'Bar Mitzvah at the Temple', 'Bat Mitzvah Celebration for Maya',
      'First Communion Sunday', 'Confirmation Ceremony', 'Christening at the Family Church',
      'Godparent Duties at the Baptism', 'Family Gathered for the Bar Mitzvah',
    ],
    work: [
      'Performance Review', 'Client Presentation Panic', 'Sprint Planning', 'Late Night Crunch Session',
      'Promotion Discussion', 'New Manager First Meeting', 'Project Deadline Push', 'Team Standup That Went Sideways',
    ],
    travel: [
      'Weekend Getaway to Portland', 'Surprise Road Trip With Friends', 'First International Solo Vacation',
      'Business Trip to Austin', 'Family Visit Across the Country', 'Wrong Turn Road Trip That Led Somewhere Good',
      'Camping Weekend Vacation', 'Flight Delay Turned Into a Story',
    ],
    family: [
      'Family Reunion After 3 Years', 'Holiday Tension at Family Dinner', 'Anniversary Dinner Nobody Enjoyed',
      "Grandma's Family Visit", 'Family Dinner That Ran Long', "Dad's Retirement Anniversary",
      "Sibling's Big Announcement at Family Dinner", 'Family Video Call That Ran Long',
    ],
    holiday: [
      "Christmas Morning at Mom's", 'Thanksgiving Dinner, Tense as Usual', "New Year's Eve Countdown With Friends",
      'Fourth of July Cookout', 'Easter Brunch With the Family', "Halloween Party at the Neighbors'",
      'Hanukkah Candles With Grandma', 'Family Holiday Card Photo Chaos',
    ],
    'community event': [
      'Neighborhood Cleanup Day', 'Volunteering at the Food Bank', 'Charity Fundraiser Gala',
      'Blood Drive at the Community Center', 'Street Fair Volunteer Shift', 'Food Drive for the Local Shelter',
      'Habitat for Humanity Build Day', 'Community Garden Volunteer Morning',
    ],
    'civic event': [
      'Voting on Election Day', 'Jury Duty Week', 'City Council Meeting About the New Zoning',
      'Town Hall on the School Budget', 'Naturalization Ceremony Day', 'Public Hearing on the New Development',
      'Standing in Line to Vote Before Work', 'Civic Duty Call for Jury Selection',
    ],
    health: [
      'Therapy Session Breakthrough', 'First Day Back at the Gym', 'ER Visit at 2am',
      'Anxiety Spike During Work Call', 'Running Personal Record', 'Skipped Doctor Visit Again',
      'Sleep Clinic Consultation', 'Burnout Day',
    ],
    education: [
      'Accepted to the Program', 'Failed the Exam', 'Study Group Breakthrough',
      'Graduation Day', 'Dropped the Course', 'First Day of Class',
      'Research Presentation', 'Mentor Conversation That Changed Things',
    ],
    personal: [
      'Moved Into New Apartment', 'Cleared Out Old Storage Unit', 'Big Decision Made Alone at Night',
      'Quiet Day That Changed Something', 'Reconnected With an Old Hobby', 'Wrote the Letter',
      'That Walk Where Everything Clicked', 'Deleted the App Finally',
    ],
    social: [
      'Impromptu Dive Bar Night', 'First Date at The Observatory', 'Reconnecting With an Old Friend',
      'Group Dinner That Went Long', 'Coffee Catch-Up That Ran Hours',
    ],
    recreation: [
      'BJJ Open Mat Session', 'Gallery Opening', 'Sunrise Hike',
      'First Time Surfing', 'Spontaneous Nature Walk',
    ],
  };

  const summaries: Record<string, string[]> = {
    birthday: [
      'Good energy all night. Stayed longer than anyone planned.',
      'A quieter one this year, but it still meant something.',
      'Everyone showed up. That mattered more than the cake.',
      "Didn't expect to cry but the surprise got you.",
    ],
    quinceañera: [
      'The whole family in one room, dressed up and proud.',
      "Months of planning came together in one long, loud night.",
      'A tradition that means more every time you see it.',
      'Court, dances, dinner — a night nobody wanted to end.',
    ],
    wedding: [
      'The kind of day you replay for years.',
      'Speeches, tears, way too much cake — perfect.',
      'Vows outside, dinner under string lights, dancing till it hurt.',
      'Everyone who matters, in one room, for one reason.',
    ],
    party: [
      'Good energy all night. Stayed longer than anyone planned.',
      "Didn't want it to end. Didn't sleep much after either.",
      'Ended up somewhere unexpected. The best kind of night.',
      'One of those nights where you feel like yourself again.',
    ],
    concert: [
      'Loud, sweaty, and completely worth it.',
      'The kind of set that reminds you why you go to shows.',
      'Front row, no phone out, just there for it.',
      'Small crowd, big energy — the local scene at its best.',
    ],
    convention: [
      'Packed schedule but the hallway conversations were the real value.',
      'Left with more business cards than you know what to do with.',
      'Exhausting but energizing — the good kind of overwhelmed.',
      'Ran into people you hadn\'t seen since last year.',
    ],
    sports: [
      "Loud stadium, bad seats, best time in months.",
      "Came down to the final minute. Everyone was on their feet.",
      "Lost the game but the day was still a win.",
      "Screamed yourself hoarse and don't regret it.",
    ],
    festival: [
      'Three days, no sleep schedule, completely worth it.',
      'Discovered a new favorite act by accident.',
      'Hot, crowded, and somehow still magical.',
      'The kind of weekend you plan the whole year around.',
    ],
    graduation: [
      'Years of work compressed into one long ceremony and it was worth every minute.',
      "Proud doesn't begin to cover it.",
      'Sat through three hours of names just to hear one.',
      'The tassel move hit different than expected.',
    ],
    'religious milestone': [
      'A ceremony that means more than the party after it.',
      'Old traditions, same room, new generation.',
      'Everyone dressed up for something that actually mattered.',
      'Quiet, formal, and somehow still emotional.',
    ],
    work: [
      'The meeting went sideways — someone finally said what everyone was thinking.',
      'Harder conversation than expected but something important got clarified.',
      'The kind of day that reminds you why this job is complicated.',
      'Stayed late again. Made progress but the pressure is real.',
      'Left the room not sure if that went well or terribly.',
    ],
    travel: [
      'New place, new version of yourself for a few days.',
      'The delays and wrong turns were part of it.',
      'Left feeling like you needed to do this more often.',
      "The trip that made you realize what you'd been missing.",
    ],
    family: [
      "Quality time that reminded you why it's complicated and worth it.",
      'Old patterns showing up but this time you handled it differently.',
      "It's never just a dinner with family.",
      'More said between the lines than out loud.',
    ],
    holiday: [
      'Same traditions, same chaos, still good.',
      'The holiday that reminded you why you only do this once a year.',
      'Loud, warm, over too fast.',
      'Different this year, but still felt like the holiday.',
    ],
    'community event': [
      "Small effort, real difference — worth the Saturday.",
      "Didn't expect to feel this good about a few hours of work.",
      'Met more neighbors in one morning than in the last year.',
      'Tiring, unglamorous, and exactly the kind of thing that matters.',
    ],
    'civic event': [
      'Waited in line longer than expected but it felt important.',
      'The kind of civic thing you complain about and still show up for.',
      'More people showed up than you expected. That mattered.',
      'Bureaucratic, slow, and somehow still meaningful.',
    ],
    health: [
      'Harder than expected but you went. That matters.',
      'The thing you\'d been avoiding for months finally happened.',
      "Didn't break any records but showed up. That's the win.",
      'The kind of session where something shifts in how you see yourself.',
      "Not the news you wanted but you're dealing with it.",
    ],
    education: [
      'Walked out with more questions than answers. Good ones.',
      'The kind of learning that makes you rethink something older.',
      'Slower going than expected but real ground was covered.',
      "Something clicked that hadn't clicked before.",
    ],
    personal: [
      'Small moment that had more weight than expected.',
      'The kind of thing nobody else would understand but you know what it meant.',
      'A decision made quietly that will matter later.',
      'Alone but not lonely. Something resolved.',
    ],
    social: [
      'A bit awkward at first, then something clicked and it was great.',
      'Ended up talking for way longer than planned.',
      'One of those nights where you feel like yourself again.',
      'Good conversation, nothing fancy, exactly what you needed.',
    ],
    recreation: [
      'Lost track of time in the best way.',
      'Exactly what you needed. No agenda, just the thing itself.',
      'One of those rare moments where you were fully present.',
      'Messy but alive. Wouldn\'t have skipped it.',
    ],
  };

  // Emotional tone by type — guides card accent color
  const emotionalTone: Record<string, Array<'positive' | 'negative' | 'mixed' | 'neutral'>> = {
    birthday: ['positive', 'positive', 'mixed', 'positive'],
    quinceañera: ['positive', 'positive', 'mixed', 'positive'],
    wedding: ['positive', 'positive', 'mixed', 'positive'],
    party: ['positive', 'positive', 'mixed', 'positive'],
    concert: ['positive', 'positive', 'neutral', 'positive'],
    convention: ['neutral', 'positive', 'mixed', 'neutral'],
    sports: ['positive', 'mixed', 'negative', 'positive'],
    festival: ['positive', 'positive', 'mixed', 'positive'],
    graduation: ['positive', 'positive', 'neutral', 'positive'],
    'religious milestone': ['positive', 'neutral', 'positive', 'mixed'],
    work: ['mixed', 'mixed', 'negative', 'neutral'],
    travel: ['positive', 'mixed', 'positive', 'positive'],
    family: ['mixed', 'negative', 'positive', 'mixed'],
    holiday: ['mixed', 'positive', 'mixed', 'positive'],
    'community event': ['positive', 'positive', 'neutral', 'positive'],
    'civic event': ['neutral', 'mixed', 'positive', 'neutral'],
    health: ['mixed', 'negative', 'positive', 'neutral'],
    education: ['neutral', 'positive', 'mixed', 'neutral'],
    personal: ['neutral', 'positive', 'mixed', 'neutral'],
    social: ['positive', 'positive', 'mixed', 'positive'],
    recreation: ['positive', 'positive', 'mixed', 'positive'],
  };

  for (let i = 0; i < 84; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const startTime = new Date(now - daysAgo * 86400000);
    const endTime = new Date(startTime.getTime() + (Math.floor(Math.random() * 8) + 1) * 3600000);
    const typeIdx = (i * 5 + 3) % eventTypes.length; // pseudo-random but stable; step must stay coprime with eventTypes.length
    const type = eventTypes[typeIdx];
    const peopleCount = Math.random() > 0.25 ? Math.floor(Math.random() * 4) + 1 : 0;
    const locationCount = Math.random() > 0.2 ? 1 : 0;

    const typeTitles = titles[type] || ['Event'];
    const typeSummaries = summaries[type] || ['Something happened.'];
    const tones = emotionalTone[type] || ['neutral'];

    const impactType = IMPACT_CYCLE[i % IMPACT_CYCLE.length];
    const toneValue = tones[i % tones.length];
    const impactDescs = IMPACT_DESCRIPTIONS[impactType];
    const impactDesc = impactDescs[i % impactDescs.length];
    const eventPeople = peopleCount > 0
      ? Array.from({ length: peopleCount }, (_, k) => peopleNames[(i + k * 3) % peopleNames.length])
      : [];

    // For related_person_affected and ripple_effect, pick a connection character
    const connectionCharacter = (impactType === 'related_person_affected' || impactType === 'ripple_effect') && eventPeople.length > 0
      ? eventPeople[0]
      : undefined;
    const connectionType = connectionCharacter
      ? CONNECTION_TYPES[i % CONNECTION_TYPES.length]
      : undefined;

    // Impact intensity: direct > related > indirect > ripple > observer
    const intensityBase: Record<ImpactType, number> = {
      direct_participant: 0.75,
      indirect_affected: 0.55,
      related_person_affected: 0.65,
      observer: 0.35,
      ripple_effect: 0.50,
    };
    const impactIntensity = Math.min(1, intensityBase[impactType] + (Math.random() * 0.2 - 0.1));

    events.push({
      id: `event-${i + 1}`,
      title: typeTitles[i % typeTitles.length],
      summary: typeSummaries[i % typeSummaries.length],
      type,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      confidence: 0.55 + Math.random() * 0.42,
      people: eventPeople,
      locations: locationCount > 0 ? [locations[(i * 3 + 1) % locations.length]] : [],
      activities: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, k) => activities[(i + k * 5) % activities.length]),
      source_count: Math.floor(Math.random() * 6) + 1,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString(),
      impact: {
        type: impactType,
        emotionalImpact: toneValue,
        impactIntensity,
        impactDescription: impactDesc,
        connectionCharacter,
        connectionType,
      },
    });
  }
  return events;
};

const MOCK_EVENTS = generateMockEvents();

// ─── Mock recurring scenes ───────────────────────────────────────────────────

const msNow = Date.now();
const msDaysAgo = (n: number) => new Date(msNow - n * 86_400_000).toISOString();

const MOCK_SCENES: RecurringScene[] = [
  {
    id: 'scene-1',
    canonical_title: 'Punk Shows',
    dominant_entity_names: ['Maya', 'Jordan', 'Marcus'],
    recurring_activities: ['music', 'dancing', 'celebrating'],
    emotional_tone: 'positive',
    occurrence_count: 6,
    continuity_strength: 0.91,
    first_seen_at: msDaysAgo(280),
    last_seen_at: msDaysAgo(12),
    source_event_ids: ['event-4', 'event-11', 'event-22', 'event-35', 'event-44', 'event-58'],
    timeline_candidate: true,
  },
  {
    id: 'scene-2',
    canonical_title: 'Therapy Sessions',
    dominant_entity_names: [],
    recurring_activities: ['talking', 'learning'],
    emotional_tone: 'mixed',
    occurrence_count: 8,
    continuity_strength: 0.94,
    first_seen_at: msDaysAgo(310),
    last_seen_at: msDaysAgo(7),
    source_event_ids: ['event-3', 'event-8', 'event-17', 'event-24', 'event-33', 'event-41', 'event-52', 'event-57'],
    timeline_candidate: true,
  },
  {
    id: 'scene-3',
    canonical_title: 'Family Dinners',
    dominant_entity_names: ['Mom', 'Dad', 'my sister'],
    recurring_activities: ['dinner', 'cooking', 'talking'],
    emotional_tone: 'mixed',
    occurrence_count: 5,
    continuity_strength: 0.83,
    first_seen_at: msDaysAgo(250),
    last_seen_at: msDaysAgo(21),
    source_event_ids: ['event-6', 'event-19', 'event-29', 'event-43', 'event-55'],
    timeline_candidate: true,
  },
  {
    id: 'scene-4',
    canonical_title: 'BJJ Competitions',
    dominant_entity_names: ['Marcus', 'Chris'],
    recurring_activities: ['workout', 'celebrating', 'learning'],
    emotional_tone: 'positive',
    occurrence_count: 4,
    continuity_strength: 0.72,
    first_seen_at: msDaysAgo(200),
    last_seen_at: msDaysAgo(38),
    source_event_ids: ['event-9', 'event-27', 'event-46', 'event-60'],
    timeline_candidate: true,
  },
  {
    id: 'scene-5',
    canonical_title: 'Late Night Crunch Sessions',
    dominant_entity_names: ['Elena', 'Sam'],
    recurring_activities: ['coding', 'coffee', 'meeting'],
    emotional_tone: 'mixed',
    occurrence_count: 3,
    continuity_strength: 0.58,
    first_seen_at: msDaysAgo(130),
    last_seen_at: msDaysAgo(14),
    source_event_ids: ['event-15', 'event-36', 'event-54'],
    timeline_candidate: false,
  },
  {
    id: 'scene-6',
    canonical_title: 'First Dates',
    dominant_entity_names: [],
    recurring_activities: ['coffee', 'dinner', 'talking'],
    emotional_tone: 'mixed',
    occurrence_count: 2,
    continuity_strength: 0.42,
    first_seen_at: msDaysAgo(180),
    last_seen_at: msDaysAgo(65),
    source_event_ids: ['event-20', 'event-48'],
    timeline_candidate: false,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const EventsBook: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [momentsLayout, setMomentsLayout] = useState<MomentsLayout>('grid');
  const [cardViewMode, setCardViewMode] = useState<CardViewMode>(() =>
    readStoredCardViewMode(EVENTS_CARD_VIEW_STORAGE_KEY, 'grid'),
  );
  const [patternsViewMode, setPatternsViewMode] = useState<CardViewMode>(() =>
    readStoredCardViewMode(PATTERNS_CARD_VIEW_STORAGE_KEY, 'grid'),
  );
  const {
    events: serverEvents,
    eventsSuccess,
    loading: bookLoading,
    refetch: refetchEvents,
    assembleFromChats,
    isAssembling,
  } = useEventsBookData();
  const isMockDataEnabled = useShouldUseMockData();
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPostComposer, setShowPostComposer] = useState(false);
  const [postedRefresh, setPostedRefresh] = useState(0);

  const events = useMemo((): Event[] => {
    if (isMockDataEnabled) {
      const posted = listDemoUserPostedEvents() as unknown as Event[];
      return [...posted, ...MOCK_EVENTS];
    }
    return (serverEvents as Event[]) ?? [];
  }, [isMockDataEnabled, serverEvents, postedRefresh]);

  const loading = bookLoading || localLoading || isAssembling;

  const deepLinkQuery = (searchParams.get('q') || searchParams.get('person') || '').trim();
  const [searchTerm, setSearchTerm] = useState(deepLinkQuery);

  useEffect(() => {
    if (!deepLinkQuery) return;
    setSearchTerm(deepLinkQuery);
  }, [deepLinkQuery]);
  const [recurringScenes, setRecurringScenes] = useState<RecurringScene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<EventCategory>('all');
  const [activeSubCategory, setActiveSubCategory] = useState<string>('all');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('all');
  const [significanceFilter, setSignificanceFilter] = useState<SignificanceFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: 'all',
    types: [],
    confidenceMin: 0,
    confidenceMax: 1,
    peopleCountMin: 0,
    peopleCountMax: 10,
    locations: [],
    hasLocation: null,
    hasPeople: null,
  });

  useEffect(() => {
    if (isMockDataEnabled || loading) return;
    if (events.length === 0) {
      setError(eventsSuccess ? 'No events found yet' : 'Failed to load events');
    } else {
      setError(null);
    }
  }, [events.length, eventsSuccess, isMockDataEnabled, loading]);

  const loadEvents = async (options?: { assembleFromChats?: boolean }) => {
    setError(null);
    if (isMockDataEnabled) return;
    setLocalLoading(true);
    try {
      if (options?.assembleFromChats) {
        await assembleFromChats(3650);
      } else {
        await refetchEvents();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLocalLoading(false);
    }
  };

  // Load recurring scenes when that view is activated
  useEffect(() => {
    if (viewMode === 'recurring' && recurringScenes.length === 0) {
      void loadRecurringScenes();
    }
  }, [viewMode]);

  const loadRecurringScenes = async () => {
    setScenesLoading(true);
    try {
      if (isMockDataEnabled) {
        // Slight delay so the skeleton is visible for demo effect
        await new Promise(r => setTimeout(r, 600));
        setRecurringScenes(MOCK_SCENES);
        return;
      }
      const result = await fetchJson<{ success: boolean; scenes: RecurringScene[] }>(
        '/api/conversation/event-candidates'
      );
      if (result.success) setRecurringScenes(result.scenes);
    } catch {
      setRecurringScenes([]);
    } finally {
      setScenesLoading(false);
    }
  };

  const uniqueTypes = useMemo(() => Array.from(new Set(events.map(e => e.type).filter(Boolean) as string[])).sort(), [events]);
  const uniqueLocations = useMemo(() => Array.from(new Set(events.flatMap(e => e.locations))).sort(), [events]);

  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate = endOfDay(now);
      switch (filters.dateRange) {
        case 'today': startDate = startOfDay(now); break;
        case 'week': startDate = startOfDay(subDays(now, 7)); break;
        case 'month': startDate = startOfDay(subDays(now, 30)); break;
        case 'year': startDate = startOfDay(subDays(now, 365)); break;
        case 'custom':
          if (filters.customStartDate && filters.customEndDate) {
            startDate = startOfDay(parseISO(filters.customStartDate));
            endDate = endOfDay(parseISO(filters.customEndDate));
          } else { return filtered; }
          break;
        default: return filtered;
      }
      filtered = filtered.filter(e => !!e.start_time && isWithinInterval(parseISO(e.start_time), { start: startDate, end: endDate }));
    }

    if (filters.types.length > 0) filtered = filtered.filter(e => e.type && filters.types.includes(e.type));
    filtered = filtered.filter(e => e.confidence >= filters.confidenceMin && e.confidence <= filters.confidenceMax);
    filtered = filtered.filter(e => e.people.length >= filters.peopleCountMin && e.people.length <= filters.peopleCountMax);
    if (filters.locations.length > 0) filtered = filtered.filter(e => e.locations.some(l => filters.locations.includes(l)));
    if (filters.hasLocation !== null) filtered = filtered.filter(e => filters.hasLocation ? e.locations.length > 0 : e.locations.length === 0);
    if (filters.hasPeople !== null) filtered = filtered.filter(e => filters.hasPeople ? e.people.length > 0 : e.people.length === 0);
    if (impactFilter !== 'all') filtered = filtered.filter(e => e.impact?.type === impactFilter);
    if (activeCategory !== 'all') {
      filtered = filtered.filter((e) => eventMatchesCategory(e, activeCategory, activeSubCategory));
    }
    if (significanceFilter !== 'all') {
      filtered = filtered.filter(e => {
        const score = getSignificanceScore(e);
        if (significanceFilter === 'major') return score >= 60;
        if (significanceFilter === 'moderate') return score >= 25 && score < 60;
        return score < 25; // minor
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(term) ||
        (e.summary?.toLowerCase().includes(term)) ||
        (e.type?.toLowerCase().includes(term)) ||
        e.people.some(p => p.toLowerCase().includes(term)) ||
        e.locations.some(l => l.toLowerCase().includes(term)) ||
        e.activities.some(a => a.toLowerCase().includes(term))
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc': return (b.start_time ? new Date(b.start_time).getTime() : -Infinity) - (a.start_time ? new Date(a.start_time).getTime() : -Infinity);
        case 'date_asc': return (a.start_time ? new Date(a.start_time).getTime() : Infinity) - (b.start_time ? new Date(b.start_time).getTime() : Infinity);
        case 'confidence_desc': return b.confidence - a.confidence;
        case 'confidence_asc': return a.confidence - b.confidence;
        case 'title_asc': return a.title.localeCompare(b.title);
        case 'title_desc': return b.title.localeCompare(a.title);
        case 'people_desc': return b.people.length - a.people.length;
        default: return 0;
      }
    });
    return filtered;
  }, [events, searchTerm, activeCategory, activeSubCategory, filters, sortBy, impactFilter, significanceFilter]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeCategory, activeSubCategory, filters, sortBy, impactFilter, significanceFilter]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && currentPage > 1) { e.preventDefault(); setCurrentPage(p => p - 1); }
      else if (e.key === 'ArrowRight' && currentPage < totalPages) { e.preventDefault(); setCurrentPage(p => p + 1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.dateRange !== 'all') n++;
    if (filters.types.length > 0) n++;
    if (filters.confidenceMin > 0 || filters.confidenceMax < 1) n++;
    if (filters.peopleCountMin > 0 || filters.peopleCountMax < 10) n++;
    if (filters.locations.length > 0) n++;
    if (filters.hasLocation !== null) n++;
    if (filters.hasPeople !== null) n++;
    if (significanceFilter !== 'all') n++;
    if (activeSubCategory !== 'all' && CATEGORY_SUB_TABS[activeCategory]) n++;
    return n;
  }, [filters, significanceFilter, activeCategory, activeSubCategory]);

  const clearFilters = () => {
    setFilters({ dateRange: 'all', types: [], confidenceMin: 0, confidenceMax: 1, peopleCountMin: 0, peopleCountMax: 10, locations: [], hasLocation: null, hasPeople: null });
    setSearchTerm('');
    setActiveCategory('all');
    setActiveSubCategory('all');
    setImpactFilter('all');
    setSignificanceFilter('all');
  };

  const clipboardText = useMemo(
    () =>
      buildEventsBookClipboardText(filteredEvents, {
        filters: clipboardFilterLines([
          searchTerm.trim() && `search="${searchTerm.trim()}"`,
          activeCategory !== 'all' && `category=${activeCategory}`,
          activeSubCategory !== 'all' && `subcategory=${activeSubCategory}`,
          impactFilter !== 'all' && `impact=${impactFilter}`,
          significanceFilter !== 'all' && `significance=${significanceFilter}`,
          activeFilterCount > 0 && `advanced_filters=${activeFilterCount}`,
          `sort=${sortBy}`,
        ]),
      }),
    [
      filteredEvents,
      searchTerm,
      activeCategory,
      activeSubCategory,
      impactFilter,
      significanceFilter,
      activeFilterCount,
      sortBy,
    ],
  );

  const patternsClipboardText = useMemo(
    () => buildPatternsClipboardText(recurringScenes),
    [recurringScenes],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.07),transparent_35%),radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.07),transparent_30%)]">
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8 space-y-4">
      <header className="overflow-hidden rounded-3xl border border-white/[0.08] bg-black/25 p-5 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl min-w-0">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
              <Sparkles className="h-4 w-4" /> Life Log
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Moments</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
              Scenes from your conversations — and events you post with a date, place, and story.
            </p>
            <StorySurfaceLinks current="moments" className="mt-3" />
          </div>
          <Button
            type="button"
            className="w-full border border-amber-400/35 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30 sm:w-auto"
            onClick={() => setShowPostComposer(true)}
            data-testid="events-book-post-event"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Post event
          </Button>
        </div>

        <div className="mt-6 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.025] p-3.5">
            <p className="text-xl font-semibold text-white">{events.length}</p>
            <p className="mt-0.5 text-xs text-white/40">{events.length === 1 ? 'moment' : 'moments'} captured</p>
          </div>
          <div className="rounded-xl bg-white/[0.025] p-3.5">
            <p className="text-xl font-semibold text-white">{recurringScenes.length}</p>
            <p className="mt-0.5 text-xs text-white/40">recurring {recurringScenes.length === 1 ? 'pattern' : 'patterns'}</p>
          </div>
        </div>
      </header>

      {error && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
            <Button type="button" onClick={() => void loadEvents({ assembleFromChats: true })} variant="outline" size="sm" disabled={loading}>
              {loading ? 'Loading…' : 'Retry'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Primary content switch: Moments | Patterns ── */}
      <div className="flex w-full items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.04] p-1 sm:w-auto sm:inline-flex">
        {VIEWS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setViewMode(value);
              if (value === 'events') setMomentsLayout('grid');
            }}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 sm:flex-none justify-center
              ${viewMode === value
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }
            `}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Moment search + filters (grid layout only) ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && (
        <div className="sticky top-0 z-10 -mx-4 border-y border-white/[0.06] bg-black/75 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35" />
              <Input
                type="text"
                placeholder="Search moments by title, person, place, or activity…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-10 border-white/10 bg-white/[0.04] pl-10 text-sm text-white placeholder:text-white/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortBy}
                title="Sort moments"
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="h-9 flex-shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/40 sm:px-3 sm:text-sm"
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="confidence_desc">High Confidence</option>
                <option value="confidence_asc">Low Confidence</option>
                <option value="title_asc">Title A–Z</option>
                <option value="title_desc">Title Z–A</option>
                <option value="people_desc">Most People</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(v => !v)}
                className={`flex-shrink-0 border-white/10 ${showFilters ? 'border-white/25 bg-white/10 text-white' : ''}`}
              >
                <Filter className="h-4 w-4 mr-1.5" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="outline" className="ml-1.5 border-white/25 bg-white/10 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadEvents({ assembleFromChats: true })}
                disabled={loading}
                className="flex-shrink-0 border-white/10"
                title="Sync events from chats"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category filter chips ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && (
        <div className="space-y-2">
          <div
            className="flex flex-wrap justify-center sm:justify-start gap-1.5"
            role="tablist"
            aria-label="Moment categories"
          >
            {CATEGORY_CHIPS.map(({ value, label, icon: Icon, shortLabel }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeCategory === value}
                onClick={() => {
                  setActiveCategory(value);
                  setActiveSubCategory('all');
                }}
                className={`
                  inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border
                  ${activeCategory === value
                    ? 'bg-white/10 text-white border-white/25'
                    : 'bg-black/40 text-white/55 border-white/[0.08] hover:border-white/20 hover:text-white/80'
                  }
                `}
              >
                <Icon className="h-3 w-3 flex-shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{shortLabel || label}</span>
              </button>
            ))}
          </div>

          {/* Nested celebration / show classifiers */}
          {CATEGORY_SUB_TABS[activeCategory] && (
            <div
              className="flex flex-wrap justify-center sm:justify-start gap-1.5 pl-0 sm:pl-1"
              role="tablist"
              aria-label={`${activeCategory.replace(/_/g, ' ')} subcategories`}
              data-testid="events-book-subcategory-tabs"
            >
              {(CATEGORY_SUB_TABS[activeCategory] ?? []).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={activeSubCategory === value}
                  onClick={() => setActiveSubCategory(value)}
                  className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors border
                    ${activeSubCategory === value
                      ? 'bg-violet-500/20 text-violet-200 border-violet-400/40'
                      : 'bg-black/30 text-white/45 border-border/30 hover:border-violet-400/30 hover:text-white/70'
                    }
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Impact filter chips ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && showFilters && <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
        {IMPACT_CHIPS.map(({ value, label, activeClass }) => (
          <button
            key={value}
            onClick={() => setImpactFilter(value)}
            className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border
              ${impactFilter === value
                ? activeClass
                : 'bg-black/30 text-white/40 border-white/[0.08] hover:border-white/20 hover:text-white/60'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>}

      {/* ── Advanced filters panel ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && showFilters && (
        <Card className="bg-black/80 border border-cyan-400/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-cyan-200" />
                <span className="text-sm font-medium">Advanced Filters</span>
                {activeFilterCount > 0 && (
                  <span className="text-xs text-white/40">{activeFilterCount} active</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={clearFilters} className="text-xs border-red-500/40 text-red-400 hover:bg-red-500/10">
                    <X className="h-3 w-3 mr-1" /> Clear All
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)} className="h-7 w-7 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/25">Scale</span>
              {SIGNIFICANCE_CHIPS.map(({ value, label, activeClass }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSignificanceFilter(value)}
                  className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border
                    ${significanceFilter === value
                      ? activeClass
                      : 'bg-black/30 text-white/40 border-white/[0.08] hover:border-white/20 hover:text-white/60'
                    }
                  `}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Date range */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Date Range
                </label>
                <select
                  value={filters.dateRange}
                  title="Date range filter"
                  onChange={e => setFilters({ ...filters, dateRange: e.target.value as DateRange })}
                  className="w-full h-9 px-3 bg-black/60 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="year">Last Year</option>
                  <option value="custom">Custom Range</option>
                </select>
                {filters.dateRange === 'custom' && (
                  <div className="space-y-1.5 mt-1.5">
                    <input type="date" title="Start date" value={filters.customStartDate || ''} onChange={e => setFilters({ ...filters, customStartDate: e.target.value })}
                      className="w-full h-9 px-3 bg-black/60 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400/40" />
                    <input type="date" title="End date" value={filters.customEndDate || ''} onChange={e => setFilters({ ...filters, customEndDate: e.target.value })}
                      className="w-full h-9 px-3 bg-black/60 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400/40" />
                  </div>
                )}
              </div>

              {/* Event type */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" /> Event Type
                </label>
                <div className="max-h-36 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-1">
                  {uniqueTypes.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-2">No types available</p>
                  ) : uniqueTypes.map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5">
                      <input type="checkbox" checked={filters.types.includes(type)}
                        onChange={e => setFilters({ ...filters, types: e.target.checked ? [...filters.types, type] : filters.types.filter(t => t !== type) })}
                        className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-cyan-200 accent-cyan-400"
                      />
                      <span className="text-sm text-white/75 capitalize">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Confidence */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Confidence
                </label>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>Min {Math.round(filters.confidenceMin * 100)}%</span>
                    <span>Max {Math.round(filters.confidenceMax * 100)}%</span>
                  </div>
                  <input type="range" title="Minimum confidence" min="0" max="1" step="0.05" value={filters.confidenceMin}
                    onChange={e => setFilters({ ...filters, confidenceMin: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full accent-cyan-400" />
                  <input type="range" title="Maximum confidence" min="0" max="1" step="0.05" value={filters.confidenceMax}
                    onChange={e => setFilters({ ...filters, confidenceMax: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full accent-cyan-400" />
                </div>
              </div>

              {/* People count */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> People Count
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] text-white/40">Min</span>
                    <input type="number" title="Minimum people count" min="0" max="10" value={filters.peopleCountMin}
                      onChange={e => setFilters({ ...filters, peopleCountMin: parseInt(e.target.value) || 0 })}
                      className="w-full h-9 px-3 bg-black/60 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400/40 mt-0.5" />
                  </div>
                  <span className="text-white/30 mt-4">–</span>
                  <div className="flex-1">
                    <span className="text-[10px] text-white/40">Max</span>
                    <input type="number" title="Maximum people count" min="0" max="10" value={filters.peopleCountMax}
                      onChange={e => setFilters({ ...filters, peopleCountMax: parseInt(e.target.value) || 10 })}
                      className="w-full h-9 px-3 bg-black/60 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400/40 mt-0.5" />
                  </div>
                </div>
              </div>

              {/* Locations */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Locations
                </label>
                <div className="max-h-36 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-1">
                  {uniqueLocations.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-2">No locations available</p>
                  ) : uniqueLocations.slice(0, 15).map(loc => (
                    <label key={loc} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-white/5">
                      <input type="checkbox" checked={filters.locations.includes(loc)}
                        onChange={e => setFilters({ ...filters, locations: e.target.checked ? [...filters.locations, loc] : filters.locations.filter(l => l !== loc) })}
                        className="w-3.5 h-3.5 rounded border-white/10 bg-black/40 text-cyan-200 accent-cyan-400"
                      />
                      <span className="text-sm text-white/75">{loc}</span>
                    </label>
                  ))}
                  {uniqueLocations.length > 15 && <p className="text-[10px] text-white/30 text-center">+{uniqueLocations.length - 15} more</p>}
                </div>
              </div>

              {/* Presence */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/60">Presence</label>
                <div className="space-y-2 p-3 bg-black/40 rounded-lg border border-border/30">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={filters.hasPeople === true}
                      onChange={e => setFilters({ ...filters, hasPeople: e.target.checked ? true : null })}
                      className="w-3.5 h-3.5 rounded accent-cyan-400" />
                    <span className="text-sm text-white/70">Has people</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={filters.hasLocation === true}
                      onChange={e => setFilters({ ...filters, hasLocation: e.target.checked ? true : null })}
                      className="w-3.5 h-3.5 rounded accent-cyan-400" />
                    <span className="text-sm text-white/70">Has location</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results summary + card layout toolbar (Moments browse only) ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 text-xs text-white/40 sm:justify-start">
            <span>
              {filteredEvents.length === 0
                ? 'No moments'
                : `${startIndex + 1}–${Math.min(startIndex + ITEMS_PER_PAGE, filteredEvents.length)} of ${filteredEvents.length}`}
              {filteredEvents.length !== events.length && (
                <span className="ml-1 text-cyan-200/60">({events.length} total)</span>
              )}
            </span>
            {totalPages > 1 && <span>Page {currentPage} of {totalPages}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMomentsLayout('facts')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/55 transition-colors hover:border-white/25 hover:text-white"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Search facts
            </button>
            <GridListViewToolbar
              viewMode={cardViewMode}
              onViewModeChange={setCardViewMode}
              copyText={clipboardText}
              copyDisabled={filteredEvents.length === 0}
              storageKey={EVENTS_CARD_VIEW_STORAGE_KEY}
            />
          </div>
        </div>
      )}

      {/* ══ MOMENTS — GRID / LIST ══ */}
      {viewMode === 'events' && momentsLayout === 'grid' && (
        loading ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
              <div key={i} className="bg-black/40 border border-border/30 rounded-lg h-56 animate-pulse" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-white/15" />
            <p className="text-base font-medium mb-1">No moments found</p>
            <p className="text-sm text-white/35">Keep chatting — LoreBook groups scenes from your conversations automatically</p>
            {(activeFilterCount > 0 || searchTerm || activeCategory !== 'all' || impactFilter !== 'all' || significanceFilter !== 'all') && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 text-xs">
                Clear All Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {cardViewMode === 'list' ? (
              <div
                className="overflow-hidden rounded-xl border border-white/10 bg-black/30 divide-y divide-white/[0.06]"
                data-testid="events-book-list"
              >
                {paginatedEvents.map((event, index) => {
                  const title = getDisplayTitle({
                    title: event.title,
                    summary: event.summary,
                    people: event.people,
                    locations: event.locations,
                    fallbackNoun: 'Moment',
                  });
                  const when = formatEventTime(event);
                  return (
                    <button
                      key={event.id || `event-${index}`}
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 sm:px-4"
                    >
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300/70" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium text-white">{title}</p>
                          <span className="shrink-0 text-[10px] text-white/40">
                            {Math.round(event.confidence * 100)}%
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/40">
                          {when && when !== 'Date unknown' && <span>{when}</span>}
                          {event.type && <span>Type: {event.type}</span>}
                          {event.people.length > 0 && (
                            <span>People: {event.people.slice(0, 3).join(', ')}{event.people.length > 3 ? ` +${event.people.length - 3}` : ''}</span>
                          )}
                          {event.locations.length > 0 && (
                            <span>Places: {event.locations.slice(0, 2).join(', ')}</span>
                          )}
                        </div>
                        {event.summary && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-white/45">{event.summary}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
                data-testid="events-book-grid"
              >
                {paginatedEvents.map((event, index) => (
                  <EventProfileCard
                    key={event.id || `event-${index}`}
                    event={event}
                    onClick={() => setSelectedEvent(event)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="text-white/50">
                  <ChevronLeft className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Previous</span><span className="sm:hidden">Prev</span>
                </Button>
                <div className="flex items-center gap-1 overflow-x-auto max-w-full">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) pageNum = i + 1;
                    else if (currentPage <= 4) pageNum = i + 1;
                    else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                    else pageNum = currentPage - 3 + i;
                    return (
                      <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded text-xs transition ${currentPage === pageNum ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="text-white/50">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )
      )}

      {/* ══ MOMENTS — FACT SEARCH (secondary, not a peer tab) ══ */}
      {viewMode === 'events' && momentsLayout === 'facts' && (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMomentsLayout('grid')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to moments
            </button>
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-br from-black/50 via-violet-950/15 to-black/40 p-3 sm:p-4">
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                Inside Moments
              </p>
              <p className="mt-1 text-sm font-semibold text-white sm:text-base">Search facts</p>
              <p className="mt-1 text-xs text-white/45 max-w-2xl">
                Atomic details from your moments — journal entries, chat facts, and linked claims.
              </p>
            </div>
            <MemoryExplorer />
          </div>
        </div>
      )}

      {/* ══ PATTERNS ══ */}
      {viewMode === 'recurring' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-xs text-white/40">
              Recurring rhythms LoreBook notices — Sunday calls, weekly rituals, familiar places.
            </p>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadRecurringScenes()}
                disabled={scenesLoading}
                aria-label="Refresh patterns"
              >
                <RefreshCw className={`h-4 w-4 ${scenesLoading ? 'animate-spin' : ''}`} />
              </Button>
              <GridListViewToolbar
                viewMode={patternsViewMode}
                onViewModeChange={setPatternsViewMode}
                copyText={patternsClipboardText}
                storageKey={PATTERNS_CARD_VIEW_STORAGE_KEY}
              />
            </div>
          </div>

          {/* Skeleton */}
          {scenesLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-black/40 border border-border/30 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!scenesLoading && recurringScenes.length === 0 && (
            <div className="text-center py-16 text-white/40">
              <Repeat2 className="h-10 w-10 mx-auto mb-3 text-white/15" />
              <p className="text-base font-medium text-white/50">No patterns detected yet</p>
              <p className="text-sm text-white/30 mt-1 max-w-xs mx-auto">
                LoreBook watches for moments that repeat. Keep having conversations and patterns will surface.
              </p>
            </div>
          )}

          {/* Scene grid / list */}
          {!scenesLoading && recurringScenes.length > 0 && (
            patternsViewMode === 'list' ? (
              <div
                className="overflow-hidden rounded-xl border border-white/10 bg-black/30 divide-y divide-white/[0.06]"
                data-testid="patterns-book-list"
              >
                {recurringScenes.map((scene) => {
                  const s = scene.continuity_strength;
                  const strengthLabel = patternContinuityLabel(s);
                  let lastSeen = '';
                  try {
                    lastSeen = formatDistanceToNow(dfParseISO(scene.last_seen_at), { addSuffix: true });
                  } catch { /* noop */ }

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => {
                        setViewMode('events');
                        setSearchTerm(scene.canonical_title.split(' ')[0]);
                      }}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5 sm:px-4"
                    >
                      <Repeat2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200/60" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium text-white">{scene.canonical_title}</p>
                          <span className="shrink-0 text-[10px] text-white/40">
                            {Math.round(s * 100)}%
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/40">
                          <span>{strengthLabel}</span>
                          <span>
                            {scene.occurrence_count} {scene.occurrence_count === 1 ? 'time' : 'times'}
                            {lastSeen ? ` · last ${lastSeen}` : ''}
                          </span>
                          {scene.dominant_entity_names && scene.dominant_entity_names.length > 0 && (
                            <span>
                              People: {scene.dominant_entity_names.slice(0, 3).join(', ')}
                              {scene.dominant_entity_names.length > 3
                                ? ` +${scene.dominant_entity_names.length - 3}`
                                : ''}
                            </span>
                          )}
                          {scene.recurring_activities && scene.recurring_activities.length > 0 && (
                            <span>
                              Activities: {scene.recurring_activities.slice(0, 3).join(', ')}
                            </span>
                          )}
                          {scene.timeline_candidate && <span>Timeline candidate</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                data-testid="patterns-book-grid"
              >
                {recurringScenes.map(scene => {
                  const s = scene.continuity_strength;
                  const strengthLabel = patternContinuityLabel(s);
                  const labelColor =
                    s >= 0.85 ? 'text-emerald-300 border-emerald-500/40' :
                    s >= 0.60 ? 'text-blue-300 border-blue-500/40' :
                    s >= 0.40 ? 'text-amber-300 border-amber-500/40' :
                               'text-white/40 border-border/30';
                  const barColor =
                    s >= 0.85 ? 'bg-emerald-400' :
                    s >= 0.60 ? 'bg-blue-400' :
                    s >= 0.40 ? 'bg-amber-400' : 'bg-white/25';

                  let lastSeen = '';
                  try {
                    lastSeen = formatDistanceToNow(dfParseISO(scene.last_seen_at), { addSuffix: true });
                  } catch { /* noop */ }

                  return (
                    <Card
                      key={scene.id}
                      className="group bg-gradient-to-br from-slate-900/90 via-slate-800/60 to-slate-900/90 border-white/10 hover:border-cyan-400/30 hover:shadow-lg hover:shadow-cyan-400/10 transition-all duration-300 cursor-pointer"
                      onClick={() => {
                        setViewMode('events');
                        setSearchTerm(scene.canonical_title.split(' ')[0]);
                      }}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Repeat2 className="h-4 w-4 text-cyan-200/50 flex-shrink-0" />
                            <h3 className="text-sm font-bold text-white group-hover:text-cyan-200 transition-colors truncate">
                              {scene.canonical_title}
                            </h3>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] flex-shrink-0 ${labelColor}`}
                          >
                            {strengthLabel}
                          </Badge>
                        </div>

                        <p className="text-xs text-white/45 mb-3">
                          {scene.occurrence_count} {scene.occurrence_count === 1 ? 'time' : 'times'}
                          {lastSeen ? ` · last ${lastSeen}` : ''}
                        </p>

                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                              style={{ width: `${Math.round(s * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-white/35 shrink-0 tabular-nums">
                            {Math.round(s * 100)}%
                          </span>
                        </div>

                        {scene.dominant_entity_names && scene.dominant_entity_names.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {scene.dominant_entity_names.slice(0, 3).map(name => (
                              <span
                                key={name}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300/80 border border-blue-500/20"
                              >
                                {name}
                              </span>
                            ))}
                            {scene.dominant_entity_names.length > 3 && (
                              <span className="text-[10px] text-white/30 self-center">
                                +{scene.dominant_entity_names.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {scene.recurring_activities && scene.recurring_activities.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {scene.recurring_activities.slice(0, 4).map(a => (
                              <Badge
                                key={a}
                                variant="outline"
                                className="text-[10px] bg-cyan-400/10 text-cyan-200/70 border-cyan-400/20 capitalize"
                              >
                                {a}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-3">
                          <p className="text-[10px] text-white/20">
                            {scene.source_event_ids?.length ?? scene.occurrence_count} moments in this pattern
                          </p>
                          {scene.timeline_candidate && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/timeline?view=events');
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-200/70 transition-colors hover:text-cyan-200"
                            >
                              View in Chronology
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Modals */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => { setSelectedEvent(null); void refetchEvents(); }}
          onUpdated={(next) => {
            setSelectedEvent(next);
            setPostedRefresh((n) => n + 1);
            if (!isMockDataEnabled) void refetchEvents();
          }}
        />
      )}
      {showPostComposer && (
      <PostEventComposer
        open={showPostComposer}
        onClose={() => setShowPostComposer(false)}
        onCreated={(created) => {
          setShowPostComposer(false);
          setPostedRefresh((n) => n + 1);
          if (!isMockDataEnabled) void refetchEvents();
          // Chat handoff is opened by PostEventComposer (LLM ingest).
          void created;
        }}
      />
      )}
    </div>
    </div>
  );
};
