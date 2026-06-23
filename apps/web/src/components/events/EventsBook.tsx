// =====================================================
// LIFE LOG (EventsBook)
// Purpose: Browse life as moments — scenes from conversations with evidence
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, MapPin, Users, Sparkles, AlertCircle, Search,
  RefreshCw, ChevronLeft, ChevronRight, Filter, X, Cake, PartyPopper,
  Music2, Building2, Briefcase, Plane, Heart, LayoutGrid,
  CalendarDays, Repeat2, Star, TrendingUp, BookOpen,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  parseISO as dfParseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  endOfDay,
} from 'date-fns';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { useEventsBookData } from '../../store/hooks/useEntityBooks';
import { EventDetailModal } from './EventDetailModal';
import { EventProfileCard, type Event } from './EventProfileCard';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { MemoryExplorer, dummyMemoryCards } from '../memory-explorer/MemoryExplorer';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { useCalendarMonth } from '../../hooks/useCalendarMonth';
import { TimelineStitchedView } from '../timeline/TimelineStitchedView';

const ITEMS_PER_PAGE = 18;

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

type ViewMode = 'events' | 'calendar' | 'recurring';
type MomentsLayout = 'grid' | 'facts';
type EventCategory = 'all' | 'recent' | 'birthdays' | 'parties' | 'concerts_shows' | 'conventions' | 'work' | 'travel' | 'family' | 'festivals' | 'with_people' | 'with_locations';
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

type CalendarItem =
  | { id: string; kind: 'event'; date: Date; title: string; event: Event }
  | { id: string; kind: 'memory'; date: Date; title: string; memory: MemoryCard }
  | { id: string; kind: 'occasion'; date: Date; title: string; lifeArcId: string; userPresence: 'attended' | 'heard_about' | 'unknown' };

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_CHIPS: { value: EventCategory; label: string; icon: React.ElementType; shortLabel?: string }[] = [
  { value: 'all', label: 'All', icon: Calendar },
  { value: 'recent', label: 'Recent', icon: Clock },
  { value: 'birthdays', label: 'Birthdays', icon: Cake, shortLabel: 'Bdays' },
  { value: 'parties', label: 'Parties', icon: PartyPopper },
  { value: 'concerts_shows', label: 'Concerts & Shows', icon: Music2, shortLabel: 'Shows' },
  { value: 'conventions', label: 'Conventions', icon: Building2, shortLabel: 'Cons' },
  { value: 'work', label: 'Work', icon: Briefcase },
  { value: 'travel', label: 'Travel', icon: Plane },
  { value: 'family', label: 'Family', icon: Heart },
  { value: 'festivals', label: 'Festivals', icon: Sparkles },
  { value: 'with_people', label: 'With People', icon: Users },
  { value: 'with_locations', label: 'With Location', icon: MapPin },
];

const IMPACT_CHIPS: { value: ImpactFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All', activeClass: 'bg-primary/20 text-primary border-primary/40' },
  { value: 'direct_participant', label: 'I Was There', activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { value: 'indirect_affected', label: 'Affects Me', activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { value: 'related_person_affected', label: 'Affects Someone Close', activeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  { value: 'observer', label: 'I Observed', activeClass: 'bg-gray-500/20 text-gray-300 border-gray-500/40' },
  { value: 'ripple_effect', label: 'Ripple Effects', activeClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
];

const SIGNIFICANCE_CHIPS: { value: SignificanceFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'All Scale', activeClass: 'bg-primary/20 text-primary border-primary/40' },
  { value: 'major', label: '★ Major', activeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  { value: 'moderate', label: 'Moderate', activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { value: 'minor', label: 'Minor', activeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/40' },
];

const VIEWS: { value: ViewMode; label: string; icon: React.ElementType }[] = [
  { value: 'events', label: 'Moments', icon: Sparkles },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'recurring', label: 'Patterns', icon: Repeat2 },
];

const MOMENTS_LAYOUTS: { value: MomentsLayout; label: string; icon: React.ElementType }[] = [
  { value: 'grid', label: 'Browse', icon: LayoutGrid },
  { value: 'facts', label: 'Search facts', icon: BookOpen },
];

// ─── Keyword matching ─────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Partial<Record<EventCategory, string[]>> = {
  birthdays: ['birthday', 'birthdays', 'bday'],
  parties: ['party', 'parties', 'rave', 'raves', 'celebration', 'gathering', 'game night', 'house party', 'afters', 'afterparty', 'after-party', 'after party', 'underground'],
  concerts_shows: ['concert', 'concerts', 'show', 'shows', 'performance', 'theater', 'theatre', 'comedy', 'gig', 'open mic', 'festival', 'local scene', 'underground scene'],
  conventions: ['convention', 'conventions', 'conference', 'conferences', 'expo', 'expos', 'meetup', 'meetups', 'summit', 'con'],
  work: ['work', 'meeting', 'meetings', 'presentation', 'client', 'office', 'conference', 'business trip', 'offsite', 'interview'],
  travel: ['travel', 'trip', 'trips', 'vacation', 'vacations', 'getaway', 'weekend getaway', 'road trip', 'family visit'],
  family: ['family', 'family dinner', 'reunion', 'reunions', 'holiday', 'holidays', 'anniversary'],
  festivals: ['festival', 'festivals', 'fair', 'multi-day'],
};

function eventText(event: Event): string {
  return [event.title, event.summary, event.type, ...(event.activities || [])].filter(Boolean).join(' ').toLowerCase();
}

function eventMatchesCategory(event: Event, category: EventCategory): boolean {
  if (category === 'all') return true;
  if (category === 'recent') return parseISO(event.start_time) >= subDays(new Date(), 30);
  if (category === 'with_people') return event.people.length > 0;
  if (category === 'with_locations') return event.locations.length > 0;
  const kw = CATEGORY_KEYWORDS[category];
  return kw ? kw.some(k => eventText(event).includes(k)) : false;
}

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
  const eventTypes = ['work', 'social', 'health', 'recreation', 'travel', 'education', 'family', 'personal'];
  const locations = ['Home', 'The Office', 'Corner Café', 'Riverside Park', 'The Gym', 'Cinema', 'Italian Place', 'Library', 'The Beach', 'Mountain Trail', 'Airport', 'Hotel Bar', 'Campus', 'Hospital', 'Museum of Art'];
  const peopleNames = ['Maya', 'Jordan', 'Sarah', 'Marcus', 'Elena', 'Tom', 'Priya', 'Chris', 'Nadia', 'Sam', 'Alex', 'Lena', 'Mom', 'Dad', 'my sister', 'my brother'];
  const activities = ['meeting', 'coffee', 'hiking', 'workout', 'dinner', 'movie', 'talking', 'coding', 'traveling', 'learning', 'celebrating', 'cooking', 'drinking', 'dancing', 'running'];
  const events: Event[] = [];
  const now = Date.now();

  const titles: Record<string, string[]> = {
    work: [
      'Performance Review', 'Client Presentation Panic', 'Sprint Planning', 'Late Night Crunch Session',
      'Promotion Discussion', 'New Manager First Meeting', 'Project Deadline Push', 'Team Standup That Went Sideways',
    ],
    social: [
      "Maya's Birthday Rooftop Party", 'Impromptu Dive Bar Night', 'First Date at The Observatory',
      'Concert at The Venue', 'Reconnecting With an Old Friend', 'Group Dinner That Went Long',
      'Game Night at Jordan\'s', 'House Party Into the Next Morning',
    ],
    health: [
      'Therapy Session Breakthrough', 'First Day Back at the Gym', 'ER Visit at 2am',
      'Anxiety Spike During Work Call', 'Running Personal Record', 'Skipped Doctor Visit Again',
      'Sleep Clinic Consultation', 'Burnout Day',
    ],
    recreation: [
      'BJJ Competition', 'Open Mic Night', 'Gallery Opening', 'Pickup Soccer at the Park',
      'Sunrise Hike', 'Punk Show at the Basement', 'First Time Surfing', 'Spontaneous Road Trip',
    ],
    travel: [
      'Weekend in Portland', 'Conference in Austin', 'Surprise Road Trip With Friends',
      'First International Solo Trip', 'Camping Weekend', 'Train Ride Across the State',
      'Flight Delay That Turned Into a Story', 'Wrong Turn That Led Somewhere Good',
    ],
    education: [
      'Accepted to the Program', 'Failed the Exam', 'Study Group Breakthrough',
      'Graduation Day', 'Dropped the Course', 'First Day of Class',
      'Research Presentation', 'Mentor Conversation That Changed Things',
    ],
    family: [
      "Mom's Health Scare", 'Holiday Tension at Dinner', 'Family Reunion After 3 Years',
      "Dad's Retirement Party", "Sibling's Big Announcement", 'Family Video Call That Ran Long',
      'Grandma Visit', 'Anniversary Dinner Nobody Enjoyed',
    ],
    personal: [
      'Moved Into New Apartment', 'Cleared Out Old Storage Unit', 'Big Decision Made Alone at Night',
      'Quiet Day That Changed Something', 'Reconnected With an Old Hobby', 'Wrote the Letter',
      'That Walk Where Everything Clicked', 'Deleted the App Finally',
    ],
  };

  const summaries: Record<string, string[]> = {
    work: [
      'The meeting went sideways — someone finally said what everyone was thinking.',
      'Harder conversation than expected but something important got clarified.',
      'The kind of day that reminds you why this job is complicated.',
      'Stayed late again. Made progress but the pressure is real.',
      'Left the room not sure if that went well or terribly.',
    ],
    social: [
      'Good energy all night. Stayed longer than anyone planned.',
      'One of those nights where you feel like yourself again.',
      'A bit awkward at first, then something clicked and it was great.',
      "Didn't want it to end. Didn't sleep much after either.",
      'Ended up somewhere unexpected. The best kind of night.',
    ],
    health: [
      'Harder than expected but you went. That matters.',
      'The thing you\'d been avoiding for months finally happened.',
      "Didn't break any records but showed up. That's the win.",
      'The kind of session where something shifts in how you see yourself.',
      "Not the news you wanted but you're dealing with it.",
    ],
    recreation: [
      'Lost track of time in the best way.',
      'Exactly what you needed. No agenda, just the thing itself.',
      'One of those rare moments where you were fully present.',
      'Messy but alive. Wouldn\'t have skipped it.',
    ],
    travel: [
      'New place, new version of yourself for a few days.',
      'The delays and wrong turns were part of it.',
      'Left feeling like you needed to do this more often.',
      "The trip that made you realize what you'd been missing.",
    ],
    education: [
      'Walked out with more questions than answers. Good ones.',
      'The kind of learning that makes you rethink something older.',
      'Slower going than expected but real ground was covered.',
      "Something clicked that hadn't clicked before.",
    ],
    family: [
      "Quality time that reminded you why it's complicated and worth it.",
      'Old patterns showing up but this time you handled it differently.',
      "It's never just a dinner with family.",
      'More said between the lines than out loud.',
    ],
    personal: [
      'Small moment that had more weight than expected.',
      'The kind of thing nobody else would understand but you know what it meant.',
      'A decision made quietly that will matter later.',
      'Alone but not lonely. Something resolved.',
    ],
  };

  // Emotional tone by type — guides card accent color
  const emotionalTone: Record<string, Array<'positive' | 'negative' | 'mixed' | 'neutral'>> = {
    work: ['mixed', 'mixed', 'negative', 'neutral'],
    social: ['positive', 'positive', 'mixed', 'positive'],
    health: ['mixed', 'negative', 'positive', 'neutral'],
    recreation: ['positive', 'positive', 'mixed', 'positive'],
    travel: ['positive', 'mixed', 'positive', 'positive'],
    education: ['neutral', 'positive', 'mixed', 'neutral'],
    family: ['mixed', 'negative', 'positive', 'mixed'],
    personal: ['neutral', 'positive', 'mixed', 'neutral'],
  };

  for (let i = 0; i < 60; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const startTime = new Date(now - daysAgo * 86400000);
    const endTime = new Date(startTime.getTime() + (Math.floor(Math.random() * 8) + 1) * 3600000);
    const typeIdx = (i * 7 + 3) % eventTypes.length; // pseudo-random but stable
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
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [momentsLayout, setMomentsLayout] = useState<MomentsLayout>('grid');
  const { entries = [] } = useLoreKeeper();
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

  const events = useMemo((): Event[] => {
    if (isMockDataEnabled) return MOCK_EVENTS;
    return (serverEvents as Event[]) ?? [];
  }, [isMockDataEnabled, serverEvents]);

  const loading = bookLoading || localLoading || isAssembling;

  const [searchTerm, setSearchTerm] = useState('');
  const [recurringScenes, setRecurringScenes] = useState<RecurringScene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<EventCategory>('all');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('all');
  const [significanceFilter, setSignificanceFilter] = useState<SignificanceFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [showFilters, setShowFilters] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => startOfDay(new Date()));
  const [selectedOccasionArc, setSelectedOccasionArc] = useState<{ id: string; title: string } | null>(null);
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

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthNum = calendarMonth.getMonth() + 1;
  const { dayMap: calendarDayMap, loading: calendarApiLoading } = useCalendarMonth(
    calendarYear,
    calendarMonthNum,
    viewMode === 'calendar' && !isMockDataEnabled
  );
  const memoryCards = useMemo<MemoryCard[]>(() => {
    const realMemories = entries.map(entry => memoryEntryToCard({
      id: entry.id,
      date: entry.date,
      content: entry.content,
      summary: entry.summary || null,
      tags: entry.tags || [],
      mood: entry.mood || null,
      chapter_id: entry.chapter_id || null,
      source: entry.source || 'manual',
      metadata: entry.metadata || {},
    }));
    return realMemories.length > 0 ? realMemories : (isMockDataEnabled ? dummyMemoryCards : []);
  }, [entries, isMockDataEnabled]);

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
      filtered = filtered.filter(e => isWithinInterval(parseISO(e.start_time), { start: startDate, end: endDate }));
    }

    if (filters.types.length > 0) filtered = filtered.filter(e => e.type && filters.types.includes(e.type));
    filtered = filtered.filter(e => e.confidence >= filters.confidenceMin && e.confidence <= filters.confidenceMax);
    filtered = filtered.filter(e => e.people.length >= filters.peopleCountMin && e.people.length <= filters.peopleCountMax);
    if (filters.locations.length > 0) filtered = filtered.filter(e => e.locations.some(l => filters.locations.includes(l)));
    if (filters.hasLocation !== null) filtered = filtered.filter(e => filters.hasLocation ? e.locations.length > 0 : e.locations.length === 0);
    if (filters.hasPeople !== null) filtered = filtered.filter(e => filters.hasPeople ? e.people.length > 0 : e.people.length === 0);
    if (impactFilter !== 'all') filtered = filtered.filter(e => e.impact?.type === impactFilter);
    if (activeCategory !== 'all') filtered = filtered.filter(e => eventMatchesCategory(e, activeCategory));
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
        case 'date_desc': return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
        case 'date_asc': return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        case 'confidence_desc': return b.confidence - a.confidence;
        case 'confidence_asc': return a.confidence - b.confidence;
        case 'title_asc': return a.title.localeCompare(b.title);
        case 'title_desc': return b.title.localeCompare(a.title);
        case 'people_desc': return b.people.length - a.people.length;
        default: return 0;
      }
    });
    return filtered;
  }, [events, searchTerm, activeCategory, filters, sortBy, impactFilter, significanceFilter]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, activeCategory, filters, sortBy, impactFilter, significanceFilter]);

  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(calendarMonth)),
    end: endOfWeek(endOfMonth(calendarMonth)),
  }), [calendarMonth]);
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];

    for (const event of events) {
      const start = safeDate(event.start_time);
      if (!start) continue;
      const end = safeDate(event.end_time) ?? start;
      const normalizedStart = startOfDay(start);
      const normalizedEnd = startOfDay(end);
      const spanDays = eachDayOfInterval({
        start: normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd,
        end: normalizedEnd >= normalizedStart ? normalizedEnd : normalizedStart,
      });
      for (const date of spanDays) {
        items.push({
          id: `event-${event.id}-${dayKey(date)}`,
          kind: 'event',
          date,
          title: event.title || 'Untitled event',
          event,
        });
      }
    }

    for (const memory of memoryCards) {
      const date = safeDate(memory.date);
      if (!date) continue;
      items.push({
        id: `memory-${memory.id}`,
        kind: 'memory',
        date,
        title: memory.title || 'Memory',
        memory,
      });
    }

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events, memoryCards]);
  const itemsByDay = useMemo(() => {
    const buckets = new Map<string, CalendarItem[]>();
    for (const item of calendarItems) {
      const key = dayKey(item.date);
      const existing = buckets.get(key) ?? [];
      existing.push(item);
      buckets.set(key, existing);
    }
    return buckets;
  }, [calendarItems]);
  const selectedCalendarItems = itemsByDay.get(dayKey(selectedCalendarDate)) ?? [];
  const selectedApiDay = calendarDayMap.get(dayKey(selectedCalendarDate));

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
    return n;
  }, [filters, significanceFilter]);

  const clearFilters = () => {
    setFilters({ dateRange: 'all', types: [], confidenceMin: 0, confidenceMax: 1, peopleCountMin: 0, peopleCountMax: 10, locations: [], hasLocation: null, hasPeople: null });
    setSearchTerm('');
    setActiveCategory('all');
    setImpactFilter('all');
    setSignificanceFilter('all');
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <ChatFirstViewHint />

      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/70">
                Life Log
              </p>
              <h2 className="mt-1 text-xl sm:text-2xl font-semibold text-white">
                Your life, scene by scene
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-white/55">
                Browse <strong className="font-medium text-white/70">Moments</strong> — scenes from your conversations with people, places, and meaning.
                Use <strong className="font-medium text-white/70">Search facts</strong> for atomic details inside those moments.
                <strong className="font-medium text-white/70"> Patterns</strong> shows rhythms LoreBook notices over time.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[16rem]">
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-lg font-semibold text-white">{events.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/35">Moments</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-lg font-semibold text-white">{recurringScenes.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/35">Patterns</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-lg font-semibold text-white">{memoryCards.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/35">Facts</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* ── Views nav ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 p-1 bg-black/40 border border-border/50 rounded-lg w-full sm:w-auto sm:inline-flex">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setViewMode(value)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors flex-1 sm:flex-none justify-center
                ${viewMode === value
                  ? 'bg-primary/20 text-primary'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }
              `}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {viewMode === 'events' && (
          <div className="flex items-center gap-1 p-1 bg-black/25 border border-border/40 rounded-lg w-full sm:w-auto sm:inline-flex">
            {MOMENTS_LAYOUTS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setMomentsLayout(value)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex-1 sm:flex-none justify-center
                  ${momentsLayout === value
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }
                `}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Moment search + filters (grid layout only) ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search moments by title, person, place, or activity…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/35 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            title="Sort moments"
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="h-9 px-2 sm:px-3 bg-black/40 border border-border/50 rounded-lg text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 flex-shrink-0"
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
            className={`flex-shrink-0 ${showFilters ? 'border-primary/50 bg-primary/10' : ''}`}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="outline" className="ml-1.5 text-[10px] bg-primary/20 text-primary border-primary/30 px-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadEvents({ assembleFromChats: true })}
            disabled={loading}
            className="flex-shrink-0"
            title="Sync events from chats"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>}

      {/* ── Category filter chips ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
        {CATEGORY_CHIPS.map(({ value, label, icon: Icon, shortLabel }) => (
          <button
            key={value}
            onClick={() => setActiveCategory(value)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border
              ${activeCategory === value
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-black/40 text-white/55 border-border/40 hover:border-primary/30 hover:text-white/80'
              }
            `}
          >
            <Icon className="h-3 w-3 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{shortLabel || label}</span>
          </button>
        ))}
      </div>}

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
                : 'bg-black/30 text-white/40 border-border/30 hover:border-border/50 hover:text-white/60'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>}

      {/* ── Significance filter chips ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 items-center">
        <span className="text-[10px] text-white/25 font-medium uppercase tracking-wide">Scale</span>
        {SIGNIFICANCE_CHIPS.map(({ value, label, activeClass }) => (
          <button
            key={value}
            onClick={() => setSignificanceFilter(value)}
            className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border
              ${significanceFilter === value
                ? activeClass
                : 'bg-black/30 text-white/40 border-border/30 hover:border-border/50 hover:text-white/60'
              }
            `}
          >
            {label}
          </button>
        ))}
      </div>}

      {/* ── Advanced filters panel ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && showFilters && (
        <Card className="bg-black/80 border border-primary/25">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
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
                  className="w-full h-9 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                      className="w-full h-9 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    <input type="date" title="End date" value={filters.customEndDate || ''} onChange={e => setFilters({ ...filters, customEndDate: e.target.value })}
                      className="w-full h-9 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
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
                        className="w-3.5 h-3.5 rounded border-border/50 bg-black/40 text-primary accent-primary"
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
                    className="w-full h-1.5 rounded-full accent-primary" />
                  <input type="range" title="Maximum confidence" min="0" max="1" step="0.05" value={filters.confidenceMax}
                    onChange={e => setFilters({ ...filters, confidenceMax: parseFloat(e.target.value) })}
                    className="w-full h-1.5 rounded-full accent-primary" />
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
                      className="w-full h-9 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 mt-0.5" />
                  </div>
                  <span className="text-white/30 mt-4">–</span>
                  <div className="flex-1">
                    <span className="text-[10px] text-white/40">Max</span>
                    <input type="number" title="Maximum people count" min="0" max="10" value={filters.peopleCountMax}
                      onChange={e => setFilters({ ...filters, peopleCountMax: parseInt(e.target.value) || 10 })}
                      className="w-full h-9 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 mt-0.5" />
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
                        className="w-3.5 h-3.5 rounded border-border/50 bg-black/40 text-primary accent-primary"
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
                      className="w-3.5 h-3.5 rounded accent-primary" />
                    <span className="text-sm text-white/70">Has people</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={filters.hasLocation === true}
                      onChange={e => setFilters({ ...filters, hasLocation: e.target.checked ? true : null })}
                      className="w-3.5 h-3.5 rounded accent-primary" />
                    <span className="text-sm text-white/70">Has location</span>
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Results summary ── */}
      {viewMode === 'events' && momentsLayout === 'grid' && <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          {filteredEvents.length === 0 ? 'No moments' : `${startIndex + 1}–${Math.min(startIndex + ITEMS_PER_PAGE, filteredEvents.length)} of ${filteredEvents.length}`}
          {filteredEvents.length !== events.length && <span className="ml-1 text-primary/60">({events.length} total)</span>}
        </span>
        {totalPages > 1 && <span>Page {currentPage} of {totalPages}</span>}
      </div>}

      {/* ══ MOMENTS — GRID ══ */}
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
            <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {paginatedEvents.map((event, index) => (
                <EventProfileCard
                  key={event.id || `event-${index}`}
                  event={event}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="text-white/50">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) pageNum = i + 1;
                    else if (currentPage <= 4) pageNum = i + 1;
                    else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                    else pageNum = currentPage - 3 + i;
                    return (
                      <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded text-xs transition ${currentPage === pageNum ? 'bg-primary/30 text-primary' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
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

      {/* ══ MOMENTS — FACT SEARCH ══ */}
      {viewMode === 'events' && momentsLayout === 'facts' && (
        <div className="mt-2 rounded-xl border border-border/50 bg-black/25 p-3 sm:p-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-white">Search facts</p>
            <p className="text-xs text-white/45 mt-0.5">
              Atomic details extracted from your moments — journal entries, chat facts, and linked claims.
              Every fact belongs inside a moment.
            </p>
          </div>
          <MemoryExplorer />
        </div>
      )}

      {/* ══ CALENDAR VIEW ══ */}
      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4">
          <Card className="bg-black/35 border-border/50">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 font-semibold">
                    Calendar
                  </p>
                  <h3 className="text-lg sm:text-xl font-semibold text-white">
                    {format(calendarMonth, 'MMMM yyyy')}
                  </h3>
                  <p className="text-xs text-white/45 mt-0.5">
                    Moments, named occasions, and facts — with times.
                    {calendarApiLoading && ' Loading…'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadEvents({ assembleFromChats: true })}
                    disabled={loading}
                    title="Sync historical events from chats"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline ml-1.5">Sync</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMonth(month => subMonths(month, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      setCalendarMonth(startOfMonth(today));
                      setSelectedCalendarDate(startOfDay(today));
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMonth(month => addMonths(month, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-white/35 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-1">{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map(day => {
                  const key = dayKey(day);
                  const items = itemsByDay.get(key) ?? [];
                  const apiDay = calendarDayMap.get(key);
                  const eventCount = items.filter(item => item.kind === 'event').length;
                  const memoryCount = items.filter(item => item.kind === 'memory').length;
                  const occasionCount = apiDay?.occasions.length ?? 0;
                  const selected = isSameDay(day, selectedCalendarDate);
                  const inMonth = isSameMonth(day, calendarMonth);
                  const primaryOccasion = apiDay?.occasions[0];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedCalendarDate(startOfDay(day))}
                      className={`
                        min-h-[5.25rem] rounded-xl border p-2 text-left transition flex flex-col
                        ${selected
                          ? 'border-primary/70 bg-primary/15 shadow-lg shadow-primary/10'
                          : 'border-white/8 bg-white/[0.03] hover:border-primary/30 hover:bg-white/[0.06]'
                        }
                        ${inMonth ? 'opacity-100' : 'opacity-35'}
                      `}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-semibold ${selected ? 'text-primary' : 'text-white/75'}`}>
                          {format(day, 'd')}
                        </span>
                        {(items.length > 0 || occasionCount > 0) && (
                          <span className="text-[10px] text-white/35 tabular-nums">
                            {occasionCount + items.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto space-y-1">
                        {primaryOccasion && (
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shrink-0" />
                            <span className="text-[10px] text-violet-200 truncate leading-tight">
                              {primaryOccasion.title}
                            </span>
                          </div>
                        )}
                        {occasionCount > 1 && (
                          <span className="text-[9px] text-white/30 pl-2.5">
                            +{occasionCount - 1} more occasion{occasionCount - 1 === 1 ? '' : 's'}
                          </span>
                        )}
                        {eventCount > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                            <span className="text-[10px] text-cyan-200 truncate">
                              {eventCount} event{eventCount === 1 ? '' : 's'}
                            </span>
                          </div>
                        )}
                        {memoryCount > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                            <span className="text-[10px] text-amber-200 truncate">
                              {memoryCount} memor{memoryCount === 1 ? 'y' : 'ies'}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/35 border-border/50 xl:sticky xl:top-4 xl:self-start">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 font-semibold">
                    Selected Day
                  </p>
                  <h3 className="text-base font-semibold text-white">
                    {format(selectedCalendarDate, 'EEEE, MMM d')}
                  </h3>
                </div>
                <Badge variant="outline" className="border-white/15 text-white/45">
                  {selectedApiDay?.items.filter(i => i.kind !== 'occasion').length ?? selectedCalendarItems.length}
                </Badge>
              </div>

              {selectedApiDay && selectedApiDay.occasions.length > 0 && (
                <div className="space-y-2 mb-4">
                  {selectedApiDay.occasions.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedOccasionArc({ id: o.id, title: o.title })}
                      className="w-full rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-left hover:bg-violet-500/15 transition"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-violet-300/80 mb-1">
                        {o.userPresence === 'heard_about' ? 'Heard about' : 'You were there'}
                      </p>
                      <p className="text-sm font-semibold text-white leading-snug">{o.title}</p>
                      {o.summary && (
                        <p className="text-xs text-white/50 mt-1 line-clamp-2">{o.summary}</p>
                      )}
                      <p className="text-[10px] text-white/35 mt-1">{o.itemCount} linked moment{o.itemCount !== 1 ? 's' : ''} & events</p>
                    </button>
                  ))}
                </div>
              )}

              {selectedApiDay && selectedApiDay.items.length > 0 ? (
                <div className="space-y-2">
                  {selectedApiDay.items
                    .filter(i => i.kind !== 'occasion')
                    .map(item => (
                      <div
                        key={item.id}
                        className="w-full rounded-xl border border-white/8 bg-white/[0.04] p-3 text-left"
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`h-2 w-2 rounded-full ${item.kind === 'event' ? 'bg-cyan-300' : 'bg-amber-300'}`} />
                          <span className="text-[10px] uppercase tracking-wide text-white/35">
                            {item.kind === 'event' ? 'Event' : 'Moment'}
                            {item.temporalRole && item.temporalRole !== 'during' && ` · ${item.temporalRole}`}
                          </span>
                          {item.userPresence === 'heard_about' && (
                            <span className="text-[10px] text-amber-300/80">heard about</span>
                          )}
                          <span className="text-[10px] text-white/30 ml-auto font-mono">
                            {item.sortTime.slice(11, 16)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white">{item.title}</p>
                      </div>
                    ))}
                </div>
              ) : selectedCalendarItems.length === 0 ? (
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/45">
                  No moments or facts recorded for this day.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedCalendarItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.kind === 'event') setSelectedEvent(item.event);
                        else if (item.kind === 'memory') setSelectedMemory(item.memory);
                      }}
                      className="w-full rounded-xl border border-white/8 bg-white/[0.04] p-3 text-left hover:border-primary/35 hover:bg-primary/8 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`h-2 w-2 rounded-full ${item.kind === 'event' ? 'bg-cyan-300' : 'bg-amber-300'}`} />
                            <span className="text-[10px] uppercase tracking-wide text-white/35">
                              {item.kind === 'event' ? 'Moment' : 'Fact'}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-white truncate">{item.title}</p>
                          {item.kind === 'event' ? (
                            <p className="text-xs text-white/40 mt-1 truncate">
                              {[item.event.type, ...item.event.people.slice(0, 2), ...item.event.locations.slice(0, 1)]
                                .filter(Boolean)
                                .join(' · ') || 'Detected event'}
                            </p>
                          ) : (
                            <p className="text-xs text-white/40 mt-1 truncate">
                              {[item.memory.source, ...item.memory.tags.slice(0, 2)]
                                .filter(Boolean)
                                .join(' · ') || 'Memory entry'}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/25 flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══ PATTERNS ══ */}
      {viewMode === 'recurring' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Repeat2 className="h-5 w-5 text-primary/70" />
                Patterns
              </h2>
              <p className="text-xs text-white/40 mt-1">
                Recurring rhythms LoreBook notices across your life — Sunday calls, weekly rituals, familiar places
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadRecurringScenes()}
              disabled={scenesLoading}
              className="flex-shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${scenesLoading ? 'animate-spin' : ''}`} />
            </Button>
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

          {/* Scene cards */}
          {!scenesLoading && recurringScenes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recurringScenes.map(scene => {
                const s = scene.continuity_strength;
                const strengthLabel =
                  s >= 0.85 ? 'Autobiographical' :
                  s >= 0.60 ? 'Recurring' :
                  s >= 0.40 ? 'Emerging' : 'Forming';
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
                    className="group bg-gradient-to-br from-slate-900/90 via-slate-800/60 to-slate-900/90 border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 cursor-pointer"
                    onClick={() => {
                      // Filter Events view to show only events in this pattern
                      setViewMode('events');
                      setSearchTerm(scene.canonical_title.split(' ')[0]);
                    }}
                  >
                    <CardContent className="p-5">
                      {/* Title + badge */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Repeat2 className="h-4 w-4 text-primary/50 flex-shrink-0" />
                          <h3 className="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">
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

                      {/* Count + last seen */}
                      <p className="text-xs text-white/45 mb-3">
                        {scene.occurrence_count} {scene.occurrence_count === 1 ? 'time' : 'times'}
                        {lastSeen ? ` · last ${lastSeen}` : ''}
                      </p>

                      {/* Continuity strength bar */}
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

                      {/* Entity names */}
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

                      {/* Activities */}
                      {scene.recurring_activities && scene.recurring_activities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {scene.recurring_activities.slice(0, 4).map(a => (
                            <Badge
                              key={a}
                              variant="outline"
                              className="text-[10px] bg-primary/8 text-primary/70 border-primary/20 capitalize"
                            >
                              {a}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <p className="text-[10px] text-white/20 mt-3 pt-3 border-t border-white/6">
                        {scene.source_event_ids?.length ?? scene.occurrence_count} moments in this pattern
                        {scene.timeline_candidate && (
                          <span className="ml-2 text-primary/40">· timeline candidate</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => { setSelectedEvent(null); void refetchEvents(); }}
        />
      )}
      {selectedMemory && (
        <MemoryDetailModal memory={selectedMemory} onClose={() => setSelectedMemory(null)} />
      )}
      {selectedOccasionArc && (
        <TimelineStitchedView
          lifeArcId={selectedOccasionArc.id}
          scopeLabel={selectedOccasionArc.title}
          onClose={() => setSelectedOccasionArc(null)}
        />
      )}
    </div>
  );
};
