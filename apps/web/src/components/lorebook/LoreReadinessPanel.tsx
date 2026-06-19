import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Sparkles, FileText, Users, MapPin,
  Lock, CheckCircle2, Loader2, Brain,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  READINESS_COLORS,
  READINESS_LABELS,
  type LoreReadinessLevel,
  type LoreTopicReadiness,
} from '../../lib/loreReadiness';
import type { CompiledLorebook } from '../../hooks/useLoreReadiness';
import type { LoreReadinessSummary } from '../../lib/loreReadiness';
import { cn } from '../../lib/cn';
import { LoreReadinessSimulator } from './LoreReadinessSimulator';

type LoreReadinessPanelProps = {
  readiness: LoreReadinessSummary;
  compiledBooks: CompiledLorebook[];
  loading?: boolean;
  variant?: 'full' | 'compact';
  onGenerateTopic?: (topicId: string) => void;
  onGoToChat?: () => void;
};

const FLOW_STEPS = [
  { id: 'collect', label: 'Collect', icon: MessageSquare, hint: 'Chat & journal' },
  { id: 'assess', label: 'Assess', icon: Brain, hint: 'Knowledge counts' },
  { id: 'compile', label: 'Compile', icon: Sparkles, hint: 'Generate book' },
  { id: 'edit', label: 'Edit', icon: Sparkles, hint: 'Refine prose' },
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

function TopicCard({
  topic,
  onGenerate,
  compact,
}: {
  topic: LoreTopicReadiness;
  onGenerate?: () => void;
  compact?: boolean;
}) {
  const badge = READINESS_COLORS[topic.level];
  return (
    <div className={cn('rounded-xl border border-white/8 bg-white/3 p-3', compact && 'p-2.5')}>
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
        <p className="text-[11px] text-white/35 font-mono">
          {topic.atomCount}/{topic.topic.minAtoms} atoms · {topic.entryCount}/{topic.topic.minEntries} entries
        </p>
        {topic.canGenerate && onGenerate && (
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onGenerate}>
            Compile
          </Button>
        )}
      </div>
      {topic.level === 'needs_more' && (
        <p className="text-[11px] text-amber-400/80 mt-1.5">
          Need ~{topic.atomsNeeded} more atoms · chat about {topic.topic.label.toLowerCase()}
        </p>
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
  const activeStep = compiledBooks.length > 0 ? 3 : readiness.canGenerateAnyBook ? 2 : readiness.overallLevel === 'building' ? 1 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
      </div>
    );
  }

  const readyTopics = readiness.topics.filter((t) => t.canGenerate);
  const buildingTopics = readiness.topics.filter((t) => t.level === 'building');

  return (
    <div className={cn('space-y-6', compact && 'space-y-4')}>
      <LoreReadinessSimulator compact={compact} />

      {/* Flow strip */}
      <div className={cn('rounded-2xl border border-white/10 bg-black/30 p-4', compact && 'p-3')}>
        <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">How lorebooks are made</p>
        <div className="grid grid-cols-4 gap-2">
          {FLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            const isLocked = idx === 3 && compiledBooks.length === 0;
            return (
              <div
                key={step.id}
                className={cn(
                  'flex flex-col items-center text-center gap-1.5 p-2 rounded-xl border transition-colors',
                  isDone && 'border-emerald-500/30 bg-emerald-500/5',
                  isActive && !isDone && 'border-primary/40 bg-primary/10',
                  !isActive && !isDone && 'border-white/5 bg-white/2 opacity-60'
                )}
              >
                <div className={cn(
                  'p-2 rounded-lg',
                  isDone ? 'bg-emerald-500/20 text-emerald-400' : isActive ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40'
                )}>
                  {isLocked ? <Lock className="h-4 w-4" /> : isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-[11px] font-semibold text-white/80">{step.label}</span>
                <span className="text-[10px] text-white/35 hidden sm:block">{step.hint}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall meter */}
      <div className={cn('rounded-2xl border border-white/10 bg-white/3 p-5', compact && 'p-4')}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Georgia, serif' }}>
              Knowledge for lorebooks
            </h3>
            <p className="text-sm text-white/45 mt-1">
              {readiness.canGenerateAnyBook
                ? 'You have enough material to compile lorebooks. Generate first, then edit.'
                : 'Keep chatting — LoreBook tracks what it knows per topic and unlocks compilation when ready.'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-white tabular-nums">{readiness.knowledgeScore}</p>
            <p className="text-[10px] font-mono text-white/35 uppercase">Knowledge score</p>
          </div>
        </div>
        <ProgressBar value={readiness.overallProgress} level={readiness.overallLevel} />
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-white/40 font-mono">
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{readiness.stats.totalNarrativeAtoms} atoms</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{readiness.stats.totalChatMessages} messages</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{readiness.stats.entityCounts.characters} people</span>
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{readiness.stats.entityCounts.locations} places</span>
        </div>
        <div className={cn('mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium', READINESS_COLORS[readiness.overallLevel])}>
          {READINESS_LABELS[readiness.overallLevel]}
          {readiness.readyTopicCount > 0 && ` · ${readiness.readyTopicCount} topic${readiness.readyTopicCount === 1 ? '' : 's'} ready`}
        </div>
      </div>

      {/* Topic grid */}
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-white/35 mb-3">Topics & domains</p>
        <div className={cn('grid gap-3', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
          {readiness.topics.map((topic) => (
            <TopicCard
              key={topic.topic.id}
              topic={topic}
              compact={compact}
              onGenerate={topic.canGenerate && onGenerateTopic ? () => onGenerateTopic(topic.topic.id) : undefined}
            />
          ))}
        </div>
      </div>

      {/* CTAs */}
      <div className="flex flex-wrap gap-2">
        {!readiness.canGenerateAnyBook && (
          <Button onClick={() => (onGoToChat ? onGoToChat() : navigate('/chat'))} leftIcon={<MessageSquare className="h-4 w-4" />}>
            Add knowledge via chat
          </Button>
        )}
        {readiness.canGenerateAnyBook && (
          <Button onClick={() => navigate('/lorebook')} leftIcon={<Sparkles className="h-4 w-4" />}>
            Go compile a lorebook
          </Button>
        )}
        {readyTopics.length > 0 && (
          <p className="w-full text-xs text-emerald-400/80">
            Ready to compile: {readyTopics.map((t) => t.topic.label).join(', ')}
          </p>
        )}
        {buildingTopics.length > 0 && !readiness.canGenerateAnyBook && (
          <p className="w-full text-xs text-sky-400/70">
            Building: {buildingTopics.slice(0, 3).map((t) => t.topic.label).join(', ')}
            {buildingTopics.length > 3 ? ` +${buildingTopics.length - 3} more` : ''}
          </p>
        )}
      </div>
    </div>
  );
};
