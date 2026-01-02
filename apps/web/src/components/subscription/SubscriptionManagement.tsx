import { useState } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Loader2, Crown, Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { SubscriptionStatus } from './SubscriptionStatus';

export const SubscriptionManagement = () => {
  const { subscription, loading, cancelSubscription, reactivateSubscription, getBillingPortalUrl } = useSubscription();
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancel = async () => {
    try {
      setCanceling(true);
      await cancelSubscription();
      setShowCancelConfirm(false);
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setReactivating(true);
      await reactivateSubscription();
    } catch (error) {
      console.error('Failed to reactivate subscription:', error);
      alert('Failed to reactivate subscription. Please try again.');
    } finally {
      setReactivating(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      const url = await getBillingPortalUrl(window.location.href);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to open billing portal:', error);
      alert('Failed to open billing portal. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <p className="text-white/60">Failed to load subscription information</p>
        </CardContent>
      </Card>
    );
  }

  const isPremium = subscription.planType === 'premium' || subscription.isTrial;
  const isCanceled = subscription.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Subscription Management</h1>
      </div>

      <SubscriptionStatus />

      {isPremium && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-400" />
              Manage Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isCanceled ? (
              <div className="space-y-4">
                <div className="p-4 bg-orange-500/20 border border-orange-500/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-orange-400 mb-1">Subscription Canceled</p>
                      <p className="text-sm text-white/80">
                        Your subscription will end on{' '}
                        {subscription.currentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                          : 'the end of the current period'}
                        . You'll continue to have access until then.
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  variant="default"
                  onClick={handleReactivate}
                  disabled={reactivating}
                  className="w-full"
                >
                  {reactivating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reactivating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Reactivate Subscription
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {subscription.currentPeriodEnd && (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Next billing date: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {!showCancelConfirm ? (
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      onClick={handleManageBilling}
                      className="w-full"
                    >
                      Manage Billing & Payment Method
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelConfirm(true)}
                      className="w-full text-red-400 border-red-400/50 hover:bg-red-400/10"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
                    <p className="text-sm text-white/80 mb-2">
                      Are you sure you want to cancel your subscription? You'll continue to have access until{' '}
                      {subscription.currentPeriodEnd
                        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                        : 'the end of the current period'}
                      .
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowCancelConfirm(false)}
                        className="flex-1"
                        disabled={canceling}
                      >
                        Keep Subscription
                      </Button>
                      <Button
                        variant="default"
                        onClick={handleCancel}
                        disabled={canceling}
                        className="flex-1 bg-red-500 hover:bg-red-600"
                      >
                        {canceling ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Canceling...
                          </>
                        ) : (
                          'Yes, Cancel'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isPremium && (
        <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
          <CardHeader>
            <CardTitle className="text-white">Upgrade to Premium</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-white/80 mb-4">
              Unlock unlimited entries, AI requests, and all premium features.
            </p>
            <Button
              variant="default"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: { surface: 'pricing' } }));
              }}
              className="w-full"
            >
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

