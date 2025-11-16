import { useState } from 'react';
import { CalendarRange, PenLine, PlusCircle, Search, Wand2 } from 'lucide-react';

import { AuthGate } from '../components/AuthGate';
import { ChatPanel } from '../components/ChatPanel';
import { EntryList } from '../components/EntryList';
import { JournalComposer } from '../components/JournalComposer';
import { Logo } from '../components/Logo';
import { Sidebar } from '../components/Sidebar';
import { TagCloud } from '../components/TagCloud';
import { TimelinePanel } from '../components/TimelinePanel';
import { useLoreKeeper } from '../hooks/useLoreKeeper';
import { Button } from '../components/ui/button';
import { ChaptersList } from '../components/ChaptersList';
import { CreateChapterModal } from '../components/CreateChapterModal';
import { EvolutionPanel } from '../components/EvolutionPanel';
import { ChapterViewer } from '../components/ChapterViewer';
import { MemoryTimeline } from '../components/MemoryTimeline';
import { fetchJson } from '../lib/api';
import { TaskEnginePanel } from '../components/TaskEnginePanel';
import { useTaskEngine } from '../hooks/useTaskEngine';

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
    reflect,
    reflection,
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
  const [chapterSummary, setChapterSummary] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [semantic, setSemantic] = useState(true);
  const [persona, setPersona] = useState('The Archivist');
  const [reflecting, setReflecting] = useState(false);
  const [activeTab, setActiveTab] = useState<'log' | 'timeline'>('log');
  const [generatingSummary, setGeneratingSummary] = useState(false);

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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <Sidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCreateChapter={() => setChapterModalOpen(true)}
        onScrollToComposer={scrollToComposer}
      />
      <main className="flex-1 space-y-6 p-6 text-white">
        <header className="rounded-2xl border border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Logo size="lg" showText={false} className="mb-4" />
              <p className="text-xs uppercase text-white/60">Timeline Intelligence</p>
              <h1 className="mt-1 text-3xl font-semibold">Welcome back, Archivist</h1>
            </div>
            <div className="rounded-xl border border-primary/50 px-4 py-2 text-sm text-white/70">
              Total Memories · {entries.length}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-sm text-white/60">
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
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
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
            <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <Search className="h-4 w-4 text-primary" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Ask for robotics last year or heartbreak entries..."
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
            <EntryList entries={(searchResults.length ? searchResults : entries).slice(0, 8)} />
          </div>
          <div className="space-y-6">
            <TimelinePanel timeline={timeline} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={activeTab === 'log' ? 'default' : 'outline'} onClick={() => setActiveTab('log')} size="sm">
            Memory Log
          </Button>
          <Button variant={activeTab === 'timeline' ? 'default' : 'outline'} onClick={() => setActiveTab('timeline')} size="sm">
            Timeline
          </Button>
        </div>
        {activeTab === 'log' ? (
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
              <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <Search className="h-4 w-4 text-primary" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Ask for robotics last year or heartbreak entries..."
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
              <EntryList entries={(searchResults.length ? searchResults : entries).slice(0, 8)} />
            </div>
            <div className="space-y-6">
              <TimelinePanel timeline={timeline} />
              <ChaptersList
                timeline={timeline}
                onCreateClick={() => setChapterModalOpen(true)}
                onSummarize={async (chapterId) => {
                  const summaryText = await summarizeChapter(chapterId);
                  setChapterSummary(summaryText);
                  await Promise.all([refreshTimeline(), refreshChapters()]);
                }}
              />
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
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <TimelinePanel timeline={timeline} />
            <ChaptersList
              timeline={timeline}
              onCreateClick={() => setChapterModalOpen(true)}
              onSummarize={async (chapterId) => {
                const summaryText = await summarizeChapter(chapterId);
                setChapterSummary(summaryText);
                await Promise.all([refreshTimeline(), refreshChapters()]);
              }}
            />
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
          </div>
        )}
        <div className="grid gap-6 xl:grid-cols-3" data-chat-panel>
          <div className="xl:col-span-2">
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
                  throw error; // Re-throw to let ChatPanel handle display
                }
              }}
            />
          </div>
          <div className="space-y-6">
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
                  <p className="text-xs uppercase text-primary/70 mb-2">Summary</p>
                  <p className="whitespace-pre-line">{summary}</p>
                </div>
              )}
            </div>
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
            <ChapterViewer chapters={chapters} candidates={chapterCandidates} onRefresh={refreshChapters} />
          </div>
        </div>
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
