import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { useLoreKeeper } from './useLoreKeeper';
import { useMockData } from '../contexts/MockDataContext';
import { mockDataService } from '../services/mockDataService';

export type BiographySection = {
  id: string;
  title: string;
  content: string;
  order: number;
  period?: { from: string; to: string };
  dateMetadata?: {
    precision?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
    confidence?: number;
    source?: string;
    extractedAt?: string;
  };
  lastUpdated?: string;
};

export type Character = {
  id: string;
  name: string;
  alias?: string[];
  summary?: string;
  [key: string]: unknown;
};

export type Location = {
  id: string;
  name: string;
  visitCount?: number;
  [key: string]: unknown;
};

export type Chapter = {
  id: string;
  title: string;
  start_date?: string;
  end_date?: string;
  summary?: string;
  [key: string]: unknown;
};

export type LoreNavigatorData = {
  biography: BiographySection[];
  characters: Character[];
  locations: Location[];
  chapters: Chapter[];
};

// Dummy data fallbacks
const dummyBiographySections: BiographySection[] = [
  {
    id: 'bio-section-1',
    title: 'Early Years',
    content: `I was born in a small town where everyone knew everyone else. My childhood was filled with long summer days spent exploring the woods behind our house, building forts with my friends, and imagining grand adventures in the backyard.

My parents were both teachers, which meant our house was always filled with books. I learned to read early, and books became my escape and my passion. By the time I was ten, I had read through most of the local library's children's section and was moving on to books meant for much older readers.

Those early years shaped who I am today—curious, always seeking to learn, and finding comfort in stories and imagination.`,
    order: 1,
    period: { from: '1990-01-01', to: '2000-12-31' },
    lastUpdated: new Date('2024-01-15').toISOString()
  },
  {
    id: 'bio-section-2',
    title: 'College Years',
    content: `College was where I truly found myself. I moved to a big city for the first time, leaving behind the small town I'd known all my life. The transition was challenging—I felt lost and overwhelmed by the sheer size of everything and the number of people.

But it was also exhilarating. I met people from all over the world, each with different perspectives and experiences. I joined clubs, took classes in subjects I'd never considered before, and discovered passions I didn't know I had.

The late-night study sessions, the deep conversations with roommates, the feeling of independence—all of it contributed to who I became. I learned not just from textbooks, but from experiences, from mistakes, and from the people around me.`,
    order: 2,
    period: { from: '2008-09-01', to: '2012-05-15' },
    lastUpdated: new Date('2024-02-20').toISOString()
  },
  {
    id: 'bio-section-3',
    title: 'First Career Steps',
    content: `After graduation, I landed my first real job in a field I was passionate about. The first few months were a steep learning curve—I was constantly questioning whether I was doing things right, whether I belonged there.

But slowly, I found my footing. I made connections with colleagues who became mentors and friends. I took on projects that challenged me and learned from each one. There were setbacks, of course—projects that didn't go as planned, moments of doubt—but each challenge made me stronger.

Those early career years taught me resilience, the importance of asking questions, and the value of building genuine relationships with the people you work with.`,
    order: 3,
    period: { from: '2012-06-01', to: '2018-12-31' },
    lastUpdated: new Date('2024-03-10').toISOString()
  },
  {
    id: 'bio-section-4',
    title: 'Major Life Changes',
    content: `The past few years have brought significant changes to my life. I moved to a new city, started a new chapter in my career, and made decisions that felt risky but necessary. Change has always been difficult for me, but I've learned that growth rarely happens in comfort zones.

I've also learned the importance of balance—between work and life, between ambition and contentment, between planning for the future and living in the present. It's an ongoing journey, one that I'm still navigating.

These experiences have taught me that life doesn't follow a linear path. Sometimes you have to take detours, sometimes you have to pause and reassess, and sometimes the best opportunities come from the most unexpected places.`,
    order: 4,
    period: { from: '2019-01-01', to: '2024-12-31' },
    lastUpdated: new Date('2024-12-15').toISOString()
  }
];

const dummyCharacters: Character[] = [
  { id: 'char-1', name: 'Sarah Chen' },
  { id: 'char-2', name: 'Marcus Johnson' },
  { id: 'char-3', name: 'Alex Rivera' }
];

const dummyLocations: Location[] = [
  { id: 'loc-1', name: 'San Francisco Tech Hub' },
  { id: 'loc-2', name: 'Golden Gate Park' },
  { id: 'loc-3', name: 'Home Office' }
];

const dummyChapters: Chapter[] = [
  { id: 'ch-1', title: 'Tech Adventures' },
  { id: 'ch-2', title: 'Career Growth' },
  { id: 'ch-3', title: 'Personal Development' }
];

export const useLoreNavigatorData = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [data, setData] = useState<LoreNavigatorData>({
    biography: [],
    characters: [],
    locations: [],
    chapters: []
  });
  const [loading, setLoading] = useState(true);
  const { chapters: loreChapters } = useLoreKeeper();

  // Note: Biography sections are handled directly in loadData based on toggle

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load biography sections
      let biography: BiographySection[] = [];
      try {
        const bioData = await fetchJson<{ sections: BiographySection[] }>('/api/biography/sections');
        biography = bioData.sections || [];
      } catch (error) {
        console.warn('Failed to load biography sections:', error);
      }

      // Load characters
      let characters: Character[] = [];
      try {
        const charData = await fetchJson<{ characters: Character[] }>('/api/characters/list');
        characters = charData.characters || [];
      } catch (error) {
        console.warn('Failed to load characters:', error);
      }

      // Load locations
      let locations: Location[] = [];
      try {
        const locData = await fetchJson<{ locations: Location[] }>('/api/locations');
        locations = locData.locations || [];
      } catch (error) {
        console.warn('Failed to load locations:', error);
      }

      // Use chapters from useLoreKeeper
      const chapters: Chapter[] = loreChapters.length > 0 
        ? loreChapters.map(ch => ({
            id: ch.id,
            title: ch.title,
            start_date: ch.start_date,
            end_date: ch.end_date,
            summary: ch.summary
          }))
        : [];

      // Use mock data service to determine what to show
      const finalBiography = biography.length > 0 
        ? biography 
        : (isMockDataEnabled ? dummyBiographySections : []);
      
      const finalCharacters = characters.length > 0 
        ? characters 
        : (isMockDataEnabled ? dummyCharacters : []);
      
      const finalLocations = locations.length > 0 
        ? locations 
        : (isMockDataEnabled ? dummyLocations : []);
      
      const finalChapters = chapters.length > 0 
        ? chapters 
        : (isMockDataEnabled ? dummyChapters : []);

      setData({
        biography: finalBiography,
        characters: finalCharacters,
        locations: finalLocations,
        chapters: finalChapters
      });
    } catch (error) {
      console.error('Failed to load lore navigator data:', error);
      // Use mock data on error only if toggle is enabled
      if (isMockDataEnabled) {
        setData({
          biography: dummyBiographySections,
          characters: dummyCharacters,
          locations: dummyLocations,
          chapters: dummyChapters
        });
      } else {
        setData({
          biography: [],
          characters: [],
          locations: [],
          chapters: []
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loreChapters]);

  useEffect(() => {
    void loadData();
  }, [loadData, isMockDataEnabled]);

  return { data, loading, refresh: loadData };
};

