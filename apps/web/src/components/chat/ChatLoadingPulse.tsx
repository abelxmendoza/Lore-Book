import { Loader2, Sparkles, Database, Users, BookOpen } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

type LoadingStage = 
  | 'analyzing'
  | 'searching'
  | 'connecting'
  | 'reasoning'
  | 'generating';

type ChatLoadingPulseProps = {
  stage?: LoadingStage;
};

const stageConfig: Record<LoadingStage, { icon: any; label: string; description: string }> = {
  analyzing: {
    icon: Database,
    label: 'Analyzing timeline',
    description: 'Reviewing your memories and patterns'
  },
  searching: {
    icon: Sparkles,
    label: 'Searching memories',
    description: 'Finding related entries via HQI'
  },
  connecting: {
    icon: Users,
    label: 'Finding connections',
    description: 'Linking to characters and chapters'
  },
  reasoning: {
    icon: BookOpen,
    label: 'Reasoning',
    description: 'Understanding context and patterns'
  },
  generating: {
    icon: Loader2,
    label: 'Generating response',
    description: 'Crafting your personalized answer'
  }
};

export const ChatLoadingPulse = ({ stage = 'analyzing' }: ChatLoadingPulseProps) => {
  const config = stageConfig[stage];
  const Icon = config.icon;

  return (
    <div className="flex gap-3 justify-start">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
      </div>
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4 text-primary animate-pulse" />
            <div>
              <div className="text-sm text-white font-medium">{config.label}</div>
              <div className="text-xs text-white/50">{config.description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

