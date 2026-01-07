import { useState, useEffect, useRef } from 'react';
import { X, Calendar, MapPin, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, Link2, TrendingUp, TrendingDown, Minus, Star, Award } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { LocationTimeline } from './LocationTimeline';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage, type Message } from '../../features/chat/message/ChatMessage';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { LocationProfile } from './LocationProfileCard';
import type { TimelineEntry } from '../../hooks/useTimelineData';
import { useMockData } from '../../contexts/MockDataContext';

type LocationDetailModalProps = {
  location: LocationProfile;
  onClose: () => void;
};

type TabKey = 'overview' | 'chat' | 'visits' | 'people' | 'context' | 'timeline' | 'insights' | 'metadata';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'overview', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'visits', label: 'History', icon: Calendar },
  { key: 'people', label: 'People', icon: Users },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'metadata', label: 'Metadata', icon: Database }
];

export const LocationDetailModal = ({ location, onClose }: LocationDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
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
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    const loadLocationMemories = async () => {
      setLoadingMemories(true);
      try {
        if (location.entries.length > 0) {
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
        } else {
          // Generate mock memories if no entries from API and toggle is enabled
          if (!isMockDataEnabled) {
            setMemoryCards([]);
            setTimelineEntries([]);
            setLoadingMemories(false);
            return;
          }
          
          const mockMemories: MemoryCard[] = [
            {
              id: `mock-mem-${location.id}-1`,
              title: `First visit to ${location.name}`,
              content: `Visited ${location.name} for the first time today. It was a memorable experience and I'm looking forward to coming back.`,
              date: location.firstVisited || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'exploration'],
              mood: location.moods?.[0]?.mood || 'excited',
              source: 'manual',
              sourceIcon: '📖',
              characters: location.relatedPeople.slice(0, 2).map(p => p.name),
            },
            {
              id: `mock-mem-${location.id}-2`,
              title: `Return visit to ${location.name}`,
              content: `Came back to ${location.name} today. It's becoming one of my favorite places. The atmosphere here is always welcoming.`,
              date: location.lastVisited || new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
              tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'return'],
              mood: location.moods?.[0]?.mood || 'calm',
              source: 'manual',
              sourceIcon: '📖',
              characters: location.relatedPeople.slice(0, 2).map(p => p.name),
            },
            {
              id: `mock-mem-${location.id}-3`,
              title: `Memorable moment at ${location.name}`,
              content: `Had a great time at ${location.name} today. ${location.relatedPeople.length > 0 ? `Spent time with ${location.relatedPeople[0].name}.` : 'The experience was wonderful.'}`,
              date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'memory'],
              mood: location.moods?.[1]?.mood || 'happy',
              source: 'manual',
              sourceIcon: '📖',
              characters: location.relatedPeople.slice(0, 1).map(p => p.name),
            },
            {
              id: `mock-mem-${location.id}-4`,
              title: `Exploring ${location.name}`,
              content: `Took some time to really explore ${location.name} today. There's so much to discover here.`,
              date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'exploration'],
              mood: location.moods?.[0]?.mood || 'curious',
              source: 'manual',
              sourceIcon: '📖',
              characters: [],
            },
          ];
          setMemoryCards(mockMemories);
          
          // Convert mock memories to timeline entries
          const entries: TimelineEntry[] = mockMemories.map(card => ({
            id: card.id,
            timestamp: card.date,
            title: card.content.substring(0, 100) || 'Untitled',
            summary: card.summary || card.content.substring(0, 200),
            full_text: card.content,
            mood: card.mood || null,
            arc: null,
            saga: null,
            era: null,
            lane: 'life',
            tags: card.tags || [],
            character_ids: [],
            related_entry_ids: []
          }));
          setTimelineEntries(entries);
        }
      } catch (error) {
        console.error('Failed to load location memories:', error);
        // Fallback to mock memories even if API fails
        const mockMemories: MemoryCard[] = [
          {
            id: `mock-mem-${location.id}-1`,
            title: `First visit to ${location.name}`,
            content: `Visited ${location.name} for the first time today. It was a memorable experience and I'm looking forward to coming back.`,
            date: location.firstVisited || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'exploration'],
            mood: location.moods?.[0]?.mood || 'excited',
            source: 'manual',
            sourceIcon: '📖',
            characters: location.relatedPeople.slice(0, 2).map(p => p.name),
          },
          {
            id: `mock-mem-${location.id}-2`,
            title: `Return visit to ${location.name}`,
            content: `Came back to ${location.name} today. It's becoming one of my favorite places. The atmosphere here is always welcoming.`,
            date: location.lastVisited || new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            tags: location.tagCounts.slice(0, 3).map(t => t.tag) || ['visit', 'return'],
            mood: location.moods?.[0]?.mood || 'calm',
            source: 'manual',
            sourceIcon: '📖',
            characters: location.relatedPeople.slice(0, 2).map(p => p.name),
          },
        ];
        setMemoryCards(mockMemories);
      } finally {
        setLoadingMemories(false);
      }
    };
    void loadLocationMemories();
  }, [location.entries, location.id, location.name, location.firstVisited, location.lastVisited, location.tagCounts, location.moods, location.relatedPeople]);

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

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

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
      // Pre-compute ternary values to avoid nested ternary parsing issues
      const importanceExplanation = location.analytics.importance_score >= 70
        ? 'this location is very important to you'
        : location.analytics.importance_score >= 40
        ? 'this location has moderate importance'
        : 'this location is developing in importance';

      const trendExplanation = location.analytics.trend === 'increasing'
        ? 'you are visiting more frequently over time'
        : location.analytics.trend === 'decreasing'
        ? 'your visits may be declining'
        : 'your visit pattern is stable';

      const comfortExplanation = location.analytics.comfort_score >= 70
        ? 'feels very comfortable and familiar'
        : location.analytics.comfort_score >= 40
        ? 'has moderate comfort'
        : 'may feel less comfortable';

      const analyticsContext = location.analytics ? `
LOCATION ANALYTICS (calculated from visits, journal entries, and conversations):
- Importance Score: ${location.analytics.importance_score}/100 (overall importance to you)
- Visit Frequency: ${location.analytics.visit_frequency}/100 (how often you visit)
- Recency Score: ${location.analytics.recency_score}/100 (how recently visited)
- Total Visits: ${location.analytics.total_visits} (all-time visit count)
- Priority Score: ${location.analytics.priority_score}/100 (urgency/priority level)
- Relevance Score: ${location.analytics.relevance_score}/100 (current relevance)
- Value Score: ${location.analytics.value_score}/100 (value this location provides)
- Sentiment Score: ${location.analytics.sentiment_score} (positive to negative, -100 to +100)
- Comfort Score: ${location.analytics.comfort_score}/100 (how comfortable you feel there)
- Productivity Score: ${location.analytics.productivity_score}/100 (productivity at this location)
- Social Score: ${location.analytics.social_score}/100 (social value)
- Activity Diversity: ${location.analytics.activity_diversity}/100 (variety of activities)
- Engagement Score: ${location.analytics.engagement_score}/100
- Associated People: ${location.analytics.associated_people_count} people
- First Visited: ${location.analytics.first_visited_days_ago} days ago
- Visit Trend: ${location.analytics.trend} (increasing/stable/decreasing)
${location.analytics.primary_purpose && location.analytics.primary_purpose.length > 0 ? `- Primary Purpose: ${location.analytics.primary_purpose.join(', ')}` : ''}
${location.analytics.associated_activities && location.analytics.associated_activities.length > 0 ? `- Associated Activities: ${location.analytics.associated_activities.join(', ')}` : ''}
${location.analytics.strengths && location.analytics.strengths.length > 0 ? `- Strengths: ${location.analytics.strengths.join(', ')}` : ''}
${location.analytics.weaknesses && location.analytics.weaknesses.length > 0 ? `- Weaknesses: ${location.analytics.weaknesses.join(', ')}` : ''}
${location.analytics.opportunities && location.analytics.opportunities.length > 0 ? `- Opportunities: ${location.analytics.opportunities.join(', ')}` : ''}
${location.analytics.considerations && location.analytics.considerations.length > 0 ? `- Considerations: ${location.analytics.considerations.join(', ')}` : ''}

You can explain these analytics to the user when asked. For example:
- "Your importance score of ${location.analytics.importance_score}% indicates ${importanceExplanation}"
- "The visit trend is ${location.analytics.trend}, meaning ${trendExplanation}"
- "With a comfort score of ${location.analytics.comfort_score}%, this location ${comfortExplanation}"
` : '';

      const locationContext = `You are helping the user with a specific location. Here's the context:

Location: ${location.name}
Coordinates: ${location.coordinates ? `${location.coordinates.lat}, ${location.coordinates.lng}` : 'Not available'}
Total Visits: ${location.visitCount}
First Visited: ${location.firstVisited || 'Unknown'}
Last Visited: ${location.lastVisited || 'Unknown'}
People Who Visited: ${location.relatedPeople.map(p => p.name).join(', ')}
Top Tags: ${location.tagCounts.map(t => t.tag).join(', ')}
Chapters: ${location.chapters.map(c => c.title).join(', ')}
${analyticsContext}
INSTRUCTIONS:
1. Answer questions about this location based on the context above
2. If the user asks about analytics, explain what the scores mean and why they might be at that level
3. If the user shares new information about the location, acknowledge it and offer to update the location profile
4. Be conversational and helpful
5. Use analytics to provide insights about visit patterns, importance, and value`;

      const conversationHistory = [
        { role: 'assistant' as const, content: locationContext },
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          conversationHistory,
          entityContext: {
            type: 'LOCATION',
            id: location.id
          }
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
          <Button variant="ghost" onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          {/* Tab Navigation */}
          <div className="flex border-b border-border/60 overflow-x-auto flex-shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-base font-medium transition whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div ref={contentRef} className="p-6 space-y-8 custom-scrollbar flex-1 min-h-0">
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
              <div className="space-y-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white flex items-center gap-3">
                      <Calendar className="h-6 w-6 text-primary" />
                      Shared Memories
                    </h3>
                    <p className="text-base text-white/60 mt-1">
                      Stories and moments at {location.name}
                    </p>
                  </div>
                  {memoryCards.length > 0 && (
                    <span className="text-base text-white/50">
                      {memoryCards.length} {memoryCards.length === 1 ? 'memory' : 'memories'}
                    </span>
                  )}
                </div>

                {/* Memory Cards */}
                {loadingMemories ? (
                  <div className="text-center py-12 text-white/60 text-lg">
                    <p>Loading shared memories...</p>
                  </div>
                ) : memoryCards.length > 0 ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {memoryCards.map((memory) => (
                        <div key={memory.id} data-memory-id={memory.id}>
                          <MemoryCardComponent
                            memory={memory}
                            showLinked={true}
                            expanded={expandedCardId === memory.id}
                            onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                            onSelect={() => setSelectedMemory(memory)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40 text-lg">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-xl font-medium mb-1">No shared memories yet</p>
                    <p className="text-base">Memories will appear here as you mention {location.name} in your journal entries</p>
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
              <div className="space-y-6 flex flex-col h-full min-h-0">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2 flex items-center gap-3">
                    <MessageSquare className="h-6 w-6 text-primary" />
                    Chat about {location.name}
                  </h3>
                  <p className="text-base text-white/60 mt-1">
                    Ask questions, share stories, or update information about {location.name} through conversation.
                  </p>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar p-2 rounded-lg border border-border/50 bg-black/30">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-white/60 text-base">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-lg font-medium mb-1">Start a conversation about {location.name}</p>
                      <p className="text-sm mt-2">Try asking:</p>
                      <ul className="list-disc list-inside text-left w-fit mx-auto text-sm text-white/50">
                        <li>"Tell me more about {location.name}"</li>
                        <li>"What do I know about {location.name}?"</li>
                        <li>"What memories are associated with this place?"</li>
                        <li>"Update {location.name}'s information: ..."</li>
                      </ul>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <ChatMessage key={idx} message={{
                        id: `msg-${idx}`,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                      }} />
                    ))
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>
                <div className="border-t border-border/60 pt-4 flex-shrink-0">
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
                {location.analytics ? (
                  <>
                    {/* Analytics Dashboard */}
                    <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/10 to-teal-500/10 border-green-500/30">
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-green-400" />
                          Location Analytics & Insights
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Importance</div>
                            <div className="text-2xl font-bold text-amber-400">{location.analytics.importance_score}%</div>
                            <div className="text-xs text-white/50 mt-1">to you</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Visit Frequency</div>
                            <div className="text-2xl font-bold text-blue-400">{location.analytics.visit_frequency}%</div>
                            <div className="text-xs text-white/50 mt-1">how often</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Priority</div>
                            <div className="text-2xl font-bold text-green-400">{location.analytics.priority_score}%</div>
                            <div className="text-xs text-white/50 mt-1">urgency level</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Total Visits</div>
                            <div className="text-2xl font-bold text-purple-400">{location.analytics.total_visits}</div>
                            <div className="text-xs text-white/50 mt-1">all time</div>
                          </div>
                        </div>

                        {/* Visit Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Recency Score</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all"
                                  style={{ width: `${location.analytics.recency_score}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{location.analytics.recency_score}%</span>
                            </div>
                            <div className="text-xs text-white/50 mt-2">How recently visited</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Engagement</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                                  style={{ width: `${location.analytics.engagement_score}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{location.analytics.engagement_score}%</span>
                            </div>
                            <div className="text-xs text-white/50 mt-2">Your engagement level</div>
                          </div>
                        </div>

                        {/* Sentiment & Experience Metrics */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Sentiment</div>
                            <div className={`text-lg font-semibold ${location.analytics.sentiment_score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {location.analytics.sentiment_score > 0 ? '+' : ''}{location.analytics.sentiment_score}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Comfort</div>
                            <div className="text-lg font-semibold text-blue-400">{location.analytics.comfort_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Productivity</div>
                            <div className="text-lg font-semibold text-yellow-400">{location.analytics.productivity_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Social</div>
                            <div className="text-lg font-semibold text-pink-400">{location.analytics.social_score}%</div>
                          </div>
                        </div>

                        {/* Additional Metrics */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Value</div>
                            <div className="text-lg font-semibold text-yellow-400">{location.analytics.value_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Relevance</div>
                            <div className="text-lg font-semibold text-cyan-400">{location.analytics.relevance_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Activity Diversity</div>
                            <div className="text-lg font-semibold text-purple-400">{location.analytics.activity_diversity}%</div>
                          </div>
                        </div>

                        {/* Context Information */}
                        {location.analytics.primary_purpose && location.analytics.primary_purpose.length > 0 && (
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm font-semibold text-white mb-2">Primary Purpose</div>
                            <div className="flex flex-wrap gap-2">
                              {location.analytics.primary_purpose.map((purpose, i) => (
                                <Badge key={i} variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                  {purpose}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {location.analytics.associated_activities && location.analytics.associated_activities.length > 0 && (
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm font-semibold text-white mb-2">Associated Activities</div>
                            <div className="flex flex-wrap gap-2">
                              {location.analytics.associated_activities.map((activity, i) => (
                                <Badge key={i} variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">
                                  {activity}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Trend */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-white/70">Visit Trend:</span>
                          {location.analytics.trend === 'increasing' && (
                            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Increasing
                            </Badge>
                          )}
                          {location.analytics.trend === 'decreasing' && (
                            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              Decreasing
                            </Badge>
                          )}
                          {location.analytics.trend === 'stable' && (
                            <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                              <Minus className="h-3 w-3 mr-1" />
                              Stable
                            </Badge>
                          )}
                          <span className="text-white/50 text-xs ml-2">
                            First visited {location.analytics.first_visited_days_ago} days ago
                          </span>
                        </div>

                        {/* SWOT Analysis */}
                        {(location.analytics.strengths?.length > 0 || 
                          location.analytics.weaknesses?.length > 0 || 
                          location.analytics.opportunities?.length > 0 || 
                          location.analytics.considerations?.length > 0) && (
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            {location.analytics.strengths && location.analytics.strengths.length > 0 && (
                              <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
                                <div className="text-sm font-semibold text-green-400 mb-2">Strengths</div>
                                <ul className="space-y-1">
                                  {location.analytics.strengths.map((strength, i) => (
                                    <li key={i} className="text-xs text-white/70">• {strength}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {location.analytics.weaknesses && location.analytics.weaknesses.length > 0 && (
                              <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                                <div className="text-sm font-semibold text-red-400 mb-2">Weaknesses</div>
                                <ul className="space-y-1">
                                  {location.analytics.weaknesses.map((weakness, i) => (
                                    <li key={i} className="text-xs text-white/70">• {weakness}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {location.analytics.opportunities && location.analytics.opportunities.length > 0 && (
                              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                                <div className="text-sm font-semibold text-blue-400 mb-2">Opportunities</div>
                                <ul className="space-y-1">
                                  {location.analytics.opportunities.map((opp, i) => (
                                    <li key={i} className="text-xs text-white/70">• {opp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {location.analytics.considerations && location.analytics.considerations.length > 0 && (
                              <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
                                <div className="text-sm font-semibold text-orange-400 mb-2">Considerations</div>
                                <ul className="space-y-1">
                                  {location.analytics.considerations.map((consideration, i) => (
                                    <li key={i} className="text-xs text-white/70">• {consideration}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Analytics not available</p>
                    <p className="text-sm mt-2">Analytics will appear here once calculated</p>
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
