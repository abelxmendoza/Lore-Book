import { useState, useEffect, useRef } from 'react';
import { X, Calendar, MapPin, Users, Tag, Sparkles, FileText, Brain, Clock, TrendingUp, TrendingDown, Minus, MessageSquare, Trash2 } from 'lucide-react';
import { XProvenanceBadge } from '../integrations/XProvenanceBadge';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage } from '../../features/chat/message/ChatMessage';
import { fetchJson } from '../../lib/api';
import { apiCache } from '../../lib/cache';
import { safeHttpUrl } from '../../lib/safeUrl';
import { fetchLocationById, isEphemeralEntityId } from '../../lib/hydrateBookEntity';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { UnknownField } from '../ui/UnknownField';
import type { LocationProfile } from './LocationProfileCard';
// Re-export so consumers (e.g. CharacterDetailModal) can import the type from here.
export type { LocationProfile } from './LocationProfileCard';
import { useMockData } from '../../contexts/MockDataContext';
import { schedulePostChatRefresh } from '../../lib/storyRefresh';
import { mockDataService } from '../../services/mockDataService';
import { getMockLocationFacts, getMockLocationPeople } from '../../mocks/modalDemoData';
import { classifyLocation, KIND_META, locationHierarchy, computeChildren, isHouseholdLocation, isRoomLocation } from '../../lib/locationTaxonomy';
import {
  formatPlaceType,
  formatPlaceSignificance,
  getPlaceTags,
  getPlaceSignificance,
  resolvePlaceType,
  type PlaceSignificance,
} from '../../lib/placeTypes';
import {
  locationAliasesForDisplay,
  locationEvidenceSourcesForDisplay,
  locationMediaForDisplay,
  locationMergeHistoryForDisplay,
  locationSourceRefsForDisplay,
} from '../../lib/locationMergeMetadata';
import { PlaceProfileEditor, type PlaceProfileDraft } from './PlaceProfileEditor';
import { HouseholdDetailPanel } from './HouseholdDetailPanel';
import { Button } from '../ui/button';
import { Pencil } from 'lucide-react';
import { EditableEntityName } from '../common/EditableEntityName';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';

type LocationDetailModalProps = {
  location: LocationProfile;
  /** Full location list — used to derive the nesting (places within this one). */
  allLocations?: LocationProfile[];
  /** Open a nested/parent location in the modal. */
  onSelectLocation?: (loc: LocationProfile) => void;
  onClose: () => void;
  onLocationUpdated?: (loc: LocationProfile) => void;
  onLocationDeleted?: (id: string) => void;
};

type TabKey = 'overview' | 'memories' | 'people' | 'insights' | 'knowledge' | 'chat' | 'delete';

const tabs: Array<{ key: TabKey; label: string; shortLabel: string; icon: typeof FileText }> = [
  { key: 'overview',  label: 'Overview',    shortLabel: 'Overview', icon: FileText },
  { key: 'knowledge', label: 'What I Know', shortLabel: 'Know',     icon: Brain },
  { key: 'memories',  label: 'Memories',    shortLabel: 'Memories', icon: Calendar },
  { key: 'people',    label: 'People',      shortLabel: 'People',   icon: Users },
  { key: 'insights',  label: 'Insights',    shortLabel: 'Insights', icon: Sparkles },
  { key: 'chat',      label: 'Chat',        shortLabel: 'Chat',     icon: MessageSquare },
  { key: 'delete',    label: 'Delete',      shortLabel: 'Delete',   icon: Trash2 },
];

export const LocationDetailModal = ({
  location: locationProp,
  allLocations = [],
  onSelectLocation,
  onClose,
  onLocationUpdated,
  onLocationDeleted,
}: LocationDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [location, setLocation] = useState(locationProp);
  const [editingProfile, setEditingProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'review' | 'confirm'>('review');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('wrong_place_or_not_relevant');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteLocation = async () => {
    if (deleting || !location.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (isMockDataEnabled) {
        // Demo mode does not persist destructive location deletion; parent state
        // still removes the card for the current session.
      } else {
        await fetchJson(`/api/locations/${location.id}`, {
          method: 'DELETE',
          body: JSON.stringify({
            reason: deleteReason,
          }),
        });
        apiCache.deletePattern(/\/api\/(locations|knowledge|conversation|counts|books)/);
      }
      onLocationDeleted?.(location.id);
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: { ids: [location.id], deleted: true } }));
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete location.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    setLocation(locationProp);
    setEditingProfile(false);
    setDeleteStep('review');
    setDeleteConfirmText('');
    setDeleteReason('wrong_place_or_not_relevant');
    setDeleteError(null);
  }, [locationProp.id]);

  useEffect(() => {
    if (isMockDataEnabled || isEphemeralEntityId(locationProp.id)) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchLocationById(locationProp.id);
        if (!cancelled) setLocation(full);
      } catch {
        // Keep seed profile on transient errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationProp.id, isMockDataEnabled]);

  const reloadLocationProfile = async () => {
    if (isMockDataEnabled || !location.id) return;
    try {
      const updated = await fetchLocationById(location.id);
      setLocation(updated);
      onLocationUpdated?.(updated);
    } catch {
      // Keep showing current profile on transient errors.
    }
  };
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
        // Real accounts must never see fabricated memories — only demo mode does.
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
    if (activeTab !== 'knowledge' || factsLoaded) return;
    if (isMockDataEnabled) {
      setLocationFacts(getMockLocationFacts(location));
      setFactsLoading(false);
      setFactsLoaded(true);
      return;
    }
    if (!location.id) return;
    setFactsLoading(true);
    fetchJson<{ success: boolean; facts: any[] }>(`/api/locations/${location.id}/facts`)
      .then(r => { if (r.success) setLocationFacts(r.facts); })
      .catch(() => {})
      .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
  }, [activeTab, location, factsLoaded, isMockDataEnabled]);

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

  const openLocationMainChat = (prompt?: string) => {
    onClose();
    openChatWithFocus({
      entityId: location.id,
      entityName: location.name,
      entityType: 'location',
      sourceSurface: 'locations',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.locations,
      knowledgeScope: 'place memories, visits, and significance',
      initialPrompt:
        prompt ??
        `Tell me about ${location.name} — what I've shared, how it fits in my life, and what stands out.`,
    });
  };

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
      schedulePostChatRefresh({ scopes: ['all'] });
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: { ids: [location.id] } }));
      setTimeout(() => { void reloadLocationProfile(); }, 4000);
      setTimeout(() => { void reloadLocationProfile(); }, 11000);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.', timestamp: new Date() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const a = location.analytics;
  const verifiedPeople = isMockDataEnabled
    ? getMockLocationPeople(location, mockDataService.get.characters())
    : location.relatedPeople.filter(person => person.character_id);
  const placeLine = [location.address, location.city, location.region, location.country].filter(Boolean).join(', ');
  const placeType = resolvePlaceType(location.type, location.name);
  const placeTags = getPlaceTags(location);
  const placeSignificance = getPlaceSignificance(location);
  const aliases = locationAliasesForDisplay(location.metadata);
  const mergeHistory = locationMergeHistoryForDisplay(location.metadata);
  const evidenceSources = locationEvidenceSourcesForDisplay(location.metadata);
  const mediaItems = locationMediaForDisplay(location.metadata);
  const sourceRefs = locationSourceRefsForDisplay(location.metadata);

  const profileDraft: PlaceProfileDraft = {
    type: resolvePlaceType(location.type, location.name) ?? location.type ?? '',
    place_tags: placeTags,
    place_significance: placeSignificance,
  };

  const savePlaceProfile = async (draft: PlaceProfileDraft) => {
    if (isMockDataEnabled) {
      const next = {
        ...location,
        type: draft.type || location.type,
        metadata: {
          ...(location.metadata ?? {}),
          place_tags: draft.place_tags,
          place_significance: draft.place_significance,
        },
      };
      const saved = mockDataService.mutate.locations.update(location.id, next) ?? next;
      setLocation(saved);
      onLocationUpdated?.(saved);
      setEditingProfile(false);
      return;
    }
    const r = await fetchJson<{ success: boolean; location: LocationProfile }>(
      `/api/locations/${location.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          type: draft.type || null,
          place_tags: draft.place_tags,
          place_significance: draft.place_significance,
        }),
      },
    );
    if (r.success && r.location) {
      setLocation(r.location);
      onLocationUpdated?.(r.location);
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: { ids: [location.id] } }));
    }
    setEditingProfile(false);
  };

  const handleRenameLocation = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === location.name) return;
    if (isMockDataEnabled) {
      const next = {
        ...location,
        name: trimmed,
        metadata: {
          ...(location.metadata ?? {}),
          name_source: 'user_confirmed',
          name_confirmed_at: new Date().toISOString(),
        },
      };
      const saved = mockDataService.mutate.locations.update(location.id, next) ?? next;
      setLocation(saved);
      onLocationUpdated?.(saved);
      return;
    }
    const r = await fetchJson<{ success: boolean; location: LocationProfile }>(
      `/api/locations/${location.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      },
    );
    if (r.success && r.location) {
      setLocation(r.location);
      onLocationUpdated?.(r.location);
      apiCache.deletePattern(/\/api\/(locations|knowledge|conversation|counts|books)/);
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: { ids: [location.id], renamed: true } }));
    }
  };

  const identityFields = [
    { label: 'Place type', value: placeType ? formatPlaceType(placeType) : location.type ?? undefined },
    { label: 'Location', value: placeLine },
    { label: 'Owner/operator', value: location.ownerOperator ?? undefined },
  ].filter((field): field is { label: string; value: string } => Boolean(field.value));

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${location.name} details`}
    >
      <div className="bg-[#0a0a0a] border-0 sm:border border-white/10 rounded-none sm:rounded-2xl w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl overflow-hidden flex flex-col shadow-2xl">

        {/* ── Header — compact on mobile ── */}
        <div className="relative border-b border-white/8 shrink-0 bg-gradient-to-r from-teal-950/30 via-black/40 to-teal-950/20">
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="sm:hidden px-3 py-2 pr-11 min-w-0"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 p-1.5 shrink-0">
                <MapPin className="h-4 w-4 text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <EditableEntityName
                  name={location.name}
                  onSave={handleRenameLocation}
                  disabled={isEphemeralEntityId(location.id)}
                  label="location name"
                  className="block truncate text-base font-bold text-white"
                  inputClassName="min-w-0 w-full rounded-md border border-white/20 bg-black/60 px-2 py-1 text-base font-bold text-white outline-none focus:border-teal-400"
                />
                <p className="text-[11px] text-white/45 truncate mt-0.5">
                  {[placeType ? formatPlaceType(placeType) : location.type?.replace(/_/g, ' '), `${location.visitCount} visits`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-start gap-4 p-5 pr-14">
          <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-2.5 shrink-0 mt-0.5">
            <MapPin className="h-5 w-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <EditableEntityName
              name={location.name}
              onSave={handleRenameLocation}
              disabled={isEphemeralEntityId(location.id)}
              label="location name"
              className="text-lg font-bold text-white leading-tight"
              inputClassName="min-w-0 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-lg font-bold text-white outline-none focus:border-teal-400"
            />
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {placeType && (
                <span className="text-xs text-teal-300/80">{formatPlaceType(placeType)}</span>
              )}
              {!placeType && location.type && (
                <span className="text-xs text-teal-300/80 capitalize">{location.type.replace(/_/g, ' ')}</span>
              )}
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
          </div>
        </div>

        {/* ── Tab bar — stacked grid on mobile, wrap on desktop ── */}
        <nav
          className="shrink-0 border-b border-white/8 px-2 sm:px-5 pt-2 pb-2 sm:pt-3"
          aria-label="Place sections"
        >
          <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:gap-1.5">
          {tabs.map(({ key, label, shortLabel, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center justify-center sm:justify-start gap-1.5 px-2 sm:px-3 py-2 text-[11px] sm:text-xs font-medium rounded-lg sm:rounded-t-lg border sm:border-0 sm:border-b-2 transition-colors touch-manipulation min-h-[40px] sm:min-h-0 ${
                activeTab === key
                  ? 'border-teal-500/40 bg-teal-500/10 text-teal-300 sm:bg-transparent sm:border-teal-400'
                  : 'border-white/8 text-white/45 hover:text-white/70 hover:bg-white/[0.04] sm:border-transparent'
              }`}
              aria-current={activeTab === key ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          ))}
          </div>
        </nav>

        {/* ── Content ── */}
        <div
          ref={contentRef}
          className={`flex-1 min-h-0 touch-pan-y [-webkit-overflow-scrolling:touch] ${
            activeTab === 'chat'
              ? 'flex flex-col overflow-hidden'
              : 'overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3 sm:space-y-5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]'
          }`}
        >

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-3 sm:space-y-5">
              <HouseholdDetailPanel
                location={location}
                allLocations={allLocations}
                onSelectLocation={onSelectLocation}
                onOpenMemoriesTab={() => setActiveTab('memories')}
              />

              {isRoomLocation(location) && (
                <div className="rounded-xl bg-purple-500/8 border border-purple-500/20 px-4 py-3 text-xs text-purple-200/80">
                  This is a <span className="font-semibold">room</span> inside a household — not a standalone place card.
                  {typeof location.metadata?.parent_household_name === 'string' && (
                    <span> Part of <span className="font-medium text-white">{location.metadata.parent_household_name}</span>.</span>
                  )}
                </div>
              )}

              {/* Hierarchy + nesting — kind, what it's part of, and places within */}
              {(() => {
                const kind = classifyLocation(location);
                const meta = KIND_META[kind];
                const hierarchy = locationHierarchy(location);
                const children = isHouseholdLocation(location)
                  ? [] // rooms shown in HouseholdDetailPanel
                  : computeChildren(location, allLocations);
                const findByName = (name: string) =>
                  allLocations.find(l => l.name.toLowerCase() === name.toLowerCase());
                if (kind === 'other' && hierarchy.length === 0 && children.length === 0) return null;
                return (
                  <div className="rounded-xl bg-white/4 border border-white/8 p-3 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.color}`}>
                        <span aria-hidden>{meta.icon}</span> {meta.label}
                      </span>
                      {hierarchy.length > 0 && (
                        <span className="text-xs text-white/45 flex items-center gap-1 flex-wrap">
                          part of
                          {hierarchy.map((h, i) => {
                            const target = findByName(h.name);
                            return (
                              <span key={h.name} className="flex items-center gap-1">
                                {i > 0 && <span className="text-white/25">›</span>}
                                {target && onSelectLocation ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelectLocation(target)}
                                    className="text-teal-300 hover:text-teal-200 hover:underline underline-offset-2"
                                  >
                                    {h.name}
                                  </button>
                                ) : (
                                  <span className="text-white/65">{h.name}</span>
                                )}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>
                    {children.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">
                          Places within ({children.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {children.slice(0, 12).map(child => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => onSelectLocation?.(child)}
                              disabled={!onSelectLocation}
                              className="text-xs px-2.5 py-1 rounded-full bg-black/30 border border-white/10 text-white/70 hover:border-teal-500/40 hover:text-teal-200 transition-colors disabled:cursor-default"
                            >
                              <span aria-hidden>{KIND_META[classifyLocation(child)].icon}</span> {child.name}
                              {child.visitCount > 0 && <span className="ml-1 text-[10px] text-white/35">{child.visitCount}</span>}
                            </button>
                          ))}
                          {children.length > 12 && (
                            <span className="text-xs text-white/35 self-center">+{children.length - 12} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Place identity + editor */}
              <div className="space-y-3">
                {!editingProfile && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setEditingProfile(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit type & tags
                    </Button>
                  </div>
                )}
                {editingProfile ? (
                  <PlaceProfileEditor
                    initial={profileDraft}
                    onSave={savePlaceProfile}
                    onCancel={() => setEditingProfile(false)}
                  />
                ) : identityFields.length > 0 || aliases.length > 0 || mergeHistory.length > 0 || evidenceSources.length > 0 ? (
                  <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> Identity
                    </p>
                    {identityFields.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {identityFields.map(field => (
                          <div key={field.label} className="rounded-lg bg-black/25 border border-white/6 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-white/30">{field.label}</p>
                            <p className="text-xs font-medium text-white/75">{field.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {(aliases.length > 0 || mergeHistory.length > 0 || evidenceSources.length > 0) && (
                      <div className="mt-3 space-y-3 border-t border-white/8 pt-3">
                        {aliases.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Also known as</p>
                            <div className="flex flex-wrap gap-1.5">
                              {aliases.map(alias => (
                                <span key={alias} className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-200">
                                  {alias}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {mergeHistory.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Merge history</p>
                            <div className="space-y-1.5">
                              {mergeHistory.slice(0, 5).map((item, index) => (
                                <div key={`${item.sourceId ?? item.sourceName}-${index}`} className="rounded-lg bg-black/25 border border-white/6 px-3 py-2">
                                  <p className="text-xs text-white/70">
                                    {item.sourceName} merged into {item.canonicalNameAfter ?? location.name}
                                  </p>
                                  {item.mergedAt && (
                                    <p className="text-[10px] text-white/35 mt-0.5">{fmt(item.mergedAt)}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {evidenceSources.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Evidence sources</p>
                            <div className="flex flex-wrap gap-1.5">
                              {evidenceSources.map(source => (
                                <span key={source} className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/8 text-white/55">
                                  {source}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {mediaItems.length > 0 && (
                <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Photos
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {mediaItems.map(item => {
                      // Validate href/src as http(s) only (CodeQL js/xss + unvalidated-url-redirection)
                      const safeSrc = safeHttpUrl(item.url);
                      if (!safeSrc) return null;
                      const safeHref = safeHttpUrl(item.sourceUrl) ?? safeSrc;
                      return (
                      <a
                        key={safeSrc}
                        href={safeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block aspect-square overflow-hidden rounded-lg border border-white/8 bg-black/25"
                        title={item.alt ?? (item.source === 'x_post' ? 'From an X post' : undefined)}
                      >
                        <img
                          src={safeSrc}
                          alt={item.alt ?? ''}
                          loading="lazy"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        {item.source === 'x_post' && (
                          <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] text-sky-300">
                            X
                          </span>
                        )}
                      </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {sourceRefs.length > 0 && (
                <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" /> Mentioned in
                  </p>
                  <div className="space-y-1.5">
                    {sourceRefs.map((ref, index) => (
                      <div
                        key={`${ref.url ?? ref.entryId ?? ref.threadId ?? 'src'}-${index}`}
                        className="rounded-lg bg-black/25 border border-white/6 px-3 py-2 flex items-start gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          {ref.excerpt && (
                            <p className="text-xs text-white/70 truncate">“{ref.excerpt}”</p>
                          )}
                          <p className="text-[10px] text-white/35 mt-0.5">
                            {ref.source === 'x_post' ? 'X post' : ref.source === 'chat' ? 'Chat conversation' : 'Journal entry'}
                            {ref.at ? ` • ${fmt(ref.at)}` : ''}
                          </p>
                        </div>
                        {ref.source === 'x_post' && (ref.url || ref.entryId) && (
                          <XProvenanceBadge source={{ url: ref.url, postedAt: ref.at, excerpt: ref.excerpt }} compact />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(placeTags.length > 0 || placeSignificance.length > 0) && !editingProfile && (
                <div className="rounded-xl bg-white/4 border border-white/8 p-3 space-y-3">
                  {placeSignificance.length > 0 && (
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Personal significance</p>
                      <div className="flex flex-wrap gap-1.5">
                        {placeSignificance.map(sig => (
                          <span key={sig} className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300">
                            {formatPlaceSignificance(sig)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {placeTags.length > 0 && (
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Place tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {placeTags.map(tag => (
                          <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {location.purpose && location.purpose.length > 0 && (
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Purpose
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {location.purpose.map(purpose => (
                      <span key={purpose} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        {purpose}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stat row */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                {[
                  { label: 'Visits',      value: location.visitCount,                        icon: Calendar },
                  { label: 'First visit', value: fmt(location.firstVisited),                 icon: Clock },
                  { label: 'Last visit',  value: fmt(location.lastVisited),                  icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg sm:rounded-xl bg-white/4 border border-white/8 p-2 sm:p-3 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
                      <Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-teal-400 shrink-0" />
                      <span className="text-[9px] sm:text-[10px] text-white/40 uppercase tracking-wider truncate">{label}</span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-white truncate">
                      {value === '—' ? <UnknownField compact label={label} /> : value}
                    </p>
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
              <div className="rounded-xl bg-teal-500/8 border border-teal-500/15 px-4 py-3">
                <p className="text-xs font-semibold text-teal-200">Verified character links only</p>
                <p className="text-xs text-white/40 mt-1">
                  People shown here resolve to confirmed Character Book IDs. Raw extracted names are hidden until verified.
                </p>
              </div>
              {verifiedPeople.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="h-10 w-10 mx-auto mb-3 text-white/15" />
                  <p className="text-sm font-medium text-white/40">No verified people linked yet</p>
                </div>
              ) : (
                verifiedPeople.map(person => (
                  <div key={person.id} className="flex items-center justify-between rounded-xl bg-white/4 border border-white/8 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-teal-500/15 border border-teal-500/20 flex items-center justify-center text-xs font-bold text-teal-300">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-white">{person.name}</span>
                        {person.relationship_type && (
                          <p className="text-[10px] text-teal-300/55 capitalize">{person.relationship_type.replace(/_/g, ' ')}</p>
                        )}
                      </div>
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
            <div className="space-y-3 sm:space-y-5">
              {a ? (
                <>
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { label: 'Importance',  value: a.importance_score,  color: 'text-amber-400' },
                      { label: 'Frequency',   value: a.visit_frequency,   color: 'text-blue-400'  },
                      { label: 'Comfort',     value: a.comfort_score,     color: 'text-emerald-400' },
                      { label: 'Productivity', value: a.productivity_score, color: 'text-purple-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg sm:rounded-xl bg-white/4 border border-white/8 p-2 sm:p-3 text-center min-w-0">
                        <p className={`text-lg sm:text-2xl font-bold tabular-nums ${color}`}>{value}%</p>
                        <p className="text-[9px] sm:text-[10px] text-white/40 mt-0.5 truncate">{label}</p>
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

          {/* ── CHAT ── */}
          {activeTab === 'chat' && (
            <div className="flex flex-col flex-1 min-h-0 h-full" data-testid="location-chat-panel">
              <div className="flex-shrink-0 px-3 sm:px-0 pt-1 pb-2 sm:pb-3 border-b border-white/8 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-teal-500/30 text-teal-200 hover:bg-teal-500/10 text-xs sm:text-sm h-9"
                  onClick={() => openLocationMainChat()}
                >
                  <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Open main chat with focus
                </Button>
                <p className="text-[11px] sm:text-xs text-white/40 hidden sm:block">
                  Quick questions about {location.name} — or open main chat for a full thread.
                </p>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-0 py-2 sm:py-3 space-y-2 sm:space-y-3"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {chatMessages.length === 0 ? (
                  <div className="text-center py-6 sm:py-10 text-white/50 px-2">
                    <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10 mx-auto mb-2 opacity-40 text-teal-400" />
                    <p className="text-sm text-white/60">Ask about visits, people, or memories here</p>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      message={{ id: `msg-${i}`, role: msg.role, content: msg.content, timestamp: msg.timestamp }}
                    />
                  ))
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              <div
                className="flex-shrink-0 border-t border-white/10 bg-black/80 backdrop-blur-sm"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
              >
                <ChatComposer
                  variant="embedded"
                  placeholder={`Ask about ${location.name}…`}
                  onSubmit={handleChatSubmit}
                  loading={chatLoading}
                />
              </div>
            </div>
          )}

          {/* ── DELETE ── */}
          {activeTab === 'delete' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/25 bg-red-950/20 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white">Delete this place</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/60">
                      This removes the place card and detaches it from linked events, facts, people, and recall caches. The system records the deletion so the same wrong place is less likely to come back.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">Memories</p>
                  <p className="mt-1 text-sm font-semibold text-white">{location.entries.length}</p>
                  <p className="mt-1 text-[11px] text-white/40">Source memories stay saved.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">People</p>
                  <p className="mt-1 text-sm font-semibold text-white">{verifiedPeople.length}</p>
                  <p className="mt-1 text-[11px] text-white/40">Verified links are removed.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">Knowledge</p>
                  <p className="mt-1 text-sm font-semibold text-white">{locationFacts.length}</p>
                  <p className="mt-1 text-[11px] text-white/40">Facts are preserved as deletion context.</p>
                </div>
              </div>

              {deleteStep === 'review' ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-2" htmlFor="location-delete-reason">
                      Why are you deleting it?
                    </label>
                    <select
                      id="location-delete-reason"
                      value={deleteReason}
                      onChange={(event) => setDeleteReason(event.target.value)}
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white"
                    >
                      <option value="wrong_place_or_not_relevant">Wrong place or not relevant</option>
                      <option value="duplicate_location">Duplicate location</option>
                      <option value="not_a_real_location">Not a real location</option>
                      <option value="private_or_sensitive">Private or sensitive</option>
                      <option value="cleanup_requested_by_user">Manual cleanup</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-red-500/30 text-red-200 hover:bg-red-500/10"
                    onClick={() => setDeleteStep('confirm')}
                    disabled={!onLocationDeleted}
                  >
                    Continue to confirmation
                  </Button>
                  {!onLocationDeleted && (
                    <p className="text-xs text-white/40">
                      Deletion is unavailable from this view.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-red-500/25 bg-black/30 p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-2" htmlFor="location-delete-confirm">
                      Type <span className="font-bold text-white">{location.name}</span> to confirm
                    </label>
                    <input
                      id="location-delete-confirm"
                      value={deleteConfirmText}
                      onChange={(event) => setDeleteConfirmText(event.target.value)}
                      className="h-10 w-full rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white outline-none focus:border-red-400"
                      autoComplete="off"
                    />
                  </div>
                  {deleteError && (
                    <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {deleteError}
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 text-white/70 hover:bg-white/10"
                      onClick={() => {
                        setDeleteStep('review');
                        setDeleteConfirmText('');
                        setDeleteError(null);
                      }}
                      disabled={deleting}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="bg-red-600 text-white hover:bg-red-500"
                      onClick={() => void handleDeleteLocation()}
                      disabled={deleting || deleteConfirmText.trim() !== location.name}
                    >
                      {deleting ? 'Deleting...' : 'Delete place'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

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
