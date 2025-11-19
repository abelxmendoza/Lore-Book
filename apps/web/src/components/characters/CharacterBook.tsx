import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, User, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { CharacterDetailModal } from './CharacterDetailModal';
import { UserProfile } from './UserProfile';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';

// Dummy character data for display
const dummyCharacters: Character[] = [
  {
    id: 'dummy-1',
    name: 'Sarah Chen',
    alias: ['Sarah', 'Sara'],
    pronouns: 'she/her',
    archetype: 'ally',
    role: 'Best Friend',
    status: 'active',
    summary: 'My closest friend and confidante. We met in college and have been inseparable ever since. Sarah is incredibly supportive, honest, and always knows how to make me laugh.',
    tags: ['friendship', 'support', 'honesty', 'loyalty'],
    metadata: {
      relationship_type: 'friend',
      closeness_score: 95,
      first_met: '2018-09-15'
    },
    social_media: {
      email: 'sarah.chen@example.com',
      instagram: '@sarah_life'
    },
    memory_count: 24,
    relationship_count: 8
  },
  {
    id: 'dummy-2',
    name: 'Marcus Johnson',
    alias: ['Marcus', 'Marc'],
    pronouns: 'he/him',
    archetype: 'mentor',
    role: 'Mentor & Coach',
    status: 'active',
    summary: 'A wise mentor who has guided me through many career and life decisions. Marcus has decades of experience and always provides thoughtful, nuanced advice.',
    tags: ['mentorship', 'wisdom', 'career', 'guidance'],
    metadata: {
      relationship_type: 'coach',
      closeness_score: 85,
      first_met: '2020-03-10'
    },
    social_media: {
      email: 'marcus@example.com',
      linkedin: 'marcus-johnson'
    },
    memory_count: 18,
    relationship_count: 5
  },
  {
    id: 'dummy-3',
    name: 'Alex Rivera',
    alias: ['Alex', 'A.R.'],
    pronouns: 'they/them',
    archetype: 'collaborator',
    role: 'Creative Collaborator',
    status: 'active',
    summary: 'A talented creative collaborator I\'ve worked with on several projects. Alex brings fresh perspectives and we complement each other\'s skills well.',
    tags: ['collaboration', 'creativity', 'professional', 'innovation'],
    metadata: {
      relationship_type: 'professional',
      closeness_score: 75,
      first_met: '2021-07-20'
    },
    social_media: {
      github: 'alex-dev',
      website: 'alexrivera.dev'
    },
    memory_count: 12,
    relationship_count: 3
  },
  {
    id: 'dummy-4',
    name: 'Jordan Kim',
    alias: ['Jordan', 'J'],
    pronouns: 'they/them',
    archetype: 'family',
    role: 'Sibling',
    status: 'active',
    summary: 'My sibling and one of the most important people in my life. We\'ve grown closer over the years and now have deep, meaningful conversations about life, dreams, and everything in between.',
    tags: ['family', 'sibling', 'support', 'connection'],
    metadata: {
      relationship_type: 'family',
      closeness_score: 90,
      first_met: '1995-06-15'
    },
    memory_count: 32,
    relationship_count: 12
  },
  {
    id: 'dummy-5',
    name: 'Dr. Maya Patel',
    alias: ['Maya', 'Dr. Patel'],
    pronouns: 'she/her',
    archetype: 'mentor',
    role: 'Life Coach',
    status: 'active',
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
    name: 'The Coffee Shop',
    alias: ['Coffee Shop', 'The Shop'],
    pronouns: 'it/its',
    archetype: 'place',
    role: 'Workspace',
    status: 'active',
    summary: 'My favorite place to work and think. The atmosphere is perfect for creativity - not too quiet, not too loud. I\'ve written some of my best work here and had many meaningful conversations.',
    tags: ['workspace', 'creativity', 'routine', 'comfort'],
    metadata: {
      relationship_type: 'place',
      visit_frequency: 'weekly'
    },
    memory_count: 28,
    relationship_count: 0
  },
  {
    id: 'dummy-7',
    name: 'Central Park',
    alias: ['The Park'],
    pronouns: 'it/its',
    archetype: 'place',
    role: 'Reflection Space',
    status: 'active',
    summary: 'A peaceful place for walks and reflection. I come here when I need to clear my mind, process thoughts, or simply enjoy nature. It\'s become a sanctuary for me.',
    tags: ['nature', 'peace', 'reflection', 'walking'],
    metadata: {
      relationship_type: 'place',
      visit_frequency: 'bi-weekly'
    },
    memory_count: 19,
    relationship_count: 0
  },
  {
    id: 'dummy-8',
    name: 'Emma Thompson',
    alias: ['Emma'],
    pronouns: 'she/her',
    archetype: 'friend',
    role: 'Friend',
    status: 'active',
    summary: 'A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other\'s work. Her perspective is always valuable.',
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
  }
];

const ITEMS_PER_PAGE = 12; // 4 columns × 3 rows

export const CharacterBook = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

  const loadCharacters = async () => {
    setLoading(true);
    
    try {
      const response = await fetchJson<{ characters: Character[] }>('/api/characters/list');
      const characterList = response?.characters || [];
      // If no characters loaded, use dummy data
      setCharacters(characterList.length > 0 ? characterList : dummyCharacters);
    } catch {
      // Silently fail - use dummy data instead
      setCharacters(dummyCharacters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCharacters();
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
    if (!searchTerm.trim()) return characters;
    const term = searchTerm.toLowerCase();
    return characters.filter(
      (char) =>
        char.name.toLowerCase().includes(term) ||
        char.alias?.some((a) => a.toLowerCase().includes(term)) ||
        char.summary?.toLowerCase().includes(term) ||
        char.tags?.some((t) => t.toLowerCase().includes(term)) ||
        char.archetype?.toLowerCase().includes(term) ||
        char.role?.toLowerCase().includes(term)
    );
  }, [characters, searchTerm]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Calculate pagination
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
    <div className="space-y-6">
      {/* User Profile & Insights - Displayed first */}
      <div className="space-y-4">
        <UserProfile />
      </div>

      {/* Character Search Bar - Right under user profile */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search characters by name, alias, tags, or role..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Character Book</h2>
            <p className="text-sm text-white/60 mt-1">
              {characters.length} characters · {filteredCharacters.length} shown
              {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
              {loading && ' · Loading...'}
            </p>
          </div>
          <Button 
            leftIcon={<Plus className="h-4 w-4" />} 
            onClick={() => void loadCharacters()}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/60">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
          <p>Loading characters...</p>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <User className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No characters found</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedCharacters.map((character, index) => {
              try {
                return (
                  <CharacterProfileCard
                    key={character.id || `char-${index}`}
                    character={character}
                    onClick={() => {
                      setSelectedCharacter(character);
                    }}
                  />
                );
              } catch {
                return null;
              }
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevious}
                disabled={currentPage === 1}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>

              <div className="flex items-center gap-2">
                {/* Page indicators */}
                <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-border/50">
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
                            ? 'bg-primary text-white'
                            : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <span className="text-sm text-white/60">
                  {startIndex + 1}-{Math.min(endIndex, filteredCharacters.length)} of {filteredCharacters.length}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={goToNext}
                disabled={currentPage === totalPages}
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Next
              </Button>
            </div>
          )}
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
                    // Find the entry and convert to MemoryCard
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
                      // Try to fetch the entry if not in local state
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

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => {
            setSelectedCharacter(null);
          }}
          onUpdate={() => {
            void loadCharacters();
            setSelectedCharacter(null);
          }}
        />
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

