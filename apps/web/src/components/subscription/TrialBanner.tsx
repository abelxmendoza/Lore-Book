import { useSubscription } from '../../hooks/useSubscription';
import { Button } from '../ui/button';
import { Crown, X } from 'lucide-react';
import { useState } from 'react';

export const TrialBanner = () => {
  const { subscription } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !subscription?.usage.isTrial || subscription.trialDaysRemaining <= 0) {
    return null;
  }

  const daysRemaining = subscription.trialDaysRemaining;

  return (
    <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-white/60 hover:text-white transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center justify-between pr-8">
        <div className="flex items-center gap-3">
          <Crown className="h-5 w-5 text-yellow-400" />
          <div>
            <p className="font-semibold text-white">
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left in your free trial
            </p>
            <p className="text-sm text-white/70">
              Your trial ends on{' '}
              {subscription.trialEndsAt
                ? new Date(subscription.trialEndsAt).toLocaleDateString()
                : 'soon'}
              . Upgrade now to continue enjoying Premium features.
            </p>
          </div>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={() => (window.location.href = '/subscription')}
        >
          Manage Subscription
        </Button>
      </div>
    </div>
  );
};

