import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { CalendarRange, PenLine, PlusCircle, Search as SearchIcon, Wand2 } from 'lucide-react';
import { config } from '../config/env';

import { AuthGate } from '../components/AuthGate';
import { SkipLink } from '../components/SkipLink';
import { AgentPanel } from '../components/AgentPanel';
import { ChaptersList } from '../components/ChaptersList';
import { ChapterViewer } from '../components/ChapterViewer';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { EntryList } from '../components/EntryList';
import { EvolutionPanel } from '../components/EvolutionPanel';
import { MemoryExplorer } from '../components/memory-explorer/MemoryExplorer';
import { Logo } from '../components/Logo';
import { MemoryTimeline } from '../components/MemoryTimeline';
import { Sidebar } from '../components/Sidebar';
import { TagCloud } from '../components/TagCloud';
import { TaskEnginePanel } from '../components/TaskEnginePanel';
import { TimelinePanel } from '../components/TimelinePanel';
import { CharacterPage } from '../components/characters/CharacterPage';
import { useLoreKeeper } from '../hooks/useLoreKeeper';
import { useTaskEngine } from '../hooks/useTaskEngine';
import { fetchJson } from '../lib/api';
import { Button } from '../components/ui/button';
import { ChatFirstInterface } from '../components/chat/ChatFirstInterface';
import { CharacterBook } from '../components/characters/CharacterBook';
import { Locations } from '../components/locations/Locations';
import { ImprovedTimelineView } from '../components/timeline/ImprovedTimelineView';
import { BiographyEditor } from '../components/biography/BiographyEditor';
import { LoreBook } from '../components/lorebook/LoreBook';
import { ChapterCreationChatbot } from '../components/chapters/ChapterCreationChatbot';
import { TimelineHierarchyPanel } from '../components/timeline-hierarchy/TimelineHierarchyPanel';
import { TimelinePage } from '../components/timeline/TimelinePage';
import { SubscriptionManagement } from '../components/subscription/SubscriptionManagement';
import { TrialBanner } from '../components/subscription/TrialBanner';
import { PricingPage } from '../components/subscription/PricingPage';
import { PrivacySecurityPage } from '../components/security/PrivacySecurityPage';
import { PrivacySettings } from '../components/security/PrivacySettings';
import { PrivacyPolicy } from '../components/security/PrivacyPolicy';
import { DiscoveryHub } from '../components/discovery/DiscoveryHub';
import { ContinuityDashboard } from '../components/continuity/ContinuityDashboard';
import { GuestBanner } from '../components/guest/GuestBanner';
import { getSurfaceFromRoute } from '../utils/routeMapping';

const formatRange = (days = 7) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label: `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`
  };
};

type SurfaceKey = 'chat' | 'timeline' | 'search' | 'characters' | 'locations' | 'memoir' | 'lorebook' | 'subscription' | 'pricing' | 'security' | 'privacy-settings' | 'privacy-policy' | 'discovery' | 'continuity';

interface AppContentProps {
  defaultSurface?: SurfaceKey;
}

const AppContent = ({ defaultSurface }: AppContentProps) => {
  const {
    entries,
    timeline,
    tags,
    answer,
    askLoreKeeper,
    createEntry,
    createChapter,
    chapters,
    chapterCandidates,
    summarizeChapter,
    summarize,
    loading,
    refreshEntries,
    refreshTimeline,
    refreshChapters,
    timelineCount,
    semanticSearch,
    searchResults,
    uploadVoiceEntry,
    evolution,
    refreshEvolution
  } = useLoreKeeper();
  const {
    tasks: taskList,
    events: taskEvents,
    briefing: taskBriefing,
    createTask,
    completeTask,
    deleteTask,
    processChat,
    syncMicrosoft
  } = useTaskEngine();
  const [summary, setSummary] = useState('');
  const [rangeLabel, setRangeLabel] = useState(formatRange().label);
  const [lastPrompt, setLastPrompt] = useState('');
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [semantic, setSemantic] = useState(true);
  const [persona, setPersona] = useState('The Archivist');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSurface, setActiveSurface] = useState<SurfaceKey>(defaultSurface || 'chat');
  const [insights, setInsights] = useState<any>(null);

  // Sync route → surface (handles browser back/forward and direct navigation)
  useEffect(() => {
    const surfaceFromRoute = getSurfaceFromRoute(location.pathname);
    if (surfaceFromRoute !== activeSurface) {
      setActiveSurface(surfaceFromRoute);
    }
  }, [location.pathname]);

  // Also sync when defaultSurface prop changes (from route params)
  useEffect(() => {
    if (defaultSurface && defaultSurface !== activeSurface) {
      setActiveSurface(defaultSurface);
    }
  }, [defaultSurface]);

  // Listen for navigation events from subscription components
  useEffect(() => {
    const handleNavigate = (e: CustomEvent) => {
      if (e.detail?.surface) {
        setActiveSurface(e.detail.surface as SurfaceKey);
      }
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, []);
  const [devMode, setDevMode] = useState(false);
  const [showChapterChatbot, setShowChapterChatbot] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      meta: true,
      handler: () => {
        navigate('/search');
        setActiveSurface('search');
        // Focus search input if it exists
        setTimeout(() => {
          const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
          searchInput?.focus();
        }, 100);
      },
      description: 'Open search'
    },
    {
      key: 'n',
      meta: true,
      handler: () => {
        // Switch to timeline and focus on entry creation
        navigate('/timeline');
        setActiveSurface('timeline');
        // Try to focus on entry composer if it exists
        setTimeout(() => {
          const textarea = document.querySelector('textarea[placeholder*="memory" i], textarea[placeholder*="entry" i]') as HTMLTextAreaElement;
          textarea?.focus();
        }, 100);
      },
      description: 'New entry'
    }
  ]);

  const handleSummary = async () => {
    setGeneratingSummary(true);
    try {
      const range = formatRange();
      const data = await summarize(range.from, range.to);
      setSummary(data.summary);
      setRangeLabel(range.label);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };


  const handleQuickCorrection = async () => {
    const entryId = prompt('Which entry needs a correction? (Provide entry ID)');
    if (!entryId) return;
    const correctedContent = prompt('Paste the corrected content');
    if (!correctedContent) return;
    try {
      await fetchJson(`/api/corrections/${entryId}`, {
        method: 'POST',
        body: JSON.stringify({ correctedContent })
      });
      await Promise.all([refreshEntries(), refreshTimeline()]);
      alert('Correction captured and ladder updated.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to save correction');
    }
  };



  const visibleEntries = useMemo(() => (searchResults.length ? searchResults : entries).slice(0, 8), [entries, searchResults]);

  const renderTimelineSurface = () => (
    <ImprovedTimelineView
      timeline={timeline}
      chapters={chapters}
      chapterCandidates={chapterCandidates}
      tags={tags}
      taskList={taskList}
      taskEvents={taskEvents}
      taskBriefing={taskBriefing}
      loading={loading}
      onCreateChapter={() => setShowChapterChatbot(true)}
      onSummarizeChapter={async (chapterId) => {
        await summarizeChapter(chapterId);
        await Promise.all([refreshTimeline(), refreshChapters()]);
      }}
      onCreateTask={(payload) => createTask(payload)}
      onCompleteTask={completeTask}
      onDeleteTask={deleteTask}
      onProcessChat={processChat}
      onSyncMicrosoft={syncMicrosoft}
      onRefreshChapters={refreshChapters}
    />
  );

  const renderSearchSurface = () => (
    <div className="h-full">
      <MemoryExplorer />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <SkipLink />
      <Sidebar
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
        onCreateChapter={() => setShowChapterChatbot(true)}
        onToggleDevMode={() => setDevMode((prev) => !prev)}
        devModeEnabled={devMode}
      />
      <main id="main-content" className="flex-1 space-y-6 p-6 text-white overflow-x-hidden" role="main">
        <header className="flex items-center justify-between rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-4 shadow-panel">
          <div>
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-sm text-white/60">{entries.length} memories · {chapters.length} chapters</p>
          </div>
        </header>

        <GuestBanner />
        <TrialBanner />

        {activeSurface === 'chat' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)]">
            <ChatFirstInterface />
          </div>
        )}
        {activeSurface === 'timeline' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)] overflow-hidden">
            <TimelinePage />
          </div>
        )}
        {activeSurface === 'search' && renderSearchSurface()}
        {activeSurface === 'characters' && <CharacterBook />}
        {activeSurface === 'locations' && <Locations />}
        {activeSurface === 'memoir' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-12rem)]">
            <BiographyEditor />
          </div>
        )}
        {activeSurface === 'lorebook' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)]">
            <LoreBook />
          </div>
        )}
        {activeSurface === 'subscription' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] p-6">
            <TrialBanner />
            <SubscriptionManagement />
          </div>
        )}
        {activeSurface === 'pricing' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] overflow-auto">
            <PricingPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'security' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] overflow-auto p-6">
            <PrivacySecurityPage onSurfaceChange={(surface) => setActiveSurface(surface as SurfaceKey)} />
          </div>
        )}
        {activeSurface === 'privacy-settings' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] overflow-auto p-6">
            <PrivacySettings onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'privacy-policy' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] overflow-auto p-6">
            <PrivacyPolicy onBack={() => setActiveSurface('security')} />
          </div>
        )}
        {activeSurface === 'discovery' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)] overflow-auto p-6">
            <DiscoveryHub />
          </div>
        )}

        {/* Hide dev mode panel in production */}
        {!config.env.isProduction && devMode && (
          <div className="space-y-4 rounded-2xl border border-primary/40 bg-black/40 p-4 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-primary/70">Developer Diagnostics</p>
                <p className="text-sm text-white/70">Raw fabric edges, agent logs, and embedding inspector.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDevMode(false)}>
                Hide
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AgentPanel />
            </div>
          </div>
        )}


        {/* Chapter Creation Chatbot */}
        <ChapterCreationChatbot
          isOpen={showChapterChatbot}
          onClose={() => setShowChapterChatbot(false)}
          onCreateChapter={async (payload) => {
            await createChapter(payload);
            await Promise.all([refreshEntries(), refreshTimeline(), refreshChapters()]);
          }}
        />
      </main>
    </div>
  );
};

interface AppProps {
  defaultSurface?: SurfaceKey;
}

const App = ({ defaultSurface }: AppProps) => (
  <AppContent defaultSurface={defaultSurface} />
);

export default App;
