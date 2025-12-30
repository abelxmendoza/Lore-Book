import { useState, useMemo, useEffect } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, BookOpen, LayoutGrid, Calendar, Tag, Sparkles, Heart, FileText, Clock } from 'lucide-react';
import { MemoryCardComponent } from './MemoryCard';
import { MemoryDetailModal } from './MemoryDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';

const ITEMS_PER_PAGE = 12; // 4 columns × 3 rows for grid view

// Comprehensive mock memory data showcasing all app capabilities
const dummyMemoryCards: MemoryCard[] = [
  {
    id: 'dummy-1',
    title: 'The Awakening - First Day at the Academy',
    content: 'Today marked the beginning of my journey at the Academy of Shadows. The ancient halls whispered secrets of generations past, and I could feel the weight of destiny on my shoulders. Master Chen spoke of the trials ahead, but I am ready.',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['academy', 'training', 'destiny', 'master-chen'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'The Awakening',
    characters: ['Master Chen', 'Sarah'],
    sagaTitle: 'Robotics Genesis 2.0'
  },
  {
    id: 'dummy-2',
    title: 'Breakthrough in Neural Networks',
    content: 'After weeks of experimentation, I finally achieved a breakthrough in neural network optimization. The new architecture reduces training time by 40% while maintaining accuracy. This could revolutionize our approach to AI development.',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['ai', 'neural-networks', 'breakthrough', 'research'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Kai', 'Dr. Martinez'],
    arcTitle: 'Research & Development'
  },
  {
    id: 'dummy-3',
    title: 'Coffee Shop Encounter',
    content: 'Met an interesting person at the coffee shop today. We talked about philosophy, technology, and the future of humanity. Sometimes the best conversations happen in the most unexpected places.',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coffee-shop', 'philosophy', 'conversation'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex'],
    sagaTitle: 'Daily Life'
  },
  {
    id: 'dummy-4',
    title: 'Completed the Robotics Project',
    content: 'Finished the robotics project that has been consuming my time for the past month. The robot can now navigate complex environments autonomously. Feeling accomplished and ready for the next challenge.',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['robotics', 'project', 'accomplishment', 'ai'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'The First Trial',
    characters: ['Marcus', 'Sarah'],
    arcTitle: 'Robotics Genesis 2.0'
  },
  {
    id: 'dummy-5',
    title: 'Reflection on Growth',
    content: 'Looking back at where I started, I can see how much I\'ve grown. The challenges seemed insurmountable at first, but each obstacle taught me something valuable. Growth comes from embracing the struggle.',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['reflection', 'growth', 'philosophy', 'personal'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Journey'
  },
  {
    id: 'dummy-6',
    title: 'Team Meeting - New Initiative',
    content: 'Had a productive team meeting today. We discussed the new initiative and everyone brought great ideas to the table. The energy in the room was palpable. Excited to see where this leads.',
    date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['team', 'meeting', 'initiative', 'collaboration'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Marcus', 'Sarah', 'Kai'],
    arcTitle: 'Team Projects'
  },
  {
    id: 'dummy-7',
    title: 'Late Night Coding Session',
    content: 'Spent the night debugging a complex issue. The satisfaction of finally solving it at 3 AM was worth the exhaustion. Sometimes the best work happens when the world is quiet.',
    date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['coding', 'debugging', 'late-night', 'problem-solving'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Development'
  },
  {
    id: 'dummy-8',
    title: 'Moment of Clarity',
    content: 'Had a moment of clarity today about the direction I want to take. Sometimes you need to step back and see the bigger picture. The path forward is clearer now.',
    date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['clarity', 'direction', 'insight', 'reflection'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Journey'
  },
  {
    id: 'dummy-9',
    title: 'Training Session with Master Chen',
    content: 'Intense training session today. Master Chen pushed me harder than ever before, but I can feel myself getting stronger. The ancient techniques are becoming more natural.',
    date: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['training', 'master-chen', 'techniques', 'growth'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    chapterTitle: 'The Academy of Shadows',
    characters: ['Master Chen'],
    sagaTitle: 'Robotics Genesis 2.0'
  },
  {
    id: 'dummy-10',
    title: 'New Project Idea',
    content: 'Came up with an exciting new project idea today. It combines AI, robotics, and human interaction in a way that hasn\'t been explored before. Can\'t wait to start prototyping.',
    date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['project', 'ai', 'robotics', 'innovation', 'prototyping'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Kai', 'Dr. Martinez'],
    arcTitle: 'Research & Development'
  },
  {
    id: 'dummy-11',
    title: 'Weekend Reflection',
    content: 'Took some time this weekend to reflect on the week. So much happened, and I\'m grateful for all the experiences. Each day brings new lessons and opportunities.',
    date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['weekend', 'reflection', 'gratitude', 'lessons'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Journey'
  },
  {
    id: 'dummy-12',
    title: 'Breakthrough Moment',
    content: 'Had a breakthrough moment today. Everything clicked into place and I finally understood the concept I\'ve been struggling with. Sometimes persistence pays off.',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['breakthrough', 'understanding', 'persistence', 'learning'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    arcTitle: 'Learning & Growth'
  },
  {
    id: 'dummy-13',
    title: 'Team Collaboration Success',
    content: 'Our team collaboration today was incredibly productive. We solved a problem that had been blocking us for days. The synergy was amazing.',
    date: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['team', 'collaboration', 'success', 'problem-solving'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Marcus', 'Sarah'],
    arcTitle: 'Team Projects'
  },
  {
    id: 'dummy-14',
    title: 'New Learning Path',
    content: 'Decided to take on a new learning path. There\'s so much to explore and I want to expand my knowledge in areas I haven\'t touched yet. Excited for the journey ahead.',
    date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['learning', 'growth', 'exploration', 'knowledge'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-15',
    title: 'Evening Walk Thoughts',
    content: 'Took a long walk this evening and had some profound thoughts. The quiet of the night helps me process everything that\'s happening. Nature has a way of putting things in perspective.',
    date: new Date(Date.now() - 37 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['walk', 'nature', 'reflection', 'thoughts'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Journey'
  },
  {
    id: 'dummy-16',
    title: 'Project Milestone Reached',
    content: 'Reached a major milestone on the project today. It\'s been a long road, but seeing the progress is incredibly rewarding. Onward to the next phase!',
    date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['milestone', 'project', 'progress', 'achievement'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Kai', 'Marcus'],
    arcTitle: 'Research & Development'
  },
  {
    id: 'dummy-17',
    title: 'Deep Conversation',
    content: 'Had a deep conversation with a friend today about life, purpose, and meaning. These conversations always leave me with new perspectives and insights.',
    date: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['conversation', 'philosophy', 'friendship', 'insights'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Alex'],
    sagaTitle: 'Personal Connections'
  },
  {
    id: 'dummy-18',
    title: 'Technical Challenge Overcome',
    content: 'Overcame a significant technical challenge today. The solution was elegant and I learned a lot in the process. These moments remind me why I love what I do.',
    date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['technical', 'challenge', 'solution', 'learning'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    arcTitle: 'Development'
  },
  {
    id: 'dummy-19',
    title: 'Morning Routine Reflection',
    content: 'Reflected on my morning routine today. Small habits compound over time, and I can see how my daily practices have shaped who I am becoming.',
    date: new Date(Date.now() - 47 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['routine', 'habits', 'reflection', 'growth'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-20',
    title: 'Innovation Workshop',
    content: 'Attended an innovation workshop today. The ideas and energy were inspiring. Came away with several concepts I want to explore further.',
    date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['workshop', 'innovation', 'ideas', 'inspiration'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Martinez', 'Sarah'],
    arcTitle: 'Learning & Growth'
  },
  {
    id: 'dummy-21',
    title: 'Martial Arts Tournament Victory',
    content: 'Won my first tournament match today! The training with Master Chen paid off. The discipline and focus I\'ve developed translated perfectly into the competition.',
    date: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['martial-arts', 'tournament', 'victory', 'training'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Master Chen'],
    arcTitle: 'Robotics Genesis 2.0',
    metadata: { favorite: true }
  },
  {
    id: 'dummy-22',
    title: 'Creative Writing Session',
    content: 'Spent the afternoon writing. The words flowed effortlessly today, and I found myself exploring themes I hadn\'t considered before. Writing is such a powerful form of expression.',
    date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['writing', 'creativity', 'expression', 'art'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Creative Exploration'
  },
  {
    id: 'dummy-23',
    title: 'Networking Event Success',
    content: 'Attended a tech networking event and made several meaningful connections. Met someone working on a project similar to mine - we\'re planning to collaborate.',
    date: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['networking', 'professional', 'collaboration', 'connections'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    arcTitle: 'Professional Development'
  },
  {
    id: 'dummy-24',
    title: 'Meditation Practice Deepened',
    content: 'Had a profound meditation session this morning. Reached a state of clarity I haven\'t experienced in weeks. The practice is really deepening.',
    date: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['meditation', 'mindfulness', 'clarity', 'practice'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-25',
    title: 'Photography Adventure',
    content: 'Went on a photography adventure today, exploring parts of the city I\'ve never seen. Captured some incredible shots that really capture the essence of the moment.',
    date: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['photography', 'adventure', 'exploration', 'art'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['David Martinez'],
    sagaTitle: 'Creative Exploration'
  },
  {
    id: 'dummy-26',
    title: 'Book Club Discussion',
    content: 'Had an amazing book club discussion tonight. We explored themes of identity and transformation. The different perspectives everyone brought enriched the conversation.',
    date: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['books', 'discussion', 'literature', 'community'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Oliver Bennett'],
    sagaTitle: 'Learning & Growth'
  },
  {
    id: 'dummy-27',
    title: 'Fitness Milestone',
    content: 'Reached a new personal best in my fitness routine today. The consistency is paying off, and I can feel my strength and endurance improving.',
    date: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['fitness', 'milestone', 'health', 'progress'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: [],
    sagaTitle: 'Personal Development'
  },
  {
    id: 'dummy-28',
    title: 'Music Collaboration',
    content: 'Worked on a new music project with Phoenix today. Their production skills are incredible, and we\'re creating something really special together.',
    date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['music', 'collaboration', 'creativity', 'production'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Phoenix Black'],
    arcTitle: 'Creative Projects'
  },
  {
    id: 'dummy-29',
    title: 'Philosophy Discussion',
    content: 'Had a late-night philosophy discussion with Riley. We explored questions about existence, ethics, and the meaning of life. These conversations always leave me thinking.',
    date: new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['philosophy', 'discussion', 'intellectual', 'friendship'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Riley Chen'],
    sagaTitle: 'Personal Connections'
  },
  {
    id: 'dummy-30',
    title: 'Hiking Adventure',
    content: 'Went on a challenging hike with Ethan today. The views from the summit were breathtaking, and the physical challenge was exactly what I needed.',
    date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['hiking', 'adventure', 'nature', 'exercise'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Ethan Walker'],
    sagaTitle: 'Outdoor Adventures'
  },
  {
    id: 'dummy-31',
    title: 'Art Gallery Visit',
    content: 'Visited the art gallery with Indigo today. Her insights into the pieces were fascinating, and I gained a new appreciation for visual art.',
    date: new Date(Date.now() - 105 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['art', 'gallery', 'culture', 'appreciation'],
    mood: 'calm',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Indigo Moon'],
    sagaTitle: 'Creative Exploration'
  },
  {
    id: 'dummy-32',
    title: 'Career Advice Session',
    content: 'Had a career advice session with Dr. Michael Chen today. His insights into the industry and negotiation strategies were invaluable.',
    date: new Date(Date.now() - 110 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['career', 'advice', 'professional', 'guidance'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Michael Chen'],
    arcTitle: 'Professional Development'
  },
  {
    id: 'dummy-33',
    title: 'Beach Volleyball Match',
    content: 'Played beach volleyball with Lucas today. The sun, sand, and friendly competition made for a perfect afternoon.',
    date: new Date(Date.now() - 115 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['sports', 'beach', 'friendship', 'fun'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Lucas Wright'],
    sagaTitle: 'Recreation'
  },
  {
    id: 'dummy-34',
    title: 'Gaming Session',
    content: 'Had an epic gaming session with Casey today. Their strategic thinking always impresses me, and we make a great team.',
    date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['gaming', 'friendship', 'strategy', 'fun'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Casey Morgan'],
    sagaTitle: 'Recreation'
  },
  {
    id: 'dummy-35',
    title: 'Family Dinner',
    content: 'Had a wonderful family dinner tonight. The conversations were meaningful, and I\'m grateful for these moments of connection.',
    date: new Date(Date.now() - 125 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['family', 'dinner', 'connection', 'gratitude'],
    mood: 'happy',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Jordan Kim', 'Linda Chen'],
    sagaTitle: 'Family Time'
  },
  {
    id: 'dummy-36',
    title: 'Research Paper Published',
    content: 'My research paper was published today! This has been months in the making, and seeing it in print is incredibly rewarding.',
    date: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['research', 'academic', 'achievement', 'publication'],
    mood: 'excited',
    source: 'journal',
    sourceIcon: '📖',
    characters: ['Dr. Rachel Kim'],
    arcTitle: 'Academic Pursuits',
    metadata: { favorite: true }
  }
];

export const MemoryBook = () => {
  const [memories, setMemories] = useState<MemoryCard[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'book'>('book');
  const [selectedTab, setSelectedTab] = useState('all');
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

  const loadMemories = async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ entries: Array<{
        id: string;
        date: string;
        content: string;
        summary?: string | null;
        tags: string[];
        mood?: string | null;
        chapter_id?: string | null;
        source: string;
        metadata?: Record<string, unknown>;
      }> }>('/api/entries/recent?limit=100');
      const cards = response.entries.map(memoryEntryToCard);
      // Use dummy data if no real entries found
      setMemories(cards.length > 0 ? cards : dummyMemoryCards);
      setAllMemories(cards.length > 0 ? cards : dummyMemoryCards);
    } catch {
      // Use dummy data on error
      setMemories(dummyMemoryCards);
      setAllMemories(dummyMemoryCards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMemories();
  }, []);

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
    // Use real data if available, otherwise use dummy data
    if (memoryCards.length > 0) {
      setMemories(memoryCards);
    } else {
      setMemories(dummyMemoryCards);
      setAllMemories(dummyMemoryCards);
    }
  }, [entries]);

  const filteredMemories = useMemo(() => {
    let mems = memories;

    if (selectedTab === 'recent') {
      // Show most recent first (already sorted by date)
      mems = [...mems].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (selectedTab === 'by-tag') {
      // Group by most common tags
      mems = mems;
    } else if (selectedTab === 'by-mood') {
      // Group by mood
      mems = mems.filter(m => m.mood);
    } else if (selectedTab === 'by-source') {
      // Group by source
      mems = mems;
    } else if (selectedTab === 'favorites') {
      // Filter by favorites (if metadata has favorite flag)
      mems = mems.filter(m => m.metadata?.favorite === true);
    }

    if (!searchTerm.trim()) return mems;
    const term = searchTerm.toLowerCase();
    return mems.filter(
      (mem) =>
        mem.title?.toLowerCase().includes(term) ||
        mem.content.toLowerCase().includes(term) ||
        mem.tags.some((t) => t.toLowerCase().includes(term)) ||
        mem.characters?.some((c) => c.toLowerCase().includes(term))
    );
  }, [memories, searchTerm, selectedTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, viewMode, selectedTab]);

  const totalPages = Math.ceil(filteredMemories.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedMemories = filteredMemories.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6">
      {/* Memory Search Bar and Controls */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search memories by content, tags, characters, or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        {/* Navigation Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 h-auto bg-black/40 border border-border/50 p-1 rounded-lg">
            <TabsTrigger value="all" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <FileText className="h-4 w-4" /> All
            </TabsTrigger>
            <TabsTrigger value="recent" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Clock className="h-4 w-4" /> Recent
            </TabsTrigger>
            <TabsTrigger value="by-tag" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Tag className="h-4 w-4" /> By Tag
            </TabsTrigger>
            <TabsTrigger value="by-mood" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Heart className="h-4 w-4" /> By Mood
            </TabsTrigger>
            <TabsTrigger value="by-source" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Sparkles className="h-4 w-4" /> By Source
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Heart className="h-4 w-4" /> Favorites
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Memory Book</h2>
            <p className="text-sm text-white/60 mt-1">
              {filteredMemories.length} memories · {filteredMemories.length} shown
              {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
              {loading && ' · Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'book' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('book')}
              leftIcon={<BookOpen className="h-4 w-4" />}
            >
              Book
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
              leftIcon={<LayoutGrid className="h-4 w-4" />}
            >
              Grid
            </Button>
            <Button 
              leftIcon={<RefreshCw className="h-4 w-4" />} 
              onClick={() => void loadMemories()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-48 animate-pulse" />
          ))}
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <FileText className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No memories found</p>
          <p className="text-sm">Try a different search term or create new journal entries</p>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-amber-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                      Memory Book
                    </h3>
                    <p className="text-xs text-amber-700/50 mt-0.5">
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-amber-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Memory Grid */}
              <div className="flex-1 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
                {paginatedMemories.map((memory, index) => {
                  try {
                    return (
                      <MemoryCardComponent
                        key={memory.id || `mem-${index}`}
                        memory={memory}
                        showLinked={true}
                        expanded={false}
                        onToggleExpand={() => {}}
                        onSelect={() => setSelectedMemory(memory)}
                      />
                    );
                  } catch {
                    return null;
                  }
                })}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-amber-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page indicators */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-amber-800/30">
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
                              ? 'bg-amber-600 text-white'
                              : 'text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm text-amber-700/50">
                    {startIndex + 1}-{Math.min(endIndex, filteredMemories.length)} of {filteredMemories.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
          </div>
        </>
      )}

      {/* Horizontal Timeline Component - Always at bottom */}
      <div className="mt-8 pt-6 border-t border-border/50">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            Timeline
          </h3>
          <p className="text-sm text-white/60 mt-1">
            {chapters.length > 0 || entries.length > 0
              ? `View your story timeline with ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} and ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`
              : 'Your timeline will appear here as you create chapters and entries'}
          </p>
        </div>
        <Card className="bg-black/40 border-border/60 overflow-hidden">
          <CardContent className="p-0 overflow-x-hidden">
            <div className="overflow-x-auto overflow-y-hidden">
              <ColorCodedTimeline
                chapters={chapters.length > 0 ? chapters.map(ch => ({
                  id: ch.id,
                  title: ch.title,
                  start_date: ch.start_date || ch.startDate || new Date().toISOString(),
                  end_date: ch.end_date || ch.endDate || null,
                  description: ch.description || null,
                  summary: ch.summary || null
                })) : []}
                entries={entries.length > 0 ? entries.map(entry => ({
                  id: entry.id,
                  content: entry.content,
                  date: entry.date,
                  chapter_id: entry.chapter_id || entry.chapterId || null
                })) : []}
                useDummyData={chapters.length === 0 && entries.length === 0}
                showLabel={true}
                onItemClick={async (item) => {
                  if (item.type === 'entry' || item.entryId || (item.id && entries.some(e => e.id === item.id))) {
                    const entryId = item.entryId || item.id;
                    const entry = entries.find(e => e.id === entryId);
                    if (entry) {
                      const memoryCard = memoryEntryToCard({
                        id: entry.id,
                        date: entry.date,
                        content: entry.content,
                        summary: entry.summary || null,
                        tags: entry.tags || [],
                        mood: entry.mood || null,
                        chapter_id: entry.chapter_id || null,
                        source: entry.source || 'manual',
                        metadata: entry.metadata || {}
                      });
                      setSelectedMemory(memoryCard);
                    } else {
                      try {
                        const fetchedEntry = await fetchJson<{
                          id: string;
                          date: string;
                          content: string;
                          summary?: string | null;
                          tags: string[];
                          mood?: string | null;
                          chapter_id?: string | null;
                          source: string;
                          metadata?: Record<string, unknown>;
                        }>(`/api/entries/${entryId}`);
                        const memoryCard = memoryEntryToCard(fetchedEntry);
                        setSelectedMemory(memoryCard);
                      } catch (error) {
                        console.error('Failed to load entry:', error);
                      }
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

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

