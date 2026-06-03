import { useState } from 'react';
import { Check, Minus, Sparkles, Zap, Brain, BookOpen } from 'lucide-react';
import { cn } from '../../lib/cn';

// ── Plan definitions — approved monetization model (Phase 7) ─────────────────

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    icon: Zap,
    iconColor: 'text-white/50',
    iconBg: 'bg-white/8',
    monthlyPrice: 0,
    yearlyPrice: 0,
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
    monthlyPrice: 12,
    yearlyPrice: 10,
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
      { text: 'Weekly in-app digest', included: true },
      { text: 'Data export (PDF / JSON)', included: true },
      { text: 'Chapter & arc auto-detection', included: false },
      { text: 'Family thread', included: false },
    ],
  },
  {
    id: 'power',
    name: 'Power',
    icon: Brain,
    iconColor: 'text-violet-300',
    iconBg: 'bg-violet-500/15',
    monthlyPrice: 29,
    yearlyPrice: 24,
    tagline: 'For people who want to understand themselves.',
    highlight: false,
    badge: null,
    cta: 'Join the waitlist',
    ctaStyle: 'border border-violet-400/40 text-violet-300 hover:bg-violet-500/10',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Deep relationship analytics', included: true },
      { text: 'Health scores, drift & cycle signals', included: true },
      { text: 'Chapter & arc auto-detection', included: true },
      { text: '"I\'ve noticed" pattern moments', included: true },
      { text: 'Custom intelligence profiles', included: true },
      { text: 'Decision journal with outcome tracking', included: true },
      { text: 'Advanced biography (quarterly)', included: true },
      { text: 'Priority processing', included: true },
      { text: 'Family thread', included: false },
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    icon: BookOpen,
    iconColor: 'text-amber-300',
    iconBg: 'bg-amber-500/15',
    monthlyPrice: 75,
    yearlyPrice: 62,
    tagline: 'For people building a life record that lasts.',
    highlight: false,
    badge: 'Legacy',
    cta: 'Join the waitlist',
    ctaStyle: 'border border-amber-400/40 text-amber-300 hover:bg-amber-500/10',
    features: [
      { text: 'Everything in Power', included: true },
      { text: 'Annual AI-written memoir', included: true },
      { text: 'Family thread (up to 5 members)', included: true },
      { text: 'Legacy mode & inheritance settings', included: true },
      { text: 'Monthly AI coaching session', included: true },
      { text: 'White-glove onboarding', included: true },
      { text: 'Printed memoir book (annual)', included: true },
      { text: 'Founding member community', included: true },
      { text: 'Direct product input', included: true },
      { text: 'Lifetime pricing lock', included: true },
    ],
  },
] as const;

export type PlanId = typeof PLANS[number]['id'];

interface PricingTableProps {
  onUpgrade?: (tier: string) => void;
  currentPlan?: string;
}

export const PricingTable = ({ onUpgrade, currentPlan = 'free' }: PricingTableProps) => {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="space-y-10">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn('text-sm font-medium transition-colors', billing === 'monthly' ? 'text-white' : 'text-white/35')}>
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
          aria-label={`Switch to ${billing === 'monthly' ? 'yearly' : 'monthly'} billing`}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors duration-200',
            billing === 'yearly' ? 'bg-primary' : 'bg-white/15'
          )}
        >
          <span className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
            billing === 'yearly' ? 'translate-x-6' : 'translate-x-1'
          )} />
        </button>
        <span className={cn('text-sm font-medium transition-colors', billing === 'yearly' ? 'text-white' : 'text-white/35')}>
          Yearly
          <span className="ml-1.5 text-[11px] text-emerald-400 font-semibold">–20%</span>
        </span>
      </div>

      {/* Plan grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.id === currentPlan;
          const price = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
          const isFree = plan.monthlyPrice === 0;

          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-2xl border p-5 transition-all duration-200',
                plan.highlight
                  ? 'border-primary/50 bg-gradient-to-b from-primary/10 via-black/70 to-black/70 shadow-[0_0_50px_rgba(139,92,246,0.12)]'
                  : 'border-white/10 bg-black/40 hover:border-white/20'
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={cn(
                  'absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap',
                  plan.highlight
                    ? 'bg-primary text-white'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                )}>
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div className="mb-4">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', plan.iconBg)}>
                  <Icon className={cn('h-4.5 w-4.5', plan.iconColor)} />
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
                    <span className="text-3xl font-bold text-white">${price}</span>
                    <span className="text-white/35 text-xs">/ mo</span>
                    {billing === 'yearly' && (
                      <span className="text-[10px] text-emerald-400 ml-0.5">billed yearly</span>
                    )}
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => {
                  if (!isCurrent) onUpgrade?.(plan.id);
                }}
                disabled={isCurrent}
                className={cn(
                  'w-full py-2 rounded-xl text-sm font-semibold transition-all mb-5',
                  isCurrent
                    ? 'bg-white/6 text-white/30 cursor-default'
                    : plan.ctaStyle
                )}
              >
                {isCurrent ? 'Your plan' : plan.cta}
              </button>

              {/* Feature list */}
              <ul className="space-y-2 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature.text} className={cn('flex items-start gap-2 text-xs', feature.included ? '' : 'opacity-30')}>
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
};
