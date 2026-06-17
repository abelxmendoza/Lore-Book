import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, GitMerge, Search as SearchIcon } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { ProjectProfileCard, type ProjectCardData } from './ProjectProfileCard';
import { ProjectDetailModal } from './ProjectDetailModal';
import { DetectedProjectSuggestions } from './DetectedProjectSuggestions';

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

/**
 * Projects Book — card grid + detail modal (Locations/Skills book pattern).
 */
export const ProjectBook = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<ProjectCardData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMockDataEnabled) {
        setProjects(DEMO_PROJECTS);
        setDuplicateGroups([]);
        return;
      }
      const [{ projects: list }, dupes] = await Promise.all([
        fetchJson<{ projects: ProjectCardData[] }>('/api/projects'),
        fetchJson<{ duplicate_groups: DuplicateGroup[] }>('/api/projects/duplicates').catch(() => ({ duplicate_groups: [] })),
      ]);
      setProjects(list ?? []);
      setDuplicateGroups(dupes.duplicate_groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [isMockDataEnabled]);

  useEffect(() => {
    if (isMockDataEnabled) return;
    return onStoryDataUpdated(() => {
      void load();
    }, 'projects');
  }, [isMockDataEnabled]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
  }, [projects, search]);

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
          <p className="text-white/50 text-sm">No projects yet.</p>
          <p className="text-white/30 text-xs mt-1">Add one above or mention projects in chat — they'll appear here.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <ProjectProfileCard
            key={p.id}
            project={p}
            selected={selected.has(p.id)}
            selectionMode={selectionMode}
            onClick={() => (selectionMode ? toggleSelect(p.id) : setActive(p))}
          />
        ))}
      </div>

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

export default ProjectBook;
