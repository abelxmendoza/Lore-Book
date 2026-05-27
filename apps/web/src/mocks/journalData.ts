/**
 * Mock journal entries, chapters, and timeline for demo mode.
 * Based on "The Creative Renaissance" narrative.
 * Matches the JournalEntry / TimelineResponse / Chapter shapes from useLoreKeeper.
 */

import type { JournalEntry, TimelineResponse, Chapter, ChapterProfile } from '../hooks/useLoreKeeper';

const now = new Date();
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

// ── Mock chapters ────────────────────────────────────────────────────────────

export const MOCK_CHAPTERS: ChapterProfile[] = [
  {
    id: 'demo-chapter-1',
    title: 'The Corporate Years',
    start_date: d(900),
    end_date: d(400),
    description: 'Five years in enterprise software — building products I didn\'t believe in.',
    summary: 'A chapter defined by comfort and quiet restlessness. Good salary, wrong direction.',
    entry_ids: ['e1', 'e2', 'e3'],
    timeline: [],
    emotion_cloud: [
      { label: 'restless', score: 0.82 },
      { label: 'capable', score: 0.74 },
      { label: 'unfulfilled', score: 0.68 },
    ],
    top_tags: [
      { label: 'work', score: 12 },
      { label: 'routine', score: 9 },
      { label: 'ambition', score: 7 },
    ],
    chapter_traits: ['disciplined', 'ambitious', 'searching'],
    featured_people: ['Marcus', 'Sarah'],
    featured_places: ['Downtown office', 'Home desk'],
  },
  {
    id: 'demo-chapter-2',
    title: 'The Pivot',
    start_date: d(400),
    end_date: d(180),
    description: 'Quit the job. Terrifying and necessary.',
    summary: 'Six months of rebuilding identity from scratch — who am I without the title?',
    entry_ids: ['e4', 'e5', 'e6', 'e7'],
    timeline: [],
    emotion_cloud: [
      { label: 'afraid', score: 0.79 },
      { label: 'liberated', score: 0.71 },
      { label: 'uncertain', score: 0.85 },
    ],
    top_tags: [
      { label: 'identity', score: 14 },
      { label: 'change', score: 11 },
      { label: 'music', score: 8 },
    ],
    chapter_traits: ['courageous', 'questioning', 'creative'],
    featured_people: ['Alex Rivera', 'Emma'],
    featured_places: ['Home studio', 'Coffee shop'],
  },
  {
    id: 'demo-chapter-3',
    title: 'The Creative Renaissance',
    start_date: d(180),
    end_date: null,
    description: 'Building the music EP while figuring out what comes next.',
    summary: 'The most alive I\'ve felt in years. Everything feels connected now.',
    entry_ids: ['e8', 'e9', 'e10', 'e11', 'e12'],
    timeline: [],
    emotion_cloud: [
      { label: 'inspired', score: 0.91 },
      { label: 'grateful', score: 0.78 },
      { label: 'energized', score: 0.83 },
    ],
    top_tags: [
      { label: 'music', score: 18 },
      { label: 'growth', score: 15 },
      { label: 'connection', score: 12 },
    ],
    chapter_traits: ['expressive', 'grounded', 'purposeful'],
    featured_people: ['Alex', 'Alex Rivera', 'Sarah', 'Emma'],
    featured_places: ['Home studio', 'Coffee shop', 'Rooftop'],
  },
];

// ── Mock journal entries ──────────────────────────────────────────────────────

export const MOCK_ENTRIES: JournalEntry[] = [
  // Chapter 1 — Corporate Years
  {
    id: 'e1',
    date: d(820),
    content: 'Another sprint review where we shipped a feature nobody asked for. The metrics look fine. I feel nothing.',
    summary: 'Shipped feature, felt hollow.',
    tags: ['work', 'routine', 'numbness'],
    mood: 'flat',
    chapter_id: 'demo-chapter-1',
    source: 'journal',
  },
  {
    id: 'e2',
    date: d(700),
    content: 'Marcus said something that stuck with me at lunch today: "You\'re too talented to be this bored." I laughed it off but I think about it every day now.',
    summary: 'Marcus planted a seed.',
    tags: ['work', 'ambition', 'friendship'],
    mood: 'thoughtful',
    chapter_id: 'demo-chapter-1',
    source: 'journal',
  },
  {
    id: 'e3',
    date: d(450),
    content: 'Found my old Ableton project files from college. Spent three hours after midnight just messing around. The apartment felt different — warmer somehow.',
    summary: 'Rediscovered music at midnight.',
    tags: ['music', 'nostalgia', 'creativity'],
    mood: 'wistful',
    chapter_id: 'demo-chapter-1',
    source: 'journal',
  },

  // Chapter 2 — The Pivot
  {
    id: 'e4',
    date: d(395),
    content: 'I quit today. Two weeks notice, hands shaking the whole time. My manager looked surprised. I was surprised too. But the moment I walked out of the building I felt lighter than I have in years.',
    summary: 'Quit the job. Terrified and free.',
    tags: ['change', 'identity', 'courage', 'fear'],
    mood: 'liberated',
    chapter_id: 'demo-chapter-2',
    source: 'journal',
  },
  {
    id: 'e5',
    date: d(360),
    content: 'Week three of no job. The silence in the mornings is either the best or worst thing depending on the day. Today: best. Made coffee slowly. Sat by the window. Read for two hours. This is allowed.',
    summary: 'Learning to exist without urgency.',
    tags: ['silence', 'transition', 'rest'],
    mood: 'peaceful',
    chapter_id: 'demo-chapter-2',
    source: 'journal',
  },
  {
    id: 'e6',
    date: d(280),
    content: 'Met Alex Rivera through Emma. They produce electronic music and were looking for a collaborator. We stayed in the studio until 4am talking about storytelling in music. I forgot what it felt like to be genuinely excited about something.',
    summary: 'Met Alex Rivera — creative chemistry.',
    tags: ['music', 'collaboration', 'excitement', 'connection'],
    mood: 'energized',
    chapter_id: 'demo-chapter-2',
    source: 'journal',
  },
  {
    id: 'e7',
    date: d(230),
    content: 'Three months post-corporate. My bank account is scared but my head is clear. I am becoming someone I recognize.',
    summary: 'Clarity emerging from uncertainty.',
    tags: ['identity', 'growth', 'money', 'clarity'],
    mood: 'hopeful',
    chapter_id: 'demo-chapter-2',
    source: 'journal',
  },

  // Chapter 3 — Creative Renaissance
  {
    id: 'e8',
    date: d(170),
    content: 'The EP concept finally crystallized at 2am. It\'s about the transition — from the version of me that optimized for safety to the version that\'s learning to want things. Alex Rivera is all in. We start recording next week.',
    summary: 'EP concept locked in at 2am.',
    tags: ['music', 'ep', 'breakthrough', 'creative'],
    mood: 'inspired',
    chapter_id: 'demo-chapter-3',
    source: 'journal',
  },
  {
    id: 'e9',
    date: d(120),
    content: 'Sarah and Emma read the first draft of the first chapter I\'ve written in seven years. They cried. I tried not to. Writing is terrifying and I need to do more of it.',
    summary: 'First writing received with tears.',
    tags: ['writing', 'vulnerability', 'friendship', 'creative'],
    mood: 'moved',
    chapter_id: 'demo-chapter-3',
    source: 'journal',
  },
  {
    id: 'e10',
    date: d(90),
    content: 'Alex and I on the rooftop at midnight. She said she fell in love with the version of me that stopped pretending. I\'m still learning who that person is.',
    summary: 'Alex said she loves who I\'m becoming.',
    tags: ['love', 'relationship', 'identity', 'connection'],
    mood: 'grateful',
    chapter_id: 'demo-chapter-3',
    source: 'journal',
  },
  {
    id: 'e11',
    date: d(45),
    content: 'First studio session where I wasn\'t faking confidence. I knew what I wanted to say and how. Alex Rivera said I finally sound like myself. That one sentence hit different.',
    summary: 'Found my authentic voice in the studio.',
    tags: ['music', 'authenticity', 'growth', 'breakthrough'],
    mood: 'proud',
    chapter_id: 'demo-chapter-3',
    source: 'journal',
  },
  {
    id: 'e12',
    date: d(7),
    content: 'Looking back at entries from a year ago. The person writing those was exhausted in a way they couldn\'t name. I want to remember that feeling — not to go back, but to understand how far the distance is now.',
    summary: 'Reading old entries. Noticing the distance.',
    tags: ['reflection', 'growth', 'gratitude', 'memory'],
    mood: 'reflective',
    chapter_id: 'demo-chapter-3',
    source: 'journal',
  },
];

// ── Mock timeline (groups entries by month into TimelineResponse shape) ───────

function groupByMonth(entries: JournalEntry[]) {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = e.date.slice(0, 7); // "YYYY-MM"
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([month, monthEntries]) => ({ month, entries: monthEntries }));
}

export const MOCK_TIMELINE: TimelineResponse = {
  chapters: MOCK_CHAPTERS.map((chapter) => ({
    ...chapter,
    months: groupByMonth(MOCK_ENTRIES.filter((e) => e.chapter_id === chapter.id)),
  })),
  unassigned: [],
};

export const MOCK_TAGS = [
  { name: 'music', count: 8 },
  { name: 'identity', count: 6 },
  { name: 'growth', count: 6 },
  { name: 'creative', count: 5 },
  { name: 'connection', count: 5 },
  { name: 'change', count: 4 },
  { name: 'friendship', count: 4 },
  { name: 'work', count: 3 },
  { name: 'reflection', count: 3 },
  { name: 'courage', count: 2 },
];
