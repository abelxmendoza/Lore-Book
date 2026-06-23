import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, GitMerge, Search as SearchIcon, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { fetchProjectById } from '../../lib/hydrateBookEntity';
import { consumeHighlightItemId, resolveBookHighlightItem } from '../../lib/resolveBookHighlight';
import { useProjectsBookData } from '../../store/hooks/useEntityBooks';
import { ProjectProfileCard, type ProjectCardData } from './ProjectProfileCard';
import { ProjectDetailModal } from './ProjectDetailModal';
import { DetectedProjectSuggestions } from './DetectedProjectSuggestions';
import { BookTrustSummary } from '../trust/BookTrustSummary';
import { Button } from '../ui/button';
import { MergeKeepSelectionBar, mergeNoticeWithReview } from '../common/MergeKeepSelectionBar';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';

interface DuplicateGroup {
  match_type: 'exact' | 'containment';
  canonical_name: string;
  projects: ProjectCardData[];
}

// Demo-mode sample projects — enough to fill several book pages in demo.
const buildDemoProjects = (): ProjectCardData[] => {
  const seeds: Array<{
    name: string;
    type: string;
    status: string;
    description: string;
    tags: string[];
  }> = [
    { name: 'LoreBook', type: 'software', status: 'active', description: 'Building the life-memory app — chat, books, and timeline.', tags: ['code', 'startup'] },
    { name: 'Amazon Onboarding', type: 'career', status: 'active', description: 'Ramp-up at Amazon after the Clever Programmer bootcamp.', tags: ['career'] },
    { name: 'MMA Training', type: 'fitness', status: 'paused', description: 'Striking and conditioning at the gym — three sessions a week.', tags: ['health'] },
    { name: 'Robotics Build', type: 'hobby', status: 'completed', description: 'Weekend robotics project with the crew. Autonomous rover done.', tags: ['robotics'] },
    { name: 'Atlas Notes Frontend', type: 'software', status: 'active', description: 'React UI for the fictional Atlas Notes productivity app in demo lore.', tags: ['react', 'design'] },
    { name: 'Indie SaaS Launch', type: 'business', status: 'active', description: 'Validate pricing, ship MVP, and land the first ten paying users.', tags: ['startup', 'revenue'] },
    { name: 'Marathon Training Block', type: 'fitness', status: 'active', description: '18-week plan targeting a sub-4-hour finish in the fall.', tags: ['running'] },
    { name: 'Kitchen Renovation', type: 'hobby', status: 'paused', description: 'Cabinet refacing, new counters, and better lighting layout.', tags: ['home'] },
    { name: 'Spanish Fluency', type: 'education', status: 'active', description: 'Daily conversation practice and reading one novel per month.', tags: ['language'] },
    { name: 'YouTube Channel', type: 'creative', status: 'active', description: 'Weekly dev-log videos documenting LoreBook and side projects.', tags: ['video', 'content'] },
    { name: 'Freelance Portfolio', type: 'career', status: 'completed', description: 'Case studies, testimonials, and a polished landing page shipped.', tags: ['design'] },
    { name: 'Family Photo Archive', type: 'creative', status: 'active', description: 'Scanning, tagging, and building a shared timeline of family memories.', tags: ['photos', 'family'] },
    { name: 'Podcast Season 2', type: 'creative', status: 'paused', description: 'Eight-episode arc on building in public and creative discipline.', tags: ['audio'] },
    { name: 'Woodshop Workbench', type: 'hobby', status: 'completed', description: 'Hard-maple top, vise install, and mobile base — shop centerpiece done.', tags: ['woodworking'] },
    { name: 'Community Garden Plot', type: 'hobby', status: 'active', description: 'Tomatoes, herbs, and a drip line for the summer season.', tags: ['garden'] },
    { name: 'Graduate Applications', type: 'education', status: 'abandoned', description: 'Paused after accepting the full-time engineering role instead.', tags: ['school'] },
    { name: 'Home Lab Setup', type: 'software', status: 'active', description: 'Proxmox cluster, NAS backups, and homelab monitoring stack.', tags: ['infra'] },
    { name: 'Short Story Collection', type: 'creative', status: 'active', description: 'Twelve stories exploring memory, place, and unreliable narrators.', tags: ['writing'] },
    { name: 'Climbing Grade Project', type: 'fitness', status: 'active', description: 'Projecting a V7 at the local bouldering gym before winter.', tags: ['climbing'] },
    { name: 'Nonprofit Board Role', type: 'career', status: 'active', description: 'Quarterly meetings and fundraising support for youth coding camps.', tags: ['volunteer'] },
    { name: 'Wedding Planning', type: 'hobby', status: 'paused', description: 'Venue booked; catering and photographer still in progress.', tags: ['life'] },
    { name: 'Debt Payoff Plan', type: 'business', status: 'active', description: 'Snowball method — two cards cleared, one personal loan left.', tags: ['finance'] },
    { name: 'Meditation Streak', type: 'fitness', status: 'active', description: 'Ten minutes every morning; tracking consistency in the journal.', tags: ['mindfulness'] },
    { name: 'Open Source Library', type: 'software', status: 'active', description: 'Small React hooks package — docs, tests, and npm publish pipeline.', tags: ['oss'] },
    { name: 'Chess Rating Push', type: 'hobby', status: 'active', description: 'Tactics drills and one classical game daily to break 1500 online.', tags: ['chess'] },
    { name: 'Urban Sketching', type: 'creative', status: 'paused', description: 'Sunday café sketches — picking this back up in spring.', tags: ['art'] },
    { name: 'Meal Prep System', type: 'fitness', status: 'completed', description: 'Batch cooking templates and a shared grocery rotation with roommates.', tags: ['nutrition'] },
    { name: 'Rental Property Search', type: 'business', status: 'active', description: 'Analyzing cap rates in two markets; touring units monthly.', tags: ['real-estate'] },
    { name: 'Band EP Recording', type: 'creative', status: 'active', description: 'Four-track EP — tracking drums and bass this month.', tags: ['music'] },
    { name: 'AWS Certification', type: 'education', status: 'active', description: 'Solutions Architect associate — practice exams and lab exercises.', tags: ['cloud'] },
    { name: 'Declutter Sprint', type: 'hobby', status: 'completed', description: 'One room per weekend; donation runs and digital file cleanup.', tags: ['home'] },
    { name: 'Japan Travel Itinerary', type: 'hobby', status: 'active', description: 'Two-week route: Tokyo, Kyoto, Osaka — rail pass and ryokan booked.', tags: ['travel'] },
    { name: 'Investor Deck Draft', type: 'business', status: 'paused', description: 'Pitch narrative and traction slides for a potential pre-seed round.', tags: ['fundraising'] },
    { name: 'Backyard Deck', type: 'hobby', status: 'active', description: 'Composite decking, railing, and stair stringers — permit approved.', tags: ['home'] },
    { name: 'Resume Overhaul', type: 'career', status: 'completed', description: 'Impact bullets, GitHub links, and a one-page technical format.', tags: ['job-search'] },
    { name: 'Volunteer Tutoring', type: 'education', status: 'active', description: 'Saturday math help for high-school seniors applying to STEM programs.', tags: ['volunteer'] },
    { name: 'Smart Home Automation', type: 'software', status: 'active', description: 'Home Assistant automations for lights, climate, and security cameras.', tags: ['iot'] },
    { name: 'Memoir First Draft', type: 'creative', status: 'active', description: 'Childhood through college — 40k words drafted, restructuring act two.', tags: ['writing'] },
    { name: 'CrossFit Competitor', type: 'fitness', status: 'paused', description: 'Scaled division prep paused after a minor shoulder strain.', tags: ['crossfit'] },
    { name: 'Etsy Store Relaunch', type: 'business', status: 'active', description: 'Print-on-demand posters and enamel pins — new branding and SEO.', tags: ['ecommerce'] },
    { name: 'Language Exchange', type: 'education', status: 'active', description: 'Weekly calls with a partner in Mexico City — Spanish for English.', tags: ['language'] },
    { name: 'Co-founder Search', type: 'business', status: 'active', description: 'Networking for a technical co-founder on the LoreBook vision.', tags: ['startup'] },
    { name: 'Alumni Network Map', type: 'career', status: 'active', description: 'Mapping bootcamp cohort connections and warm intro paths.', tags: ['networking'] },
    { name: 'Screenplay Rewrite', type: 'creative', status: 'abandoned', description: 'Shelved after pivoting creative energy to the memoir project.', tags: ['film'] },
    { name: 'Electric Bike Commute', type: 'fitness', status: 'completed', description: 'Converted daily drive to a 12-mile e-bike route — battery and gear dialed.', tags: ['commute'] },
    { name: 'Patent Prior Art Review', type: 'business', status: 'paused', description: 'Legal review paused pending product direction on the hardware idea.', tags: ['legal'] },
    { name: 'Neighborhood Block Party', type: 'hobby', status: 'completed', description: 'Permits, potluck signup, and a kids activity zone — great turnout.', tags: ['community'] },
    { name: 'AI Agent Experiments', type: 'software', status: 'active', description: 'Prototyping memory-aware agents that feed into LoreBook ingestion.', tags: ['ai', 'agents'] },
    { name: 'Photography Zine', type: 'creative', status: 'active', description: 'Thirty-six street photos sequenced for a limited print run.', tags: ['photography'] },
    { name: 'Parent Care Planning', type: 'hobby', status: 'active', description: 'Medical appointments, power of attorney docs, and visit schedule.', tags: ['family'] },
    { name: 'Side Hustle Bookkeeping', type: 'business', status: 'active', description: 'Separate accounts, quarterly taxes, and expense categorization habits.', tags: ['finance'] },
    { name: 'Trail Race Series', type: 'fitness', status: 'active', description: 'Three trail 10Ks this summer — hill repeats on Thursdays.', tags: ['running'] },
    { name: 'Conference Talk Proposal', type: 'career', status: 'active', description: 'Submitting a talk on personal knowledge graphs and life logging.', tags: ['speaking'] },
    { name: 'Basement Studio Soundproofing', type: 'hobby', status: 'paused', description: 'Acoustic panels ordered; installation waiting on drywall patch.', tags: ['music', 'home'] },
    { name: 'Bug Bounty Practice', type: 'software', status: 'active', description: 'HackerOne labs and two scoped web apps for responsible disclosure.', tags: ['security'] },
    { name: 'Holiday Newsletter', type: 'creative', status: 'completed', description: 'Annual family update letter with photos and a printed mailer.', tags: ['family'] },
    { name: 'Roommate Lease Renewal', type: 'business', status: 'completed', description: 'Negotiated rent hold and split utilities for another year.', tags: ['housing'] },
    { name: 'Sourdough Starter Revival', type: 'hobby', status: 'abandoned', description: 'Gave up after three dense loaves — might retry with a new strain.', tags: ['cooking'] },
    { name: 'LoreBook Mobile Shell', type: 'software', status: 'active', description: 'Capacitor wrapper and responsive nav for chat-first mobile UX.', tags: ['mobile', 'code'] },
    { name: 'Therapy Homework Journal', type: 'education', status: 'active', description: 'Weekly reflection prompts tied to goals from counseling sessions.', tags: ['wellness'] },
  ];

  return seeds.map((seed, i) => {
    const updated = new Date(Date.now() - i * 3 * 864e5);
    const started = new Date(updated.getTime() - (60 + (i % 180)) * 864e5);
    let ended: string | null = null;
    if (seed.status === 'completed') {
      ended = new Date(updated.getTime() - 14 * 864e5).toISOString();
    } else if (seed.status === 'abandoned') {
      ended = new Date(updated.getTime() - 45 * 864e5).toISOString();
    }
    return {
      id: `demo-project-${i}`,
      name: seed.name,
      type: seed.type,
      status: seed.status,
      description: seed.description,
      tags: seed.tags,
      started_at: started.toISOString(),
      ended_at: ended,
      updated_at: updated.toISOString(),
      metadata: { source: 'demo' },
    };
  });
};

const DEMO_PROJECTS = buildDemoProjects();

const PAGE_SIZE = 15; // 2 × 8 on mobile, 3 × 5 on desktop — at least 5 cards per column

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
 * Projects Book — paginated book page with card grid; detail opens in modal.
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
  const [mergeBusy, setMergeBusy] = useState(false);
  const [active, setActive] = useState<ProjectCardData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [demoProjects, setDemoProjects] = useState<ProjectCardData[]>(() => [...DEMO_PROJECTS]);

  const projects = useMemo((): ProjectCardData[] => {
    if (isMockDataEnabled) return demoProjects;
    return (data?.projects ?? []) as ProjectCardData[];
  }, [data, isMockDataEnabled, demoProjects]);

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

  useEffect(() => {
    const id = consumeHighlightItemId();
    if (!id) return;

    let cancelled = false;
    (async () => {
      const resolved = await resolveBookHighlightItem({
        id,
        items: projects,
        match: (p, needle) =>
          p.id === needle || p.name.toLowerCase() === needle.toLowerCase(),
        fetchById: fetchProjectById,
      });
      if (!cancelled && resolved) setActive(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [projects]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => { setPage(1); }, [search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginated = useMemo(
    () => filtered.slice(startIndex, endIndex),
    [filtered, startIndex, endIndex]
  );
  const visibleStart = filtered.length === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, filtered.length);

  const goToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  };
  const goToPrevious = () => goToPage(currentPage - 1);
  const goToNext = () => goToPage(currentPage + 1);

  const createProject = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      if (isMockDataEnabled) {
        const now = new Date().toISOString();
        const project: ProjectCardData = {
          id: `demo-${Date.now()}`,
          name,
          type: 'project',
          status: 'active',
          updated_at: now,
          metadata: { source: 'demo' },
        };
        setDemoProjects((prev) => [project, ...prev]);
        setNewName('');
        setNotice(`Added "${name}".`);
        return;
      }
      await fetchJson('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
      setNewName('');
      setNotice(`Added "${name}".`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add project');
    }
  };

  const patchProject = async (id: string, patch: Partial<ProjectCardData>) => {
    if (isMockDataEnabled) {
      const updated = { ...patch, updated_at: new Date().toISOString() };
      setDemoProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      setActive((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev));
      return;
    }
    const { project } = await fetchJson<{ project: ProjectCardData }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setActive((prev) => (prev && prev.id === id ? { ...prev, ...project } : prev));
    await load();
  };

  const deleteProject = async (id: string) => {
    if (isMockDataEnabled) {
      setDemoProjects((prev) => prev.filter((p) => p.id !== id));
      setActive(null);
      return;
    }
    await fetchJson(`/api/projects/${id}`, { method: 'DELETE' });
    setActive(null);
    await load();
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedProjects = useMemo(
    () => projects.filter((p) => selected.has(p.id)),
    [projects, selected]
  );

  const mergeInto = async (targetId: string, sourceIds: string[]) => {
    setNotice(null);
    setError(null);
    setMergeBusy(true);
    try {
      if (isMockDataEnabled) {
        setDemoProjects((prev) => {
          const target = prev.find((p) => p.id === targetId);
          if (!target) return prev;
          const sourceNames = sourceIds
            .filter((id) => id !== targetId)
            .map((id) => prev.find((p) => p.id === id)?.name)
            .filter(Boolean);
          const mergedDescription = [target.description, ...sourceNames.map((n) => `Merged: ${n}`)]
            .filter(Boolean)
            .join(' · ');
          const merged: ProjectCardData = {
            ...target,
            description: mergedDescription || target.description,
            updated_at: new Date().toISOString(),
          };
          return [merged, ...prev.filter((p) => p.id !== targetId && !sourceIds.includes(p.id))];
        });
        setSelectionMode(false);
        setSelected(new Set());
        setNotice('Projects merged.');
        return;
      }
      let mergedName = projects.find((p) => p.id === targetId)?.name ?? 'the selected project';
      let reviewCount = 0;
      for (const source_id of sourceIds) {
        if (source_id === targetId) continue;
        const result = await fetchJson<{
          project?: ProjectCardData;
          report?: { canonicalName?: string; reviewFlags?: string[] };
        }>('/api/projects/merge', {
          method: 'POST',
          body: JSON.stringify({ source_id, target_id: targetId, reason: 'Merged from Projects Book' }),
        });
        mergedName = result.project?.name ?? result.report?.canonicalName ?? mergedName;
        reviewCount += result.report?.reviewFlags?.length ?? 0;
      }
      setSelectionMode(false);
      setSelected(new Set());
      setNotice(
        reviewCount > 0
          ? mergeNoticeWithReview(mergedName, reviewCount, 'combined tags, links, and knowledge')
          : mergeNoticeWithReview(mergedName, 0, 'combined tags, links, and knowledge')
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed');
    } finally {
      setMergeBusy(false);
    }
  };

  const askInChat = (prompt: string, project?: ProjectCardData) => {
    const target = project ?? active;
    if (!target) {
      openChatWithFocus({
        entityId: 'project',
        entityName: 'Your project',
        entityType: 'project',
        sourceSurface: 'projects',
        sourceLabel: CHAT_FOCUS_SOURCE_LABELS.projects,
        initialPrompt: prompt,
      });
      return;
    }
    openChatWithFocus({
      entityId: target.id,
      entityName: target.name,
      entityType: 'project',
      sourceSurface: 'projects',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.projects,
      knowledgeScope: 'project goals, progress, and priorities',
      initialPrompt: prompt,
    });
  };

  return (
    <div className={`max-w-6xl mx-auto w-full min-w-0 ${selectionMode && selected.size >= 2 ? 'pb-28 sm:pb-4' : 'pb-4 sm:pb-0'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-8">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 shrink-0">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Projects Book</h1>
            <p className="text-xs sm:text-sm text-white/45">{projects.length} active threads in your life</p>
            <BookTrustSummary domain="projects" className="mt-1" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setSelectionMode((m) => !m); setSelected(new Set()); }}
          className="sm:ml-auto flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-4 py-2.5 sm:py-2 text-sm text-white/70 hover:bg-white/5 hover:border-primary/30 transition min-h-[44px] sm:min-h-0 w-full sm:w-auto touch-manipulation"
        >
          <GitMerge className="h-4 w-4 shrink-0" />
          <span>{selectionMode ? 'Cancel merge' : 'Merge duplicates'}</span>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-5 sm:mb-6">
        <div className="flex items-center gap-2 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 min-h-[44px]">
          <SearchIcon className="h-4 w-4 text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="flex-1 min-w-0 bg-transparent py-2.5 text-base sm:text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 min-h-[44px]">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void createProject(); }}
            placeholder="New project name…"
            className="flex-1 min-w-0 bg-transparent py-2.5 text-base sm:text-sm text-white outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => void createProject()}
            className="flex items-center gap-1 rounded-lg bg-primary/20 text-primary px-3 py-2 sm:px-2 sm:py-1 text-xs font-medium hover:bg-primary/30 shrink-0 min-h-[36px] sm:min-h-0 touch-manipulation"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Status + type filters (derived from your projects) */}
      {(statusOptions.length > 1 || typeOptions.length > 1) && (
        <div className="flex flex-col gap-3 mb-5 max-w-2xl mx-auto w-full">
          {statusOptions.length > 1 && (
            <div className="rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4 space-y-3 text-center">
              <span className="block text-[11px] uppercase tracking-wider text-white/35">Status</span>
              <div className="flex flex-wrap gap-2 justify-center">
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
            </div>
          )}
          {typeOptions.length > 1 && (
            <div className="rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4 space-y-3 text-center">
              <span className="block text-[11px] uppercase tracking-wider text-white/35">Type</span>
              <div className="flex flex-wrap gap-2 justify-center">
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
            </div>
          )}
        </div>
      )}

      {notice && <div className="mb-3 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2.5 text-sm text-primary">{notice}</div>}
      {error && <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-300">{error}</div>}

      <DetectedProjectSuggestions
        demoMode={isMockDataEnabled}
        existingBookEntries={projects.map((p) => ({ id: p.id, name: p.name }))}
        existingProjectNames={projects.map((p) => p.name)}
        onProjectAdded={() => void load()}
      />

      {duplicateGroups.length > 0 && (
        <div className="mb-5 sm:mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
          <div className="text-sm font-medium text-amber-300 mb-2">Possible duplicates</div>
          {duplicateGroups.map((g, i) => (
            <div key={i} className="flex flex-col gap-2 py-2 sm:py-1.5 text-sm border-t border-amber-500/10 first:border-t-0 first:pt-0">
              <span className="text-white/70 leading-snug">{g.projects.map((p) => p.name).join(' · ')}</span>
              <div className="flex flex-wrap gap-2">
                {g.projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={mergeBusy}
                    onClick={() => mergeInto(p.id, g.projects.filter((x) => x.id !== p.id).map((x) => x.id))}
                    className="text-xs rounded-lg border border-amber-500/40 px-3 py-2 sm:px-2.5 sm:py-1 text-amber-200 hover:bg-amber-500/10 min-h-[44px] sm:min-h-0 touch-manipulation"
                  >
                    Keep {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 lg:grid-rows-5 gap-2 sm:gap-3 auto-rows-fr">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="aspect-[4/5] sm:aspect-auto h-full min-h-0 rounded-xl bg-white/5 border border-white/8 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-12 sm:py-20 px-4 sm:px-6 text-center">
          <Briefcase className="h-8 w-8 sm:h-10 sm:w-10 text-white/20 mx-auto mb-3" />
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
      ) : (
        <>
          <div className="relative w-full min-h-[88dvh] sm:min-h-[780px] lg:min-h-[860px] bg-gradient-to-br from-primary/10 via-black/40 to-primary/5 rounded-lg border-2 border-primary/25 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1 min-h-0">
              {/* Page header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-primary/20">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary/70 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                      Projects Book
                    </h3>
                    <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">
                      Page {currentPage} of {totalPages} · {filtered.length} project{filtered.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs text-white/35 font-mono shrink-0">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Project card grid — square tiles on mobile, auto height on desktop */}
              <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 lg:grid-rows-5 gap-2 sm:gap-3 lg:gap-3 mb-4 sm:mb-6 min-h-0 overflow-hidden auto-rows-fr">
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

              {/* Page footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 pt-3 sm:pt-4 border-t border-primary/20 mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-white/50 hover:text-white hover:bg-primary/10 disabled:opacity-30 w-full sm:w-auto min-h-[44px] sm:min-h-0 touch-manipulation"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex flex-col sm:flex-row items-center gap-2 flex-wrap justify-center">
                  {totalPages > 1 && (
                    <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1 bg-black/40 rounded-lg border border-primary/25 overflow-x-auto max-w-full">
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 7) pageNum = i + 1;
                        else if (currentPage <= 4) pageNum = i + 1;
                        else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                        else pageNum = currentPage - 3 + i;

                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => goToPage(pageNum)}
                            className={`px-1.5 sm:px-2 py-1 rounded text-xs sm:text-sm transition touch-manipulation shrink-0 ${
                              currentPage === pageNum
                                ? 'bg-primary text-white'
                                : 'text-white/50 hover:text-white hover:bg-primary/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-xs sm:text-sm text-white/40 whitespace-nowrap">
                    {visibleStart}–{visibleEnd} of {filtered.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-white/50 hover:text-white hover:bg-primary/10 disabled:opacity-30 w-full sm:w-auto min-h-[44px] sm:min-h-0 touch-manipulation"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book binding */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 via-primary/20 to-primary/30 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/30 via-primary/20 to-primary/30 pointer-events-none" />
          </div>
        </>
      )}

      {active && (
        <ProjectDetailModal
          project={active}
          onClose={() => setActive(null)}
          onPatch={patchProject}
          onDelete={deleteProject}
          onAskInChat={askInChat}
        />
      )}

      <MergeKeepSelectionBar
        visible={selectionMode && selected.size >= 2}
        selectedCount={selected.size}
        options={selectedProjects.map((project) => ({ id: project.id, name: project.name }))}
        busy={mergeBusy}
        onKeep={(targetId) => {
          const sourceIds = selectedProjects.filter((p) => p.id !== targetId).map((p) => p.id);
          void mergeInto(targetId, sourceIds);
        }}
      />
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium border transition-all touch-manipulation ${
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
