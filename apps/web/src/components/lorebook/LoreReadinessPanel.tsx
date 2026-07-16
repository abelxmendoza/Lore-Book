import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Sparkles,
  FileText,
  Users,
  MapPin,
  Lock,
  CheckCircle2,
  Loader2,
  Brain,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  READINESS_COLORS,
  READINESS_LABELS,
  type FocusCandidate,
  type LoreReadinessLevel,
  type LoreTopicReadiness,
  type ReadinessGap,
} from '../../lib/loreReadiness';
import type { CompiledLorebook } from '../../hooks/useLoreReadiness';
import type { LoreReadinessSummary } from '../../lib/loreReadiness';
import { cn } from '../../lib/cn';
import { LoreReadinessSimulator } from './LoreReadinessSimulator';
import { openChatWithPrefill } from '../../lib/openChatWithFocus';
import {
  lorebookEditUrl,
  lorebookEditorUrlForCompiledBooks,
  lorebookLibraryUrl,
} from '../../lib/lorebookLibrary';

export type GenerateTopicOptions = {
  characterId?: string;
  locationId?: string;
  organizationId?: string;
  skillId?: string;
  threadId?: string;
  timeRange?: { start: string; end: string };
  themes?: string[];
};

function optionsFromFocus(focus: FocusCandidate): GenerateTopicOptions {
  return {
    characterId: focus.compileRef.characterId,
    locationId: focus.compileRef.locationId,
    organizationId: focus.compileRef.organizationId,
    skillId: focus.compileRef.skillId,
    threadId: focus.compileRef.threadId,
    timeRange: focus.compileRef.timeRange,
    themes: focus.compileRef.themes,
  };
}

function topicFocuses(topic: LoreTopicReadiness): FocusCandidate[] {
  if (topic.focusCandidates?.length) return topic.focusCandidates;
  // Legacy entityCandidates → synthetic focuses
  return (topic.entityCandidates ?? []).map((c) => ({
    id: c.id,
    kind: topic.topic.id === 'place_book' ? 'location' : 'character',
    label: c.name,
    topicId: topic.topic.id,
    score: c.progress,
    canCompile: c.canGenerate,
    reasons: [],
    signals: {
      atomCount: c.atomCount,
      wordCount: 0,
      entryCount: c.entryCount,
      meaningClusters: 0,
      threadLinks: 0,
      evidenceFacts: 0,
    },
    compileRef:
      topic.topic.id === 'place_book'
        ? { locationId: c.id }
        : { characterId: c.id },
  }));
}

type LoreReadinessPanelProps = {
  readiness: LoreReadinessSummary;
  compiledBooks: CompiledLorebook[];
  loading?: boolean;
  variant?: 'full' | 'compact';
  onGenerateTopic?: (topicId: string, options?: GenerateTopicOptions) => void;
  onGoToChat?: () => void;
};

const FLOW_STEPS = [
  { id: 'collect', label: 'Collect', icon: MessageSquare, hint: 'Chat & journal' },
  { id: 'assess', label: 'Assess', icon: Brain, hint: 'Knowledge counts' },
  { id: 'compile', label: 'Compile', icon: Sparkles, hint: 'Generate book' },
  { id: 'edit', label: 'Edit', icon: Pencil, hint: 'Refine prose' },
] as const;

function ProgressBar({ value, level }: { value: number; level: LoreReadinessLevel }) {
  const barColor =
    level === 'ready' ? 'bg-emerald-500' : level === 'building' ? 'bg-sky-500' : 'bg-amber-500';
  return (
    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function primaryGap(topic: LoreTopicReadiness): ReadinessGap | undefined {
  return topic.gaps?.find((g) => g.severity === 'blocker') ?? topic.gaps?.[0];
}

function chatPromptForTopic(topic: LoreTopicReadiness): string {
  const gap = primaryGap(topic);
  if (gap?.suggestion) {
    const s = gap.suggestion;
    return s.endsWith('.') ? `${s.slice(0, -1)} — can you walk me through one?` : s;
  }
  return `Tell me more about ${topic.topic.label.toLowerCase()} — a specific moment that shaped you.`;
}

function TopicCard({
  topic,
  onGenerate,
  onChatAbout,
  compact,
}: {
  topic: LoreTopicReadiness;
  onGenerate?: (options?: GenerateTopicOptions) => void;
  onChatAbout?: () => void;
  compact?: boolean;
}) {
  const focuses = topicFocuses(topic);
  const [selectedId, setSelectedId] = useState(focuses[0]?.id ?? '');
  const selected = focuses.find((f) => f.id === selectedId) ?? focuses[0];
  const badge = READINESS_COLORS[topic.level];
  const gap = primaryGap(topic);

  const handleCompile = () => {
    if (!onGenerate) return;
    if (selected) {
      onGenerate(optionsFromFocus(selected));
      return;
    }
    onGenerate();
  };

  const canCompile = Boolean(
    onGenerate &&
      (selected?.canCompile || (topic.canGenerate && (focuses.length === 0 || selected)))
  );

  const signalLine =
    topic.signalSummary ||
    (selected
      ? [
          selected.signals.wordCount > 0
            ? selected.signals.wordCount >= 1000
              ? `~${(selected.signals.wordCount / 1000).toFixed(1)}k words`
              : `~${selected.signals.wordCount} words`
            : null,
          selected.signals.entryCount > 0 ? `${selected.signals.entryCount} episodes` : null,
          selected.signals.threadLinks > 0 ? `${selected.signals.threadLinks} linked` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null) ||
    `${topic.atomCount}/${topic.topic.minAtoms} atoms · ${topic.entryCount}/${topic.topic.minEntries} entries`;

  return (
    <div
      data-testid={`lore-topic-card-${topic.topic.id}`}
      className={cn(
        'rounded-xl border p-3',
        topic.canGenerate ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-white/8 bg-white/3',
        compact && 'p-2.5',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{topic.topic.label}</p>
          {!compact && <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{topic.topic.description}</p>}
        </div>
        <span className={cn('shrink-0 text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-full border', badge)}>
          {READINESS_LABELS[topic.level]}
        </span>
      </div>
      <ProgressBar value={topic.progress} level={topic.level} />
      <div className="flex items-center justify-between mt-2 gap-2">
        <p className="text-[11px] text-white/35 font-mono truncate">{signalLine}</p>
        {canCompile && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-emerald-300 hover:text-emerald-200 shrink-0"
            onClick={handleCompile}
          >
            Compile
          </Button>
        )}
      </div>

      {focuses.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {focuses.length === 1 ? (
            <p className="text-[10px] text-white/45 truncate">
              Focus: {focuses[0].label}
              {focuses[0].canCompile ? '' : ` · ${Math.round(focuses[0].score * 100)}% fuel`}
            </p>
          ) : (
            <label className="block">
              <span className="sr-only">Choose focus for this lorebook</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/80"
              >
                {focuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({Math.round(c.score * 100)}%)
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected?.reasons?.[0] && (
            <p className="text-[10px] text-white/40 leading-snug">{selected.reasons[0]}</p>
          )}
          {!topic.canGenerate && gap && (
            <p className="text-[11px] text-amber-400/85 leading-snug">
              Still needed: {gap.suggestion ?? gap.label}
            </p>
          )}
        </div>
      )}

      {focuses.length === 0 && topic.level === 'needs_more' && !topic.gaps?.length && (
        <p className="text-[11px] text-amber-400/80 mt-1.5">
          Need ~{topic.atomsNeeded} more atoms · chat about {topic.topic.label.toLowerCase()}
        </p>
      )}
      {focuses.length === 0 && gap && !topic.canGenerate && (
        <p className="text-[11px] text-white/45 mt-1.5 leading-snug">
          {gap.suggestion ?? `${gap.label}: ${gap.current}/${gap.required}`}
        </p>
      )}

      {!topic.canGenerate && onChatAbout && (
        <button
          type="button"
          onClick={onChatAbout}
          className="mt-2 text-[11px] text-sky-300/90 hover:text-sky-200 underline-offset-2 hover:underline"
        >
          Chat about this
        </button>
      )}
    </div>
  );
}

export const LoreReadinessPanel = ({
  readiness,
  compiledBooks,
  loading,
  variant = 'full',
  onGenerateTopic,
  onGoToChat,
}: LoreReadinessPanelProps) => {
  const navigate = useNavigate();
  const compact = variant === 'compact';
  const topicsRef = useRef<HTMLDivElement>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);

  const activeStep = compiledBooks.length > 0 ? 3 : readiness.canGenerateAnyBook ? 2 : readiness.overallLevel === 'building' ? 1 : 0;

  const { readyTopics, buildingTopics, needsMoreTopics } = useMemo(() => {
    const ready = readiness.topics.filter((t) => t.canGenerate);
    const building = readiness.topics.filter((t) => !t.canGenerate && t.level === 'building');
    const needsMore = readiness.topics.filter((t) => !t.canGenerate && t.level !== 'building');
    return { readyTopics: ready, buildingTopics: building, needsMoreTopics: needsMore };
  }, [readiness.topics]);

  const bestReady = readyTopics[0];
  const bestBuilding = [...buildingTopics].sort((a, b) => b.progress - a.progress)[0];

  const goToChat = (prompt?: string) => {
    if (prompt) {
      openChatWithPrefill(prompt, 'Lore readiness');
      navigate('/chat');
      return;
    }
    if (onGoToChat) {
      onGoToChat();
      return;
    }
    navigate('/chat');
  };

  const scrollToTopics = () => {
    topicsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const collapsedNeedsMore =
    buildingTopics.length > 0 ? needsMoreTopics : needsMoreTopics.slice(2);
  const visibleSecondary = showAllTopics
    ? [...buildingTopics, ...needsMoreTopics]
    : buildingTopics.length > 0
      ? buildingTopics
      : needsMoreTopics.slice(0, 2);

  const hiddenCount = showAllTopics ? 0 : collapsedNeedsMore.length;

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')} data-testid="lore-readiness-panel">
      <LoreReadinessSimulator compact={compact} />

      {/* Flow strip */}
      <div className={cn('rounded-2xl border border-white/10 bg-black/30 p-4', compact && 'p-3')}>
        <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">How lorebooks are made</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            const isLocked = idx === 3 && compiledBooks.length === 0;
            const clickable =
              (step.id === 'collect') ||
              (step.id === 'compile' && readiness.canGenerateAnyBook) ||
              (step.id === 'edit' && compiledBooks.length > 0);

            const onClick = () => {
              if (step.id === 'collect') goToChat(bestBuilding ? chatPromptForTopic(bestBuilding) : undefined);
              if (step.id === 'compile') {
                if (bestReady && onGenerateTopic) {
                  onGenerateTopic(bestReady.topic.id);
                } else {
                  scrollToTopics();
                }
              }
              if (step.id === 'edit' && compiledBooks.length > 0) {
                navigate(lorebookEditorUrlForCompiledBooks(compiledBooks));
              }
            };

            return (
              <button
                key={step.id}
                type="button"
                disabled={!clickable}
                onClick={onClick}
                className={cn(
                  'flex flex-col items-center text-center gap-1.5 p-2 rounded-xl border transition-colors',
                  isDone && 'border-emerald-500/30 bg-emerald-500/5',
                  isActive && !isDone && 'border-primary/40 bg-primary/10',
                  !isActive && !isDone && 'border-white/5 bg-white/2 opacity-60',
                  clickable && 'cursor-pointer hover:opacity-100 hover:border-white/20',
                  !clickable && 'cursor-default',
                )}
              >
                <div
                  className={cn(
                    'p-2 rounded-lg',
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-white/5 text-white/40',
                  )}
                >
                  {isLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-white/80">{step.label}</span>
                <span className="text-[10px] text-white/35 hidden sm:block">{step.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Overall meter + primary CTA */}
      <div className={cn('rounded-2xl border border-white/10 bg-white/3 p-5', compact && 'p-4')}>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Georgia, serif' }}>
              Knowledge for lorebooks
            </h3>
            <p className="mt-1 text-sm text-white/45">
              {compiledBooks.length > 0
                ? 'Material is ready — compile another topic or edit a book you already made.'
                : readiness.canGenerateAnyBook
                  ? 'Enough material to compile. Pick a ready topic below.'
                  : 'Keep chatting — topics unlock compile when they have enough grounded stories.'}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-2xl font-bold text-white tabular-nums">{readiness.knowledgeScore}</p>
            <p className="text-[10px] font-mono text-white/35 uppercase">Knowledge score</p>
          </div>
        </div>
        <ProgressBar value={readiness.overallProgress} level={readiness.overallLevel} />
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-white/40 font-mono">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {readiness.stats.totalNarrativeAtoms} atoms
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {readiness.stats.totalChatMessages} messages
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {readiness.stats.entityCounts.characters} people
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {readiness.stats.entityCounts.locations} places
          </span>
        </div>
        <div
          className={cn(
            'mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium',
            READINESS_COLORS[readiness.overallLevel],
          )}
        >
          {READINESS_LABELS[readiness.overallLevel]}
          {readiness.readyTopicCount > 0 &&
            ` · ${readiness.readyTopicCount} topic${readiness.readyTopicCount === 1 ? '' : 's'} ready`}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!readiness.canGenerateAnyBook && (
            <Button
              onClick={() => goToChat(bestBuilding ? chatPromptForTopic(bestBuilding) : undefined)}
              leftIcon={<MessageSquare className="h-4 w-4" />}
            >
              Continue in chat
            </Button>
          )}
          {readiness.canGenerateAnyBook && bestReady && onGenerateTopic && (
            <Button
              onClick={() => {
                const focus = topicFocuses(bestReady)[0];
                if (focus) {
                  onGenerateTopic(bestReady.topic.id, optionsFromFocus(focus));
                  return;
                }
                onGenerateTopic(bestReady.topic.id);
              }}
              leftIcon={<Sparkles className="h-4 w-4" />}
            >
              Compile {bestReady.topic.label}
            </Button>
          )}
          {compiledBooks.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => navigate(lorebookLibraryUrl())}
                leftIcon={<FileText className="h-4 w-4" />}
              >
                Open library
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate(lorebookEditUrl(compiledBooks[0].id))}
                leftIcon={<Pencil className="h-4 w-4" />}
              >
                Edit latest
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Topics */}
      <div ref={topicsRef}>
        <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Topics & domains</p>

        {readyTopics.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-medium text-emerald-400/80 mb-2">Ready to compile</p>
            <div className={cn('grid gap-3', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
              {readyTopics.map((topic) => (
                <TopicCard
                  key={topic.topic.id}
                  topic={topic}
                  compact={compact}
                  onGenerate={
                    onGenerateTopic
                      ? (opts) => onGenerateTopic(topic.topic.id, opts)
                      : undefined
                  }
                  onChatAbout={() => goToChat(chatPromptForTopic(topic))}
                />
              ))}
            </div>
          </div>
        )}

        {visibleSecondary.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-white/40 mb-2">
              {buildingTopics.length > 0 ? 'Still building' : 'Needs more stories'}
            </p>
            <div className={cn('grid gap-3', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
              {visibleSecondary.map((topic) => (
                <TopicCard
                  key={topic.topic.id}
                  topic={topic}
                  compact={compact}
                  onGenerate={
                    onGenerateTopic
                      ? (opts) => onGenerateTopic(topic.topic.id, opts)
                      : undefined
                  }
                  onChatAbout={() => goToChat(chatPromptForTopic(topic))}
                />
              ))}
            </div>
          </div>
        )}

        {(hiddenCount > 0 || showAllTopics) && needsMoreTopics.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllTopics((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs text-white/45 hover:text-white/70"
          >
            {showAllTopics ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Show fewer topics
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Show more topics
                {hiddenCount > 0 ? ` (${hiddenCount})` : ''}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
