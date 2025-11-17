import { useMemo, useRef, useState } from 'react';
import { CalendarRange, PenLine, PlusCircle, Search as SearchIcon, Wand2 } from 'lucide-react';

import { AuthGate } from '../components/AuthGate';
import { AutopilotPanel } from '../components/AutopilotPanel';
import { AgentPanel } from '../components/AgentPanel';
import { ChatPanel } from '../components/ChatPanel';
import { ChaptersList } from '../components/ChaptersList';
import { ChapterViewer } from '../components/ChapterViewer';
import { ContinuityPanel } from '../components/ContinuityPanel';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { EntryList } from '../components/EntryList';
import { EvolutionPanel } from '../components/EvolutionPanel';
import { HQIPanel } from '../components/hqi/HQIPanel';
import { IdentityPulsePanel } from '../components/identity/IdentityPulsePanel';
import { InsightsPanel } from '../components/InsightsPanel';
import { JournalComposer } from '../components/JournalComposer';
import { Logo } from '../components/Logo';
import { MemoryFabricPanel } from '../components/fabric/MemoryFabricPanel';
import { MemoryTimeline } from '../components/MemoryTimeline';
import { SagaScreen } from '../components/saga/SagaScreen';
import { Sidebar } from '../components/Sidebar';
import { TagCloud } from '../components/TagCloud';
import { TaskEnginePanel } from '../components/TaskEnginePanel';
import { TimelinePanel } from '../components/TimelinePanel';
import { AccountSafetyPanel } from '../components/settings/AccountSafetyPanel';
import { CharacterPage } from '../components/characters/CharacterPage';
import { useLoreKeeper } from '../hooks/useLoreKeeper';
import { useTaskEngine } from '../hooks/useTaskEngine';
import { fetchJson } from '../lib/api';
import { Button } from '../components/ui/button';

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

type SurfaceKey = 'notebook' | 'timeline' | 'search';
type LayerKey = 'events' | 'tasks' | 'arcs' | 'seasons' | 'identity' | 'drift' | 'characters' | 'tags' | 'voice';

const surfaceTabs: { key: SurfaceKey; label: string; description: string }[] = [
  { key: 'notebook', label: 'Neon Notebook', description: 'Calm journaling with smart, contextual assists.' },
  { key: 'timeline', label: 'Omni Timeline', description: 'Layered life map with toggles for every signal.' },
  { key: 'search', label: 'HQI Explorer', description: 'Command bar search for memories, people, arcs, and motifs.' }
];

const layerLabels: Record<LayerKey, string> = {
  events: 'Events',
  tasks: 'Tasks',
  arcs: 'Arcs',
  seasons: 'Seasons',
  identity: 'Identity',
  drift: 'Drift Alerts',
  characters: 'Characters',
  tags: 'Tags',
  voice: 'Voice Memos'
};

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
  const [activeSurface, setActiveSurface] = useState<SurfaceKey>('notebook');
  const [layerVisibility, setLayerVisibility] = useState<Record<LayerKey, boolean>>({
    events: true,
    tasks: true,
    arcs: true,
    seasons: true,
    identity: true,
    drift: true,
    characters: true,
    tags: true,
    voice: false
  });
  const [panelsOpen, setPanelsOpen] = useState({
    identity: true,
    characters: true,
    saga: false,
    continuity: false,
    fabric: false,
    insights: true,
    autopilot: false
  });
  const [devMode, setDevMode] = useState(false);
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

  const scrollToComposer = () => {
    const composer = document.getElementById('journal-composer');
    composer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const toggleLayer = (layer: LayerKey) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };

  const togglePanel = (panel: keyof typeof panelsOpen) => {
    setPanelsOpen((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const visibleEntries = useMemo(() => (searchResults.length ? searchResults : entries).slice(0, 8), [entries, searchResults]);

  const renderNotebookSurface = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <SearchIcon className="h-4 w-4 text-primary" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search your memories or ask for a vibe check…"
              className="w-72 rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={semantic}
              onChange={(event) => setSemantic(event.target.checked)}
              className="h-4 w-4 rounded border-border/50 bg-black/60"
            />
            Semantic
          </label>
          <Button
            size="sm"
            onClick={() => searchTerm && semanticSearch(searchTerm, semantic)}
            leftIcon={<Wand2 className="h-4 w-4 text-primary" />}
          >
            Search
          </Button>
        </div>
        {searchResults.length > 0 && (
          <p className="mt-2 text-xs text-white/50">Showing {searchResults.length} semantic matches.</p>
        )}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1.1fr]">
        <div className="space-y-6">
          <div id="journal-composer">
            <JournalComposer
              loading={loading}
              chapters={chapters}
              onSave={async (content, options) => {
                try {
                  await createEntry(content, { chapter_id: options?.chapterId ?? null, metadata: options?.metadata });
                  await Promise.all([refreshEntries(), refreshTimeline()]);
                } catch (error) {
                  console.error('Failed to create entry:', error);
                  throw error;
                }
              }}
              onAsk={async (content) => {
                try {
                  setLastPrompt(content);
                  await askLoreKeeper(content, persona);
                } catch (error) {
                  console.error('Failed to ask Lore Keeper:', error);
                  throw error;
                }
              }}
              onVoiceUpload={async (file) => {
                await uploadVoiceEntry(file);
                await Promise.all([refreshEntries(), refreshTimeline()]);
              }}
            />
          </div>
          <EntryList entries={visibleEntries} />
          <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-white/50">Tag Cloud</p>
                <h3 className="text-lg font-semibold">Topics</h3>
              </div>
            </div>
            <div className="mt-4">
              <TagCloud tags={tags} />
            </div>
          </div>
          <AccountSafetyPanel />
        </div>
        <div className="space-y-6">
          <ChatPanel
            answer={answer}
            loading={loading}
            persona={persona}
            onPersonaChange={setPersona}
            onRefresh={() => {
              if (lastPrompt) askLoreKeeper(lastPrompt, persona);
            }}
            onAsk={async (message) => {
              try {
                setLastPrompt(message);
                await askLoreKeeper(message, persona);
              } catch (error) {
                console.error('Failed to ask Lore Keeper:', error);
                throw error;
              }
            }}
          />
          <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-white/50">Summaries</p>
                <h3 className="text-lg font-semibold">Weekly Debrief</h3>
                <p className="text-xs text-white/40">{rangeLabel}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<CalendarRange className="h-4 w-4" />}
                onClick={handleSummary}
                disabled={generatingSummary || loading}
              >
                {generatingSummary ? 'Generating...' : 'Generate'}
              </Button>
            </div>
            {summary && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-white/80">
                <p className="mb-2 text-xs uppercase text-primary/70">Summary</p>
                <p className="whitespace-pre-line">{summary}</p>
              </div>
            )}
          </div>
          <EvolutionPanel insights={evolution} loading={loading} onRefresh={refreshEvolution} />
        </div>
      </div>
    </div>
  );

  const renderTimelineSurface = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-white/50">Layer Toggles</p>
            <p className="text-sm text-white/70">Turn on the views you need for your current arc.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(layerVisibility) as LayerKey[]).map((layer) => (
              <Button
                key={layer}
                size="sm"
                variant={layerVisibility[layer] ? 'secondary' : 'outline'}
                onClick={() => toggleLayer(layer)}
              >
                {layerLabels[layer]}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {layerVisibility.events && <TimelinePanel timeline={timeline} />}
          {layerVisibility.arcs && (
            <ChaptersList
              timeline={timeline}
              onCreateClick={() => setChapterModalOpen(true)}
              onSummarize={async (chapterId) => {
                await summarizeChapter(chapterId);
                await Promise.all([refreshTimeline(), refreshChapters()]);
              }}
            />
          )}
          {layerVisibility.seasons && <MemoryTimeline />}
        </div>
        <div className="space-y-6">
          {layerVisibility.tasks && (
            <TaskEnginePanel
              tasks={taskList}
              events={taskEvents}
              briefing={taskBriefing}
              loading={loading}
              onCreate={(payload) => createTask(payload)}
              onComplete={completeTask}
              onDelete={deleteTask}
              onChatCommand={processChat}
              onSync={syncMicrosoft}
            />
          )}
          {layerVisibility.tags && (
            <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-white/50">Tag Cloud</p>
                  <h3 className="text-lg font-semibold">Topics</h3>
                </div>
              </div>
              <div className="mt-4">
                <TagCloud tags={tags} />
              </div>
            </div>
          )}
          {layerVisibility.identity && <IdentityPulsePanel />}
          {layerVisibility.characters && (
            <ChapterViewer chapters={chapters} candidates={chapterCandidates} onRefresh={refreshChapters} />
          )}
        </div>
      </div>
    </div>
  );

  const renderSearchSurface = () => (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-white/50">HQI Super Search</p>
            <h3 className="text-xl font-semibold">Command your memories</h3>
            <p className="text-sm text-white/60">Search returns memories, people, arcs, motifs, and related clusters.</p>
          </div>
          <Button onClick={() => searchTerm && semanticSearch(searchTerm, semantic)} leftIcon={<Wand2 className="h-4 w-4" />}>
            Run search
          </Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <HQIPanel />
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <SearchIcon className="h-4 w-4 text-primary" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="People, motifs, arcs, or moods…"
                  className="w-72 rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={semantic}
                  onChange={(event) => setSemantic(event.target.checked)}
                  className="h-4 w-4 rounded border-border/50 bg-black/60"
                />
                Semantic
              </label>
              <Button
                size="sm"
                onClick={() => searchTerm && semanticSearch(searchTerm, semantic)}
                leftIcon={<Wand2 className="h-4 w-4 text-primary" />}
              >
                Search
              </Button>
            </div>
            {searchResults.length > 0 && (
              <p className="mt-2 text-xs text-white/50">Showing {searchResults.length} semantic matches.</p>
            )}
          </div>
          <EntryList entries={visibleEntries} />
          <TimelinePanel timeline={timeline} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <Sidebar
        activeSurface={activeSurface}
        onSurfaceChange={setActiveSurface}
        onCreateChapter={() => setChapterModalOpen(true)}
        onScrollToComposer={scrollToComposer}
        onScrollToDiscovery={() => discoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onToggleDevMode={() => setDevMode((prev) => !prev)}
        devModeEnabled={devMode}
      />
      <main className="flex-1 space-y-6 p-6 text-white">
        <header className="rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Logo size="lg" showText={false} className="mb-4" />
              <p className="text-xs uppercase text-white/60">OmegaOS · Calm surface, intelligent depth</p>
              <h1 className="mt-1 text-3xl font-semibold">Welcome back, Archivist</h1>
            </div>
            <div className="rounded-xl border border-primary/50 px-4 py-2 text-sm text-white/70">
              Total Memories · {entries.length}
            </div>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-3 text-sm text-white/60">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary/70">Timeline Nodes</p>
              <p className="text-xl font-semibold text-white">{timelineCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-primary/70">Tracked Tags</p>
              <p className="text-xl font-semibold text-white">{tags.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-primary/70">Chapters</p>
              <p className="text-xl font-semibold text-white">{chapters.length}</p>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-white/60">Primary Surfaces</p>
              <p className="text-sm text-white/70">Journal, timeline, and HQI search stay upfront. Depth stays optional.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {surfaceTabs.map((tab) => (
                <Button
                  key={tab.key}
                  variant={activeSurface === tab.key ? 'default' : 'outline'}
                  onClick={() => setActiveSurface(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {surfaceTabs.map((tab) => (
              <div
                key={tab.key}
                className={`rounded-xl border px-3 py-3 text-sm transition ${
                  activeSurface === tab.key ? 'border-primary/60 bg-primary/10 text-white' : 'border-border/50 bg-black/40 text-white/70'
                }`}
              >
                <p className="font-semibold">{tab.label}</p>
                <p className="text-xs text-white/60">{tab.description}</p>
              </div>
            ))}
          </div>
        </div>

        {activeSurface === 'notebook' && renderNotebookSurface()}
        {activeSurface === 'timeline' && renderTimelineSurface()}
        {activeSurface === 'search' && renderSearchSurface()}

        <section ref={discoveryRef} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-white/60">Discovery Panels</p>
              <p className="text-sm text-white/70">Identity, characters, saga, continuity, fabric, insights, and autopilot live here.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['identity', 'Identity'],
                  ['characters', 'Characters'],
                  ['saga', 'Saga'],
                  ['continuity', 'Continuity'],
                  ['fabric', 'Fabric'],
                  ['insights', 'Insights'],
                  ['autopilot', 'Autopilot']
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={panelsOpen[key] ? 'secondary' : 'outline'}
                  onClick={() => togglePanel(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {panelsOpen.identity && <IdentityPulsePanel />}
            {panelsOpen.characters && <CharacterPage characterId="maya" />}
            {panelsOpen.saga && <SagaScreen />}
            {panelsOpen.continuity && <ContinuityPanel />}
            {panelsOpen.fabric && <MemoryFabricPanel />}
            {panelsOpen.insights && <InsightsPanel />}
            {panelsOpen.autopilot && <AutopilotPanel />}
          </div>
        </section>

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
            <AgentPanel />
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2">
          <Button size="lg" leftIcon={<PlusCircle className="h-4 w-4" />} onClick={scrollToComposer}>
            + New Entry
          </Button>
          <Button size="lg" variant="outline" leftIcon={<PenLine className="h-4 w-4" />} onClick={handleQuickCorrection}>
            + Correction
          </Button>
        </div>

        <CreateChapterModal
          open={chapterModalOpen}
          onClose={() => setChapterModalOpen(false)}
          onCreate={async (payload) => {
            const chapter = await createChapter(payload);
            await Promise.all([refreshTimeline(), refreshChapters()]);
            return chapter;
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
