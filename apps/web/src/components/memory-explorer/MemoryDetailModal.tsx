import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Tag, Users, Sparkles, MapPin, ChevronLeft, ChevronRight, FileText, Network, MessageSquare, Brain, Clock, Layers, Link2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatComposer } from '../chat/ChatComposer';
import { MemoryComponents } from './MemoryComponents';
import { KnowledgeGraphViewer } from '../graph/KnowledgeGraphViewer';
import { ReactionList } from '../reactions/ReactionList';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard, type LinkedMemory } from '../../types/memory';

type MemoryDetailModalProps = {
  memory: MemoryCard;
  onClose: () => void;
  onNavigate?: (memoryId: string) => void;
  allMemories?: MemoryCard[]; // For navigation between memories
};

type TabKey = 'overview' | 'chat' | 'context' | 'connections' | 'linked' | 'insights' | 'timeline';

const moodColors: Record<string, string> = {
  happy: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sad: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  angry: 'bg-red-500/20 text-red-300 border-red-500/30',
  anxious: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  calm: 'bg-green-500/20 text-green-300 border-green-500/30',
  excited: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'overview', label: 'Overview', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'connections', label: 'Connections', icon: Network },
  { key: 'linked', label: 'Linked Memories', icon: Link2 },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'timeline', label: 'Timeline', icon: Clock }
];

type MemoryComponent = {
  id: string;
  component_type: string;
  text: string;
  characters_involved: string[];
  location?: string | null;
  timestamp?: string | null;
  tags: string[];
  importance_score: number;
};

export const MemoryDetailModal = ({ memory, onClose, onNavigate, allMemories = [] }: MemoryDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [linkedMemories, setLinkedMemories] = useState<LinkedMemory[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [entryMetadata, setEntryMetadata] = useState<Record<string, unknown> | null>(null);
  const [temporalMemories, setTemporalMemories] = useState<MemoryCard[]>([]);
  const [chapterMemories, setChapterMemories] = useState<MemoryCard[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [linkedSearchTerm, setLinkedSearchTerm] = useState('');
  const [expandedLinkedId, setExpandedLinkedId] = useState<string | null>(null);
  const [similarMemories, setSimilarMemories] = useState<MemoryCard[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [characterTimeline, setCharacterTimeline] = useState<Array<{ character: string; date: string; memoryId: string }>>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // Find previous and next memories for navigation
  const currentIndex = allMemories.findIndex(m => m.id === memory.id);
  const prevMemory = currentIndex > 0 ? allMemories[currentIndex - 1] : null;
  const nextMemory = currentIndex < allMemories.length - 1 ? allMemories[currentIndex + 1] : null;

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    // Load full content and linked memories
    const loadMemoryDetails = async () => {
      setLoadingFull(true);
      setLoadingLinked(true);

      try {
        // Load full entry details
        const entry = await fetchJson<{
          id: string;
          date: string;
          content: string;
          summary?: string | null;
          tags: string[];
          mood?: string | null;
          chapter_id?: string | null;
          source: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        }>(`/api/entries/${memory.id}`);
        setFullContent(entry.content);
        setEntryMetadata(entry.metadata || {});

        // Load linked memories
        const linkedResponse = await fetchJson<{ entries: Array<{
          id: string;
          date: string;
          content: string;
          summary?: string | null;
          tags: string[];
          mood?: string | null;
          chapter_id?: string | null;
          source: string;
        }> }>(`/api/entries/${memory.id}/linked`);

        const linked = linkedResponse.entries.map((entry) => {
          const entryDate = new Date(entry.date);
          const memoryDate = new Date(memory.date);
          const daysDiff = Math.round((entryDate.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));

          let linkType: LinkedMemory['linkType'] = 'temporal';
          let linkLabel = '';

          if (daysDiff === 0) {
            linkLabel = 'Same day';
          } else if (daysDiff > 0) {
            linkLabel = `${daysDiff} day${daysDiff > 1 ? 's' : ''} after`;
          } else {
            linkLabel = `${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} before`;
          }

          if (entry.chapter_id === memory.chapterId) {
            linkType = 'arc';
            linkLabel = 'Same chapter';
          } else if (entry.tags.some(tag => memory.tags.includes(tag))) {
            linkType = 'tag';
            const sharedTag = entry.tags.find(tag => memory.tags.includes(tag));
            linkLabel = `Tagged: ${sharedTag}`;
          } else if (entry.source === memory.source) {
            linkType = 'source';
            linkLabel = `From: ${memory.source}`;
          }

          return {
            id: entry.id,
            title: entry.summary || entry.content.substring(0, 50) + '...',
            date: entry.date,
            linkType,
            linkLabel,
            daysDiff
          };
        });

        setLinkedMemories(linked);

        // Load temporal context (memories ±5 days)
        const memoryDate = new Date(memory.date);
        const dateFrom = new Date(memoryDate);
        dateFrom.setDate(dateFrom.getDate() - 5);
        const dateTo = new Date(memoryDate);
        dateTo.setDate(dateTo.getDate() + 5);

        try {
          const temporalResponse = await fetchJson<{ entries: Array<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }> }>(`/api/entries/recent?dateFrom=${dateFrom.toISOString()}&dateTo=${dateTo.toISOString()}&limit=20`);
          const temporalCards = temporalResponse.entries
            .filter(e => e.id !== memory.id)
            .map(memoryEntryToCard)
            .slice(0, 10);
          setTemporalMemories(temporalCards);
        } catch (error) {
          console.error('Failed to load temporal memories:', error);
        }

        // Load chapter context
        if (memory.chapterId) {
          try {
            const chapterResponse = await fetchJson<{ entries: Array<{
              id: string;
              date: string;
              content: string;
              summary?: string | null;
              tags: string[];
              mood?: string | null;
              chapter_id?: string | null;
              source: string;
            }> }>(`/api/entries/recent?limit=50`);
            const chapterCards = chapterResponse.entries
              .filter(e => e.chapter_id === memory.chapterId && e.id !== memory.id)
              .map(memoryEntryToCard)
              .slice(0, 10);
            setChapterMemories(chapterCards);
          } catch (error) {
            console.error('Failed to load chapter memories:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load memory details:', error);
        setFullContent(memory.content);
      } finally {
        setLoadingFull(false);
        setLoadingLinked(false);
      }
    };

    void loadMemoryDetails();
  }, [memory.id, memory.chapterId, memory.tags, memory.source, memory.date]);

  // Load insights when Insights tab is active
  useEffect(() => {
    if (activeTab === 'insights' && !insights && !loadingInsights) {
      setLoadingInsights(true);
      // TODO: Fetch insights from API when available
      // For now, generate basic insights
      setTimeout(() => {
        setInsights({
          themes: memory.tags.slice(0, 5),
          sentiment: memory.mood || 'neutral',
          wordCount: (fullContent || memory.content).split(/\s+/).length,
          readingTime: Math.ceil((fullContent || memory.content).split(/\s+/).length / 200)
        });
        setLoadingInsights(false);
      }, 500);
    }
  }, [activeTab, insights, loadingInsights, memory.tags, memory.mood, memory.content, fullContent]);

  // Load similar memories when Insights tab is active
  useEffect(() => {
    if (activeTab === 'insights' && similarMemories.length === 0 && !loadingSimilar) {
      setLoadingSimilar(true);
      // Find similar memories by tags
      const similar = allMemories
        .filter(m => m.id !== memory.id && m.tags.some(tag => memory.tags.includes(tag)))
        .slice(0, 5);
      setSimilarMemories(similar);
      setLoadingSimilar(false);
    }
  }, [activeTab, similarMemories.length, loadingSimilar, allMemories, memory.id, memory.tags]);

  // Load character timeline when Connections tab is active
  useEffect(() => {
    if (activeTab === 'connections' && characterTimeline.length === 0 && memory.characters.length > 0) {
      // Build character timeline from all memories
      const timeline: Array<{ character: string; date: string; memoryId: string }> = [];
      allMemories.forEach(m => {
        m.characters.forEach(char => {
          if (memory.characters.includes(char)) {
            timeline.push({ character: char, date: m.date, memoryId: m.id });
          }
        });
      });
      // Sort by date
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setCharacterTimeline(timeline);
    }
  }, [activeTab, characterTimeline.length, allMemories, memory.characters]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && prevMemory && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onNavigate?.(prevMemory.id);
      } else if (e.key === 'ArrowRight' && nextMemory && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onNavigate?.(nextMemory.id);
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex].key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevMemory, nextMemory, onClose, onNavigate]);

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Build context about the memory
      const memoryContext = `You are helping the user with a specific memory entry. Here's the context:

Memory ID: ${memory.id}
Date: ${memory.date}
Title: ${memory.title}
Content: ${fullContent || memory.content}
Tags: ${memory.tags.join(', ')}
Mood: ${memory.mood || 'none'}
Characters: ${memory.characters.join(', ')}

The user can ask questions about this memory, request to add details, update tags, change mood, or modify metadata. When they request updates, respond with a JSON object in this format: {"updates": {"tags": [...], "mood": "...", "summary": "...", "metadata": {...}}}`;

      // Build conversation history with context
      const conversationHistory = [
        { role: 'assistant' as const, content: memoryContext },
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      // Call chat API with memory context
      const response = await fetchJson<{ answer: string; metadata?: any }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `[Memory Context: ${memory.title}] ${message}`,
          conversationHistory
        })
      });

      let assistantContent = response.answer || 'I understand. How can I help you with this memory?';
      
      // Try to parse updates from response if it contains JSON
      let updates = null;
      try {
        const jsonMatch = assistantContent.match(/\{[\s\S]*"updates"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          updates = parsed.updates;
          // Remove JSON from response text
          assistantContent = assistantContent.replace(jsonMatch[0], '').trim();
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: assistantContent, 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      // If updates are provided, apply them
      if (updates) {
        try {
          await fetchJson(`/api/entries/${memory.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
          });
          // Show success message
          const successMessage = { 
            role: 'assistant' as const, 
            content: '✓ Memory updated successfully!', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, successMessage]);
          // Refresh page to show updates
          setTimeout(() => window.location.reload(), 1000);
        } catch (updateError) {
          console.error('Update error:', updateError);
          const errorMsg = { 
            role: 'assistant' as const, 
            content: 'Failed to update memory. Please try again.', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, errorMsg]);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = { 
        role: 'assistant' as const, 
        content: 'Sorry, I encountered an error. Please try again.', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const moodColor = memory.mood ? moodColors[memory.mood.toLowerCase()] || 'bg-gray-500/20 text-gray-300 border-gray-500/30' : undefined;
  const wordCount = (fullContent || memory.content).split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  // Group linked memories by type
  const linkedByType = linkedMemories.reduce((acc, linked) => {
    if (!acc[linked.linkType]) {
      acc[linked.linkType] = [];
    }
    acc[linked.linkType].push(linked);
    return acc;
  }, {} as Record<string, LinkedMemory[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-border/60 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {prevMemory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate?.(prevMemory.id)}
                className="flex-shrink-0"
                aria-label="Previous memory"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{memory.sourceIcon}</span>
                {memory.mood && (
                  <Badge className={`text-xs ${moodColor}`} variant="outline">
                    {memory.mood}
                  </Badge>
                )}
              </div>
              <h2 className="text-2xl font-semibold text-white truncate">{memory.title}</h2>
              <p className="text-sm text-white/60 mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                {formatDate(memory.date)}
              </p>
            </div>
            {nextMemory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate?.(nextMemory.id)}
                className="flex-shrink-0"
                aria-label="Next memory"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/60 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-b-2 border-primary text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="text-sm text-white/60 mb-1">Word Count</div>
                      <div className="text-2xl font-bold text-white">{wordCount}</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="text-sm text-white/60 mb-1">Reading Time</div>
                      <div className="text-2xl font-bold text-white">{readingTime} min</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="text-sm text-white/60 mb-1">Linked</div>
                      <div className="text-2xl font-bold text-white">{linkedMemories.length}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Full Content */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Content</h3>
                  {loadingFull ? (
                    <div className="text-white/60">Loading full content...</div>
                  ) : (
                    <div className="prose prose-invert max-w-none">
                      <p className="text-white/90 whitespace-pre-wrap leading-relaxed">
                        {fullContent || memory.content}
                      </p>
                    </div>
                  )}
                </div>

                {/* Reactions */}
                <div className="pt-4 border-t border-border/50">
                  <ReactionList
                    triggerType="memory"
                    triggerId={memory.id}
                    onReactionChange={() => {
                      // Could reload memory if needed
                    }}
                  />
                </div>

                {/* Memory Components */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Memory Components
                  </h3>
                  <MemoryComponents entryId={memory.id} />
                </div>

                {/* Tags */}
                {memory.tags.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {memory.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-sm border-primary/30 text-primary/70 px-3 py-1"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline Hierarchy */}
                {(memory.eraTitle || memory.sagaTitle || memory.arcTitle || memory.chapterTitle) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Timeline Hierarchy
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {memory.eraTitle && (
                        <Badge variant="outline" className="border-blue-500/50 text-blue-300 px-3 py-1">
                          Era: {memory.eraTitle}
                        </Badge>
                      )}
                      {memory.sagaTitle && (
                        <Badge variant="outline" className="border-green-500/50 text-green-300 px-3 py-1">
                          Saga: {memory.sagaTitle}
                        </Badge>
                      )}
                      {memory.arcTitle && (
                        <Badge variant="outline" className="border-purple-500/50 text-purple-300 px-3 py-1">
                          Arc: {memory.arcTitle}
                        </Badge>
                      )}
                      {memory.chapterTitle && (
                        <Badge variant="outline" className="border-yellow-500/50 text-yellow-300 px-3 py-1">
                          Chapter: {memory.chapterTitle}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Characters */}
                {memory.characters.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Characters
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {memory.characters.map((character) => (
                        <Badge
                          key={character}
                          variant="outline"
                          className="border-blue-500/30 text-blue-300 px-3 py-1"
                        >
                          {character}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked Memories Summary */}
                {linkedMemories.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Linked Memories ({linkedMemories.length})
                    </h3>
                    <p className="text-white/60 text-sm">
                      {linkedMemories.length} memory{linkedMemories.length !== 1 ? 'ies' : 'y'} linked to this entry. 
                      See the "Linked Memories" tab for details.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Context Tab */}
            {activeTab === 'context' && (
              <div className="space-y-6">
                {/* Timeline Hierarchy Details */}
                {(memory.eraTitle || memory.sagaTitle || memory.arcTitle || memory.chapterTitle) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Layers className="h-5 w-5 text-primary" />
                      Timeline Hierarchy
                    </h3>
                    <div className="space-y-3">
                      {memory.eraTitle && (
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="border-blue-500/50 text-blue-300">
                                Era
                              </Badge>
                              <span className="text-white font-semibold">{memory.eraTitle}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {memory.sagaTitle && (
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="border-green-500/50 text-green-300">
                                Saga
                              </Badge>
                              <span className="text-white font-semibold">{memory.sagaTitle}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {memory.arcTitle && (
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="border-purple-500/50 text-purple-300">
                                Arc
                              </Badge>
                              <span className="text-white font-semibold">{memory.arcTitle}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {memory.chapterTitle && (
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="border-yellow-500/50 text-yellow-300">
                                Chapter
                              </Badge>
                              <span className="text-white font-semibold">{memory.chapterTitle}</span>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                )}

                {/* Temporal Context */}
                {temporalMemories.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Temporal Context (±5 days)
                    </h3>
                    <div className="space-y-2">
                      {temporalMemories.map((tempMemory) => (
                        <Card
                          key={tempMemory.id}
                          className="bg-black/40 border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                          onClick={() => onNavigate?.(tempMemory.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white mb-1 truncate">
                                  {tempMemory.title}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-white/60">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(tempMemory.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chapter Context */}
                {chapterMemories.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Layers className="h-5 w-5 text-primary" />
                      Same Chapter ({memory.chapterTitle || 'Unknown'})
                    </h3>
                    <div className="space-y-2">
                      {chapterMemories.map((chapterMemory) => (
                        <Card
                          key={chapterMemory.id}
                          className="bg-black/40 border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                          onClick={() => onNavigate?.(chapterMemory.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-white mb-1 truncate">
                                  {chapterMemory.title}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-white/60">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(chapterMemory.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location Context */}
                {entryMetadata && (entryMetadata.location || entryMetadata.coordinates) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      Location Context
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        {entryMetadata.location && (
                          <div className="mb-2">
                            <span className="text-sm text-white/60">Location: </span>
                            <span className="text-white">{String(entryMetadata.location)}</span>
                          </div>
                        )}
                        {entryMetadata.coordinates && (
                          <div>
                            <span className="text-sm text-white/60">Coordinates: </span>
                            <span className="text-white font-mono text-xs">
                              {typeof entryMetadata.coordinates === 'object' 
                                ? `${(entryMetadata.coordinates as any).lat}, ${(entryMetadata.coordinates as any).lng}`
                                : String(entryMetadata.coordinates)}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {/* Connections Tab */}
            {activeTab === 'connections' && (
              <div className="space-y-6">
                {/* Knowledge Graph */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Network className="h-5 w-5 text-primary" />
                    Knowledge Graph
                  </h3>
                  <KnowledgeGraphViewer componentId={memory.id} />
                </div>

                {/* Characters */}
                {memory.characters.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Characters Mentioned ({memory.characters.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {memory.characters.map((character) => (
                        <Card key={character} className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                <Users className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1">
                                <h4 className="text-base font-semibold text-white">{character}</h4>
                                <p className="text-xs text-white/60">Mentioned in this memory</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No characters mentioned in this memory</p>
                  </div>
                )}

                {/* Character Interaction Timeline */}
                {characterTimeline.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Character Interaction Timeline
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {characterTimeline.map((item, idx) => (
                        <Card
                          key={`${item.character}-${item.memoryId}-${idx}`}
                          className="bg-black/40 border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                          onClick={() => onNavigate?.(item.memoryId)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-white">{item.character}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-white/60">
                                <Calendar className="h-3 w-3" />
                                {new Date(item.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Linked Memories Tab */}
            {activeTab === 'linked' && (
              <div className="space-y-6">
                {loadingLinked ? (
                  <div className="text-white/60">Loading linked memories...</div>
                ) : linkedMemories.length > 0 ? (
                  <>
                    {/* Search/Filter */}
                    <div>
                      <input
                        type="text"
                        placeholder="Search linked memories..."
                        value={linkedSearchTerm}
                        onChange={(e) => setLinkedSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 bg-black/40 border border-border/50 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-primary/50"
                      />
                    </div>

                    {Object.entries(linkedByType).map(([type, memories]) => {
                      const filtered = memories.filter(m => 
                        !linkedSearchTerm || 
                        m.title.toLowerCase().includes(linkedSearchTerm.toLowerCase()) ||
                        m.linkLabel.toLowerCase().includes(linkedSearchTerm.toLowerCase())
                      );
                      
                      if (filtered.length === 0) return null;

                      return (
                        <div key={type}>
                          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-primary" />
                            {type.charAt(0).toUpperCase() + type.slice(1)} Linked ({filtered.length})
                          </h3>
                          <div className="space-y-3">
                            {filtered.map((linked) => {
                              const isExpanded = expandedLinkedId === linked.id;
                              const linkedMemory = allMemories.find(m => m.id === linked.id);
                              
                              return (
                                <Card
                                  key={linked.id}
                                  className="bg-black/40 border-border/50 hover:border-primary/50 transition-colors"
                                >
                                  <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <h4 
                                          className="text-base font-semibold text-white mb-1 truncate cursor-pointer"
                                          onClick={() => onNavigate?.(linked.id)}
                                        >
                                          {linked.title}
                                        </h4>
                                        <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
                                          <Calendar className="h-3 w-3" />
                                          {new Date(linked.date).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                          })}
                                        </div>
                                        {isExpanded && linkedMemory && (
                                          <div className="mt-3 pt-3 border-t border-border/30">
                                            <p className="text-sm text-white/80 mb-2 line-clamp-3">
                                              {linkedMemory.content}
                                            </p>
                                            {linkedMemory.tags.length > 0 && (
                                              <div className="flex flex-wrap gap-1 mt-2">
                                                {linkedMemory.tags.map(tag => (
                                                  <Badge key={tag} variant="outline" className="text-xs">
                                                    {tag}
                                                  </Badge>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end gap-2">
                                        <Badge variant="outline" className="border-primary/30 text-primary/70 flex-shrink-0">
                                          {linked.linkLabel}
                                        </Badge>
                                        {linkedMemory && (
                                          <button
                                            onClick={() => setExpandedLinkedId(isExpanded ? null : linked.id)}
                                            className="text-xs text-primary/70 hover:text-primary transition-colors"
                                          >
                                            {isExpanded ? 'Show less' : 'Show more'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Link2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No linked memories found.</p>
                  </div>
                )}
              </div>
            )}

            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Chat about this Memory</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Ask questions, add details, or update information about this memory through conversation.
                  </p>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Start a conversation about this memory</p>
                      <p className="text-xs mt-2">Try: "Add more details about..." or "What tags should this have?"</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-primary/20 text-white'
                              : 'bg-black/40 border border-border/50 text-white'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className="text-xs text-white/40 mt-1">
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border/60 pt-4">
                  <ChatComposer
                    input={chatInput}
                    onInputChange={setChatInput}
                    onSubmit={handleChatSubmit}
                    loading={chatLoading}
                  />
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {activeTab === 'insights' && (
              <div className="space-y-6">
                {loadingInsights ? (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 animate-pulse opacity-50" />
                    <p>Analyzing memory...</p>
                  </div>
                ) : insights ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Key Themes
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {insights.themes?.map((theme: string) => (
                          <Badge key={theme} variant="outline" className="border-primary/30 text-primary/70 px-3 py-1">
                            {theme}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="bg-black/40 border-border/50">
                        <CardContent className="p-4">
                          <div className="text-sm text-white/60 mb-1">Sentiment</div>
                          <div className="text-xl font-bold text-white capitalize">{insights.sentiment}</div>
                          {/* Sentiment visualization */}
                          <div className="mt-2 h-2 bg-black/60 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${
                                insights.sentiment === 'happy' ? 'bg-yellow-500' :
                                insights.sentiment === 'sad' ? 'bg-blue-500' :
                                insights.sentiment === 'angry' ? 'bg-red-500' :
                                insights.sentiment === 'anxious' ? 'bg-purple-500' :
                                insights.sentiment === 'calm' ? 'bg-green-500' :
                                insights.sentiment === 'excited' ? 'bg-orange-500' :
                                'bg-gray-500'
                              }`}
                              style={{ width: '60%' }}
                            />
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="bg-black/40 border-border/50">
                        <CardContent className="p-4">
                          <div className="text-sm text-white/60 mb-1">Reading Time</div>
                          <div className="text-xl font-bold text-white">{insights.readingTime} min</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Similar Memories */}
                    {similarMemories.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          Similar Memories ({similarMemories.length})
                        </h3>
                        <div className="space-y-2">
                          {similarMemories.map((similar) => (
                            <Card
                              key={similar.id}
                              className="bg-black/40 border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                              onClick={() => onNavigate?.(similar.id)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-white mb-1 truncate">
                                      {similar.title}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-white/60">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(similar.date).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {similar.tags.filter(tag => memory.tags.includes(tag)).slice(0, 3).map(tag => (
                                        <Badge key={tag} variant="outline" className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No insights available</p>
                  </div>
                )}
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Timeline View</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Visual timeline centered on this memory with related entries
                  </p>
                </div>
                <div className="border border-border/50 rounded-lg p-4 bg-black/20">
                  <ColorCodedTimeline
                    entries={[
                      ...temporalMemories.map(m => ({
                        id: m.id,
                        content: m.content,
                        date: m.date,
                        chapter_id: m.chapterId || null
                      })),
                      {
                        id: memory.id,
                        content: memory.content,
                        date: memory.date,
                        chapter_id: memory.chapterId || null
                      }
                    ]}
                    showLabel={true}
                    onItemClick={(item) => {
                      if (item.id !== memory.id) {
                        onNavigate?.(item.id);
                      }
                    }}
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
