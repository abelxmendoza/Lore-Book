import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Wallet, X } from 'lucide-react';

export type OpenAiBudgetState = {
  enabled: boolean;
  monthlyLimitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  percentUsed: number;
  exhausted: boolean;
  warning: boolean;
  resetsAt: string;
};

type Props = {
  budget?: OpenAiBudgetState | null;
  usage?: {
    aiRequestsCount: number;
    aiLimit: number;
    isPremium: boolean;
  };
};

type BannerKind = 'exhausted' | 'warning' | 'freeTier';

const DISMISS_PREFIX = 'lorekeeper.aiBudget.dismissed';

function monthKeyFromResetsAt(resetsAt?: string): string {
  if (!resetsAt) return 'unknown';
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return prev.toISOString().split('T')[0];
}

function dismissKey(kind: BannerKind, month: string): string {
  return `${DISMISS_PREFIX}.${kind}.${month}`;
}

function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage unavailable */
  }
}

/** For tests — reset dismiss state between cases. */
export function resetAiBudgetBannerDismissed(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(DISMISS_PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

type BannerConfig = {
  kind: BannerKind;
  dismissKey: string;
  role: 'alert' | 'status';
  testId: string;
  containerClass: string;
  icon: ReactNode;
  mobileText: string;
  desktopText: string;
};

function DismissibleBudgetBar({
  config,
  onDismiss,
}: {
  config: BannerConfig;
  onDismiss: () => void;
}) {
  return (
    <div
      role={config.role}
      data-testid={config.testId}
      className={`w-full shrink-0 flex items-start gap-1.5 sm:items-center sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 select-none ${config.containerClass}`}
    >
      <span className="mt-0.5 sm:mt-0 shrink-0" aria-hidden>
        {config.icon}
      </span>
      <p className="flex-1 min-w-0 text-[10px] sm:text-xs leading-snug">
        <span className="sm:hidden">{config.mobileText}</span>
        <span className="hidden sm:inline">{config.desktopText}</span>
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss budget notice"
        data-testid={`${config.testId}-dismiss`}
        className="shrink-0 -mr-1 rounded-md p-2 sm:p-1 text-current/40 transition-colors hover:bg-white/10 hover:text-current/80 touch-manipulation"
      >
        <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" aria-hidden />
      </button>
    </div>
  );
}

export function AiBudgetBanner({ budget, usage }: Props) {
  const month = monthKeyFromResetsAt(budget?.resetsAt);

  const activeConfig = useMemo((): BannerConfig | null => {
    if (budget?.enabled && budget.exhausted) {
      const limit = budget.monthlyLimitUsd.toFixed(2);
      return {
        kind: 'exhausted',
        dismissKey: dismissKey('exhausted', month),
        role: 'alert',
        testId: 'ai-budget-exhausted-banner',
        containerClass: 'border-b border-amber-500/30 bg-amber-500/10 text-amber-100/95',
        icon: <Wallet className="h-3.5 w-3.5 text-amber-300" />,
        mobileText: `AI budget reached ($${limit}/mo) · replies paused · lore still saves`,
        desktopText:
          `AI budget reached ($${limit}/month). Chat replies are paused until the budget resets or you add credits at platform.openai.com. Your messages and lore are still saved.`,
      };
    }

    if (budget?.enabled && budget.warning) {
      const limit = budget.monthlyLimitUsd.toFixed(2);
      const remaining = budget.remainingUsd.toFixed(2);
      return {
        kind: 'warning',
        dismissKey: dismissKey('warning', month),
        role: 'status',
        testId: 'ai-budget-warning-banner',
        containerClass: 'border-b border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-100/90',
        icon: <AlertTriangle className="h-3.5 w-3.5 text-yellow-300" />,
        mobileText: `AI spend ${budget.percentUsed}% of $${limit} ($${remaining} left)`,
        desktopText:
          `AI spend at ${budget.percentUsed}% of $${limit} monthly budget ($${remaining} left).`,
      };
    }

    if (usage && !usage.isPremium && usage.aiLimit !== Infinity && usage.aiRequestsCount >= usage.aiLimit * 0.8) {
      const remaining = Math.max(0, usage.aiLimit - usage.aiRequestsCount);
      return {
        kind: 'freeTier',
        dismissKey: dismissKey('freeTier', month),
        role: 'status',
        testId: 'ai-budget-free-tier-banner',
        containerClass: 'border-b border-white/10 bg-white/[0.04] text-white/65',
        icon: <AlertTriangle className="h-3.5 w-3.5 text-white/45" />,
        mobileText: remaining === 0
          ? `Free tier: ${usage.aiLimit} AI msgs used`
          : `Free tier: ${remaining} AI msgs left (${usage.aiRequestsCount}/${usage.aiLimit})`,
        desktopText: remaining === 0
          ? `Free tier: ${usage.aiLimit} AI messages/month used. Upgrade for more.`
          : `Free tier: ${remaining} AI messages left this month (${usage.aiRequestsCount}/${usage.aiLimit}).`,
      };
    }

    return null;
  }, [budget, usage, month]);

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!activeConfig) {
      setDismissed(false);
      return;
    }
    setDismissed(readDismissed(activeConfig.dismissKey));
  }, [activeConfig]);

  const dismiss = useCallback(() => {
    if (!activeConfig) return;
    writeDismissed(activeConfig.dismissKey);
    setDismissed(true);
  }, [activeConfig]);

  if (!activeConfig || dismissed) return null;

  return <DismissibleBudgetBar config={activeConfig} onDismiss={dismiss} />;
}
