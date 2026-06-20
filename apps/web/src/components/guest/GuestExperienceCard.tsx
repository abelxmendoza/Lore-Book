import { LogIn, Sparkles, Crown, X, User, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGuest } from '../../contexts/GuestContext';
import { useGuestExperienceDismiss } from '../../hooks/useGuestExperienceDismiss';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  getGuestUsage,
  GUEST_SESSION_FEATURES,
  GUEST_UNLOCK_FEATURES,
} from './guestExperience';

type GuestExperienceVariant = 'banner' | 'panel' | 'prompt' | 'compact';

type GuestExperienceCardProps = {
  variant?: GuestExperienceVariant;
  onEndSession?: () => void;
  showEndSession?: boolean;
  /** Allow hiding the compact guest bar for the current session. Default true for compact. */
  dismissible?: boolean;
  className?: string;
};

function UsageMeter({ used, limit, percentUsed, compact }: {
  used: number;
  limit: number;
  percentUsed: number;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">Guest chat usage</span>
        <span className="font-medium text-white/80">
          {used}/{limit} messages
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentUsed}%` }}
        />
      </div>
    </div>
  );
}

function GuestExperienceCompactBar({
  used,
  limit,
  remaining,
  percentUsed,
  canDismiss,
  onDismiss,
  onSignUp,
  onPlans,
  className,
}: {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  canDismiss: boolean;
  onDismiss: () => void;
  onSignUp: () => void;
  onPlans: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 border-b border-primary/15 bg-primary/5 px-3 py-2 flex-shrink-0 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs text-white/80 truncate">
            Guest · {remaining}/{limit} messages left
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onSignUp}
            className="text-xs font-medium text-primary hover:text-primary/80 px-2 py-1"
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={onPlans}
            className="text-xs text-white/50 hover:text-white px-2 py-1"
          >
            Plans
          </button>
          {canDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss guest banner"
              data-testid="guest-experience-dismiss"
              className="rounded-md p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <UsageMeter used={used} limit={limit} percentUsed={percentUsed} compact />
    </div>
  );
}

export const GuestExperienceCard = ({
  variant = 'panel',
  onEndSession,
  showEndSession = true,
  dismissible,
  className = '',
}: GuestExperienceCardProps) => {
  const navigate = useNavigate();
  const { guestState, endGuestSession } = useGuest();
  const { dismissed, dismiss } = useGuestExperienceDismiss();
  const { used, limit, remaining, limitReached, percentUsed } = getGuestUsage(guestState);
  const canDismiss = dismissible ?? variant === 'compact';

  const handleEndSession = () => {
    if (onEndSession) onEndSession();
    else endGuestSession();
  };

  const goSignUp = () => navigate('/login');
  const goPlans = () => navigate('/upgrade');

  if (canDismiss && dismissed) return null;

  if (variant === 'banner') {
    return (
      <div className={`border-b border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 ${className}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <User className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {limitReached
                  ? 'Guest limit reached'
                  : `Guest mode · ${remaining} chat ${remaining === 1 ? 'message' : 'messages'} left`}
              </p>
              <p className="text-xs text-white/60">
                {limitReached
                  ? 'Create an account to keep chatting, or view plans for Pro.'
                  : 'Your session is temporary. Sign up to save memories and unlock unlimited chat.'}
              </p>
              <div className="mt-2 max-w-xs">
                <UsageMeter used={used} limit={limit} percentUsed={percentUsed} compact />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={goSignUp}
              className="bg-primary text-white hover:bg-primary/90"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {limitReached ? 'Sign up free' : 'Create account'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={goPlans}
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              <Crown className="mr-2 h-4 w-4" />
              View plans
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/account')}
              className="text-white/60 hover:text-white"
            >
              Guest account
            </Button>
            {showEndSession && !limitReached && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEndSession}
                className="text-white/40 hover:text-white"
                aria-label="End guest session"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return <GuestExperienceCompactBar
      used={used}
      limit={limit}
      remaining={remaining}
      percentUsed={percentUsed}
      canDismiss={canDismiss}
      onDismiss={dismiss}
      onSignUp={goSignUp}
      onPlans={goPlans}
      className={className}
    />;
  }

  if (variant === 'prompt') {
    return (
      <Card className={`border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/20 p-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Guest limit reached</h3>
            <p className="text-sm text-white/70 mb-4">
              You&apos;ve used all {limit} guest messages. Create a free account to keep chatting,
              or view Pro plans for unlimited threads and advanced features.
            </p>
            <UsageMeter used={used} limit={limit} percentUsed={percentUsed} />
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button onClick={goSignUp} className="flex-1 bg-primary text-white hover:bg-primary/90">
                <LogIn className="mr-2 h-4 w-4" />
                Sign up free
              </Button>
              <Button
                onClick={goPlans}
                variant="outline"
                className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
              >
                <Crown className="mr-2 h-4 w-4" />
                View plans & trial
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // panel — full guest account center
  return (
    <div className={`space-y-6 ${className}`}>
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center mx-auto mb-4">
          <User className="h-8 w-8 text-primary" />
        </div>
        <p className="text-xl font-bold text-white mb-1">Guest session</p>
        <p className="text-sm text-white/45">
          Exploring without an account — nothing is saved to the cloud yet.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <UsageMeter used={used} limit={limit} percentUsed={percentUsed} />
        <p className="mt-3 text-sm text-white/60">
          {limitReached
            ? 'You\'ve used your guest messages for today. Sign up to continue.'
            : `${remaining} guest ${remaining === 1 ? 'message' : 'messages'} remaining this session.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Right now (guest)
          </p>
          <ul className="space-y-2">
            {GUEST_SESSION_FEATURES.map((feature) => (
              <li key={feature} className="text-sm text-white/60 flex gap-2">
                <span className="text-white/25">·</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary/80 mb-3">
            After sign-up
          </p>
          <ul className="space-y-2">
            {GUEST_UNLOCK_FEATURES.map((feature) => (
              <li key={feature} className="text-sm text-white/80 flex gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <Button onClick={goSignUp} className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold">
          <LogIn className="mr-2 h-4 w-4" />
          Create free account
        </Button>
        <Button
          onClick={goPlans}
          variant="outline"
          className="w-full border-primary/30 text-primary hover:bg-primary/10"
        >
          <Crown className="mr-2 h-4 w-4" />
          View plans & start Pro trial
        </Button>
        {showEndSession && (
          <Button
            onClick={handleEndSession}
            variant="ghost"
            className="w-full text-white/40 hover:text-white"
          >
            End guest session
          </Button>
        )}
      </div>
    </div>
  );
};
