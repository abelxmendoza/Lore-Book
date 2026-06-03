import { Check, Minus, Zap, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    icon: Zap,
    iconColor: 'text-white/50',
    iconBg: 'bg-white/8',
    price: 0,
    tagline: 'Start building your record.',
    highlight: false,
    badge: null,
    cta: 'Get started free',
    ctaStyle: 'border border-white/20 text-white/80 hover:bg-white/8',
    features: [
      { text: '1 active thread (full memory)', included: true },
      { text: '15 tracked characters', included: true },
      { text: 'Cross-session memory — 30 days', included: true },
      { text: 'Entity recognition & recall', included: true },
      { text: 'Return greetings', included: true },
      { text: 'Unlimited messages', included: true },
      { text: 'Unlimited threads', included: false },
      { text: 'Relationship intelligence', included: false },
      { text: 'Biography generation', included: false },
      { text: 'Memory search', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Sparkles,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/15',
    price: 20,
    tagline: 'For people who talk to LoreBook every day.',
    highlight: true,
    badge: 'Most popular',
    cta: 'Join the waitlist',
    ctaStyle: 'bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]',
    features: [
      { text: 'Unlimited threads', included: true },
      { text: 'Unlimited tracked characters', included: true },
      { text: 'Full memory — no date limit', included: true },
      { text: 'Relationship intelligence dashboard', included: true },
      { text: 'Biography generation (monthly)', included: true },
      { text: 'Memory search across all threads', included: true },
      { text: 'Chapter & arc auto-detection', included: true },
      { text: 'Weekly in-app digest', included: true },
      { text: 'Data export (PDF / JSON)', included: true },
      { text: 'Priority support', included: true },
    ],
  },
] as const;

export type PlanId = typeof PLANS[number]['id'];

interface PricingTableProps {
  onUpgrade?: (tier: string) => void;
  currentPlan?: string;
}

export const PricingTable = ({ onUpgrade, currentPlan = 'free' }: PricingTableProps) => (
  <div className="space-y-10">
    {/* Plan grid */}
    <div className="grid gap-5 sm:grid-cols-2 max-w-2xl mx-auto">
      {PLANS.map((plan) => {
        const Icon = plan.icon;
        const isCurrent = plan.id === currentPlan;
        const isFree = plan.price === 0;

        return (
          <div
            key={plan.id}
            className={cn(
              'relative flex flex-col rounded-2xl border p-6 transition-all duration-200',
              plan.highlight
                ? 'border-primary/50 bg-gradient-to-b from-primary/10 via-black/70 to-black/70 shadow-[0_0_50px_rgba(139,92,246,0.12)]'
                : 'border-white/10 bg-black/40 hover:border-white/20'
            )}
          >
            {/* Badge */}
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-primary text-white">
                {plan.badge}
              </div>
            )}

            {/* Header */}
            <div className="mb-4">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', plan.iconBg)}>
                <Icon className={cn('h-4 w-4', plan.iconColor)} />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                {isCurrent && (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-1.5 py-0.5">
                    Current
                  </span>
                )}
              </div>
              <p className="text-xs text-white/45 leading-snug">{plan.tagline}</p>
            </div>

            {/* Price */}
            <div className="mb-5">
              {isFree ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">Free</span>
                  <span className="text-white/35 text-xs">forever</span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  <span className="text-white/35 text-xs">/ mo</span>
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={() => { if (!isCurrent) onUpgrade?.(plan.id); }}
              disabled={isCurrent}
              className={cn(
                'w-full py-2 rounded-xl text-sm font-semibold transition-all mb-5',
                isCurrent ? 'bg-white/6 text-white/30 cursor-default' : plan.ctaStyle
              )}
            >
              {isCurrent ? 'Your plan' : plan.cta}
            </button>

            {/* Feature list */}
            <ul className="space-y-2 flex-1">
              {plan.features.map((feature) => (
                <li key={feature.text} className={cn('flex items-start gap-2 text-xs', !feature.included && 'opacity-30')}>
                  {feature.included ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5 text-white/30 shrink-0 mt-0.5" />
                  )}
                  <span className={feature.included ? 'text-white/75' : 'text-white/40'}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>

    {/* Pre-launch note */}
    <div className="flex items-center justify-center gap-3">
      <div className="h-px flex-1 bg-white/6" />
      <p className="text-xs text-white/25 text-center px-4">
        Payments launching soon. Join the waitlist to lock in early-adopter pricing.
      </p>
      <div className="h-px flex-1 bg-white/6" />
    </div>
  </div>
);
