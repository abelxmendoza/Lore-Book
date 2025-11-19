import { useState, useEffect, useRef } from 'react';
import { X, Calendar, MapPin, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, Link2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { LocationTimeline } from './LocationTimeline';
import { ChatComposer } from '../chat/ChatComposer';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { LocationProfile } from './LocationProfileCard';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type LocationDetailModalProps = {
  location: LocationProfile;
  onClose: () => void;
};

type TabKey = 'overview' | 'visits' | 'people' | 'context' | 'timeline' | 'chat' | 'insights' | 'metadata';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'overview', label: 'Overview', icon: FileText },
  { key: 'visits', label: 'Visits', icon: Calendar },
  { key: 'people', label: 'People', icon: Users },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'metadata', label: 'Metadata', icon: Database }
];

export const LocationDetailModal = ({ location, onClose }: LocationDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [eras, setEras] = useState<Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>>([]);
  const [sagas, setSagas] = useState<Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>>([]);
  const [arcs, setArcs] = useState<Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    const loadLocationMemories = async () => {
      if (location.entries.length === 0) return;
      
      setLoadingMemories(true);
      try {
        // Fetch full entry details for each visit
        const entryPromises = location.entries.map(async (entry) => {
          try {
            const fullEntry = await fetchJson<{
              id: string;
              date: string;
              content: string;
              summary?: string | null;
              tags: string[];
              mood?: string | null;
              chapter_id?: string | null;
              source: string;
              metadata?: Record<string, unknown>;
            }>(`/api/entries/${entry.id}`);
            return memoryEntryToCard(fullEntry);
          } catch (error) {
            console.error(`Failed to load entry ${entry.id}:`, error);
            return null;
          }
        });

        const cards = (await Promise.all(entryPromises)).filter((card): card is MemoryCard => card !== null);
        setMemoryCards(cards);

        // Convert memory cards to timeline entries
        const entries: TimelineEntry[] = cards.map(card => ({
          id: card.id,
          timestamp: card.date,
          title: card.content.substring(0, 100) || 'Untitled',
          summary: card.summary || card.content.substring(0, 200),
          full_text: card.content,
          mood: card.mood || null,
          arc: null,
          saga: null,
          era: null,
          lane: 'life', // Default lane, could be enhanced to detect from tags/content
          tags: card.tags || [],
          character_ids: [],
          related_entry_ids: []
        }));
        setTimelineEntries(entries);
      } catch (error) {
        console.error('Failed to load location memories:', error);
      } finally {
        setLoadingMemories(false);
      }
    };
    void loadLocationMemories();
  }, [location.entries]);

  // Load timeline bands (eras, sagas, arcs) when timeline tab is active
  useEffect(() => {
    if (activeTab === 'timeline') {
      const loadTimelineBands = async () => {
        try {
          const [erasRes, sagasRes, arcsRes] = await Promise.allSettled([
            fetchJson<{ eras: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string }> }>('/api/timeline/eras'),
            fetchJson<{ sagas: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string }> }>('/api/timeline/sagas'),
            fetchJson<{ arcs: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string }> }>('/api/timeline/arcs')
          ]);

          if (erasRes.status === 'fulfilled') {
            setEras(erasRes.value.eras || []);
          }
          if (sagasRes.status === 'fulfilled') {
            setSagas(sagasRes.value.sagas || []);
          }
          if (arcsRes.status === 'fulfilled') {
            setArcs(arcsRes.value.arcs || []);
          }
        } catch (error) {
          console.error('Failed to load timeline bands:', error);
        }
      };
      void loadTimelineBands();
    }
  }, [activeTab]);

  // Load insights when Insights tab is active
  useEffect(() => {
    if (activeTab === 'insights' && !insights && !loadingInsights) {
      setLoadingInsights(true);
      setTimeout(() => {
        setInsights({
          totalVisits: location.visitCount,
          uniquePeople: location.relatedPeople.length,
          topTags: location.tagCounts.slice(0, 5),
          topMoods: location.moods.slice(0, 3),
          chapters: location.chapters.length,
          visitFrequency: location.firstVisited && location.lastVisited ? {
            daysBetween: Math.round((new Date(location.lastVisited).getTime() - new Date(location.firstVisited).getTime()) / (1000 * 60 * 60 * 24)),
            avgDaysBetween: location.visitCount > 1 ? Math.round((new Date(location.lastVisited).getTime() - new Date(location.firstVisited).getTime()) / (1000 * 60 * 60 * 24) / (location.visitCount - 1)) : 0
          } : null
        });
        setLoadingInsights(false);
      }, 500);
    }
  }, [activeTab, insights, loadingInsights, location]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [onClose]);

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const locationContext = `You are helping the user with a specific location. Here's the context:

Location: ${location.name}
Coordinates: ${location.coordinates ? `${location.coordinates.lat}, ${location.coordinates.lng}` : 'Not available'}
Total Visits: ${location.visitCount}
First Visited: ${location.firstVisited || 'Unknown'}
Last Visited: ${location.lastVisited || 'Unknown'}
People Who Visited: ${location.relatedPeople.map(p => p.name).join(', ')}
Top Tags: ${location.tagCounts.map(t => t.tag).join(', ')}
Chapters: ${location.chapters.map(c => c.title).join(', ')}`;

      const conversationHistory = [
        { role: 'assistant' as const, content: locationContext },
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `[Location Context: ${location.name}] ${message}`,
          conversationHistory
        })
      });

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: response.answer || 'I understand. How can I help you with this location?', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, assistantMessage]);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-black border border-border/60 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <MapPin className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-2xl font-semibold">{location.name}</h2>
              {location.coordinates && (
                <p className="text-sm text-white/60 mt-1">
                  {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
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

        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="text-sm text-white/60">Total Visits</span>
                      </div>
                      <p className="text-2xl font-semibold text-white">{location.visitCount}</p>
                    </CardContent>
                  </Card>
                  
                  {location.firstVisited && (
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-green-400" />
                          <span className="text-sm text-white/60">First Visit</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {new Date(location.firstVisited).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  
                  {location.lastVisited && (
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-blue-400" />
                          <span className="text-sm text-white/60">Last Visit</span>
                        </div>
                        <p className="text-sm font-semibold text-white">
                          {new Date(location.lastVisited).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-sm text-white/60">People</span>
                      </div>
                      <p className="text-2xl font-semibold text-white">{location.relatedPeople.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Tags */}
                {location.tagCounts.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      Top Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {location.tagCounts.map((tagCount) => (
                        <Badge
                          key={tagCount.tag}
                          variant="outline"
                          className="px-3 py-1 text-sm bg-primary/10 text-primary border-primary/20"
                        >
                          {tagCount.tag} ({tagCount.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chapters */}
                {location.chapters.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Chapters
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {location.chapters.map((chapter) => (
                        <Badge
                          key={chapter.id}
                          variant="outline"
                          className="px-3 py-1 text-sm bg-purple-500/10 text-purple-300 border-purple-500/20"
                        >
                          {chapter.title || 'Untitled'} ({chapter.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Moods */}
                {location.moods.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Moods
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {location.moods.map((mood) => (
                        <Badge
                          key={mood.mood}
                          variant="outline"
                          className="px-3 py-1 text-sm bg-yellow-500/10 text-yellow-300 border-yellow-500/20"
                        >
                          {mood.mood} ({mood.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'visits' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Visit History ({location.entries.length})
                </h3>
                {location.entries.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No visits recorded</p>
                    <p className="text-sm">Visits will appear here as you mention this location in your journal entries</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {location.entries.map((entry) => (
                      <Card key={entry.id} className="bg-black/40 border-border/50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-4 w-4 text-white/50" />
                                <span className="text-sm text-white/70">
                                  {new Date(entry.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                {entry.mood && (
                                  <Badge variant="outline" className="text-xs">
                                    {entry.mood}
                                  </Badge>
                                )}
                              </div>
                              {entry.summary && (
                                <p className="text-sm text-white/80 mb-2">{entry.summary}</p>
                              )}
                              {entry.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {entry.tags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'people' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  People Who Visited ({location.relatedPeople.length})
                </h3>
                {location.relatedPeople.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No people recorded</p>
                    <p className="text-sm">People will appear here as you mention them in entries about this location</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {location.relatedPeople.map((person) => (
                      <Card key={person.id} className="bg-black/40 border-border/50">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-base font-semibold text-white">{person.name}</h4>
                              <p className="text-sm text-white/60 mt-1">
                                {person.entryCount} {person.entryCount === 1 ? 'visit' : 'visits'}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/20">
                              {person.total_mentions} total mentions
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'context' && (
              <div className="space-y-6">
                {/* Location Details */}
                {location.coordinates && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      Location Details
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/60">Latitude:</span>
                            <span className="text-white">{location.coordinates.lat.toFixed(6)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">Longitude:</span>
                            <span className="text-white">{location.coordinates.lng.toFixed(6)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Visit Timeline */}
                {location.firstVisited && location.lastVisited && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Visit Timeline
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">First Visit:</span>
                            <span className="text-white">{new Date(location.firstVisited).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">Last Visit:</span>
                            <span className="text-white">{new Date(location.lastVisited).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-white/60">Time Span:</span>
                            <span className="text-white">
                              {Math.round((new Date(location.lastVisited).getTime() - new Date(location.firstVisited).getTime()) / (1000 * 60 * 60 * 24))} days
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Sources */}
                {location.sources.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      Sources
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {location.sources.map((source) => (
                        <Badge key={source} variant="outline" className="px-3 py-1 text-sm">
                          {source}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Timeline View</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Visual timeline of visits to {location.name}
                  </p>
                </div>
                {loadingMemories ? (
                  <div className="flex items-center justify-center h-[500px]">
                    <div className="text-center text-white/60">
                      <Clock className="h-12 w-12 mx-auto mb-3 animate-pulse opacity-50" />
                      <p>Loading timeline...</p>
                    </div>
                  </div>
                ) : (
                  <LocationTimeline
                    entries={timelineEntries}
                    locationName={location.name}
                    eras={eras}
                    sagas={sagas}
                    arcs={arcs}
                    onMemoryClick={(entry) => {
                      const clickedMemory = memoryCards.find(m => m.id === entry.id);
                      if (clickedMemory) {
                        setSelectedMemory(clickedMemory);
                      }
                    }}
                    compact={true}
                  />
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Chat about this Location</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Ask questions or add information about {location.name} through conversation.
                  </p>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Start a conversation about this location</p>
                      <p className="text-xs mt-2">Try: "Tell me more about this place" or "What memories are associated here?"</p>
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

            {activeTab === 'insights' && (
              <div className="space-y-6">
                {loadingInsights ? (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 animate-pulse opacity-50" />
                    <p>Analyzing location...</p>
                  </div>
                ) : insights ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Visit Patterns
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Total Visits</div>
                            <div className="text-2xl font-bold text-white">{insights.totalVisits}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Unique People</div>
                            <div className="text-2xl font-bold text-white">{insights.uniquePeople}</div>
                          </CardContent>
                        </Card>
                        {insights.visitFrequency && (
                          <>
                            <Card className="bg-black/40 border-border/50">
                              <CardContent className="p-4">
                                <div className="text-sm text-white/60 mb-1">Days Between First & Last</div>
                                <div className="text-2xl font-bold text-white">{insights.visitFrequency.daysBetween}</div>
                              </CardContent>
                            </Card>
                            <Card className="bg-black/40 border-border/50">
                              <CardContent className="p-4">
                                <div className="text-sm text-white/60 mb-1">Avg Days Between Visits</div>
                                <div className="text-2xl font-bold text-white">{insights.visitFrequency.avgDaysBetween}</div>
                              </CardContent>
                            </Card>
                          </>
                        )}
                      </div>
                    </div>
                    {insights.topTags && insights.topTags.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          <Tag className="h-5 w-5 text-primary" />
                          Top Tags
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {insights.topTags.map((tagCount: { tag: string; count: number }) => (
                            <Badge key={tagCount.tag} variant="outline" className="px-3 py-1 text-sm">
                              {tagCount.tag} ({tagCount.count})
                            </Badge>
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

            {activeTab === 'metadata' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Location Details</h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/60">Name:</span>
                          <span className="text-white">{location.name}</span>
                        </div>
                        {location.coordinates && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-white/60">Latitude:</span>
                              <span className="text-white">{location.coordinates.lat}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-white/60">Longitude:</span>
                              <span className="text-white">{location.coordinates.lng}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-white/60">Visit Count:</span>
                          <span className="text-white">{location.visitCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Related People:</span>
                          <span className="text-white">{location.relatedPeople.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Chapters:</span>
                          <span className="text-white">{location.chapters.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Sources:</span>
                          <span className="text-white">{location.sources.length}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {location.firstVisited && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Timestamps</h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/60">First Visited:</span>
                            <span className="text-white">{location.firstVisited}</span>
                          </div>
                          {location.lastVisited && (
                            <div className="flex justify-between">
                              <span className="text-white/60">Last Visited:</span>
                              <span className="text-white">{location.lastVisited}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Timeline & Memories
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      Stories and moments at {location.name}
                    </p>
                  </div>
                  {location.entries.length > 0 && (
                    <span className="text-sm text-white/50">
                      {location.entries.length} {location.entries.length === 1 ? 'memory' : 'memories'}
                    </span>
                  )}
                </div>

                {/* Timeline */}
                {memoryCards.length > 0 && (
                  <div className="border-b border-border/60 pb-6">
                    <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Timeline
                    </h4>
                    <div className="overflow-x-auto overflow-y-hidden">
                      <ColorCodedTimeline
                        entries={memoryCards.map(memory => ({
                          id: memory.id,
                          content: memory.content,
                          date: memory.date,
                          chapter_id: memory.chapterId || null
                        }))}
                        showLabel={true}
                        onItemClick={(item) => {
                          const clickedMemory = memoryCards.find(m => m.id === item.id);
                          if (clickedMemory) {
                            setSelectedMemory(clickedMemory);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Memory Cards */}
                {loadingMemories ? (
                  <div className="text-center py-12 text-white/60">
                    <p>Loading memories...</p>
                  </div>
                ) : memoryCards.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Memory Cards
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memoryCards.map((memory) => (
                        <div key={memory.id} data-memory-id={memory.id}>
                          <MemoryCardComponent
                            memory={memory}
                            showLinked={true}
                            expanded={expandedCardId === memory.id}
                            onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : location.entries.length > 0 ? (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">Loading memory details...</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No memories yet</p>
                    <p className="text-sm">Memories will appear here as you visit {location.name}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = memoryCards.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={memoryCards}
        />
      )}
    </div>
  );
};
