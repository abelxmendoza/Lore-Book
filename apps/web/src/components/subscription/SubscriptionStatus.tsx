import { useSubscription } from '../../hooks/useSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, Crown, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
// Note: Using window.location for navigation since app uses surface-based routing

export const SubscriptionStatus = () => {
  const { subscription, loading, getBillingPortalUrl } = useSubscription();

  if (loading) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <p className="text-white/60">Failed to load subscription status</p>
        </CardContent>
      </Card>
    );
  }

  const isPremium = subscription.planType === 'premium' || subscription.usage.isTrial;
  const isTrial = subscription.status === 'trial' || subscription.usage.isTrial;
  const entryUsagePercent = subscription.usage.entryLimit === Infinity 
    ? 0 
    : (subscription.usage.entryCount / subscription.usage.entryLimit) * 100;
  const aiUsagePercent = subscription.usage.aiLimit === Infinity 
    ? 0 
    : (subscription.usage.aiRequestsCount / subscription.usage.aiLimit) * 100;

  const handleManageBilling = async () => {
    try {
      const url = await getBillingPortalUrl(window.location.href);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open billing portal:', error);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className={`h-5 w-5 ${isPremium ? 'text-yellow-400' : 'text-white/40'}`} />
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">
                {isPremium ? 'Premium' : 'Free'} Plan
              </p>
              {isTrial && subscription.trialDaysRemaining > 0 && (
                <p className="text-sm text-yellow-400 mt-1">
                  {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} left in trial
                </p>
              )}
              {subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-orange-400 mt-1">
                  Cancels on {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'period end'}
                </p>
              )}
            </div>
            {!isPremium && (
              <Button variant="default" onClick={() => {
                // Trigger pricing page via custom event
                window.dispatchEvent(new CustomEvent('navigate', { detail: { surface: 'pricing' } }));
              }}>
                Upgrade
              </Button>
            )}
          </div>

          {subscription.currentPeriodEnd && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Calendar className="h-4 w-4" />
              <span>
                {subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews on'}{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}

          {isPremium && (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              className="w-full"
            >
              Manage Billing
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Usage This Month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/60">Journal Entries</span>
              <span className="text-white">
                {subscription.usage.entryCount} / {subscription.usage.entryLimit === Infinity ? '∞' : subscription.usage.entryLimit}
              </span>
            </div>
            {subscription.usage.entryLimit !== Infinity && (
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    entryUsagePercent >= 100 ? 'bg-red-500' :
                    entryUsagePercent >= 80 ? 'bg-yellow-500' :
                    'bg-primary'
                  }`}
                  style={{ width: `${Math.min(entryUsagePercent, 100)}%` }}
                />
              </div>
            )}
            {entryUsagePercent >= 100 && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Limit reached. Upgrade for unlimited entries.
              </p>
            )}
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/60">AI Requests</span>
              <span className="text-white">
                {subscription.usage.aiRequestsCount} / {subscription.usage.aiLimit === Infinity ? '∞' : subscription.usage.aiLimit}
              </span>
            </div>
            {subscription.usage.aiLimit !== Infinity && (
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    aiUsagePercent >= 100 ? 'bg-red-500' :
                    aiUsagePercent >= 80 ? 'bg-yellow-500' :
                    'bg-primary'
                  }`}
                  style={{ width: `${Math.min(aiUsagePercent, 100)}%` }}
                />
              </div>
            )}
            {aiUsagePercent >= 100 && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Limit reached. Upgrade for unlimited AI requests.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

