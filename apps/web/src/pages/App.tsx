import { useState } from 'react';
import { CalendarRange, Search, Wand2 } from 'lucide-react';

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
    uploadVoiceEntry
  } = useLoreKeeper();
  const [summary, setSummary] = useState('');
  const [rangeLabel, setRangeLabel] = useState(formatRange().label);
  const [lastPrompt, setLastPrompt] = useState('');
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [chapterSummary, setChapterSummary] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [semantic, setSemantic] = useState(true);
  const [persona, setPersona] = useState('The Archivist');
  const [reflecting, setReflecting] = useState(false);

  const handleSummary = async () => {
    const range = formatRange();
    const data = await summarize(range.from, range.to);
    setSummary(data.summary);
    setRangeLabel(range.label);
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <Sidebar />
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
                await createEntry(content, { chapter_id: options?.chapterId ?? null, metadata: options?.metadata });
                await Promise.all([refreshEntries(), refreshTimeline()]);
              }}
              onAsk={async (content) => {
                setLastPrompt(content);
                await askLoreKeeper(content, persona);
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
        <div className="grid gap-6 lg:grid-cols-2">
          <ChatPanel
            answer={answer}
            loading={loading}
            persona={persona}
            onPersonaChange={setPersona}
            onRefresh={() => {
              if (lastPrompt) askLoreKeeper(lastPrompt, persona);
            }}
          />
          <div className="rounded-2xl border border-border/60 bg-black/40 p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-white/50">Summaries</p>
                <h3 className="text-lg font-semibold">Weekly Debrief</h3>
                <p className="text-xs text-white/40">{rangeLabel}</p>
              </div>
              <Button size="sm" variant="ghost" leftIcon={<CalendarRange className="h-4 w-4" />} onClick={handleSummary}>
                Generate
              </Button>
            </div>
            <p className="mt-4 text-sm text-white/80">
              {summary || 'Generate a summary to see your latest milestones compacted into lore.'}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-white/50">Reflect Mode</p>
                <p className="text-xs text-white/40">Ask for advice on this month.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Wand2 className="h-4 w-4" />}
                disabled={reflecting}
                onClick={async () => {
                  const now = new Date();
                  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  setReflecting(true);
                  try {
                    await reflect({ mode: 'month', month: monthKey, persona });
                  } finally {
                    setReflecting(false);
                  }
                }}
              >
                {reflecting ? 'Reflecting…' : 'Reflect'}
              </Button>
            </div>
            {reflection && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white/80">
                <p className="text-xs uppercase text-primary/70">Insight</p>
                <p className="mt-2 whitespace-pre-line">{reflection}</p>
              </div>
            )}
            {chapterSummary && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white/80">
                <p className="text-xs uppercase text-primary/70">Chapter Summary</p>
                <p className="mt-2">{chapterSummary}</p>
              </div>
            )}
          </div>
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
