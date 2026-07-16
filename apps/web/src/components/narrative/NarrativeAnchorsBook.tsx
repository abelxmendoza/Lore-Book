import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  Anchor,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  Compass,
  FolderKanban,
  GraduationCap,
  Heart,
  Info,
  MapPin,
  Plane,
  RefreshCw,
  Repeat2,
  Search,
  Sparkles,
  TreePine,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { fetchJson } from '../../lib/api';
import { cn } from '../../lib/cn';
import { MOCK_NARRATIVE_ANCHORS } from '../../mocks/narrativeAnchors';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export type AnchorType =
  | 'life_era'
  | 'school_era'
  | 'work_era'
  | 'relationship_arc'
  | 'community'
  | 'family_period'
  | 'project_arc'
  | 'travel_period'
  | 'pivotal_event'
  | 'recurring_activity';

export type AnchorMember = {
  id: string;
  kind: string;
  name: string;
  role?: string;
  gravityScore?: number;
};

export type AnchorEvidence = {
  id: string;
  label: string;
  source: string;
  confidence: number;
};

export type NarrativeAnchor = {
  id: string;
  title: string;
  anchorType: AnchorType;
  confidence: number;
  gravityScore: number;
  startDate?: string;
  endDate?: string;
  entities: AnchorMember[];
  events: AnchorMember[];
  groups: AnchorMember[];
  places: AnchorMember[];
  evidence: AnchorEvidence[];
  provenance: { builtAt: string; signals: string[] };
};

type TypeMeta = {
  label: string;
  description: string;
  icon: typeof Anchor;
  accent: string;
  iconSurface: string;
};

const TYPE_META: Record<AnchorType, TypeMeta> = {
  life_era: { label: 'Life eras', description: 'Long chapters that shaped who you were', icon: BookOpen, accent: 'text-cyan-200', iconSurface: 'border-cyan-400/20 bg-cyan-400/10' },
  school_era: { label: 'School', description: 'Classes, campuses, and formative years', icon: GraduationCap, accent: 'text-sky-200', iconSurface: 'border-sky-400/20 bg-sky-400/10' },
  work_era: { label: 'Work', description: 'Roles, teams, and career seasons', icon: Briefcase, accent: 'text-blue-200', iconSurface: 'border-blue-400/20 bg-blue-400/10' },
  relationship_arc: { label: 'Relationships', description: 'People and the chapters you shared', icon: Heart, accent: 'text-rose-200', iconSurface: 'border-rose-400/20 bg-rose-400/10' },
  community: { label: 'Communities', description: 'The groups and scenes you belonged to', icon: Users, accent: 'text-violet-200', iconSurface: 'border-violet-400/20 bg-violet-400/10' },
  family_period: { label: 'Family', description: 'Family seasons and changing dynamics', icon: TreePine, accent: 'text-emerald-200', iconSurface: 'border-emerald-400/20 bg-emerald-400/10' },
  project_arc: { label: 'Projects', description: 'Things you built and pursued over time', icon: FolderKanban, accent: 'text-amber-200', iconSurface: 'border-amber-400/20 bg-amber-400/10' },
  travel_period: { label: 'Travel', description: 'Places and journeys that became chapters', icon: Plane, accent: 'text-teal-200', iconSurface: 'border-teal-400/20 bg-teal-400/10' },
  pivotal_event: { label: 'Pivotal events', description: 'Specific moments with lasting significance', icon: Sparkles, accent: 'text-amber-200', iconSurface: 'border-amber-400/20 bg-amber-400/10' },
  recurring_activity: { label: 'Rituals', description: 'Activities that keep returning to your story', icon: Repeat2, accent: 'text-fuchsia-200', iconSurface: 'border-fuchsia-400/20 bg-fuchsia-400/10' },
};

const TYPE_ORDER = Object.keys(TYPE_META) as AnchorType[];

function formatYears(startDate?: string, endDate?: string): string | null {
  if (!startDate && !endDate) return null;
  const start = startDate ? new Date(startDate).getFullYear() : null;
  const end = endDate ? new Date(endDate).getFullYear() : null;
  if (start && end && start === end) return String(start);
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}–present`;
  return `Until ${end}`;
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'Strong match';
  if (confidence >= 0.6) return 'Supported';
  return 'Needs review';
}

function NarrativeAnchorCard({ anchor }: { anchor: NarrativeAnchor }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[anchor.anchorType];
  const Icon = meta.icon;
  const years = formatYears(anchor.startDate, anchor.endDate);
  const members = [
    ...anchor.entities,
    ...anchor.places.map((member) => ({ ...member, kind: 'place' })),
    ...anchor.groups.map((member) => ({ ...member, kind: 'group' })),
    ...anchor.events.map((member) => ({ ...member, kind: 'event' })),
  ];
  const visibleMembers = expanded ? members : members.slice(0, 5);
  const visibleEvidence = anchor.evidence.filter((evidence, index, all) =>
    all.findIndex((candidate) => candidate.label.trim().toLowerCase() === evidence.label.trim().toLowerCase()) === index,
  );

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition-colors hover:border-white/[0.16]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.035] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="relative w-full p-4 text-left sm:p-5"
      >
        <div className="flex items-start gap-3.5">
          <div className={cn('mt-0.5 rounded-xl border p-2.5', meta.iconSurface)}>
            <Icon className={cn('h-4 w-4', meta.accent)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', meta.accent)}>{meta.label}</p>
                <h3 className="mt-1 text-base font-semibold leading-snug text-white sm:text-lg">{anchor.title}</h3>
              </div>
              <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-white/35 transition-transform', expanded && 'rotate-180')} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/45">
              {years && <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{years}</span>}
              <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />{confidenceLabel(anchor.confidence)}</span>
              <span>{members.length} connected {members.length === 1 ? 'detail' : 'details'}</span>
            </div>

            {visibleMembers.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {visibleMembers.map((member) => (
                  <span key={`${member.kind}-${member.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-black/25 px-2.5 py-1 text-xs text-white/70">
                    {member.kind === 'place' && <MapPin className="h-3 w-3 text-teal-300/80" />}
                    {member.kind === 'group' && <Users className="h-3 w-3 text-violet-300/80" />}
                    {member.name}
                  </span>
                ))}
                {!expanded && members.length > visibleMembers.length && (
                  <span className="self-center px-1 text-xs text-white/35">+{members.length - visibleMembers.length}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="relative mx-4 border-t border-white/[0.07] pb-5 pt-4 sm:mx-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Why Lorekeeper connected this</p>
              {visibleEvidence.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {visibleEvidence.slice(0, 5).map((evidence) => (
                    <li key={evidence.id} className="flex items-start gap-2 text-sm leading-relaxed text-white/65">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
                      <span>{evidence.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-white/45">This connection comes from repeated people, places, and events in your memories.</p>
              )}
            </div>
            {anchor.provenance?.builtAt && (
              <p className="text-xs text-white/30 sm:text-right">
                Updated {formatDistanceToNow(parseISO(anchor.provenance.builtAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function LoadingState() {
  return (
    <div aria-label="Loading narrative anchors" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
          <div className="mb-5 h-9 w-9 rounded-xl bg-white/[0.07]" />
          <div className="h-3 w-20 rounded bg-white/[0.07]" />
          <div className="mt-3 h-5 w-3/4 rounded bg-white/[0.07]" />
          <div className="mt-6 h-7 w-full rounded bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

export function NarrativeAnchorsBook() {
  const sharedDemoMode = useShouldUseMockData();
  // Authenticated users are intentionally prevented from enabling global mock
  // data. A scoped query flag allows safe visual QA of this surface without
  // changing their account or weakening the global real-data policy.
  const isDemoPreview = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('demo') === '1';
  const isDemoMode = sharedDemoMode || isDemoPreview;
  const [anchors, setAnchors] = useState<NarrativeAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<AnchorType | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const loadAnchors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDemoMode) {
        setAnchors(MOCK_NARRATIVE_ANCHORS);
        return;
      }
      const response = await fetchJson<{ anchors: NarrativeAnchor[] }>('/api/narrative-anchors');
      setAnchors(response.anchors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not load your story map.');
    } finally {
      setLoading(false);
    }
  }, [isDemoMode]);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      if (isDemoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 550));
        setAnchors(MOCK_NARRATIVE_ANCHORS.map((anchor) => ({
          ...anchor,
          provenance: { ...anchor.provenance, builtAt: new Date().toISOString() },
        })));
        return;
      }
      const response = await fetchJson<{ anchors: NarrativeAnchor[] }>('/api/narrative-anchors/rebuild', { method: 'POST' });
      setAnchors(response.anchors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not refresh your story map.');
    } finally {
      setRebuilding(false);
    }
  }, [isDemoMode]);

  useEffect(() => { void loadAnchors(); }, [loadAnchors]);

  const typeCounts = useMemo(() => anchors.reduce<Partial<Record<AnchorType, number>>>((counts, anchor) => {
    counts[anchor.anchorType] = (counts[anchor.anchorType] ?? 0) + 1;
    return counts;
  }, {}), [anchors]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return anchors
      .filter((anchor) => activeType === 'all' || anchor.anchorType === activeType)
      .filter((anchor) => !query || [
        anchor.title,
        TYPE_META[anchor.anchorType].label,
        ...anchor.entities.map((entity) => entity.name),
        ...anchor.places.map((place) => place.name),
        ...anchor.groups.map((group) => group.name),
      ].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => b.gravityScore - a.gravityScore);
  }, [activeType, anchors, search]);

  const clearFilters = () => {
    setSearch('');
    setActiveType('all');
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.07),transparent_35%),radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.07),transparent_30%)]">
      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <header className="overflow-hidden rounded-3xl border border-white/[0.08] bg-black/25 p-5 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                <Compass className="h-4 w-4" /> Your story map
                {isDemoMode && <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[9px] tracking-[0.12em] text-violet-100/80">Demo story</span>}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Narrative Anchors</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
                The chapters, relationships, places, and rituals your memories keep returning to. Anchors help Lorekeeper understand how separate moments belong to the same story.
              </p>
            </div>
            <Button onClick={() => void rebuild()} disabled={rebuilding} className="w-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15 sm:w-auto">
              <RefreshCw className={cn('mr-2 h-4 w-4', rebuilding && 'animate-spin')} />
              {rebuilding ? 'Reading your story…' : anchors.length ? 'Refresh story map' : 'Discover my anchors'}
            </Button>
          </div>

          <div className="mt-6 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.025] p-3.5"><p className="text-xl font-semibold text-white">{anchors.length}</p><p className="mt-0.5 text-xs text-white/40">story threads discovered</p></div>
            <div className="rounded-xl bg-white/[0.025] p-3.5"><p className="text-xl font-semibold text-white">{Object.keys(typeCounts).length}</p><p className="mt-0.5 text-xs text-white/40">parts of life connected</p></div>
            <div className="flex items-center gap-3 rounded-xl border border-violet-400/10 bg-violet-400/[0.04] p-3.5"><Info className="h-4 w-4 shrink-0 text-violet-200/70" /><p className="text-xs leading-relaxed text-white/45">These are helpful interpretations, not permanent facts. They evolve as your story grows.</p></div>
          </div>
        </header>

        <div className="sticky top-0 z-10 -mx-4 mt-5 border-y border-white/[0.06] bg-black/75 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your story…" className="h-10 border-white/10 bg-white/[0.04] pl-9 pr-9 text-white placeholder:text-white/30" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
              <button type="button" onClick={() => setActiveType('all')} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors', activeType === 'all' ? 'border-white/25 bg-white/10 text-white' : 'border-white/[0.08] text-white/45 hover:text-white/75')}>All <span className="ml-1 text-white/35">{anchors.length}</span></button>
              {TYPE_ORDER.filter((type) => typeCounts[type]).map((type) => {
                const meta = TYPE_META[type];
                const Icon = meta.icon;
                return <button key={type} type="button" onClick={() => setActiveType(type)} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors', activeType === type ? cn('bg-white/10 text-white', meta.iconSurface) : 'border-white/[0.08] text-white/45 hover:text-white/75')}><Icon className="h-3.5 w-3.5" />{meta.label}<span className="text-white/35">{typeCounts[type]}</span></button>;
              })}
            </div>
          </div>
        </div>

        <main className="py-6">
          {error && (
            <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span><Button variant="outline" size="sm" onClick={() => void loadAnchors()} className="border-rose-300/20">Try again</Button>
            </div>
          )}

          {loading ? <LoadingState /> : anchors.length === 0 ? (
            <div className="mx-auto max-w-xl py-14 text-center sm:py-20">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.07]"><Anchor className="h-7 w-7 text-cyan-200/70" /></div>
              <h2 className="mt-5 text-xl font-semibold text-white">Your story map is ready to be discovered</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/50">Lorekeeper will look for the people, places, and activities that recur across your memories, then organize them into meaningful chapters.</p>
              <Button className="mt-6 bg-white text-black hover:bg-white/90" onClick={() => void rebuild()} disabled={rebuilding}><Sparkles className="mr-2 h-4 w-4" />Discover my anchors</Button>
              <p className="mt-4 inline-flex items-center gap-1 text-xs text-white/30">The more memories you share, the clearer this becomes <ArrowUpRight className="h-3 w-3" /></p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center"><Search className="mx-auto h-8 w-8 text-white/20" /><h2 className="mt-4 font-medium text-white">No matching story threads</h2><p className="mt-1 text-sm text-white/40">Try another search or show all anchor types.</p><Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 border-white/15">Clear filters</Button></div>
          ) : (
            <div>
              <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{activeType === 'all' ? 'Your strongest story threads' : TYPE_META[activeType].label}</p>{activeType !== 'all' && <p className="mt-1 text-sm text-white/45">{TYPE_META[activeType].description}</p>}</div><p className="text-xs text-white/30">{filtered.length} {filtered.length === 1 ? 'anchor' : 'anchors'}</p></div>
              <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((anchor) => <NarrativeAnchorCard key={anchor.id} anchor={anchor} />)}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
