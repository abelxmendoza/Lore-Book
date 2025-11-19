import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { MemoryCardComponent } from './MemoryCard';
import { MemoryDetailModal } from './MemoryDetailModal';
import { MemoryFiltersSidebar } from './MemoryFiltersSidebar';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard, type MemoryFilters, type MemorySearchResult } from '../../types/memory';
import type { HQIResult } from '../hqi/HQIResultCard';

const DEBOUNCE_DELAY = 300;

// Dummy memory cards for demonstration
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
  }
];

export const MemoryExplorer = () => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<MemoryFilters>({
    eras: [],
    sagas: [],
    arcs: [],
    characters: [],
    sources: [],
    tags: []
  });
  const [recentMemories, setRecentMemories] = useState<MemoryCard[]>(dummyMemoryCards.slice(0, 20));
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);

  // Load recent memories on mount and when filters change
  useEffect(() => {
    if (!query.trim()) {
      loadRecentMemories();
    }
  }, [filters, query]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch();
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const loadRecentMemories = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '20');
      if (filters.eras.length > 0) params.append('eras', filters.eras.join(','));
      if (filters.sagas.length > 0) params.append('sagas', filters.sagas.join(','));
      if (filters.arcs.length > 0) params.append('arcs', filters.arcs.join(','));
      if (filters.sources.length > 0) params.append('sources', filters.sources.join(','));
      if (filters.tags.length > 0) params.append('tags', filters.tags.join(','));
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

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
      }> }>(`/api/entries/recent?${params.toString()}`);
      const cards = response.entries.map(memoryEntryToCard);
      // Use dummy data if no real entries found
      setRecentMemories(cards.length > 0 ? cards : dummyMemoryCards.slice(0, 20));
    } catch (error) {
      console.error('Failed to load recent memories:', error);
      // Use dummy data on error
      setRecentMemories(dummyMemoryCards.slice(0, 20));
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async () => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      // Parallel searches
      const [semanticResults, keywordResults] = await Promise.all([
        // Semantic search via HQI
        fetchJson<{ results: HQIResult[] }>('/api/hqi/search', {
          method: 'POST',
          body: JSON.stringify({ query, filters: {} })
        }).catch(() => ({ results: [] })),
        // Keyword search
        (async () => {
          const params = new URLSearchParams();
          params.append('query', query);
          params.append('limit', '20');
          if (filters.sources.length > 0) params.append('sources', filters.sources.join(','));
          if (filters.tags.length > 0) params.append('tags', filters.tags.join(','));
          if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
          if (filters.dateTo) params.append('dateTo', filters.dateTo);

          const response = await fetchJson<{ entries: MemoryEntry[] }>(`/api/entries/search/keyword?${params.toString()}`);
          return response.entries || [];
        })()
      ]);

      // Convert semantic results to memory cards
      const semanticCards: MemoryCard[] = [];
      for (const result of semanticResults.results.slice(0, 10)) {
        try {
          // Fetch full entry details
          const entryResponse = await fetchJson<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }>(`/api/entries/${result.node_id}`).catch(() => null);
          if (entryResponse) {
            semanticCards.push(memoryEntryToCard(entryResponse));
          }
        } catch (error) {
          console.error('Failed to fetch semantic result entry:', error);
        }
      }

      // Convert keyword results to memory cards
      const keywordCards = keywordResults.map(memoryEntryToCard);

      // Get related clusters for top semantic matches
      const topMemoryIds = semanticCards.slice(0, 5).map(c => c.id);
      let clusterResults: MemorySearchResult[] = [];
      if (topMemoryIds.length > 0) {
        try {
          const clustersResponse = await fetchJson<{ clusters: Array<{ type: string; label: string; memories: Array<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }> }> }>(
            '/api/entries/clusters',
            {
              method: 'POST',
              body: JSON.stringify({ memoryIds: topMemoryIds, limit: 10 })
            }
          );

          clusterResults = clustersResponse.clusters.map(cluster => ({
            type: 'cluster' as const,
            memories: cluster.memories.map(memoryEntryToCard),
            clusterLabel: cluster.label,
            clusterReason: `Related by ${cluster.type}`
          }));
        } catch (error) {
          console.error('Failed to load clusters:', error);
        }
      }

      // Combine results
      const results: MemorySearchResult[] = [];

      if (semanticCards.length > 0) {
        results.push({
          type: 'semantic',
          memories: semanticCards
        });
      }

      if (keywordCards.length > 0) {
        results.push({
          type: 'keyword',
          memories: keywordCards
        });
      }

      results.push(...clusterResults);

      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const isSearchMode = query.trim().length > 0;

  // Get all memories for navigation (from search results or recent memories)
  const allMemories = useMemo(() => {
    if (isSearchMode) {
      return searchResults.flatMap(result => result.memories);
    }
    return recentMemories;
  }, [isSearchMode, searchResults, recentMemories]);

  const handleNavigateMemory = (memoryId: string) => {
    const memory = allMemories.find(m => m.id === memoryId);
    if (memory) {
      setSelectedMemory(memory);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Filters Sidebar */}
      <MemoryFiltersSidebar filters={filters} onFiltersChange={setFilters} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search Bar */}
        <div className="border-b border-border/60 bg-black/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-border/50 bg-black/60 px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your memories... e.g., 'robotics events involving Kai in March'"
                className="border-none bg-transparent text-white text-base placeholder:text-white/40 focus-visible:ring-0"
                disabled={loading}
              />
            </div>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          </div>
        </div>

        {/* Timeline */}
        {!isSearchMode && (
          <div className="border-b border-border/60 bg-black/40 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Timeline
              </h3>
            </div>
            <div className="overflow-x-auto overflow-y-hidden">
              <ColorCodedTimeline
                entries={recentMemories.map(memory => ({
                  id: memory.id,
                  content: memory.content,
                  date: memory.date,
                  chapter_id: memory.chapterId || null
                }))}
                useDummyData={recentMemories.length === 0}
                showLabel={true}
                onItemClick={(item) => {
                  const clickedMemory = recentMemories.find(m => m.id === item.id);
                  if (clickedMemory) {
                    setSelectedMemory(clickedMemory);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSearchMode ? (
            /* Search Results */
            <div className="space-y-8">
              {searchResults.length === 0 && !loading && (
                <div className="text-center py-12 text-white/60">
                  <p className="text-lg font-medium mb-2">No results found</p>
                  <p className="text-sm">Try rephrasing your search or use different keywords</p>
                </div>
              )}

              {searchResults.map((result, idx) => (
                <div key={idx} className="space-y-4">
                  {/* Section Header */}
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      {result.type === 'semantic' && (
                        <>
                          <Sparkles className="h-5 w-5 inline-block mr-2 text-primary" />
                          Semantic Matches
                        </>
                      )}
                      {result.type === 'keyword' && (
                        <>
                          <Search className="h-5 w-5 inline-block mr-2 text-primary" />
                          Keyword Matches
                        </>
                      )}
                      {result.type === 'cluster' && (
                        <>
                          <Sparkles className="h-5 w-5 inline-block mr-2 text-primary" />
                          {result.clusterLabel || 'Related Clusters'}
                        </>
                      )}
                    </h3>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {result.memories.length}
                    </Badge>
                    {result.clusterReason && (
                      <span className="text-xs text-white/50">{result.clusterReason}</span>
                    )}
                  </div>

                  {/* Memory Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {result.memories.map((memory) => (
                      <MemoryCardComponent
                        key={memory.id}
                        memory={memory}
                        showLinked={true}
                        expanded={expandedCardId === memory.id}
                        onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                        onSelect={() => setSelectedMemory(memory)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Default View - Recent Memories */
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Recent Memories</h2>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {recentMemories.length}
                </Badge>
              </div>

              {loading && recentMemories.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : recentMemories.length === 0 ? (
                <div className="text-center py-12 text-white/60">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
                  <p className="text-lg font-medium mb-2">No memories yet</p>
                  <p className="text-sm">Start creating journal entries to see them here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentMemories.map((memory) => (
                    <MemoryCardComponent
                      key={memory.id}
                      memory={memory}
                      showLinked={true}
                      expanded={expandedCardId === memory.id}
                      onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                      onSelect={() => setSelectedMemory(memory)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={handleNavigateMemory}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};

