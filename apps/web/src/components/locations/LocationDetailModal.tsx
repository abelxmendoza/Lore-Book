import { useState, useEffect, useRef } from 'react';
import { X, Calendar, MapPin, Users, Tag, Sparkles, FileText, Brain, Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage } from '../../features/chat/message/ChatMessage';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { LocationProfile } from './LocationProfileCard';
import { useMockData } from '../../contexts/MockDataContext';

type LocationDetailModalProps = {
  location: LocationProfile;
  onClose: () => void;
};

type TabKey = 'overview' | 'memories' | 'people' | 'insights' | 'knowledge';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'overview',  label: 'Overview',  icon: FileText },
  { key: 'knowledge', label: 'What I Know', icon: Brain },
  { key: 'memories',  label: 'Memories',  icon: Calendar },
  { key: 'people',    label: 'People',    icon: Users },
  { key: 'insights',  label: 'Insights',  icon: Brain },
];

export const LocationDetailModal = ({ location, onClose }: LocationDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [locationFacts, setLocationFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsLoaded, setFactsLoaded] = useState(false);
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
        } else {
          // Generate mock memories if no entries from API and toggle is enabled
          if (!isMockDataEnabled) {
            setMemoryCards([]);
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

  // Load facts when knowledge tab opens
  useEffect(() => {
    if (activeTab !== 'knowledge' || factsLoaded || isMockDataEnabled || !location.id) return;
    setFactsLoading(true);
    fetchJson<{ success: boolean; facts: any[] }>(`/api/locations/${location.id}/facts`)
      .then(r => { if (r.success) setLocationFacts(r.facts); })
      .catch(() => {})
      .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
  }, [activeTab, location.id, factsLoaded, isMockDataEnabled]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '7') {
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
    setChatMessages(prev => [...prev, { role: 'user', content: message, timestamp: new Date() }]);
    setChatLoading(true);
    try {
      const ctx = `Location: ${location.name}. Visits: ${location.visitCount}. Tags: ${location.tagCounts.map(t => t.tag).join(', ')}.`;
      const response = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          conversationHistory: [
            { role: 'assistant', content: ctx },
            ...chatMessages.map(m => ({ role: m.role, content: m.content })),
          ],
          entityContext: { type: 'LOCATION', id: location.id },
        }),
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.answer || 'Got it.', timestamp: new Date() }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.', timestamp: new Date() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const a = location.analytics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start gap-4 p-5 border-b border-white/8 shrink-0">
          <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-2.5 shrink-0 mt-0.5">
            <MapPin className="h-5 w-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white leading-tight">{location.name}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span className="text-xs text-white/45">{location.visitCount} visits</span>
              {location.coordinates && (
                <span className="text-xs text-white/30 font-mono">
                  {location.coordinates.lat.toFixed(4)}, {location.coordinates.lng.toFixed(4)}
                </span>
              )}
              {location.lastVisited && (
                <span className="text-xs text-white/30">last {fmt(location.lastVisited)}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 px-5 pt-3 border-b border-white/8 shrink-0 overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'border-teal-400 text-teal-300'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5 pb-28 space-y-5">

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Stat row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Visits',      value: location.visitCount,                        icon: Calendar },
                  { label: 'First visit', value: fmt(location.firstVisited),                 icon: Clock },
                  { label: 'Last visit',  value: fmt(location.lastVisited),                  icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl bg-white/4 border border-white/8 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3 w-3 text-teal-400" />
                      <span className="text-[10px] text-white/40 uppercase tracking-wider">{label}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {location.tagCounts.length > 0 && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {location.tagCounts.map(t => (
                      <span key={t.tag} className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300">
                        {t.tag} <span className="text-teal-400/60 text-[10px]">·{t.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Moods */}
              {location.moods.length > 0 && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Mood
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {location.moods.map(m => (
                      <span key={m.mood} className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/55">
                        {m.mood} <span className="text-white/30 text-[10px]">·{m.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Chapters */}
              {location.chapters.length > 0 && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Chapters
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {location.chapters.map(ch => (
                      <span key={ch.id} className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                        {ch.title || 'Untitled'} <span className="text-purple-400/60 text-[10px]">·{ch.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Coordinates */}
              {location.coordinates && (
                <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> Coordinates
                  </p>
                  <p className="text-sm font-mono text-white/70">
                    {location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}
                  </p>
                </div>
              )}

              {/* Sources */}
              {location.sources.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <span>Sources:</span>
                  {location.sources.map(s => (
                    <span key={s} className="px-2 py-0.5 rounded bg-white/5 border border-white/8 text-white/45">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── MEMORIES ── */}
          {activeTab === 'memories' && (
            <div className="space-y-3">
              {loadingMemories ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 rounded-xl bg-white/5 border border-white/8 animate-pulse" />
                  ))}
                </div>
              ) : memoryCards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {memoryCards.map(memory => (
                    <div key={memory.id}>
                      <MemoryCardComponent
                        memory={memory}
                        showLinked
                        expanded={expandedCardId === memory.id}
                        onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                        onSelect={() => setSelectedMemory(memory)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <Calendar className="h-10 w-10 mx-auto mb-3 text-white/15" />
                  <p className="text-sm font-medium text-white/40 mb-1">No memories yet</p>
                  <p className="text-xs text-white/25">Mention {location.name} in chat and memories will appear here</p>
                </div>
              )}
            </div>
          )}

          {/* ── PEOPLE ── */}
          {activeTab === 'people' && (
            <div className="space-y-2">
              {location.relatedPeople.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="h-10 w-10 mx-auto mb-3 text-white/15" />
                  <p className="text-sm font-medium text-white/40">No people recorded yet</p>
                </div>
              ) : (
                location.relatedPeople.map(person => (
                  <div key={person.id} className="flex items-center justify-between rounded-xl bg-white/4 border border-white/8 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-teal-500/15 border border-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-300">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-white">{person.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/50">{person.entryCount} {person.entryCount === 1 ? 'visit' : 'visits'}</p>
                      <p className="text-[10px] text-white/30">{person.total_mentions} mentions</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── KNOWLEDGE ── */}
          {activeTab === 'knowledge' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-violet-400" />
                  What LoreBook Knows About {location.name}
                </h3>
                <p className="text-xs text-white/45">
                  Facts about this place extracted from your conversations.
                </p>
              </div>

              {factsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!factsLoading && locationFacts.length === 0 && (
                <div className="text-center py-12 text-white/30">
                  <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium mb-1">No facts yet</p>
                  <p className="text-xs max-w-xs mx-auto">
                    Mention {location.name} in a chat to start building knowledge about this place.
                  </p>
                </div>
              )}

              {!factsLoading && locationFacts.length > 0 && (
                <div className="space-y-4">
                  {Object.entries(
                    locationFacts.reduce((acc: Record<string, any[]>, f: any) => {
                      if (!acc[f.category]) acc[f.category] = [];
                      acc[f.category].push(f);
                      return acc;
                    }, {})
                  ).map(([category, facts]) => {
                    const catLabel: Record<string, string> = {
                      experience: 'Experiences', association: 'Associations',
                      pattern: 'Patterns', sentiment: 'Sentiment',
                      practical: 'Practical', general: 'General',
                    };
                    const statusBadge: Record<string, { label: string; cls: string }> = {
                      updated:      { label: 'Updated',      cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                      corrected:    { label: 'Corrected',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                      contradicted: { label: 'Contradicted', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
                    };
                    return (
                      <div key={category}>
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">
                          {catLabel[category] ?? category}
                        </p>
                        <div className="space-y-2">
                          {(facts as any[]).map((fact: any) => {
                            const pct = Math.round((fact.confidence ?? 0.7) * 100);
                            const badge = statusBadge[fact.status as string];
                            return (
                              <div key={fact.id} className="flex items-start gap-2.5 p-3 rounded-lg border border-white/6 bg-white/3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white/85 leading-snug">{fact.fact}</p>
                                  {fact.previous_value && (
                                    <p className="text-[11px] text-white/35 mt-1 line-through">{fact.previous_value}</p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  {badge && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                  <span className={`text-[10px] tabular-nums font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── INSIGHTS ── */}
          {activeTab === 'insights' && (
            <div className="space-y-5">
              {a ? (
                <>
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Importance',  value: a.importance_score,  color: 'text-amber-400' },
                      { label: 'Frequency',   value: a.visit_frequency,   color: 'text-blue-400'  },
                      { label: 'Comfort',     value: a.comfort_score,     color: 'text-emerald-400' },
                      { label: 'Productivity', value: a.productivity_score, color: 'text-purple-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-xl bg-white/4 border border-white/8 p-3 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}%</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Bar metrics */}
                  <div className="space-y-3">
                    {[
                      { label: 'Sentiment',        value: Math.max(0, a.sentiment_score), max: 100, color: 'bg-green-500' },
                      { label: 'Recency',          value: a.recency_score,                max: 100, color: 'bg-teal-500'  },
                      { label: 'Social value',     value: a.social_score,                 max: 100, color: 'bg-rose-500'  },
                      { label: 'Activity variety', value: a.activity_diversity,           max: 100, color: 'bg-cyan-500'  },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/50">{label}</span>
                          <span className="text-white/70">{value}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Trend */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Visit trend:</span>
                    {a.trend === 'increasing' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <TrendingUp className="h-3.5 w-3.5" /> Increasing
                      </span>
                    )}
                    {a.trend === 'decreasing' && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <TrendingDown className="h-3.5 w-3.5" /> Decreasing
                      </span>
                    )}
                    {a.trend === 'stable' && (
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <Minus className="h-3.5 w-3.5" /> Stable
                      </span>
                    )}
                    <span className="text-xs text-white/25 ml-auto">First visited {a.first_visited_days_ago}d ago</span>
                  </div>

                  {/* SWOT */}
                  {(a.strengths?.length || a.weaknesses?.length || a.opportunities?.length || a.considerations?.length) ? (
                    <div className="grid grid-cols-2 gap-3">
                      {a.strengths?.length ? (
                        <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3">
                          <p className="text-xs font-semibold text-emerald-400 mb-2">Strengths</p>
                          <ul className="space-y-1">{a.strengths.map((s, i) => <li key={i} className="text-xs text-white/60">· {s}</li>)}</ul>
                        </div>
                      ) : null}
                      {a.weaknesses?.length ? (
                        <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3">
                          <p className="text-xs font-semibold text-red-400 mb-2">Weaknesses</p>
                          <ul className="space-y-1">{a.weaknesses.map((s, i) => <li key={i} className="text-xs text-white/60">· {s}</li>)}</ul>
                        </div>
                      ) : null}
                      {a.opportunities?.length ? (
                        <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3">
                          <p className="text-xs font-semibold text-blue-400 mb-2">Opportunities</p>
                          <ul className="space-y-1">{a.opportunities.map((s, i) => <li key={i} className="text-xs text-white/60">· {s}</li>)}</ul>
                        </div>
                      ) : null}
                      {a.considerations?.length ? (
                        <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 p-3">
                          <p className="text-xs font-semibold text-orange-400 mb-2">Considerations</p>
                          <ul className="space-y-1">{a.considerations.map((s, i) => <li key={i} className="text-xs text-white/60">· {s}</li>)}</ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-center py-16">
                  <Brain className="h-10 w-10 mx-auto mb-3 text-white/15" />
                  <p className="text-sm text-white/40">Analytics not yet available</p>
                  <p className="text-xs text-white/25 mt-1">Keep journaling about this place and insights will appear</p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Sticky chat composer ── */}
        <div className="shrink-0 border-t border-white/8 bg-black/60 backdrop-blur-sm p-3">
          {chatMessages.map((msg, i) => (
            <ChatMessage key={i} message={{ id: `msg-${i}`, role: msg.role, content: msg.content, timestamp: msg.timestamp }} />
          ))}
          <div ref={chatMessagesEndRef} />
          <ChatComposer onSubmit={handleChatSubmit} loading={chatLoading} />
        </div>
      </div>

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={memoryId => {
            const m = memoryCards.find(x => x.id === memoryId);
            if (m) setSelectedMemory(m);
          }}
          allMemories={memoryCards}
        />
      )}
    </div>
  );
};
