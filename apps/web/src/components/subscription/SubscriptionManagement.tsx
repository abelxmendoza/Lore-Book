import { useState } from 'react';
import { useSubscription } from '../../hooks/useSubscription';
import { privilegeSourceLabel } from '../../lib/accountAuthority';
import {
  Loader2, Sparkles, Zap, Check, Minus,
  Calendar, AlertTriangle, CheckCircle, XCircle,
  CreditCard, PauseCircle, AlertCircle, Shield, Crown, Code2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { CheckoutFlow } from './CheckoutFlow';

// ── Usage bar ─────────────────────────────────────────────────────────────────

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
              className={cn('h-1.5 rounded-full transition-all', isFull ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-primary')}
              // eslint-disable-next-line react/forbid-dom-props
          style={{ width: `${pct}%` }}
            />
          </div>
          {isFull && (
            <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Limit reached — upgrade for unlimited access
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Plan feature lists ────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { text: '1 active thread (full memory)', included: true },
  { text: '15 tracked characters', included: true },
  { text: 'Cross-session memory — 30 days', included: true },
  { text: 'Unlimited messages', included: true },
  { text: 'Unlimited threads', included: false },
  { text: 'Relationship intelligence', included: false },
  { text: 'Biography generation', included: false },
  { text: 'Memory search', included: false },
];

const PRO_FEATURES = [
  { text: 'Unlimited threads', included: true },
  { text: 'Unlimited tracked characters', included: true },
  { text: 'Full memory — no date limit', included: true },
  { text: 'Relationship intelligence dashboard', included: true },
  { text: 'Biography generation (monthly)', included: true },
  { text: 'Memory search across all threads', included: true },
  { text: 'Chapter & arc auto-detection', included: true },
  { text: 'Data export (PDF / JSON)', included: true },
];

// ── Cancel confirm dialog ─────────────────────────────────────────────────────

function CancelConfirm({
  periodEnd,
  onConfirm,
  onDismiss,
  loading,
}: {
  periodEnd?: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Cancel your Pro subscription?</p>
          <p className="text-xs text-white/60 mt-1 leading-relaxed">
            You'll keep full access until{' '}
            <span className="text-white/80">
              {periodEnd ? new Date(periodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'the end of your billing period'}
            </span>
            . After that you'll revert to the Free plan. Your data is never deleted.
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading}
          className="flex-1 py-2 rounded-lg border border-white/15 text-sm text-white/70 hover:text-white hover:bg-white/5 transition disabled:opacity-50"
        >
          Keep subscription
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Yes, cancel
        </button>
      </div>
    </div>
  );
}

// ── Privileged account panel ──────────────────────────────────────────────────

function PrivilegedAccessPanel({ authority }: { authority: NonNullable<ReturnType<typeof useSubscription>['subscription']>['authority'] }) {
  if (!authority?.isPrivileged) return null;

  const isOwner = authority.role === 'owner';
  const isAdmin = authority.role === 'admin';
  const isDeveloper = authority.role === 'developer';

  return (
    <div className={cn(
      'rounded-xl border p-5 space-y-3',
      isOwner ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-black/40' :
      isAdmin ? 'border-purple-500/40 bg-gradient-to-br from-purple-500/10 to-black/40' :
      'border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 to-black/40'
    )}>
      <div className="flex items-start gap-3">
        {isOwner ? <Crown className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" /> :
         isAdmin ? <Shield className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" /> :
         <Code2 className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />}
        <div>
          <p className="text-sm font-semibold text-white">
            {isOwner ? 'Founder Account' : isAdmin ? 'Admin Access' : 'Developer Account'}
          </p>
          <p className="text-xs text-white/60 mt-1">
            Premium Access Included
          </p>
          <p className="text-[11px] text-white/40 mt-2">
            Source: {privilegeSourceLabel(authority.privilegeSource)}
          </p>
          {authority.isFounderAccount && (
            <p className="text-[11px] text-amber-400/80 mt-1 font-medium">
              Founder Account · Personal Production Data
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export const SubscriptionManagement = () => {
  const { subscription, loading, cancelSubscription, reactivateSubscription, getBillingPortalUrl, refresh } = useSubscription();
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const openBillingPortal = async () => {
    try {
      const url = await getBillingPortalUrl(window.location.href);
      window.location.href = url;
    } catch {
      alert('Could not open billing portal. Please try again.');
    }
  };

  const handleCancel = async () => {
    try {
      setCanceling(true);
      await cancelSubscription();
      setShowCancelConfirm(false);
    } catch {
      alert('Failed to cancel. Please try again.');
    } finally {
      setCanceling(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setReactivating(true);
      await reactivateSubscription();
    } catch {
      alert('Failed to reactivate. Please try again.');
    } finally {
      setReactivating(false);
    }
  };

  const handleUpgrade = () => setShowCheckout(true);

  if (showCheckout) {
    return (
      <CheckoutFlow
        onCancel={() => setShowCheckout(false)}
        onSuccess={() => { void refresh(); setShowCheckout(false); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="rounded-xl border border-white/8 bg-black/30 p-6">
        <p className="text-sm text-white/50">Could not load subscription info.</p>
      </div>
    );
  }

  const isPrivileged = subscription.authority?.isPrivileged === true;
  const isPro = isPrivileged || ['pro', 'power', 'premium'].includes(subscription.planType ?? '');
  const isCanceled = !isPrivileged && subscription.cancelAtPeriodEnd;
  const isTrial = !isPrivileged && (subscription.status === 'trial' || subscription.usage?.isTrial);

  if (isPrivileged) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-white">Subscription</h1>
        <PrivilegedAccessPanel authority={subscription.authority} />
        <div className="rounded-xl border border-white/10 bg-black/30 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Usage this month</p>
          <UsageBar label="Journal entries" used={subscription.usage?.entryCount ?? 0} limit={Infinity} />
          <UsageBar label="AI conversations" used={subscription.usage?.aiRequestsCount ?? 0} limit={Infinity} />
        </div>
        <p className="text-xs text-white/25 text-center">
          Platform accounts are never billed and cannot lose access through Stripe.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Subscription</h1>

      {/* ── Current plan status ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPro
              ? <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary" /></div>
              : <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center"><Zap className="h-4 w-4 text-white/40" /></div>
            }
            <div>
              <p className="text-sm font-semibold text-white">{isPro ? 'Pro' : 'Free'} plan</p>
              {isTrial && subscription.trialDaysRemaining > 0 && (
                <p className="text-xs text-amber-400">{subscription.trialDaysRemaining}d left in trial</p>
              )}
              {isCanceled && (
                <p className="text-xs text-orange-400">
                  Access until{' '}
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : 'period end'}
                </p>
              )}
            </div>
          </div>
          <span className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full',
            isCanceled ? 'bg-orange-500/15 text-orange-400' :
            isPro ? 'bg-primary/15 text-primary' :
            'bg-white/8 text-white/50'
          )}>
            {isCanceled ? 'Canceling' : isPro ? 'Active' : 'Free'}
          </span>
        </div>

        {isPro && subscription.currentPeriodEnd && !isCanceled && (
          <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-white/8 text-xs text-white/40">
            <Calendar className="h-3.5 w-3.5" />
            Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>

      {/* ── Plan comparison (free users only) ──────────────────────────── */}
      {!isPro && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Free card */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Free</p>
              <span className="text-[11px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 rounded px-2 py-0.5">Current plan</span>
            </div>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-bold text-white">$0</span>
              <span className="text-xs text-white/40">/ month</span>
            </div>
            <ul className="space-y-2 flex-1">
              {FREE_FEATURES.map(f => (
                <li key={f.text} className={cn('flex items-start gap-2 text-xs', !f.included && 'opacity-30')}>
                  {f.included
                    ? <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    : <Minus className="h-3.5 w-3.5 text-white/30 shrink-0 mt-0.5" />
                  }
                  <span className={f.included ? 'text-white/70' : 'text-white/40'}>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pro card */}
          <div className="relative rounded-xl border border-primary/40 bg-gradient-to-b from-primary/10 to-black/60 p-5 flex flex-col shadow-[0_0_40px_rgba(139,92,246,0.1)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[11px] font-semibold px-3 py-0.5 rounded-full">
              Most popular
            </div>
            <p className="text-sm font-bold text-white mb-3">Pro</p>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-bold text-white">$20</span>
              <span className="text-xs text-white/40">/ month</span>
            </div>
            <ul className="space-y-2 flex-1 mb-4">
              {PRO_FEATURES.map(f => (
                <li key={f.text} className="flex items-start gap-2 text-xs">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-white/80">{f.text}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleUpgrade}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-sm font-semibold text-white transition shadow-[0_0_20px_rgba(139,92,246,0.3)]"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      )}

      {/* ── Billing management (paid users) ────────────────────────────── */}
      {isPro && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Manage subscription</p>

          {isCanceled ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
                <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-sm text-white/80">
                  Your subscription is set to cancel. You'll have full access until{' '}
                  <span className="text-white font-medium">
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                      : 'the end of the billing period'}
                  </span>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReactivate}
                disabled={reactivating}
                className="w-full py-2.5 rounded-xl border border-primary/40 text-sm font-semibold text-primary hover:bg-primary/10 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {reactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Reactivate subscription
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={openBillingPortal}
                className="w-full py-2.5 rounded-xl border border-white/15 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-2"
              >
                <CreditCard className="h-4 w-4" />
                Manage billing &amp; payment method
              </button>
              <button
                type="button"
                onClick={openBillingPortal}
                className="w-full py-2.5 rounded-xl border border-white/15 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-2"
              >
                <PauseCircle className="h-4 w-4" />
                Pause payments
              </button>
              {!showCancelConfirm && (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full py-2.5 rounded-xl border border-red-500/20 text-sm font-medium text-red-400 hover:bg-red-500/10 transition flex items-center justify-center gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel subscription
                </button>
              )}
              {showCancelConfirm && (
                <CancelConfirm
                  periodEnd={subscription.currentPeriodEnd}
                  onConfirm={handleCancel}
                  onDismiss={() => setShowCancelConfirm(false)}
                  loading={canceling}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Usage meters ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Usage this month</p>
        <UsageBar
          label="Journal entries"
          used={subscription.usage?.entryCount ?? 0}
          limit={isPro ? Infinity : (subscription.usage?.entryLimit ?? 50)}
        />
        <UsageBar
          label="AI conversations"
          used={subscription.usage?.aiRequestsCount ?? 0}
          limit={isPro ? Infinity : (subscription.usage?.aiLimit ?? 100)}
        />
      </div>

      {/* ── Trust footnote ──────────────────────────────────────────────── */}
      <p className="text-xs text-white/25 text-center">
        7-day free trial&nbsp;·&nbsp;Cancel any time&nbsp;·&nbsp;Your data is never deleted
      </p>
    </div>
  );
};
