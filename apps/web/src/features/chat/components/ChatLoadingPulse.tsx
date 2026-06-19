import { Loader2, Sparkles, Database, Users, BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

type LoadingStage =
  | 'analyzing'
  | 'searching'
  | 'connecting'
  | 'reasoning'
  | 'generating';

type ChatLoadingPulseProps = {
  stage?: LoadingStage;
  progress?: number; // 0-100
};

const STAGES: LoadingStage[] = ['analyzing', 'searching', 'connecting', 'reasoning', 'generating'];

const stageConfig: Record<LoadingStage, { icon: typeof Database; label: string; description: string; progress: number }> = {
  analyzing: {
    icon: Database,
    label: 'Analyzing timeline',
    description: 'Reviewing your memories and patterns',
    progress: 20,
  },
  searching: {
    icon: Sparkles,
    label: 'Searching memories',
    description: 'Finding related entries via semantic search',
    progress: 40,
  },
  connecting: {
    icon: Users,
    label: 'Finding connections',
    description: 'Linking to characters, chapters, and related memories',
    progress: 60,
  },
  reasoning: {
    icon: BookOpen,
    label: 'Reasoning',
    description: 'Understanding context and building insights',
    progress: 80,
  },
  generating: {
    icon: Loader2,
    label: 'Generating response',
    description: 'Crafting your personalized answer',
    progress: 95,
  },
};

export const ChatLoadingPulse = ({ stage = 'analyzing', progress: externalProgress }: ChatLoadingPulseProps) => {
  const config = stageConfig[stage];
  const Icon = config.icon;
  const [internalProgress, setInternalProgress] = useState(0);
  const progress = externalProgress ?? config.progress;
  const stageIndex = STAGES.indexOf(stage);

  useEffect(() => {
    const target = progress;
    const id = window.setInterval(() => {
      setInternalProgress((p) => (p >= target ? target : Math.min(p + 2, target)));
    }, 35);
    return () => window.clearInterval(id);
  }, [progress]);

  return (
    <div className="flex gap-3 justify-start chat-loading-card-enter px-3 sm:px-6 lg:px-10 pb-2">
      <div className="chat-loading-avatar-ring flex-shrink-0 w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center ring-1 ring-primary/25">
        <BotIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm chat-bubble-assistant border border-white/10 px-4 py-3.5 shadow-lg shadow-black/25">
        <div className="flex items-center gap-2.5 mb-3">
          <Icon className={`h-4 w-4 text-primary flex-shrink-0 ${stage === 'generating' ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium">{config.label}</div>
            <div className="text-xs text-white/45 truncate">{config.description}</div>
          </div>
        </div>

        <div className="flex gap-1 mb-2.5">
          {STAGES.map((s, i) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i < stageIndex
                  ? 'bg-primary/70'
                  : i === stageIndex
                    ? 'bg-primary/45 chat-loading-progress-fill'
                    : 'bg-white/8'
              }`}
            />
          ))}
        </div>

        <div className="h-1.5 bg-black/50 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-primary/50 via-primary to-cyan-400/80 transition-all duration-300 ease-out chat-loading-progress-fill rounded-full"
            style={{ width: `${internalProgress}%` }}
          />
          {progress < 100 && <div className="chat-loading-shimmer" aria-hidden />}
        </div>
      </div>
    </div>
  );
};

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 8V4H8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 14h.01M15 14h.01" strokeLinecap="round" />
    </svg>
  );
}
