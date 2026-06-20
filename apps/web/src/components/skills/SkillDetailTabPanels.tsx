import {
  Activity,
  BookOpen,
  Brain,
  FileText,
  GitBranch,
  Lightbulb,
  Link2,
  MapPin,
  MessageSquare,
  ScrollText,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import type { Skill, SkillMetadata, SkillProgress } from '../../types/skill';
import type { SkillProfile } from '../../lib/skillProfile';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import { cn } from '../../lib/cn';
import {
  formatCategoryHierarchy,
  formatFirstSeen,
  formatLastUsed,
  formatSkillCertainty,
  formatSkillCertaintyDetail,
  formatSkillCertaintyTitle,
  evidenceScoreToCertainty,
  levelLabel,
  levelProgressSegments,
  readRelatedSkillNames,
  skillCertaintyFieldLabel,
  usageCountLabel,
  usageFrequencyLabel,
} from '../../lib/skillStory';
import {
  getSkillActivityBuckets,
  getSkillAiInsights,
  getSkillEvidenceItems,
  getSkillGrowthTimeline,
  getSkillMemories,
  getSkillMetaDump,
  getSkillPortfolioItems,
  getSkillStoryBeats,
  getSkillStoryNarrative,
} from '../../mocks/skillStoryDemoData';
import { slugId } from '../../lib/skillEntityNavigation';

type Theme = ReturnType<typeof skillCategoryTheme>;

export type SkillEntityNavigation = {
  onOpenCharacter: (c: { id: string; name: string }) => void;
  onOpenLocation: (l: { id: string; name: string }) => void;
  onOpenOrganization: (o: { id: string; name: string }) => void;
  onOpenProject: (p: { id: string; name: string }) => void;
  onOpenRelatedSkill: (name: string) => void;
  onOpenMemory?: (mem: { id: string; summary: string; date: string }) => void;
};

type BaseProps = {
  skill: Skill;
  profile?: SkillProfile;
  details?: SkillMetadata | null;
  theme: Theme;
  nav?: SkillEntityNavigation;
};

function NavChip({
  label,
  className,
  onClick,
}: {
  label: string;
  className?: string;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <Badge variant="outline" className={className}>
        {label}
      </Badge>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border text-xs px-2 py-0.5 transition-colors touch-manipulation',
        'hover:brightness-125 active:scale-[0.98] cursor-pointer',
        className,
      )}
    >
      {label}
    </button>
  );
}

export function SkillStoryTab({ skill, details, theme, nav }: BaseProps) {
  const narrative = getSkillStoryNarrative(skill, details);
  const beats = getSkillStoryBeats(skill, details);

  const openBeat = (beat: ReturnType<typeof getSkillStoryBeats>[number]) => {
    if (!nav) return;
    if (beat.kind === 'project' && beat.title.startsWith('Built ')) {
      const name = beat.title.replace(/^Built\s+/i, '').trim();
      nav.onOpenProject({ id: slugId(name, 'project'), name });
    }
  };

  return (
    <div className="space-y-4">
      <Card className={cn('border', theme.levelPanel)}>
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1">
            <ScrollText className={cn('h-3 w-3', theme.icon)} /> Your story
          </p>
          <p className="text-sm text-white/90 leading-relaxed">{narrative}</p>
        </CardContent>
      </Card>

      <div className="relative pl-4 border-l border-white/10 space-y-4">
        {beats.map((beat, i) => {
          const clickable = nav && beat.kind === 'project';
          return (
          <div key={beat.id} className="relative">
            <span className={cn('absolute -left-[1.125rem] top-1 h-2 w-2 rounded-full ring-2 ring-black', theme.statBg.replace('bg-', 'bg-'))} />
            <p className="text-[10px] text-white/40 uppercase tracking-wide">
              {format(parseISO(beat.date), 'MMM yyyy')}
            </p>
            {clickable ? (
              <button
                type="button"
                onClick={() => openBeat(beat)}
                className={cn('text-sm font-semibold text-left hover:underline', theme.accentText)}
              >
                {beat.title}
              </button>
            ) : (
              <p className={cn('text-sm font-semibold', theme.accentText)}>{beat.title}</p>
            )}
            {beat.description && (
              <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{beat.description}</p>
            )}
            {i < beats.length - 1 && (
              <span className="block text-white/20 text-lg leading-none my-1" aria-hidden>↓</span>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkillEvidenceTab({ skill, profile, theme, nav }: BaseProps) {
  const items = getSkillEvidenceItems(skill);
  const certainty = evidenceScoreToCertainty(
    profile?.evidence_score ?? Math.round(skill.confidence_score * 100),
  );

  const sourceIcon = (type: string) => {
    switch (type) {
      case 'project':
        return GitBranch;
      case 'file':
        return FileText;
      case 'note':
        return BookOpen;
      default:
        return MessageSquare;
    }
  };

  const handleEvidenceClick = (item: ReturnType<typeof getSkillEvidenceItems>[number]) => {
    if (!nav) return;
    if (item.source_type === 'project') {
      const title = item.title.replace(/\s+repository$/i, '').trim();
      nav.onOpenProject({ id: slugId(title, 'project'), name: title });
    } else if (item.source_type === 'chat' || item.source_type === 'journal') {
      nav.onOpenMemory?.({ id: item.id, summary: item.excerpt, date: item.date });
    }
  };

  return (
    <div className="space-y-3">
      <div className={cn('rounded-lg border p-3 flex items-center justify-between', theme.levelPanel)}>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45">{skillCertaintyFieldLabel()}</p>
          <p className={cn('text-lg font-bold leading-tight', theme.statValue)}>{formatSkillCertainty(certainty)}</p>
          <p className="text-[10px] text-white/45 mt-0.5">{formatSkillCertaintyDetail(certainty)}</p>
        </div>
        <Shield className={cn('h-8 w-8 opacity-40', theme.icon)} />
      </div>
      <p className="text-xs text-white/50">
        LoreBook tracks skills it can back up. Each source below helped verify this one.
      </p>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = sourceIcon(item.source_type);
          const clickable = nav && (item.source_type === 'project' || item.source_type === 'chat');
          const Wrapper = clickable ? 'button' : 'div';
          return (
            <Card key={item.id} className="bg-black/40 border border-white/10">
              <CardContent className="p-0">
                <Wrapper
                  type={clickable ? 'button' : undefined}
                  onClick={clickable ? () => handleEvidenceClick(item) : undefined}
                  className={cn(
                    'w-full text-left p-3',
                    clickable && 'hover:bg-white/[0.04] transition-colors cursor-pointer touch-manipulation',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', theme.icon)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white capitalize">{item.title}</p>
                        <span className="text-[10px] text-white/40 shrink-0">
                          {format(parseISO(item.date), 'MMM yyyy')}
                        </span>
                      </div>
                      <p className="text-xs text-white/70 mt-1 leading-relaxed">{item.excerpt}</p>
                      {item.confidence_delta != null && (
                        <p className={cn('text-[10px] mt-1.5 font-medium', theme.accentText)}>
                          Verified more strongly
                          {clickable && <span className="text-white/40 font-normal"> · Tap to open</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </Wrapper>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function SkillGrowthTimelineTab({ skill, theme }: BaseProps) {
  const points = getSkillGrowthTimeline(skill);

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">Chronological growth — level milestones over time.</p>
      <div className="space-y-0">
        {points.map((point, i) => (
          <div key={point.date} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('h-3 w-3 rounded-full border-2', theme.border, theme.statBg)} />
              {i < points.length - 1 && <span className="w-px flex-1 bg-white/10 min-h-[2rem]" />}
            </div>
            <div className="pb-4 min-w-0">
              <p className="text-[10px] text-white/40 uppercase">{point.date}</p>
              <p className={cn('text-sm font-semibold', theme.accentText)}>{point.label}</p>
              {i === points.length - 1 && (
                <Badge className={cn('mt-1 text-[10px] border', theme.badge)}>Current</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkillConnectionsTab({
  skill,
  profile,
  details,
  theme,
  relatedCharacters,
  relatedOrganizations,
  nav,
}: BaseProps & {
  relatedCharacters: Array<{ id: string; name: string; role?: string; relationship?: string }>;
  relatedOrganizations: Array<{ id: string; name: string; type?: string }>;
}) {
  const relatedSkills = readRelatedSkillNames(skill.metadata);
  const projects = profile?.related_projects ?? [];
  const places = [
    ...(details?.learned_at ?? []).map((loc) => ({
      id: loc.location_id,
      name: loc.location_name,
    })),
    ...(details?.practiced_at ?? []).map((loc) => ({
      id: loc.location_id,
      name: loc.location_name,
    })),
  ].filter((loc, i, arr) => arr.findIndex((x) => x.id === loc.id) === i);

  return (
    <div className="space-y-3">
      {relatedSkills.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Related skills</p>
          <div className="flex flex-wrap gap-1.5">
            {relatedSkills.map((name) => (
              <NavChip
                key={name}
                label={name}
                className={cn('text-xs border', theme.chip)}
                onClick={nav ? () => nav.onOpenRelatedSkill(name) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Related projects</p>
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <NavChip
                key={p}
                label={p}
                className="text-xs border-amber-500/35 bg-amber-500/10 text-amber-200"
                onClick={nav ? () => nav.onOpenProject({ id: slugId(p, 'project'), name: p }) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {profile?.related_jobs && profile.related_jobs.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Work contexts</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.related_jobs.map((job) => (
              <NavChip
                key={job}
                label={job}
                className="text-xs border-purple-500/35 bg-purple-500/10 text-purple-200"
                onClick={nav ? () => nav.onOpenOrganization({ id: slugId(job, 'org'), name: job }) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {relatedCharacters.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" /> People
          </p>
          <div className="space-y-1.5">
            {relatedCharacters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => nav?.onOpenCharacter({ id: c.id, name: c.name })}
                className="w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2 hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors touch-manipulation"
              >
                <p className="text-sm text-white">{c.name}</p>
                {c.relationship && <p className="text-[10px] text-white/45">{c.relationship}</p>}
              </button>
            ))}
          </div>
        </section>
      )}

      {places.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Places
          </p>
          <div className="flex flex-wrap gap-1.5">
            {places.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => nav?.onOpenLocation({ id: loc.id, name: loc.name })}
                className="text-xs px-2 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-200 hover:bg-green-500/20 transition-colors touch-manipulation"
              >
                {loc.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {relatedOrganizations.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Organizations</p>
          <div className="space-y-1.5">
            {relatedOrganizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => nav?.onOpenOrganization({ id: org.id, name: org.name })}
                className="w-full text-left rounded-lg border border-purple-500/25 bg-purple-500/10 px-3 py-2 hover:bg-purple-500/20 transition-colors touch-manipulation"
              >
                <p className="text-sm text-purple-100">{org.name}</p>
                {org.type && <p className="text-[10px] text-purple-200/60 capitalize">{org.type}</p>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function SkillActivityTab({ skill, theme }: BaseProps) {
  const buckets = getSkillActivityBuckets(skill);

  return (
    <div className="space-y-3">
      {buckets.map((bucket) => (
        <Card key={bucket.label} className={cn('border', theme.statBorder, 'bg-black/30')}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/70">{bucket.label}</p>
              <p className={cn('text-lg font-bold tabular-nums', theme.statValue)}>{bucket.count}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bucket.categories.map((cat) => (
                <span key={cat.label} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/55 border border-white/10">
                  {cat.label}: {cat.count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SkillProficiencyTab({ skill, profile, theme }: BaseProps) {
  const breakdown = profile?.proficiency_breakdown ?? {
    knowledge: profile?.proficiency ?? 50,
    experience: 50,
    recency: 50,
    confidence: Math.round(skill.confidence_score * 100),
  };

  const rows = [
    { label: 'Knowledge', sub: 'How much they know', value: breakdown.knowledge, icon: Brain },
    { label: 'Experience', sub: 'How much they\'ve done', value: breakdown.experience, icon: Activity },
    { label: 'Recency', sub: 'How recently used', value: breakdown.recency, icon: TrendingUp },
    {
      label: skillCertaintyFieldLabel(),
      sub: 'How well LoreBook can back this up',
      value: breakdown.confidence,
      icon: Shield,
      isCertainty: true,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">Four dimensions — not a single arbitrary score.</p>
      {rows.map(({ label, sub, value, icon: Icon, isCertainty }) => (
        <div key={label} className={cn('rounded-lg border p-3', theme.statBg, theme.statBorder)}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className={cn('h-4 w-4', theme.icon)} />
            <div>
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-[10px] text-white/45">{sub}</p>
            </div>
            <p
              className={cn('ml-auto text-sm font-bold text-right leading-tight', theme.statValue)}
              title={isCertainty ? formatSkillCertaintyTitle(value / 100) : undefined}
            >
              {isCertainty ? formatSkillCertainty(value / 100) : `${value}%`}
            </p>
          </div>
          <div className={cn('h-2 rounded-full overflow-hidden', theme.progressTrack)}>
            <div className={cn('h-full bg-gradient-to-r rounded-full', theme.progress)} style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkillPortfolioTab({ skill, theme, nav }: BaseProps) {
  const items = getSkillPortfolioItems(skill);

  if (items.length === 0) {
    return <p className="text-sm text-white/50 py-8 text-center">No portfolio items linked yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            if (item.kind === 'project') {
              nav?.onOpenProject({ id: slugId(item.title, 'project'), name: item.title });
            } else {
              nav?.onOpenOrganization({ id: slugId(item.title, 'org'), name: item.title });
            }
          }}
          className="w-full text-left rounded-lg border border-white/10 bg-black/40 p-3 hover:border-white/25 hover:bg-black/55 transition-colors touch-manipulation"
        >
          <p className="text-sm font-semibold text-white">{item.title}</p>
          <p className="text-[10px] text-white/45 uppercase tracking-wide mt-0.5">{item.subtitle}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {item.skills.map((s) => (
              <Badge
                key={s}
                variant="outline"
                className={cn('text-[10px] border', theme.chip)}
                onClick={(e) => {
                  e.stopPropagation();
                  nav?.onOpenRelatedSkill(s);
                }}
              >
                {s}
              </Badge>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

export function SkillRelationshipsTab({ details, theme, nav }: BaseProps) {
  const learned = details?.learned_from ?? [];
  const practiced = details?.practiced_with ?? [];

  if (learned.length === 0 && practiced.length === 0) {
    return <p className="text-sm text-white/50 py-8 text-center">Relationships appear as people show up in your story.</p>;
  }

  return (
    <div className="space-y-4">
      {learned.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-blue-300/80 mb-2">Learned from</p>
          {learned.map((t) => (
            <button
              key={t.character_id}
              type="button"
              onClick={() => nav?.onOpenCharacter({ id: t.character_id, name: t.character_name })}
              className="block w-full text-left rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2 mb-1.5"
            >
              <p className="text-sm text-blue-100">{t.character_name}</p>
              <p className="text-[10px] text-blue-200/60 capitalize">{t.relationship_type}</p>
            </button>
          ))}
        </section>
      )}
      {practiced.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Worked with</p>
          {practiced.map((p) => (
            <button
              key={p.character_id}
              type="button"
              onClick={() => nav?.onOpenCharacter({ id: p.character_id, name: p.character_name })}
              className="block w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2 mb-1.5"
            >
              <p className="text-sm text-white">{p.character_name}</p>
              <p className="text-[10px] text-white/45">{p.practice_count} sessions</p>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

export function SkillInsightsTab({ skill, profile, theme }: BaseProps) {
  const insights = getSkillAiInsights(skill, profile);

  return (
    <div className="space-y-2">
      {insights.map((text, i) => (
        <Card key={i} className={cn('border', theme.levelPanel)}>
          <CardContent className="p-3 flex gap-2">
            <Lightbulb className={cn('h-4 w-4 shrink-0 mt-0.5', theme.icon)} />
            <p className="text-sm text-white/85 leading-relaxed">{text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SkillMemoriesTab({ skill, theme, nav }: BaseProps) {
  const memories = getSkillMemories(skill);

  return (
    <div className="space-y-0 divide-y divide-white/5 border border-white/10 rounded-lg overflow-hidden">
      {memories.map((mem) => (
        <button
          key={mem.id}
          type="button"
          onClick={() => nav?.onOpenMemory?.({ id: mem.id, summary: mem.summary, date: mem.date })}
          className="w-full text-left px-3 py-2.5 bg-black/25 hover:bg-black/40 transition-colors touch-manipulation"
        >
          <p className="text-[10px] text-white/40">{format(parseISO(mem.date), 'MMM d yyyy')}</p>
          <p className="text-sm text-white/80">{mem.summary}</p>
        </button>
      ))}
    </div>
  );
}

export function SkillMetaTab({ skill }: { skill: Skill }) {
  const meta = getSkillMetaDump(skill);

  return (
    <div className="space-y-3 font-mono text-[11px]">
      <p className="text-white/45 text-xs font-sans">Power-user provenance — lexical intelligence & entity links.</p>
      <pre className="rounded-lg border border-white/10 bg-black/50 p-3 text-white/70 overflow-x-auto">
        {JSON.stringify(meta, null, 2)}
      </pre>
      <pre className="rounded-lg border border-purple-500/20 bg-purple-950/20 p-3 text-purple-200/70 overflow-x-auto max-h-48">
        {JSON.stringify(skill.metadata, null, 2)}
      </pre>
    </div>
  );
}

export function SkillOverviewExtras({
  skill,
  profile,
  theme,
  nav,
}: {
  skill: Skill;
  profile?: SkillProfile;
  theme: Theme;
  nav?: SkillEntityNavigation;
}) {
  const related = readRelatedSkillNames(skill.metadata);
  const segments = levelProgressSegments(skill.current_level);
  const filled = Math.round((segments * (profile?.proficiency ?? skill.current_level * 8)) / 100);

  return (
    <div className="space-y-3">
      <div className={cn('rounded-lg border p-3', theme.levelPanel)}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className={cn('text-lg font-bold', theme.accentText)}>{skill.skill_name}</p>
          <Badge className={cn('border capitalize', theme.badge)}>{levelLabel(skill.current_level)}</Badge>
        </div>
        <div className="flex gap-0.5 mb-2" aria-hidden>
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={cn('h-2 flex-1 rounded-sm', i < filled ? cn('bg-gradient-to-r', theme.progress) : theme.progressTrack)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
          <span>{usageFrequencyLabel(profile?.usage_frequency)}</span>
          <span>Last used {formatLastUsed(skill.last_practiced_at, profile)}</span>
        </div>
      </div>

      {(profile?.related_projects?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">Part of</p>
          <div className="flex flex-wrap gap-1.5">
            {profile!.category_domain && (
              <Badge variant="outline" className={cn('text-[10px] border', theme.chip)}>{profile!.category_domain}</Badge>
            )}
            {profile!.related_projects!.map((p) => (
              <NavChip
                key={p}
                label={p}
                className="text-[10px] border-amber-500/35 bg-amber-500/10 text-amber-200"
                onClick={nav ? () => nav.onOpenProject({ id: slugId(p, 'project'), name: p }) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5 flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Related skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {related.map((name) => (
              <NavChip
                key={name}
                label={name}
                className={cn('text-[10px] border', theme.chip)}
                onClick={nav ? () => nav.onOpenRelatedSkill(name) : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function skillDetailTabMeta() {
  return {
    overviewFields: {
      formatCategoryHierarchy,
      formatFirstSeen,
      formatLastUsed,
      usageCountLabel,
      confidenceLabel: formatSkillCertainty,
      levelLabel,
    },
  };
}

export type SkillDetailTabKey =
  | 'overview'
  | 'story'
  | 'evidence'
  | 'timeline'
  | 'connections'
  | 'activity'
  | 'proficiency'
  | 'portfolio'
  | 'relationships'
  | 'insights'
  | 'memories'
  | 'meta';

export const SKILL_DETAIL_TABS: Array<{
  key: SkillDetailTabKey;
  label: string;
  shortLabel: string;
  icon: typeof Sparkles;
  hidden?: boolean;
}> = [
  { key: 'overview', label: 'Overview', shortLabel: 'Overview', icon: Sparkles },
  { key: 'story', label: 'Story', shortLabel: 'Story', icon: ScrollText },
  { key: 'evidence', label: 'Evidence', shortLabel: 'Proof', icon: Shield },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Time', icon: TrendingUp },
  { key: 'connections', label: 'Connections', shortLabel: 'Links', icon: Link2 },
  { key: 'activity', label: 'Activity', shortLabel: 'Activity', icon: Activity },
  { key: 'proficiency', label: 'Proficiency', shortLabel: 'Prof.', icon: Brain },
  { key: 'portfolio', label: 'Portfolio', shortLabel: 'Work', icon: BookOpen },
  { key: 'relationships', label: 'Relationships', shortLabel: 'People', icon: Users },
  { key: 'insights', label: 'AI Insights', shortLabel: 'AI', icon: Lightbulb },
  { key: 'memories', label: 'Memories', shortLabel: 'Mem', icon: MessageSquare },
  { key: 'meta', label: 'Meta', shortLabel: 'Meta', icon: FileText, hidden: true },
];
