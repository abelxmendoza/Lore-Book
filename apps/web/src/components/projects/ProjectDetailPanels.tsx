import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Link2,
  MapPin,
  MessageSquare,
  PauseCircle,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { formatMilestoneKind } from '../../mocks/projectModalDemoData';
import {
  buildProjectOmniTimelineSearchQuery,
  buildProjectTimelineClipboardText,
  projectHasEnoughTimelineForLorebook,
} from '../../lib/projectTimelineClipboard';
import { meterFromProjectProfile } from '../../lib/lorebookContentMeter';
import type { LorebookForm } from '../../lib/lorebookTiers';
import { copyTextToClipboard } from '../../lib/listClipboard';
import type { ProjectCardData } from './ProjectProfileCard';
import type { ProjectDetailProfile, ProjectStatus } from './projectModalTypes';
import { LoreEntityChip } from '../lore/LoreEntityChip';
import { LorebookContentMeter } from '../lorebook/LorebookContentMeter';
import { LorebookTierMenu } from '../lorebook/LorebookTierMenu';
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';

export const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; badge: string; icon: typeof CheckCircle2 }
> = {
  active: {
    label: 'Active',
    badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    icon: TrendingUp,
  },
  paused: {
    label: 'Paused',
    badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    icon: PauseCircle,
  },
  completed: {
    label: 'Completed',
    badge: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
    icon: CheckCircle2,
  },
  abandoned: {
    label: 'Abandoned',
    badge: 'bg-white/10 text-white/50 border-white/20',
    icon: XCircle,
  },
};

export const TYPE_GRADIENT: Record<string, string> = {
  software: 'from-violet-600/30 via-indigo-900/20 to-black',
  business: 'from-emerald-600/25 via-teal-900/15 to-black',
  creative: 'from-rose-600/25 via-purple-900/15 to-black',
  fitness: 'from-orange-600/25 via-red-900/15 to-black',
  education: 'from-blue-600/25 via-cyan-900/15 to-black',
  career: 'from-amber-600/25 via-yellow-900/10 to-black',
  hobby: 'from-pink-600/20 via-fuchsia-900/10 to-black',
  default: 'from-primary/25 via-purple-950/20 to-black',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

type OverviewProps = {
  project: ProjectCardData;
  profile: ProjectDetailProfile;
  readOnly: boolean;
  localDescription: string;
  localSummary: string;
  nameDraft: string;
  aliases: string[];
  onNameChange: (v: string) => void;
  onNameBlur: () => void;
  onAliasesChange: (next: string[]) => void;
  onDescriptionChange: (v: string) => void;
  onSummaryChange: (v: string) => void;
  onDescriptionBlur: () => void;
  onSummaryBlur: () => void;
  onStatusChange: (status: string) => void;
};

export function ProjectOverviewTab({
  project,
  profile,
  readOnly,
  localDescription,
  localSummary,
  nameDraft,
  aliases,
  onNameChange,
  onNameBlur,
  onAliasesChange,
  onDescriptionChange,
  onSummaryChange,
  onDescriptionBlur,
  onSummaryBlur,
  onStatusChange,
}: OverviewProps) {
  const status = (project.status ?? 'active') as ProjectStatus;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="border-white/10 bg-black/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Name & aliases
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block" htmlFor="project-name-input">
              Project name
            </label>
            <input
              id="project-name-input"
              type="text"
              disabled={readOnly}
              value={nameDraft}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={onNameBlur}
              data-testid="project-name-input"
              className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-primary/40"
              placeholder="Project name"
            />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1.5">Also known as</p>
            <div className="flex flex-wrap items-center gap-1.5" data-testid="project-alias-editor">
              {aliases.length === 0 && (
                <span className="text-xs text-white/35">No aliases yet</span>
              )}
              {aliases.map((alias) => (
                <span
                  key={alias}
                  className="flex items-center gap-1 text-xs pl-2.5 pr-1 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-200"
                >
                  {alias}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove alias ${alias}`}
                      className="p-0.5 text-violet-200/40 hover:text-red-300"
                      onClick={() => onAliasesChange(aliases.filter((a) => a !== alias))}
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <input
                  type="text"
                  placeholder="Add alias…"
                  aria-label="Add project alias"
                  data-testid="project-alias-input"
                  className="w-28 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs text-white placeholder:text-white/25 focus:border-violet-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const value = e.currentTarget.value.trim();
                    if (!value) return;
                    const next = [...new Set([...aliases, value])];
                    onAliasesChange(next);
                    e.currentTarget.value = '';
                  }}
                />
              )}
            </div>
            <p className="text-[11px] text-white/35 mt-2">
              Aliases help LoreBook match chat mentions like nicknames or short names.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Project brief */}
      <Card className="border-white/10 bg-gradient-to-br from-white/[0.06] to-black/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Project brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(
            [
              ['What', profile.brief.what],
              ['Why it matters', profile.brief.why],
              ['Current state', profile.brief.currentState],
              ['Last activity', profile.brief.lastActivity],
              ['Next step', profile.brief.nextStep],
              ...(profile.brief.openQuestion ? [['Open question', profile.brief.openQuestion] as const] : []),
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-1 sm:gap-3">
              <span className="text-[11px] uppercase tracking-wider text-white/40 font-medium">{label}</span>
              <p className="text-white/80 leading-relaxed">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Status & dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="border-white/10 bg-black/30">
          <CardContent className="pt-4 space-y-3">
            <label className="text-[11px] uppercase tracking-wider text-white/40" htmlFor="project-status-select">
              Lifecycle status
            </label>
            <select
              id="project-status-select"
              disabled={readOnly}
              value={project.status ?? 'active'}
              onChange={(e) => onStatusChange(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white disabled:opacity-50"
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key} className="bg-gray-900">
                  {cfg.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/45 flex items-start gap-2">
              <StatusIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              LoreBook tracks whether you still talk about this — change it when your intent shifts.
            </p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/30">
          <CardContent className="pt-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-white/40">Timeline</p>
            <div className="flex items-center gap-2 text-sm text-white/75">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <span>Started {fmtDate(project.started_at)}</span>
            </div>
            {(project as { ended_at?: string | null }).ended_at && (
              <div className="flex items-center gap-2 text-sm text-white/75">
                <CalendarClock className="h-4 w-4 text-white/40 shrink-0" />
                <span>Ended {fmtDate((project as { ended_at?: string | null }).ended_at)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Sparkles className="h-4 w-4 text-amber-400/80 shrink-0" />
              <span>{profile.stats.dayCount} days on this arc</span>
            </div>
            <Badge variant="outline" className={`mt-1 ${statusCfg.badge}`}>
              {profile.currentPhase}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Editable fields */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Purpose line</label>
          <Textarea
            value={localSummary}
            disabled={readOnly}
            onChange={(e) => onSummaryChange(e.target.value)}
            onBlur={onSummaryBlur}
            rows={2}
            placeholder="One sentence: why this project exists…"
            className="bg-black/50 border-white/10 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/40 mb-1 block">Description</label>
          <Textarea
            value={localDescription}
            disabled={readOnly}
            onChange={(e) => onDescriptionChange(e.target.value)}
            onBlur={onDescriptionBlur}
            rows={4}
            placeholder="Goals, scope, context…"
            className="bg-black/50 border-white/10 text-sm text-white min-h-[100px]"
          />
        </div>
      </div>

      {profile.openLoops.length > 0 && (
        <Card className="border-amber-500/25 bg-amber-950/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-100 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Open loops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-amber-100/80">
              {profile.openLoops.map((loop, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-400">•</span>
                  {loop}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type TimelineTabProps = {
  project: ProjectCardData;
  profile: ProjectDetailProfile;
  onOpenInOmniTimeline?: (query: string) => void;
  onCreateLorebook?: (form?: LorebookForm) => void;
};

export function ProjectTimelineTab({
  project,
  profile,
  onOpenInOmniTimeline,
  onCreateLorebook,
}: TimelineTabProps) {
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lorebookMeter = useMemo(() => meterFromProjectProfile(profile), [profile]);
  const canMakeLorebook =
    Boolean(lorebookMeter.tierOffer?.canCreateAny) ||
    projectHasEnoughTimelineForLorebook(profile);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const sorted = useMemo(
    () =>
      [...profile.milestones].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [profile.milestones],
  );

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return sorted;
    return sorted.filter((m) => {
      const hay = `${m.title} ${m.summary ?? ''} ${m.kind} ${formatMilestoneKind(m.kind)}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [sorted, query]);

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(buildProjectTimelineClipboardText(project, profile));
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-xs text-white/45">
          Milestones inferred from chat — ★ milestone · ↻ pivot · ⏸ pause · ✦ breakthrough
        </p>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="project-timeline-copy-all"
            onClick={() => void handleCopyAll()}
            disabled={profile.milestones.length === 0 && !profile.storyBeats.length}
            className="text-[11px] h-8"
            leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          >
            {copied ? 'Copied' : 'Copy all'}
          </Button>
          {onOpenInOmniTimeline && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="project-timeline-open-omni"
              onClick={() =>
                onOpenInOmniTimeline(buildProjectOmniTimelineSearchQuery(project))
              }
              className="text-[11px] h-8"
              leftIcon={<CalendarClock className="h-3.5 w-3.5" />}
            >
              Timeline
            </Button>
          )}
          {onCreateLorebook && (
            <div
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 pl-2 pr-2 py-1"
              data-testid="project-timeline-make-lorebook"
            >
              {lorebookMeter.tierOffer ? (
                <LorebookTierMenu
                  tierOffer={lorebookMeter.tierOffer}
                  forceEnable={canMakeLorebook && !lorebookMeter.tierOffer.canCreateAny}
                  onSelectForm={(form) => onCreateLorebook(form)}
                  subjectLabel={project.name}
                  testId="project-lorebook-tier-menu"
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!canMakeLorebook}
                  title={lorebookMeter.detailLabel}
                  onClick={() => onCreateLorebook()}
                  className="text-[11px] h-7 px-2 text-amber-200 hover:text-amber-100"
                >
                  LoreBook
                </Button>
              )}
              <LorebookContentMeter meter={lorebookMeter} />
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${project.name} timeline…`}
          data-testid="project-timeline-search"
          className="w-full rounded-lg border border-white/10 bg-black/30 pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-primary/40"
        />
      </div>

      <EntityTimelinePanel<SwimlaneEvent>
        icon={GitBranch}
        title="Milestones"
        subtitle="Milestones inferred from chat — ★ milestone · ↻ pivot · ⏸ pause · ✦ breakthrough"
        lanes={[{ key: 'milestones', label: 'Milestones', accent: 'violet' }]}
        events={filtered.map((m): SwimlaneEvent => ({
          id: m.id,
          title: m.title,
          date: m.date,
          laneKey: 'milestones',
          type: formatMilestoneKind(m.kind),
          summary: m.summary ?? undefined,
        }))}
        emptyTitle={sorted.length === 0 ? 'No milestones yet' : 'No milestones match that search'}
        emptyHint={
          sorted.length === 0
            ? 'Talk about this project in chat to grow its timeline.'
            : 'Try a different search term.'
        }
        renderListItem={(m) => (
          <>
            <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-black/80 bg-primary" />
            <div className="w-full rounded-xl border border-white/10 bg-black/35 p-3 sm:p-4 hover:border-primary/30 transition-colors">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wide text-primary/80 font-semibold">
                  {m.type}
                </span>
                <span className="text-[11px] text-white/40">{fmtDate(m.date)}</span>
              </div>
              <h4 className="text-sm font-semibold text-white">{m.title}</h4>
              {m.summary && (
                <p className="text-xs text-white/55 mt-1 leading-relaxed">{m.summary}</p>
              )}
            </div>
          </>
        )}
        footer={null}
      />
    </div>
  );
}

export function ProjectPeopleTab({ profile }: { profile: ProjectDetailProfile }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-white/45">People who shaped this effort — from chat mentions and linked characters.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.contributors.map((c) => (
          <Card key={c.id} className="border-white/10 bg-black/30 hover:border-violet-500/30 transition-colors">
            <CardContent className="pt-4 flex gap-3">
              <div className="h-10 w-10 rounded-full border-2 border-blue-500/40 bg-blue-500/15 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-blue-300" />
              </div>
              <div className="min-w-0 flex-1">
                <LoreEntityChip kind="person" className="mb-1.5">
                  {c.name}
                </LoreEntityChip>
                <p className="text-xs text-white/50">{c.role}</p>
                <p className="text-[11px] text-white/35 mt-1">
                  {c.momentCount} moment{c.momentCount !== 1 ? 's' : ''}
                  {c.lastActive ? ` · last ${fmtDate(c.lastActive)}` : ''}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {profile.locations.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> Places tied to this project
          </h4>
          <div className="flex flex-wrap gap-2">
            {profile.locations.map((loc) => (
              <LoreEntityChip key={loc.id} kind="place">
                {loc.name}
              </LoreEntityChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectSkillsTab({ profile }: { profile: ProjectDetailProfile }) {
  const kindIcon = (kind: string) => {
    if (kind === 'thread') return MessageSquare;
    if (kind === 'file' || kind === 'doc') return FileText;
    if (kind === 'link') return ExternalLink;
    return FolderOpen;
  };

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5" /> Skills practiced
        </h4>
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((s) => (
            <LoreEntityChip key={s.id} kind="skill">
              {s.name}
              {s.level ? ` · ${s.level}` : ''}
            </LoreEntityChip>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Files, links & threads
        </h4>
        <div className="space-y-2">
          {profile.resources.map((r) => {
            const Icon = kindIcon(r.kind);
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 hover:border-white/20 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-white/50" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{r.title}</p>
                  <p className="text-[10px] uppercase text-white/35">{r.kind}</p>
                </div>
                {r.url && (
                  <ExternalLink className="h-3.5 w-3.5 text-white/30 shrink-0" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function ProjectStoryTab({ profile }: { profile: ProjectDetailProfile }) {
  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" /> Story & history
        </h4>
        <div className="space-y-3">
          {profile.storyBeats.map((beat) => (
            <Card key={beat.id} className="border-white/10 bg-gradient-to-br from-white/[0.04] to-black/40">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-white">{beat.title}</h4>
                  {beat.date && <span className="text-[10px] text-white/35">{fmtDate(beat.date)}</span>}
                </div>
                <p className="text-sm text-white/65 leading-relaxed">{beat.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {profile.decisions.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-white/40 mb-3 flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Decisions
          </h4>
          <div className="space-y-3">
            {profile.decisions.map((d) => (
              <Card key={d.id} className="border-violet-500/20 bg-violet-950/15">
                <CardContent className="pt-4 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{d.decision}</span>
                    <span className="text-[10px] text-white/35">{fmtDate(d.date)}</span>
                  </div>
                  {d.options && (
                    <p className="text-xs text-white/45">
                      <span className="text-white/30">Options: </span>
                      {d.options}
                    </p>
                  )}
                  <p className="text-xs text-emerald-200/90">
                    <span className="text-white/40">Chose: </span>
                    {d.chosen}
                  </p>
                  {d.reason && (
                    <p className="text-xs text-white/55 italic border-l-2 border-violet-500/40 pl-2">{d.reason}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type ChatTabProps = {
  project: ProjectCardData;
  profile: ProjectDetailProfile;
  onAsk: (prompt: string) => void;
};

export function ProjectChatTab({ project, profile, onAsk }: ChatTabProps) {
  const prompts = [
    `Where am I on "${project.name}" right now?`,
    `What milestones have I hit for ${project.name}?`,
    `Who has helped with ${project.name}?`,
    `Should I mark ${project.name} as paused or abandoned?`,
    profile.brief.openQuestion ?? `What's the next step on ${project.name}?`,
  ];

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-black/50">
        <CardContent className="pt-5 pb-5 text-center space-y-3">
          <MessageSquare className="h-8 w-8 text-primary mx-auto opacity-80" />
          <p className="text-sm text-white/80 max-w-md mx-auto leading-relaxed">
            Chat is how LoreBook learns project state over time. Ask about progress, pick up paused work, or log a
            milestone — it all links back here.
          </p>
          <Button
            type="button"
            className="gap-2"
            onClick={() =>
              onAsk(
                `Tell me about my project "${project.name}" — status (${project.status}), progress, milestones, and what I should focus on next.`
              )
            }
          >
            <MessageSquare className="h-4 w-4" />
            Open chat about this project
          </Button>
        </CardContent>
      </Card>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Suggested prompts</p>
        <div className="flex flex-wrap gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onAsk(p)}
              className="text-left text-xs rounded-xl border border-white/10 bg-white/[0.04] hover:border-primary/40 hover:bg-primary/10 text-white/70 hover:text-white px-3 py-2 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProjectHeroStats({ profile }: { profile: ProjectDetailProfile }) {
  const items = [
    { label: 'Moments', value: profile.stats.momentCount },
    { label: 'Threads', value: profile.stats.threadCount },
    { label: 'Days', value: profile.stats.dayCount },
    { label: 'Last', value: profile.stats.lastActiveLabel },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-2">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-md sm:rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 sm:px-2.5 sm:py-2 text-center min-w-0"
        >
          <p className="text-[8px] sm:text-[10px] uppercase tracking-wide text-white/35 truncate">{label}</p>
          <p className="text-xs sm:text-base font-semibold text-white tabular-nums truncate">{value}</p>
        </div>
      ))}
    </div>
  );
}
