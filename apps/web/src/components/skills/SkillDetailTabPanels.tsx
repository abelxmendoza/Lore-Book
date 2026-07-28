import {
  Activity,
  BookOpen,
  Brain,
  Clock,
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
import { EntityTimelinePanel } from '../common/EntityTimelinePanel';
import type { SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import type { Skill, SkillMetadata } from '../../types/skill';
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
    <div className="space-y-4 min-w-0">
      <Card className={cn('border', theme.levelPanel)}>
        <CardContent className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1">
            <ScrollText className={cn('h-3 w-3', theme.icon)} /> Your story
          </p>
          <p className="text-sm text-white/90 leading-relaxed">{narrative}</p>
          <p className="text-[11px] text-white/40 mt-3 leading-relaxed">
            Story is the narrative — how this skill fits your life. For when things happened, use Timeline.
          </p>
        </CardContent>
      </Card>

      <div className="relative pl-4 border-l border-white/10 space-y-4">
        {beats.map((beat, i) => {
          const clickable = nav && beat.kind === 'project';
          return (
            <div key={beat.id} className="relative">
              <span className={cn('absolute -left-[1.125rem] top-1 h-2 w-2 rounded-full ring-2 ring-black', theme.statBg)} />
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
                <span className="block text-white/20 text-lg leading-none my-1" aria-hidden>
                  ↓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Same EntityTimelinePanel / swimlanes chrome as Groups & Places —
 * chronological *when*, not narrative *story*.
 */
export function SkillTimelineTab({
  skill,
  theme,
  loading,
  practiceEvents = [],
  onEventSelect,
}: BaseProps & {
  loading?: boolean;
  practiceEvents?: Array<{
    id: string;
    title: string;
    date: string;
    description?: string;
    type?: string;
  }>;
  onEventSelect?: (event: SwimlaneEvent) => void;
}) {
  const growth = getSkillGrowthTimeline(skill);
  const memories = getSkillMemories(skill);

  const events: SwimlaneEvent[] = [
    ...growth.map((point, idx) => ({
      id: `growth-${point.date}`,
      title: point.label,
      date: point.date,
      laneKey: 'growth',
      type: 'level',
      meta: idx === growth.length - 1 ? 'Current level band' : undefined,
    })),
    ...practiceEvents.map((ev) => ({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      laneKey: 'practice',
      type: ev.type,
      summary: ev.description,
    })),
    // Demo fallback moments when no journal/achievement events loaded yet
    ...(practiceEvents.length === 0
      ? memories.map((mem) => ({
          id: mem.id,
          title: mem.summary,
          date: mem.date,
          laneKey: 'practice',
          type: 'moment',
        }))
      : []),
  ];

  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden isolate">
      <EntityTimelinePanel<SwimlaneEvent>
        icon={Clock}
        title={`${skill.skill_name} across time`}
        subtitle="When you practiced, leveled up, and logged moments — same lanes chrome as Groups."
        lanes={[
          { key: 'growth', label: 'Levels', accent: 'violet' },
          { key: 'practice', label: 'Practice & moments', accent: 'sky' },
        ]}
        events={events}
        loading={loading}
        emptyTitle="No timeline yet"
        emptyHint="Practice sessions, level-ups, and related moments will show up here."
        defaultView="list"
        onEventSelect={onEventSelect}
      />
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
        Proof that LoreBook can stand behind this skill — chats, projects, notes, and journals that mention or demonstrate it. Not a diary (that’s Timeline) and not a narrative (that’s Story).
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

      {(() => {
        const portfolio = getSkillPortfolioItems(skill);
        if (portfolio.length === 0) return null;
        return (
          <section className="pt-1">
            <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Work artifacts</p>
            <div className="space-y-2">
              {portfolio.map((item) => (
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
                </button>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}

export function SkillChatTab({
  skill,
  onOpenMainChat,
}: {
  skill: Skill;
  /** Explicit user action — never call from tab navigation. */
  onOpenMainChat: (prompt?: string) => void;
}) {
  const prompts = [
    `Tell me about my ${skill.skill_name} skill — where I'm at and what to focus on next.`,
    `How have I grown in ${skill.skill_name}?`,
    `Who taught me ${skill.skill_name}, and where have I practiced?`,
    `What should I practice next for ${skill.skill_name}?`,
  ];

  return (
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-black/50 p-4 sm:p-5 text-center space-y-3">
        <MessageSquare className="h-8 w-8 text-primary mx-auto opacity-80" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">Chat about {skill.skill_name}</h3>
          <p className="text-xs sm:text-sm text-white/65 max-w-md mx-auto leading-relaxed">
            Stay here to pick a prompt. Main chat opens only when you tap a prompt or the button below — not when you open this tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenMainChat()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary/25 border border-primary/40 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/35 touch-manipulation min-h-[44px]"
        >
          <MessageSquare className="h-4 w-4" />
          Open chat about this skill
        </button>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 mb-2">Suggested prompts</p>
        <div className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onOpenMainChat(prompt)}
              className="w-full text-left text-xs rounded-xl border border-white/10 bg-white/[0.04] hover:border-primary/40 hover:bg-primary/10 text-white/70 hover:text-white px-3 py-2.5 transition-colors touch-manipulation min-h-[44px]"
            >
              {prompt}
            </button>
          ))}
        </div>
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
  const learned = details?.learned_from ?? [];
  const practiced = details?.practiced_with ?? [];

  const empty =
    relatedSkills.length === 0 &&
    projects.length === 0 &&
    !(profile?.related_jobs && profile.related_jobs.length > 0) &&
    relatedCharacters.length === 0 &&
    places.length === 0 &&
    relatedOrganizations.length === 0 &&
    learned.length === 0 &&
    practiced.length === 0;

  if (empty) {
    return (
      <p className="text-sm text-white/50 py-8 text-center">
        Links to people, places, projects, and related skills will appear here as LoreBook learns them.
      </p>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      {learned.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-wider text-blue-300/80 mb-2">Learned from</p>
          {learned.map((t) => (
            <button
              key={t.character_id}
              type="button"
              onClick={() => nav?.onOpenCharacter({ id: t.character_id, name: t.character_name })}
              className="block w-full text-left rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2 mb-1.5 touch-manipulation"
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
              className="block w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2 mb-1.5 touch-manipulation"
            >
              <p className="text-sm text-white">{p.character_name}</p>
              <p className="text-[10px] text-white/45">{p.practice_count} sessions</p>
            </button>
          ))}
        </section>
      )}

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

export function SkillMetaTab({ skill }: { skill: Skill }) {
  const meta = getSkillMetaDump(skill);

  return (
    <div className="space-y-3 font-mono text-[11px]">
      <p className="text-white/45 text-xs font-sans">
        Debug / raw metadata — not a product surface. Hidden unless you unlock it from the desktop tab strip.
      </p>
      <pre className="rounded-lg border border-white/10 bg-black/50 p-3 text-white/70 overflow-x-auto">
        {JSON.stringify(meta, null, 2)}
      </pre>
      <pre className="rounded-lg border border-purple-500/20 bg-purple-950/20 p-3 text-purple-200/70 overflow-x-auto max-h-48">
        {JSON.stringify(skill.metadata, null, 2)}
      </pre>
    </div>
  );
}

/** Compact proficiency bars + AI notes for Overview (not worth their own nav tabs). */
export function SkillOverviewDepth({
  skill,
  profile,
  theme,
}: {
  skill: Skill;
  profile?: SkillProfile;
  theme: Theme;
}) {
  const breakdown = profile?.proficiency_breakdown ?? {
    knowledge: profile?.proficiency ?? 50,
    experience: 50,
    recency: 50,
    confidence: Math.round(skill.confidence_score * 100),
  };
  const insights = getSkillAiInsights(skill, profile).slice(0, 2);

  const rows = [
    { label: 'Knowledge', value: breakdown.knowledge, icon: Brain },
    { label: 'Experience', value: breakdown.experience, icon: Activity },
    { label: 'Recency', value: breakdown.recency, icon: TrendingUp },
    {
      label: skillCertaintyFieldLabel(),
      value: breakdown.confidence,
      icon: Shield,
      isCertainty: true as const,
    },
  ];

  return (
    <div className="space-y-3 min-w-0">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2">Proficiency</p>
        <div className="space-y-2">
          {rows.map(({ label, value, icon: Icon, isCertainty }) => (
            <div key={label} className={cn('rounded-lg border px-2.5 py-2', theme.statBg, theme.statBorder)}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={cn('h-3.5 w-3.5', theme.icon)} />
                <p className="text-xs font-medium text-white/80">{label}</p>
                <p
                  className={cn('ml-auto text-xs font-bold', theme.statValue)}
                  title={isCertainty ? formatSkillCertaintyTitle(value / 100) : undefined}
                >
                  {isCertainty ? formatSkillCertainty(value / 100) : `${value}%`}
                </p>
              </div>
              <div className={cn('h-1.5 rounded-full overflow-hidden', theme.progressTrack)}>
                <div className={cn('h-full bg-gradient-to-r rounded-full', theme.progress)} style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {insights.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 flex items-center gap-1">
            <Lightbulb className={cn('h-3 w-3', theme.icon)} /> Notes
          </p>
          <div className="space-y-2">
            {insights.map((text) => (
              <div key={text} className={cn('rounded-lg border p-2.5', theme.levelPanel)}>
                <p className="text-xs text-white/80 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
  | 'chat'
  | 'story'
  | 'timeline'
  | 'evidence'
  | 'connections'
  | 'meta';

export const SKILL_DETAIL_TABS: Array<{
  key: SkillDetailTabKey;
  label: string;
  shortLabel: string;
  icon: typeof Sparkles;
  hidden?: boolean;
}> = [
  { key: 'overview', label: 'Overview', shortLabel: 'Overview', icon: Sparkles },
  { key: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { key: 'story', label: 'Story', shortLabel: 'Story', icon: ScrollText },
  { key: 'timeline', label: 'Timeline', shortLabel: 'Time', icon: Clock },
  { key: 'evidence', label: 'Evidence', shortLabel: 'Proof', icon: Shield },
  { key: 'connections', label: 'Connections', shortLabel: 'Links', icon: Link2 },
  { key: 'meta', label: 'Debug', shortLabel: 'Debug', icon: FileText, hidden: true },
];
