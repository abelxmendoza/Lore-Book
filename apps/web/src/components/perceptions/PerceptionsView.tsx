import { useState, useEffect, useMemo } from 'react';
import { Eye, Plus, Filter, AlertTriangle, ChevronLeft, ChevronRight, BookOpen, MessageSquare } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PerceptionEntryCard } from './PerceptionEntryCard';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry, PerceptionSource, PerceptionStatus } from '../../types/perception';
import { PerceptionDetailModal } from './PerceptionDetailModal';
import { GossipChatModal } from './GossipChatModal';
import { PerceptionSearchBar } from './PerceptionSearchBar';
import { Card, CardContent } from '../ui/card';

const ITEMS_PER_PAGE = 12; // 4 columns × 3 rows for grid view

// Mock dummy data for perceptions
const mockPerceptions: PerceptionEntry[] = [
  {
    id: 'mock-1',
    user_id: 'mock-user',
    subject_alias: 'Sarah Chen',
    subject_person_id: null,
    content: 'I believed that Sarah was spreading rumors about me to our mutual friends. I heard this from Marcus who said he overheard her talking about me at a party.',
    source: 'told_by',
    source_detail: 'Told by Marcus',
    confidence_level: 0.4,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'This made me feel paranoid and I started avoiding group hangouts. I stopped trusting Sarah completely and questioned all our past interactions.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I believed that Sarah was spreading rumors about me to our mutual friends. I heard this from Marcus who said he overheard her talking about me at a party.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-2',
    user_id: 'mock-user',
    subject_alias: 'Alex Martinez',
    subject_person_id: null,
    content: 'I heard from multiple people that Alex was planning to leave the company soon. People said he was interviewing at other places and had been complaining about management.',
    source: 'rumor',
    source_detail: 'Multiple coworkers mentioned it',
    confidence_level: 0.6,
    sentiment: 'neutral',
    timestamp_heard: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I started preparing for his departure mentally and began documenting processes he handled. I also started networking more with other team members.',
    status: 'confirmed',
    retracted: false,
    resolution_note: 'Confirmed when Alex announced his resignation two weeks later',
    original_content: 'I heard from multiple people that Alex was planning to leave the company soon. People said he was interviewing at other places and had been complaining about management.',
    evolution_notes: [
      '2024-01-15: Confirmed when Alex announced his resignation two weeks later'
    ],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-3',
    user_id: 'mock-user',
    subject_alias: 'Jordan Taylor',
    subject_person_id: null,
    content: 'I believed that Jordan was being manipulative in our friendship. I thought they were only reaching out when they needed something, and I felt used.',
    source: 'intuition',
    source_detail: 'Based on pattern of behavior',
    confidence_level: 0.3,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I distanced myself from Jordan and stopped initiating contact. I felt resentful and started questioning all our past interactions. This affected my ability to trust other friendships too.',
    status: 'disproven',
    retracted: false,
    resolution_note: 'After reflecting, I realized I was projecting my own insecurities. Jordan has always been supportive, and I was misinterpreting their communication style.',
    original_content: 'I believed that Jordan was being manipulative in our friendship. I thought they were only reaching out when they needed something, and I felt used.',
    evolution_notes: [
      '2024-01-10: After reflecting, I realized I was projecting my own insecurities. Jordan has always been supportive, and I was misinterpreting their communication style.'
    ],
    created_in_high_emotion: true,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-4',
    user_id: 'mock-user',
    subject_alias: 'Morgan Lee',
    subject_person_id: null,
    content: 'I saw on Instagram that Morgan was at an event I wasn\'t invited to. I assumed they were intentionally excluding me from their social circle.',
    source: 'social_media',
    source_detail: 'Instagram post',
    confidence_level: 0.2,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I felt hurt and left out. I started overthinking our friendship and wondering if I had done something wrong. I didn\'t reach out to ask about it because I felt embarrassed.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I saw on Instagram that Morgan was at an event I wasn\'t invited to. I assumed they were intentionally excluding me from their social circle.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-5',
    user_id: 'mock-user',
    subject_alias: 'Riley Kim',
    subject_person_id: null,
    content: 'I overheard Riley talking about me in the break room. They were saying something about my work performance, but I only caught fragments of the conversation.',
    source: 'overheard',
    source_detail: 'Break room conversation',
    confidence_level: 0.5,
    sentiment: 'neutral',
    timestamp_heard: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I became self-conscious about my work and started second-guessing myself. I avoided Riley for a few days and felt anxious in their presence.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I overheard Riley talking about me in the break room. They were saying something about my work performance, but I only caught fragments of the conversation.',
    evolution_notes: [],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-6',
    user_id: 'mock-user',
    subject_alias: 'Casey Johnson',
    subject_person_id: null,
    content: 'I believed that Casey was being dishonest about their reasons for canceling our plans. I thought they were making excuses because they didn\'t want to spend time with me.',
    source: 'assumption',
    source_detail: 'Based on pattern of cancellations',
    confidence_level: 0.4,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I stopped making plans with Casey and felt rejected. I started questioning whether they actually valued our friendship. This made me more cautious about making plans with other people too.',
    status: 'retracted',
    retracted: true,
    resolution_note: 'I was wrong - Casey had legitimate family emergencies. I was being overly sensitive and projecting my own fears of rejection.',
    original_content: 'I believed that Casey was being dishonest about their reasons for canceling our plans. I thought they were making excuses because they didn\'t want to spend time with me.',
    evolution_notes: [
      '2024-01-20: I was wrong - Casey had legitimate family emergencies. I was being overly sensitive and projecting my own fears of rejection.'
    ],
    created_in_high_emotion: true,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-7',
    user_id: 'mock-user',
    subject_alias: 'Taylor Brown',
    subject_person_id: null,
    content: 'People said that Taylor was talking behind my back at work, saying I wasn\'t pulling my weight on the team project.',
    source: 'told_by',
    source_detail: 'Colleague mentioned it',
    confidence_level: 0.3,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I became defensive and started overworking to prove myself. I avoided Taylor and felt resentful. This created tension in our working relationship.',
    status: 'unverified',
    retracted: false,
    resolution_note: 'Taylor did express frustration, but it was about project timeline, not my work quality. I misunderstood the context.',
    original_content: 'People said that Taylor was talking behind my back at work, saying I wasn\'t pulling my weight on the team project.',
    evolution_notes: [
      '2024-01-18: Taylor did express frustration, but it was about project timeline, not my work quality. I misunderstood the context.'
    ],
    created_in_high_emotion: false,
    review_reminder_at: null,
    metadata: {},
    created_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'mock-8',
    user_id: 'mock-user',
    subject_alias: 'Sam Williams',
    subject_person_id: null,
    content: 'I thought Sam was avoiding me because I saw them cross the street when they noticed me coming. I assumed they didn\'t want to talk to me.',
    source: 'assumption',
    source_detail: 'Observed behavior',
    confidence_level: 0.2,
    sentiment: 'negative',
    timestamp_heard: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    related_memory_id: null,
    impact_on_me: 'I felt hurt and confused. I started wondering what I might have done wrong. I didn\'t reach out because I assumed they didn\'t want to talk to me.',
    status: 'unverified',
    retracted: false,
    resolution_note: null,
    original_content: 'I thought Sam was avoiding me because I saw them cross the street when they noticed me coming. I assumed they didn\'t want to talk to me.',
    evolution_notes: [],
    created_in_high_emotion: true,
    review_reminder_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: {},
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  }
];

type PerceptionsViewProps = {
  personId?: string;
  personName?: string;
  showCreateButton?: boolean;
};

export const PerceptionsView = ({ personId, personName, showCreateButton = true }: PerceptionsViewProps) => {
  const [perceptions, setPerceptions] = useState<PerceptionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPerceptionForDetail, setSelectedPerceptionForDetail] = useState<PerceptionEntry | null>(null);
  const [showGossipChat, setShowGossipChat] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<PerceptionSource | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PerceptionStatus | 'all' | 'unverified_only'>('unverified_only');
  const [showRetracted, setShowRetracted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    void loadPerceptions();
  }, [personId, sourceFilter, statusFilter, showRetracted]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [sourceFilter, statusFilter, showRetracted, searchQuery]);

  const loadPerceptions = async () => {
    setLoading(true);
    try {
      let data: PerceptionEntry[];
      if (personId) {
        data = await perceptionApi.getPerceptionsAboutPerson(personId);
      } else {
        data = await perceptionApi.getPerceptions({
          retracted: showRetracted ? undefined : false,
          status: statusFilter === 'all' ? undefined : statusFilter === 'unverified_only' ? 'unverified' : statusFilter
        });
      }

      // Use mock data if no real data (for development/demo)
      if (data.length === 0 && !personId) {
        data = mockPerceptions;
      }

      setPerceptions(data);
    } catch (error) {
      console.error('Failed to load perceptions:', error);
      // Fallback to mock data on error
      if (!personId) {
        setPerceptions(mockPerceptions);
      }
    } finally {
      setLoading(false);
    }
  };


  const handleRetract = async (perception: PerceptionEntry) => {
    try {
      await perceptionApi.updatePerception(perception.id, {
        retracted: true,
        status: 'retracted',
        resolution_note: 'Retracted by user'
      });
      void loadPerceptions();
    } catch (error) {
      console.error('Failed to retract perception:', error);
    }
  };

  const handleResolve = async (perception: PerceptionEntry, status: PerceptionStatus, notes?: string) => {
    try {
      await perceptionApi.updatePerception(perception.id, {
        status,
        resolution_note: notes
      });
      void loadPerceptions();
    } catch (error) {
      console.error('Failed to resolve perception:', error);
    }
  };

  // Calculate pagination
  const filteredPerceptions = useMemo(() => {
    let filtered = [...perceptions];

    // Apply search query filter
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.subject_alias.toLowerCase().includes(queryLower) ||
        p.content.toLowerCase().includes(queryLower) ||
        p.impact_on_me.toLowerCase().includes(queryLower) ||
        (p.source_detail && p.source_detail.toLowerCase().includes(queryLower))
      );
    }

    // Filter by source if needed
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(p => p.source === sourceFilter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      if (statusFilter === 'unverified_only') {
        filtered = filtered.filter(p => p.status === 'unverified');
      } else {
        filtered = filtered.filter(p => p.status === statusFilter);
      }
    }

    // Filter out retracted unless explicitly shown
    if (!showRetracted) {
      filtered = filtered.filter(p => !p.retracted);
    }

    return filtered;
  }, [perceptions, searchQuery, sourceFilter, statusFilter, showRetracted]);

  const totalPages = Math.ceil(filteredPerceptions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPerceptions = filteredPerceptions.slice(startIndex, endIndex);

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

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Perceived Lore
            {personName && <span className="text-white/60">about {personName}</span>}
          </h3>
          <p className="text-sm text-white/60 mt-1">
            What you heard, believed, and how it affected you — not objective truth
          </p>
        </div>
        {showCreateButton && (
          <Button 
            onClick={() => setShowGossipChat(true)} 
            leftIcon={<MessageSquare className="h-4 w-4" />}
            className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30"
          >
            Gossip Chat
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <PerceptionSearchBar
          onSelect={(perception) => setSelectedPerceptionForDetail(perception)}
          onSearchChange={(query) => setSearchQuery(query)}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-white/50" />
          <span className="text-sm text-white/70">Source:</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className="bg-black/60 border-border/50 text-white text-sm h-8 rounded px-2"
          >
            <option value="all">All</option>
            <option value="overheard">Overheard</option>
            <option value="told_by">Told By</option>
            <option value="rumor">Rumor</option>
            <option value="social_media">Social Media</option>
            <option value="intuition">Intuition</option>
            <option value="assumption">Assumption</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-white/70">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-black/60 border-border/50 text-white text-sm h-8 rounded px-2"
          >
            <option value="unverified_only">Unverified Only</option>
            <option value="all">All</option>
            <option value="unverified">Unverified</option>
            <option value="confirmed">Confirmed</option>
            <option value="disproven">Disproven</option>
            <option value="retracted">Retracted</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={showRetracted}
            onChange={(e) => setShowRetracted(e.target.checked)}
            className="w-4 h-4 rounded border-border/50 bg-black/60 text-primary focus:ring-primary"
          />
          Show retracted
        </label>
      </div>

      {/* Warning banner */}
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-orange-200/90">
          <p className="font-medium mb-1">This is your perception, not objective truth</p>
          <p className="text-orange-200/70">
            These entries represent what you heard, believed, or assumed — they may be incomplete, biased, or false.
            Track how your beliefs evolved over time.
          </p>
        </div>
      </div>

      {/* Perceptions list - Book/Grid View with Pagination */}
      {loading ? (
        <div className="text-center py-12 text-white/60">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading perceptions...</p>
        </div>
      ) : filteredPerceptions.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No perceptions yet</p>
          <p className="text-sm">
            {personId
              ? `No perceptions recorded about this person yet.`
              : 'Start tracking what you hear, believe, and how it affects you.'}
          </p>
        </div>
      ) : (
        <Card className="bg-black/40 border-border/60 overflow-hidden">
          <CardContent className="p-0">
            {/* Book Page Container */}
            <div className="relative w-full min-h-[600px] bg-gradient-to-br from-orange-50/5 via-orange-100/5 to-orange-50/5 rounded-lg border-2 border-orange-800/30 shadow-2xl overflow-hidden">
              {/* Page Content */}
              <div className="absolute inset-0 p-6 flex flex-col">
                {/* Page Header */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-orange-800/20">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-orange-600/60" />
                    <div>
                      <h3 className="text-sm font-semibold text-orange-900/40 uppercase tracking-wider">
                        Perception Book
                      </h3>
                      <p className="text-xs text-orange-700/50 mt-0.5">
                        {totalPages > 1 && `Page ${currentPage} of ${totalPages}`}
                        {totalPages === 1 && `${filteredPerceptions.length} perception${filteredPerceptions.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-orange-700/40 font-mono">
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                {/* Perceptions Grid */}
                <div className="flex-1 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6 overflow-y-auto">
                  {paginatedPerceptions.map((perception, index) => (
                    <PerceptionEntryCard
                      key={perception.id || `perception-${index}`}
                      perception={perception}
                      showSubject={!personId}
                      onClick={(p) => setSelectedPerceptionForDetail(p)}
                      onRetract={() => handleRetract(perception)}
                      onResolve={(p, status, notes) => handleResolve(p, status, notes)}
                    />
                  ))}
                </div>

                {/* Page Footer with Navigation */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-orange-800/20">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goToPrevious}
                      disabled={currentPage === 1}
                      className="text-orange-700/60 hover:text-orange-600 hover:bg-orange-500/10 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>

                    <div className="flex items-center gap-2">
                      {/* Page indicators */}
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
                            className={`px-2 py-1 text-xs rounded transition ${
                              currentPage === pageNum
                                ? 'bg-orange-600 text-white'
                                : 'bg-orange-700/30 text-orange-700/60 hover:bg-orange-700/50'
                            }`}
                            aria-label={`Go to page ${pageNum}`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={goToNext}
                      disabled={currentPage === totalPages}
                      className="text-orange-700/60 hover:text-orange-600 hover:bg-orange-500/10 disabled:opacity-30"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPerceptionForDetail && (
        <PerceptionDetailModal
          perception={selectedPerceptionForDetail}
          onClose={() => setSelectedPerceptionForDetail(null)}
          onUpdate={(updated) => {
            setSelectedPerceptionForDetail(updated);
            void loadPerceptions();
          }}
        />
      )}

      {showGossipChat && (
        <GossipChatModal
          onClose={() => setShowGossipChat(false)}
          onPerceptionsCreated={() => {
            void loadPerceptions();
          }}
        />
      )}
    </div>
  );
};
