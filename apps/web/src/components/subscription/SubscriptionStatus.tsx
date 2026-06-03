import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../../hooks/useSubscription';
import { Loader2, Sparkles, Zap, Brain, BookOpen, Calendar, AlertCircle, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';

const PLAN_META: Record<string, { label: string; icon: typeof Zap; color: string; iconColor: string }> = {
  free:    { label: 'Free',    icon: Zap,        color: 'text-white/50',    iconColor: 'text-white/40' },
  pro:     { label: 'Pro',     icon: Sparkles,   color: 'text-primary',     iconColor: 'text-primary' },
  power:   { label: 'Power',   icon: Brain,      color: 'text-violet-300',  iconColor: 'text-violet-300' },
  premium: { label: 'Premium', icon: BookOpen,   color: 'text-amber-300',   iconColor: 'text-amber-300' },
};

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | typeof Infinity }) {
  const isUnlimited = limit === Infinity;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isHigh = pct >= 80;
  const isFull = pct >= 100;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5 text-white/50">
        <span>{label}</span>
        <span className={cn(isFull ? 'text-red-400' : isHigh ? 'text-amber-400' : 'text-white/60')}>
          {isUnlimited ? '∞ unlimited' : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <>
          <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all',
                isFull ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-primary'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {isFull && (
            <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Limit reached — upgrade for unlimited access
            </p>
          )}
        </>
      )}
    </div>
  );
}

export const SubscriptionStatus = () => {
  const navigate = useNavigate();
  const { subscription, loading, getBillingPortalUrl } = useSubscription();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="rounded-xl border border-white/8 bg-black/30 p-4">
        <p className="text-sm text-white/40">Could not load subscription info.</p>
      </div>
    );
  }

  const planId = subscription.planType ?? 'free';
  const meta = PLAN_META[planId] ?? PLAN_META.free;
  const Icon = meta.icon;
  const isFree = planId === 'free';
  const isTrial = subscription.status === 'trial' || subscription.usage?.isTrial;
  const cancelSoon = subscription.cancelAtPeriodEnd;

  const handleManageBilling = async () => {
    try {
      const url = await getBillingPortalUrl(window.location.href);
      window.location.href = url;
    } catch {
      console.error('Failed to open billing portal');
    }
  };

  return (
    <div className="space-y-4">

      {/* Plan card */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Icon className={cn('h-4.5 w-4.5', meta.iconColor)} />
            <div>
              <p className="text-sm font-semibold text-white">{meta.label} plan</p>
              {isTrial && subscription.trialDaysRemaining > 0 && (
                <p className="text-[11px] text-amber-400">
                  {subscription.trialDaysRemaining} day{subscription.trialDaysRemaining !== 1 ? 's' : ''} left in trial
                </p>
              )}
              {cancelSoon && (
                <p className="text-[11px] text-orange-400">
                  Cancels {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : 'at period end'}
                </p>
              )}
            </div>
          </div>
          {isFree ? (
            <button
              type="button"
              onClick={() => navigate('/upgrade')}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition"
            >
              Upgrade
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleManageBilling}
              className="text-xs text-white/40 hover:text-white transition"
            >
              Manage billing
            </button>
          )}
        </div>

        {subscription.currentPeriodEnd && !isFree && (
          <div className="flex items-center gap-1.5 text-xs text-white/35">
            <Calendar className="h-3.5 w-3.5" />
            {cancelSoon ? 'Access until' : 'Renews'}{' '}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Usage this month</p>
        <UsageBar
          label="Journal entries"
          used={subscription.usage?.entryCount ?? 0}
          limit={subscription.usage?.entryLimit ?? 50}
        />
        <UsageBar
          label="AI conversations"
          used={subscription.usage?.aiRequestsCount ?? 0}
          limit={subscription.usage?.aiLimit ?? 100}
        />
      </div>

      {/* Free plan upgrade nudge */}
      {isFree && (
        <button
          type="button"
          onClick={() => navigate('/upgrade')}
          className="w-full rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left hover:bg-primary/8 transition"
        >
          <p className="text-sm font-semibold text-white mb-0.5">Unlock unlimited threads</p>
          <p className="text-xs text-white/40">Pro starts at $12/mo — see all plans</p>
        </button>
      )}

    </div>
  );
};
