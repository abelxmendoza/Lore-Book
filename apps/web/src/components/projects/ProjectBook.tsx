import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, GitMerge, Search as SearchIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { useProjectsBookData } from '../../store/hooks/useEntityBooks';
import { ProjectProfileCard, type ProjectCardData } from './ProjectProfileCard';
import { ProjectDetailModal } from './ProjectDetailModal';
import { DetectedProjectSuggestions } from './DetectedProjectSuggestions';
import { BookTrustSummary } from '../trust/BookTrustSummary';

interface DuplicateGroup {
  match_type: 'exact' | 'containment';
  canonical_name: string;
  projects: ProjectCardData[];
}

// Demo-mode sample projects so the Projects Book is populated without an account.
const DEMO_PROJECTS: ProjectCardData[] = [
  { id: 'demo-lorebook', name: 'LoreBook', type: 'software', status: 'active', description: 'Building the life-memory app — chat, books, and timeline.', tags: ['code', 'startup'], updated_at: new Date().toISOString(), metadata: { source: 'demo' } },
  { id: 'demo-amazon', name: 'Amazon Onboarding', type: 'career', status: 'active', description: 'Ramp-up at Amazon after the Clever Programmer bootcamp.', tags: ['career'], updated_at: new Date(Date.now() - 2 * 864e5).toISOString(), metadata: { source: 'demo' } },
  { id: 'demo-mma', name: 'MMA Training', type: 'fitness', status: 'paused', description: 'Striking and conditioning at the gym.', tags: ['health'], updated_at: new Date(Date.now() - 9 * 864e5).toISOString(), metadata: { source: 'demo' } },
  { id: 'demo-robotics', name: 'Robotics Build', type: 'hobby', status: 'completed', description: 'Weekend robotics project with the crew.', tags: ['robotics'], updated_at: new Date(Date.now() - 40 * 864e5).toISOString(), metadata: { source: 'demo' } },
];

const PAGE_SIZE = 9; // 3 × 3 grid on desktop

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

const TYPE_LABELS: Record<string, string> = {
  software: 'Software',
  business: 'Business',
  creative: 'Creative',
  fitness: 'Fitness',
  education: 'Education',
  career: 'Career',
  hobby: 'Hobby',
  project: 'Project',
};

const titleizeFilter = (value: string, labels: Record<string, string>) =>
  labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Projects Book — card grid + detail modal (Locations/Skills book pattern).
 */
export const ProjectBook = () => {
  const { data, loading, refetch, isMockEnabled: isMockDataEnabled } = useProjectsBookData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [newName, setNewName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<ProjectCardData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);

  const projects = useMemo((): ProjectCardData[] => {
    if (isMockDataEnabled) return DEMO_PROJECTS;
    return (data?.projects ?? []) as ProjectCardData[];
  }, [data, isMockDataEnabled]);

  useEffect(() => {
    if (isMockDataEnabled) {
      setDuplicateGroups([]);
      return;
    }
    setDuplicateGroups((data?.duplicate_groups ?? []) as DuplicateGroup[]);
  }, [data, isMockDataEnabled]);

  const load = async () => {
    setError(null);
    try {
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    }
  };

  // Available status / type filters, derived from the loaded projects (with counts).
  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const s = (p.status ?? 'active').toLowerCase();
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [projects]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const t = (p.type ?? 'project').toLowerCase();
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && (p.status ?? 'active').toLowerCase() !== statusFilter) return false;
      if (typeFilter !== 'all' && (p.type ?? 'project').toLowerCase() !== typeFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
    });
  }, [projects, search, statusFilter, typeFilter]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paginated = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart]
  );

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      await fetchJson('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
      setNewName('');
      setNotice(`Added "${name}".`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add project');
    }
  };

  const patchProject = async (id: string, patch: Partial<ProjectCardData>) => {
    const { project } = await fetchJson<{ project: ProjectCardData }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...project } : p)));
    setActive((prev) => (prev && prev.id === id ? { ...prev, ...project } : prev));
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const mergeInto = async (targetId: string, sourceIds: string[]) => {
    setNotice(null);
    setError(null);
    try {
      for (const source_id of sourceIds) {
        if (source_id === targetId) continue;
        await fetchJson('/api/projects/merge', {
          method: 'POST',
          body: JSON.stringify({ source_id, target_id: targetId, reason: 'Merged from Projects Book' }),
        });
      }
      setSelectionMode(false);
      setSelected(new Set());
      setNotice('Projects merged.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    }
  };

  const askInChat = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('lorebook:chat-prefill', { detail: { message: prompt } }));
  };

  return (
    <div className="max-w-6xl mx-auto px-1">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Projects Book</h1>
            <p className="text-sm text-white/45">{projects.length} active threads in your life</p>
            <BookTrustSummary domain="projects" className="mt-1" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setSelectionMode((m) => !m); setSelected(new Set()); }}
          className="sm:ml-auto flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:border-primary/30 transition"
        >
          <GitMerge className="h-4 w-4" /> {selectionMode ? 'Cancel merge' : 'Merge duplicates'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="flex items-center gap-2 flex-1 rounded-xl border border-white/10 bg-black/30 px-3">
          <SearchIcon className="h-4 w-4 text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void createProject(); }}
            placeholder="New project name…"
            className="bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30 min-w-[140px]"
          />
          <button
            type="button"
            onClick={() => void createProject()}
            className="flex items-center gap-1 rounded-lg bg-primary/20 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/30"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Status + type filters (derived from your projects) */}
      {(statusOptions.length > 1 || typeOptions.length > 1) && (
        <div className="flex flex-col gap-2 mb-5">
          {statusOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/35 mr-1">Status</span>
              <FilterChip label="All" count={projects.length} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
              {statusOptions.map(({ id, count }) => (
                <FilterChip
                  key={id}
                  label={titleizeFilter(id, STATUS_LABELS)}
                  count={count}
                  active={statusFilter === id}
                  onClick={() => setStatusFilter((cur) => (cur === id ? 'all' : id))}
                />
              ))}
            </div>
          )}
          {typeOptions.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/35 mr-1">Type</span>
              <FilterChip label="All" count={projects.length} active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
              {typeOptions.map(({ id, count }) => (
                <FilterChip
                  key={id}
                  label={titleizeFilter(id, TYPE_LABELS)}
                  count={count}
                  active={typeFilter === id}
                  onClick={() => setTypeFilter((cur) => (cur === id ? 'all' : id))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {notice && <div className="mb-3 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm text-primary">{notice}</div>}
      {error && <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">{error}</div>}

      <DetectedProjectSuggestions
        demoMode={isMockDataEnabled}
        existingProjectNames={projects.map((p) => p.name)}
        onProjectAdded={() => void load()}
      />

      {duplicateGroups.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-sm font-medium text-amber-300 mb-2">Possible duplicates</div>
          {duplicateGroups.map((g, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <span className="text-white/70">{g.projects.map((p) => p.name).join(' · ')}</span>
              <button
                type="button"
                onClick={() => mergeInto(g.projects[0].id, g.projects.slice(1).map((p) => p.id))}
                className="ml-auto text-xs rounded-lg border border-amber-500/40 px-2.5 py-1 text-amber-200 hover:bg-amber-500/10"
              >
                Merge into {g.projects[0].name}
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && <div className="text-sm text-white/40 py-12 text-center">Loading projects…</div>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 py-20 px-6 text-center">
          <Briefcase className="h-10 w-10 text-white/20 mx-auto mb-3" />
          {projects.length === 0 ? (
            <>
              <p className="text-white/50 text-sm">No projects yet.</p>
              <p className="text-white/30 text-xs mt-1">Add one above or mention projects in chat — they'll appear here.</p>
            </>
          ) : (
            <>
              <p className="text-white/50 text-sm">No projects match these filters.</p>
              <button
                type="button"
                onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
                className="text-primary text-xs mt-2 hover:underline"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginated.map((p) => (
          <ProjectProfileCard
            key={p.id}
            project={p}
            selected={selected.has(p.id)}
            selectionMode={selectionMode}
            onClick={() => (selectionMode ? toggleSelect(p.id) : setActive(p))}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 mt-6">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:border-primary/30 transition disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <span className="text-xs text-white/45 font-mono">
            Page {safePage} of {totalPages} · {filtered.length} project{filtered.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:border-primary/30 transition disabled:opacity-30 disabled:hover:bg-transparent"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {active && (
        <ProjectDetailModal
          project={active}
          onClose={() => setActive(null)}
          onPatch={patchProject}
          onAskInChat={askInChat}
        />
      )}

      {selectionMode && selected.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-primary/40 bg-gray-950/95 backdrop-blur px-5 py-3 shadow-2xl">
          <span className="text-sm text-white/70">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => {
              const ids = Array.from(selected);
              mergeInto(ids[0], ids.slice(1));
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Merge into {projects.find((p) => p.id === Array.from(selected)[0])?.name}
          </button>
        </div>
      )}
    </div>
  );
};

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active
          ? 'bg-primary/15 border-primary/40 text-primary'
          : 'bg-white/4 border-white/10 text-white/50 hover:border-white/25 hover:text-white/70'
      }`}
    >
      {label}
      <span className="text-[10px] text-white/40">{count}</span>
    </button>
  );
}

export default ProjectBook;
