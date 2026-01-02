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
    progress: 20
  },
  searching: {
    icon: Sparkles,
    label: 'Searching memories',
    description: 'Finding related entries via semantic search',
    progress: 40
  },
  connecting: {
    icon: Users,
    label: 'Finding connections',
    description: 'Linking to characters, chapters, and related memories',
    progress: 60
  },
  reasoning: {
    icon: BookOpen,
    label: 'Reasoning',
    description: 'Understanding context and building insights',
    progress: 80
  },
  generating: {
    icon: Loader2,
    label: 'Generating response',
    description: 'Crafting your personalized answer',
    progress: 95
  }
};

export const ChatLoadingPulse = ({ stage = 'analyzing', progress: externalProgress }: ChatLoadingPulseProps) => {
  const config = stageConfig[stage];
  const Icon = config.icon;
  const [internalProgress, setInternalProgress] = useState(0);
  const progress = externalProgress ?? config.progress;

  // Animate progress bar
  useEffect(() => {
    const targetProgress = progress;
    const interval = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= targetProgress) {
          clearInterval(interval);
          return targetProgress;
        }
        return Math.min(prev + 2, targetProgress);
      });
    }, 50);
    return () => clearInterval(interval);
  }, [progress]);

  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
      </div>
      <Card className="bg-black/40 border-border/60 flex-1">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Icon className="h-4 w-4 text-primary animate-pulse" />
            <div className="flex-1">
              <div className="text-sm text-white font-medium">{config.label}</div>
              <div className="text-xs text-white/50">{config.description}</div>
            </div>
            {progress >= 100 && (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            )}
          </div>
          {/* Progress Bar */}
          <div className="mt-2 h-1 bg-black/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-300 ease-out chat-loading-pulse"
              style={{ width: `${internalProgress}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

