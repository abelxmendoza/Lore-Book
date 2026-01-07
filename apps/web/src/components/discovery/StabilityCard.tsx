// =====================================================
// STABILITY CARD
// Purpose: Display stability/silence states intentionally
// =====================================================

import { Pause, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

type StabilityState = 'STABLE_EMPTY' | 'STABLE_CONTINUATION' | 'UNSTABLE_UNCLEAR' | 'SIGNAL_PRESENT';

interface StabilityCardProps {
  stabilityState: StabilityState;
  message: string;
  explanation?: string;
}

export const StabilityCard: React.FC<StabilityCardProps> = ({
  stabilityState,
  message,
  explanation,
}) => {
  const getIcon = () => {
    switch (stabilityState) {
      case 'STABLE_EMPTY':
      case 'STABLE_CONTINUATION':
        return <Pause className="w-6 h-6 text-white/40" />;
      case 'UNSTABLE_UNCLEAR':
        return <AlertCircle className="w-6 h-6 text-yellow-400/60" />;
      case 'SIGNAL_PRESENT':
        return <Sparkles className="w-6 h-6 text-primary" />;
      default:
        return <CheckCircle className="w-6 h-6 text-white/40" />;
    }
  };

  const getTone = (): 'neutral' | 'caution' | 'positive' => {
    switch (stabilityState) {
      case 'STABLE_EMPTY':
      case 'STABLE_CONTINUATION':
        return 'neutral';
      case 'UNSTABLE_UNCLEAR':
        return 'caution';
      case 'SIGNAL_PRESENT':
        return 'positive';
      default:
        return 'neutral';
    }
  };

  const tone = getTone();
  const bgColor =
    tone === 'neutral'
      ? 'bg-white/5 border-white/10'
      : tone === 'caution'
      ? 'bg-yellow-500/5 border-yellow-500/20'
      : 'bg-primary/5 border-primary/20';

  return (
    <Card className={`${bgColor} border-border/40`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">{getIcon()}</div>
          <div className="flex-1">
            <p className="text-white/80 mb-2">{message}</p>
            {explanation && (
              <p className="text-xs text-white/50 italic">
                {explanation}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

