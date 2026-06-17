import { useNavigate } from 'react-router-dom';
import { Brain, Lock, Repeat2, MessageSquareHeart, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PricingTable } from '../components/billing/PricingTable';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../lib/supabase';
import { useGuest } from '../contexts/GuestContext';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { CTASection } from '../components/landing/CTASection';
import { CheckoutFlow } from '../components/subscription/CheckoutFlow';
import { GuestExperienceCard } from '../components/guest/GuestExperienceCard';

// ── Value pillars ─────────────────────────────────────────────────────────────

const VALUE_PILLARS = [
  {
    icon: Brain,
    color: 'text-primary',
    bg: 'bg-primary/10',
    title: 'It actually remembers you',
    body: 'Not just facts — patterns. Who the recurring people in your life are. That you tend to second-guess yourself before big decisions. That you\'ve mentioned this same feeling three times now.',
  },
  {
    icon: Lock,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    title: 'Private by design',
    body: 'End-to-end encrypted. Your conversations stay yours. We don\'t train on your data, sell your story, or share what you tell us.',
  },
  {
    icon: Repeat2,
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    title: 'Gets smarter the longer you use it',
    body: 'The first session is just a conversation. The hundredth session is a system that knows your patterns, your people, and what you\'re working through.',
  },
  {
    icon: MessageSquareHeart,
    color: 'text-rose-400',
    bg: 'bg-rose-400/10',
    title: 'Meets you where you are',
    body: 'Therapist mode, strategist mode, gossip buddy mode. The same record, different lenses depending on what you need right now.',
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: 'What happens to my data when I pay?',
    a: 'Nothing changes about how your data is stored. Pro unlocks more threads, deeper analytics, and generation features — not different privacy treatment. Your data is always encrypted and always yours.',
  },
  {
    q: 'Can I keep my data if I downgrade?',
    a: 'Yes. If you downgrade from Pro to Free, your threads and memories are preserved. You\'ll lose access to unlimited threads and advanced features, but your record stays intact.',
  },
  {
    q: 'What does "unlimited threads" actually mean?',
    a: 'On Free, you get one active thread with full persistent memory. Pro removes that limit — you can have separate threads for relationships, career, health, and anything else, all with full memory.',
  },
  {
    q: 'Is the biography actually good?',
    a: 'It\'s as good as what you\'ve shared. The longer and more honestly you\'ve talked to LoreBook, the more accurate and moving the biography becomes. New users get a solid outline. Veteran users get something they want to keep.',
  },
  {
    q: 'How does billing work?',
    a: 'Pro is a $20/month subscription with a 7-day free trial. You add a card to start, but you\'re not charged until the trial ends — and you can cancel anytime before then with no charge. Billing is handled securely by Stripe.',
  },
];

// ── FAQ item ──────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/8 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left gap-4 text-sm font-medium text-white/80 hover:text-white transition-colors"
      >
        <span>{q}</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-white/30 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-white/30 shrink-0" />
        }
      </button>
      {open && (
        <p className="pb-4 text-sm text-white/50 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const UpgradePage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isGuest } = useGuest();
  const { subscription } = useSubscription();
  const [showCheckout, setShowCheckout] = useState(false);

  const handleUpgrade = (tier: string) => {
    if (tier === 'free') {
      navigate('/login');
      return;
    }
    if (authLoading) return;
    if (!user || isGuest) {
      navigate('/login');
      return;
    }
    setShowCheckout(true);
  };

  if (showCheckout) {
    return (
      <CheckoutFlow
        onCancel={() => setShowCheckout(false)}
        onSuccess={() => setShowCheckout(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black text-white">
      <LandingHeader />

      <main className="pt-20">

        {isGuest && (
          <section className="px-4 sm:px-6 lg:px-8 pb-4">
            <div className="max-w-3xl mx-auto rounded-2xl overflow-hidden border border-primary/20">
              <GuestExperienceCard variant="banner" showEndSession={false} />
            </div>
          </section>
        )}

        {/* Hero */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <p className="text-xs text-primary/60 font-mono tracking-[0.2em] uppercase">
              LoreBook Plans
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              The longer you talk,{' '}
              <span className="text-primary">the more it knows you.</span>
            </h1>
            <p className="text-lg text-white/60 max-w-xl mx-auto leading-relaxed">
              Start free. Upgrade when LoreBook has earned it.
              Your first memory is free forever.
            </p>
          </div>
        </section>

        {/* Value pillars */}
        <section className="py-8 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            {VALUE_PILLARS.map(({ icon: Icon, color, bg, title, body }) => (
              <div key={title} className="flex gap-3.5 p-5 rounded-xl border border-white/6 bg-white/[0.025]">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-1">{title}</p>
                  <p className="text-xs text-white/45 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing table */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Simple pricing</h2>
              <p className="text-white/60">Start free. Upgrade when you're ready for the full picture.</p>
            </div>
            <PricingTable
              onUpgrade={handleUpgrade}
              currentPlan={subscription?.planType ?? 'free'}
            />
          </div>
        </section>

        {/* Trust line */}
        <div className="text-center pb-12">
          <p className="text-sm text-white/30">
            No credit card required to start.&nbsp;&nbsp;·&nbsp;&nbsp;
            Cancel any time.&nbsp;&nbsp;·&nbsp;&nbsp;
            Your data is always yours.
          </p>
        </div>

        {/* FAQ */}
        <section className="py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-bold text-white mb-6 text-center">Questions</h2>
            <div className="border border-white/8 rounded-2xl px-5">
              {FAQ.map(item => <FAQItem key={item.q} {...item} />)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <CTASection
          title="Ready to stop starting over?"
          description="Join LoreBook and let context carry forward. Start free."
          primaryAction={{ label: 'Get Started Free', path: '/login' }}
          secondaryAction={{ label: 'Explore Features', path: '/features' }}
        />

      </main>

      <LandingFooter />
    </div>
  );
};

export default UpgradePage;
