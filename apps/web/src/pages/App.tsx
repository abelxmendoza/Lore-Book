import { useMemo, useRef, useState } from 'react';
import { CalendarRange, PenLine, PlusCircle, Search as SearchIcon, Wand2 } from 'lucide-react';

import { AuthGate } from '../components/AuthGate';
import { AutopilotPanel } from '../components/AutopilotPanel';
import { AgentPanel } from '../components/AgentPanel';
import { ChaptersList } from '../components/ChaptersList';
import { ChapterViewer } from '../components/ChapterViewer';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { EntryList } from '../components/EntryList';
import { EvolutionPanel } from '../components/EvolutionPanel';
import { HQIPanel } from '../components/hqi/HQIPanel';
import { IdentityPulsePanel } from '../components/identity/IdentityPulsePanel';
import { InsightsPanel } from '../components/InsightsPanel';
import { Logo } from '../components/Logo';
import { MemoryFabricPanel } from '../components/fabric/MemoryFabricPanel';
import { MemoryTimeline } from '../components/MemoryTimeline';
import { SagaScreen } from '../components/saga/SagaScreen';
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
import { ImprovedTimelineView } from '../components/timeline/ImprovedTimelineView';
import { MemoirEditor } from '../components/memoir/MemoirEditor';
import { LoreBook } from '../components/lorebook/LoreBook';
import { PopulateDummyData } from '../components/dev/PopulateDummyData';
import { ChapterCreationChatbot } from '../components/chapters/ChapterCreationChatbot';
import { TimelineHierarchyPanel } from '../components/timeline-hierarchy/TimelineHierarchyPanel';

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

type SurfaceKey = 'chat' | 'timeline' | 'search' | 'characters' | 'memoir' | 'lorebook';



const AppContent = () => {
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
  const [activeSurface, setActiveSurface] = useState<SurfaceKey>('chat');
  const [insights, setInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState({
    identity: false,
    characters: false,
    saga: false,
    continuity: false,
    fabric: false,
    insights: false,
    autopilot: false
  });

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await fetchJson<{ insights?: any }>('/api/insights/recent');
      setInsights(result.insights || result);
    } catch (error) {
      console.error('Failed to load insights:', error);
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [showChapterChatbot, setShowChapterChatbot] = useState(false);
  const discoveryRef = useRef<HTMLDivElement | null>(null);

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


  const togglePanel = (panel: keyof typeof panelsOpen) => {
    setPanelsOpen((prev) => ({ ...prev, [panel]: !prev[panel] }));
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
    <div className="space-y-6">
      <HQIPanel />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <Sidebar
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
        onCreateChapter={() => setShowChapterChatbot(true)}
        onScrollToDiscovery={() => discoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onToggleDevMode={() => setDevMode((prev) => !prev)}
        devModeEnabled={devMode}
      />
      <main className="flex-1 space-y-6 p-6 text-white overflow-x-hidden">
        <header className="flex items-center justify-between rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-4 shadow-panel">
          <div>
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-sm text-white/60">{entries.length} memories · {chapters.length} chapters</p>
          </div>
          <div className="flex items-center gap-2">
            <PopulateDummyData compact onSuccess={() => {
              refreshEntries();
              refreshChapters();
              refreshTimeline();
            }} />
            <Button
              size="sm"
              variant={showDiscovery ? 'default' : 'outline'}
              onClick={() => setShowDiscovery(!showDiscovery)}
            >
              {showDiscovery ? 'Hide' : 'Show'} Discovery
            </Button>
          </div>
        </header>

        {activeSurface === 'chat' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)]">
            <ChatFirstInterface />
          </div>
        )}
        {activeSurface === 'timeline' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)] overflow-hidden">
            <TimelineHierarchyPanel />
          </div>
        )}
        {activeSurface === 'search' && renderSearchSurface()}
        {activeSurface === 'characters' && <CharacterBook />}
        {activeSurface === 'memoir' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)] overflow-y-auto">
            <MemoirEditor />
          </div>
        )}
        {activeSurface === 'lorebook' && (
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel min-h-[calc(100vh-4rem)]">
            <LoreBook />
          </div>
        )}

        {showDiscovery && (
          <section ref={discoveryRef} className="space-y-4 rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Discovery Hub</h2>
                <p className="text-sm text-white/60">Explore insights, characters, continuity, and more</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowDiscovery(false)}>
                Hide
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['identity', 'Identity'],
                  ['characters', 'Characters'],
                  ['saga', 'Saga'],
                  ['fabric', 'Fabric'],
                  ['insights', 'Insights'],
                  ['autopilot', 'Autopilot']
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={panelsOpen[key] ? 'default' : 'outline'}
                  onClick={() => togglePanel(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {(Object.values(panelsOpen).some(Boolean)) && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {panelsOpen.identity && <IdentityPulsePanel />}
                {panelsOpen.characters && <CharacterBook />}
                {panelsOpen.saga && <SagaScreen />}
                {panelsOpen.fabric && <MemoryFabricPanel />}
                {panelsOpen.insights && (
                  <InsightsPanel
                    insights={insights}
                    loading={insightsLoading}
                    onRefresh={loadInsights}
                  />
                )}
                {panelsOpen.autopilot && <AutopilotPanel />}
              </div>
            )}
          </section>
        )}

        {devMode && (
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
              <PopulateDummyData />
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

const App = () => (
  <AuthGate>
    <AppContent />
  </AuthGate>
);

export default App;
