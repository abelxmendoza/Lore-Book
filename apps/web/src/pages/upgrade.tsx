import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Brain, Lock, Repeat2, MessageSquareHeart, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PricingTable } from '../components/billing/PricingTable';
import { useSubscription } from '../hooks/useSubscription';

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
    a: 'Nothing changes about how your data is stored. Paid plans unlock more threads, deeper analytics, and generation features — not different privacy treatment. Your data is always encrypted and always yours.',
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
    q: 'When do payments actually start?',
    a: 'We\'re finishing payment infrastructure now. Joining the waitlist locks in early-adopter pricing and you\'ll be notified first. No credit card required until launch.',
  },
  {
    q: 'What\'s the difference between Power and Pro?',
    a: 'Pro is for people who want a memory companion. Power is for people who want to understand their own patterns — relationship health scores, drift signals, the "I\'ve noticed" moments, and a decision journal that tracks outcomes over time.',
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
  const { subscription } = useSubscription();

  const handleUpgrade = (tier: string) => {
    const subject = encodeURIComponent(`LoreBook ${tier} plan — early access`);
    const body = encodeURIComponent(
      `Hi, I'd like to join the waitlist for the LoreBook ${tier} plan.\n\nI'm currently on the free plan and want to lock in early-adopter pricing.`
    );
    window.open(`mailto:abelxmendoza@gmail.com?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#080510] via-[#0a0614] to-black text-white">

      {/* Atmospheric glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[400px] bg-primary/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[300px] bg-violet-600/6 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-16">

        {/* Back nav */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/30 hover:text-white text-sm transition mb-12"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {/* Hero */}
        <div className="text-center mb-16 sm:mb-20">
          <p className="text-xs text-primary/60 font-mono tracking-[0.2em] uppercase mb-5">
            LoreBook Plans
          </p>
          <h1 className="text-3xl sm:text-[3.25rem] font-bold text-white mb-5 leading-[1.1] font-serif">
            The longer you talk,<br className="hidden sm:block" />
            the more it knows you.
          </h1>
          <p className="text-white/45 text-base sm:text-lg max-w-lg mx-auto leading-relaxed">
            Start free. Upgrade when LoreBook has earned it.
            Your first memory is free forever.
          </p>
        </div>

        {/* Value pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-20">
          {VALUE_PILLARS.map(({ icon: Icon, color, bg, title, body }) => (
            <div key={title} className="flex gap-3.5 p-4 rounded-xl border border-white/6 bg-white/[0.025]">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white mb-1">{title}</p>
                <p className="text-xs text-white/45 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing table */}
        <div id="pricing" className="mb-20">
          <PricingTable
            onUpgrade={handleUpgrade}
            currentPlan={subscription?.planType ?? 'free'}
          />
        </div>

        {/* Trust line */}
        <div className="text-center mb-20">
          <p className="text-sm text-white/30">
            No credit card required to start.&nbsp;&nbsp;·&nbsp;&nbsp;
            Cancel any time.&nbsp;&nbsp;·&nbsp;&nbsp;
            Your data is always yours.
          </p>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mb-16">
          <h2 className="text-lg font-bold text-white mb-6 text-center">Questions</h2>
          <div className="border border-white/8 rounded-2xl px-5">
            {FAQ.map(item => <FAQItem key={item.q} {...item} />)}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center rounded-2xl border border-primary/20 bg-primary/5 p-8 sm:p-10">
          <p className="text-white/40 text-xs font-mono tracking-widest uppercase mb-3">Still deciding?</p>
          <p className="text-lg sm:text-xl font-semibold text-white mb-2">
            The Free plan is the best way to see if LoreBook works for you.
          </p>
          <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
            No limit on messages. One full thread. Real persistent memory.
            If it's not useful, you'll know in a week.
          </p>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="inline-flex items-center gap-2 bg-white text-black px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/90 transition"
          >
            Start for free
          </button>
        </div>

      </div>
    </div>
  );
};

export default UpgradePage;
