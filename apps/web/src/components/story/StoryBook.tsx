import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Compass,
  GitBranch,
  Heart,
  Home,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';

type Chapter = {
  title: string;
  summary: string;
  dominantTheme: string;
  confidence: number;
  evidenceCount: number;
  evidence: Array<{ label: string; source: string }>;
};

type Arc = {
  id: string;
  title: string;
  category: string;
  status: string;
  momentum: string;
  confidence: number;
  evidence: Array<{ label: string }>;
};

type TurningPoint = {
  id: string;
  title: string;
  date: string | null;
  kind: string;
  importance: number;
};

type Health = {
  coverage: number;
  orphanEventCount: number;
  unresolvedEntityCount: number;
  unsupportedConclusionCount: number;
  confidenceDistribution: { low: number; medium: number; high: number };
};

type StoryPayload = {
  success: boolean;
  ir: {
    generatedAt: string;
    currentChapter: Chapter;
    activeArcs: Arc[];
    dormantArcs: Arc[];
    turningPoints: TurningPoint[];
    goals: Array<{ id: string; title: string; status: string }>;
    projects: Array<{ id: string; name: string }>;
    relationships: Array<{ id: string; name: string; role: string }>;
    family: { householdCount: number; memberCount: number; groupCount: number };
    scenes: Array<{ title: string; cues: string[] }>;
    provenance: { confidence: number; why: string };
  };
};

type HealthPayload = { success: boolean; health: Health };
type BookPayload = {
  success: boolean;
  outline: { title: string; kind: string; chapters: Array<{ title: string; summary: string }> };
};

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/70">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function StoryBook() {
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<StoryPayload['ir'] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [book, setBook] = useState<BookPayload['outline'] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storyRes, healthRes, bookRes] = await Promise.all([
        fetchJson<StoryPayload>('/api/story'),
        fetchJson<HealthPayload>('/api/story/health'),
        fetchJson<BookPayload>('/api/story/book-outline?kind=autobiography'),
      ]);
      if (storyRes.success) setStory(storyRes.ir);
      if (healthRes.success) setHealth(healthRes.health);
      if (bookRes.success) setBook(bookRes.outline);
    } catch {
      setStory(null);
      setHealth(null);
      setBook(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'story'), [load]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Compiling your story…
      </div>
    );
  }

  if (!story) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
        Story compilation is warming up. Add journal entries, goals, and relationships to seed your narrative.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Story Dashboard</h1>
        <p className="mt-1 text-sm text-white/50">
          Narrative IR · compiled {new Date(story.generatedAt).toLocaleString()}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Current Chapter" icon={BookOpen}>
          <h3 className="text-lg font-semibold text-white">{story.currentChapter.title}</h3>
          <p className="mt-2 text-sm text-white/70">{story.currentChapter.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-primary/20 px-2 py-1 text-primary">
              {story.currentChapter.dominantTheme}
            </span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-white/60">
              {Math.round(story.currentChapter.confidence * 100)}% confidence
            </span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-white/60">
              {story.currentChapter.evidenceCount} evidence
            </span>
          </div>
          {story.currentChapter.evidence.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-white/50">
              {story.currentChapter.evidence.slice(0, 4).map((e, i) => (
                <li key={i}>· {e.label} <span className="text-white/30">({e.source})</span></li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Story Health" icon={TrendingUp}>
          {health ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-white/50">Coverage</p>
                <p className="text-xl font-semibold text-white">{Math.round(health.coverage * 100)}%</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-white/50">Orphan events</p>
                <p className="text-xl font-semibold text-white">{health.orphanEventCount}</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-white/50">Unresolved entities</p>
                <p className="text-xl font-semibold text-white">{health.unresolvedEntityCount}</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <p className="text-white/50">Low-confidence arcs</p>
                <p className="text-xl font-semibold text-white">{health.unsupportedConclusionCount}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/50">Health metrics unavailable.</p>
          )}
          <p className="mt-3 text-xs text-white/40">{story.provenance.why}</p>
        </Section>
      </div>

      <Section title="Active Arcs" icon={GitBranch}>
        {story.activeArcs.length === 0 ? (
          <p className="text-sm text-white/50">No active arcs yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {story.activeArcs.map((arc) => (
              <div key={arc.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-white">{arc.title}</h4>
                  <span className="text-xs text-white/40">{arc.momentum}</span>
                </div>
                <p className="mt-1 text-xs text-white/50">{arc.category} · {arc.status}</p>
                <p className="mt-2 text-xs text-primary">{Math.round(arc.confidence * 100)}% confidence</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Turning Points" icon={Zap}>
          {story.turningPoints.length === 0 ? (
            <p className="text-sm text-white/50">No turning points detected yet.</p>
          ) : (
            <ul className="space-y-2">
              {story.turningPoints.slice(0, 8).map((tp) => (
                <li key={tp.id} className="flex justify-between gap-2 text-sm">
                  <span className="text-white">{tp.title}</span>
                  <span className="shrink-0 text-white/40">{tp.date?.slice(0, 10) ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Scenes" icon={Sparkles}>
          {story.scenes.length === 0 ? (
            <p className="text-sm text-white/50">Scenes will emerge as patterns repeat.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {story.scenes.map((s, i) => (
                <li key={i} className="text-white/80">
                  {s.title}
                  <span className="ml-2 text-xs text-white/40">{s.cues.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Section title="Relationships" icon={Heart}>
          <ul className="space-y-1 text-sm text-white/70">
            {story.relationships.slice(0, 6).map((r) => (
              <li key={r.id}>{r.name} <span className="text-white/40">({r.role})</span></li>
            ))}
          </ul>
        </Section>
        <Section title="Family" icon={Home}>
          <p className="text-sm text-white/70">
            {story.family.memberCount} members · {story.family.householdCount} households · {story.family.groupCount} groups
          </p>
        </Section>
        <Section title="Goals & Projects" icon={Target}>
          <p className="text-xs text-white/50 mb-2">Goals</p>
          <ul className="mb-3 space-y-1 text-sm text-white/70">
            {story.goals.slice(0, 4).map((g) => (
              <li key={g.id}>{g.title}</li>
            ))}
          </ul>
          <p className="text-xs text-white/50 mb-2">Projects</p>
          <ul className="space-y-1 text-sm text-white/70">
            {story.projects.slice(0, 4).map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </Section>
      </div>

      {book && (
        <Section title="Book Draft" icon={Compass}>
          <h3 className="font-semibold text-white">{book.title}</h3>
          <ol className="mt-3 space-y-2 text-sm text-white/70">
            {book.chapters.slice(0, 6).map((ch, i) => (
              <li key={i}>
                <span className="text-white">{ch.title}</span>
                {ch.summary && <span className="block text-xs text-white/40">{ch.summary}</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
