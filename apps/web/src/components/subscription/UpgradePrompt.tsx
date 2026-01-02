import { Crown, Zap, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

type UpgradePromptProps = {
  title?: string;
  message?: string;
  feature?: string;
  onUpgrade?: () => void;
  variant?: 'inline' | 'modal';
};

export const UpgradePrompt = ({
  title = 'Upgrade to Premium',
  message = 'This feature requires a Premium subscription.',
  feature,
  onUpgrade,
  variant = 'inline',
}: UpgradePromptProps) => {
  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = '/pricing';
    }
  };

  if (variant === 'modal') {
    return (
      <Card className="bg-gradient-to-r from-purple-900/40 to-fuchsia-900/40 border-purple-500/50">
        <CardContent className="p-6 text-center space-y-4">
          <Crown className="h-12 w-12 text-yellow-400 mx-auto" />
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
            <p className="text-white/80 mb-1">{message}</p>
            {feature && (
              <p className="text-sm text-white/60">
                <Zap className="h-4 w-4 inline mr-1" />
                {feature} is available with Premium
              </p>
            )}
          </div>
          <Button variant="default" onClick={handleUpgrade} className="w-full">
            Upgrade to Premium
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="p-4 bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border border-purple-500/50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="font-semibold text-white">{title}</p>
            <p className="text-sm text-white/70">{message}</p>
          </div>
        </div>
        <Button variant="default" size="sm" onClick={handleUpgrade}>
          Upgrade
          <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};

