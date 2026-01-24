import { Loader2, Sparkles, Database, Users, BookOpen, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
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

const stageConfig: Record<LoadingStage, { icon: any; label: string; description: string; progress: number }> = {
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
  const [dots, setDots] = useState('');
  const progress = externalProgress ?? config.progress;

  // Animate progress bar toward target
  useEffect(() => {
    const target = progress;
    const id = setInterval(() => {
      setInternalProgress((p) => (p >= target ? target : Math.min(p + 1.5, target)));
    }, 40);
    return () => clearInterval(id);
  }, [progress]);

  // Cycling dots so it feels like active progress
  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 380);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/20 animate-pulse">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
      </div>
      <Card className="bg-black/40 border-border/60 flex-1 shadow-lg shadow-black/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Icon className="h-4 w-4 text-primary animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-medium">{config.label}</div>
              <div className="text-xs text-white/50 truncate">
                {config.description}
                <span className="inline-block w-4 text-left">{dots}</span>
              </div>
            </div>
            {progress >= 100 && <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />}
          </div>
          {/* Progress bar with shimmer overlay */}
          <div className="mt-2 h-1.5 bg-black/60 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-300 ease-out chat-loading-pulse"
              style={{ width: `${internalProgress}%` }}
            />
            {progress < 100 && <div className="chat-loading-shimmer" aria-hidden />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

