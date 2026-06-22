// =====================================================
// Narrative Anchors Book
// Purpose: Browse life as narrative clusters — eras, arcs, communities, activities
// =====================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  MapPin,
  Repeat2,
  Briefcase,
  GraduationCap,
  Heart,
  TreePine,
  Plane,
  FolderKanban,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

import { fetchJson } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { ChatFirstViewHint } from '../ChatFirstViewHint';

type AnchorType =
  | 'life_era'
  | 'school_era'
  | 'work_era'
  | 'relationship_arc'
  | 'community'
  | 'family_period'
  | 'project_arc'
  | 'travel_period'
  | 'recurring_activity';

type AnchorMember = {
  id: string;
  kind: string;
  name: string;
  role?: string;
  gravityScore?: number;
};

type AnchorEvidence = {
  id: string;
  label: string;
  source: string;
  confidence: number;
};

type NarrativeAnchor = {
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

const TYPE_LABELS: Record<AnchorType, string> = {
  life_era: 'Life Era',
  school_era: 'School Era',
  work_era: 'Work Era',
  relationship_arc: 'Relationship Arc',
  community: 'Community',
  family_period: 'Family Period',
  project_arc: 'Project Arc',
  travel_period: 'Travel Period',
  recurring_activity: 'Recurring Activity',
};

const TYPE_ICONS: Record<AnchorType, typeof Anchor> = {
  life_era: BookOpen,
  school_era: GraduationCap,
  work_era: Briefcase,
  relationship_arc: Heart,
  community: Users,
  family_period: TreePine,
  project_arc: FolderKanban,
  travel_period: Plane,
  recurring_activity: Repeat2,
};

const SECTION_ORDER: AnchorType[] = [
  'school_era',
  'work_era',
  'relationship_arc',
  'community',
  'family_period',
  'project_arc',
  'recurring_activity',
  'travel_period',
  'life_era',
];

function gravityColor(score: number): string {
  if (score >= 0.75) return 'text-amber-300 border-amber-400/40 bg-amber-500/10';
  if (score >= 0.5) return 'text-purple-300 border-purple-400/40 bg-purple-500/10';
  return 'text-white/60 border-white/20 bg-white/5';
}

function AnchorCard({ anchor }: { anchor: NarrativeAnchor }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[anchor.anchorType] ?? Anchor;

  const allMembers = [
    ...anchor.entities,
    ...anchor.places.map((p) => ({ ...p, kind: 'place' })),
    ...anchor.groups.map((g) => ({ ...g, kind: 'group' })),
    ...anchor.events.map((e) => ({ ...e, kind: 'event' })),
  ];

  return (
    <Card className="border-white/10 bg-black/40 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-lg bg-primary/15 p-2 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base text-white truncate">{anchor.title}</CardTitle>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs border-white/20 text-white/70">
                  {TYPE_LABELS[anchor.anchorType]}
                </Badge>
                <Badge variant="outline" className={`text-xs ${gravityColor(anchor.gravityScore)}`}>
                  gravity {anchor.gravityScore.toFixed(2)}
                </Badge>
                <Badge variant="outline" className="text-xs border-white/20 text-white/50">
                  {Math.round(anchor.confidence * 100)}% conf
                </Badge>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-white/50 hover:text-white"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {allMembers.slice(0, expanded ? undefined : 6).map((m) => (
            <span
              key={`${m.kind}-${m.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/80"
            >
              {m.kind === 'place' && <MapPin className="h-3 w-3 text-sky-400" />}
              {m.kind === 'group' && <Users className="h-3 w-3 text-violet-400" />}
              {m.name}
            </span>
          ))}
          {!expanded && allMembers.length > 6 && (
            <span className="text-xs text-white/40 self-center">+{allMembers.length - 6} more</span>
          )}
        </div>

        {(anchor.startDate || anchor.endDate) && (
          <div className="flex items-center gap-1.5 text-xs text-white/50 mb-2">
            <Calendar className="h-3 w-3" />
            {anchor.startDate && new Date(anchor.startDate).getFullYear()}
            {anchor.startDate && anchor.endDate && ' — '}
            {anchor.endDate && new Date(anchor.endDate).getFullYear()}
          </div>
        )}

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
            {anchor.evidence.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1.5">Evidence</p>
                <ul className="space-y-1">
                  {anchor.evidence.slice(0, 8).map((ev) => (
                    <li key={ev.id} className="text-xs text-white/70 flex items-start gap-2">
                      <Sparkles className="h-3 w-3 text-primary/70 shrink-0 mt-0.5" />
                      <span>{ev.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {anchor.provenance?.builtAt && (
              <p className="text-xs text-white/30">
                Built {formatDistanceToNow(parseISO(anchor.provenance.builtAt), { addSuffix: true })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NarrativeAnchorsBook() {
  const [anchors, setAnchors] = useState<NarrativeAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadAnchors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<{ anchors: NarrativeAnchor[] }>('/api/narrative-anchors');
      setAnchors(res.anchors ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load anchors');
    } finally {
      setLoading(false);
    }
  }, []);

  const rebuild = useCallback(async () => {
    setRebuilding(true);
    setError(null);
    try {
      const res = await fetchJson<{ anchors: NarrativeAnchor[] }>('/api/narrative-anchors/rebuild', {
        method: 'POST',
      });
      setAnchors(res.anchors ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rebuild failed');
    } finally {
      setRebuilding(false);
    }
  }, []);

  useEffect(() => {
    void loadAnchors();
  }, [loadAnchors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return anchors;
    return anchors.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.entities.some((e) => e.name.toLowerCase().includes(q)) ||
        TYPE_LABELS[a.anchorType].toLowerCase().includes(q),
    );
  }, [anchors, search]);

  const bySection = useMemo(() => {
    const map = new Map<AnchorType, NarrativeAnchor[]>();
    for (const type of SECTION_ORDER) map.set(type, []);
    for (const a of filtered) {
      const list = map.get(a.anchorType) ?? [];
      list.push(a);
      map.set(a.anchorType, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/10">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Anchor className="h-5 w-5 text-primary" />
              Narrative Anchors
            </h1>
            <p className="text-sm text-white/50 mt-0.5">
              Life clusters — eras, arcs, communities, and recurring activities
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void rebuild()}
            disabled={rebuilding}
            className="border-white/20 text-white/80"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${rebuilding ? 'animate-spin' : ''}`} />
            Rebuild
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search anchors, people, places…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-black/40 border-white/15 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ChatFirstViewHint />

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/50">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading anchors…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <Anchor className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No narrative anchors yet.</p>
            <p className="text-sm mt-1">Chat about people, places, and life periods — then rebuild.</p>
            <Button variant="outline" size="sm" className="mt-4 border-white/20" onClick={() => void rebuild()}>
              Discover anchors
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {SECTION_ORDER.map((type) => {
              const section = bySection.get(type) ?? [];
              if (section.length === 0) return null;
              const Icon = TYPE_ICONS[type];
              return (
                <section key={type}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {TYPE_LABELS[type]}
                    <span className="text-white/25 font-normal">({section.length})</span>
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {section.map((anchor) => (
                      <AnchorCard key={anchor.id} anchor={anchor} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
