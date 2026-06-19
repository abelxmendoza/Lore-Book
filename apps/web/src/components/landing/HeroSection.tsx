// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight, Shield } from 'lucide-react';
import { HeroLogo } from './HeroLogo';
import { RotatingHeroHeadline } from './RotatingHeroHeadline';
import './HeroSection.css';

const ENTITY_CHIPS = ['Mom', 'Portland', 'New job', 'Alex', 'The move'];

const ChatPreview = () => (
  <div className="hero-chat-enter hero-chat-panel w-full rounded-xl border border-white/10 bg-black/55 backdrop-blur-sm overflow-hidden shadow-xl shadow-black/40">
    <div className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/5 bg-white/[0.02]">
      <div className="w-2 h-2 rounded-full bg-red-500/50 shrink-0" />
      <div className="w-2 h-2 rounded-full bg-yellow-500/50 shrink-0" />
      <div className="w-2 h-2 rounded-full bg-green-500/50 shrink-0" />
      <span className="ml-1 text-[10px] sm:text-xs text-white/25 truncate">LoreBook · Career thread</span>
    </div>

    <div className="px-3 sm:px-4 py-3 sm:py-4 space-y-2.5 sm:space-y-3">
      <div className="flex flex-wrap gap-1 sm:gap-1.5">
        {ENTITY_CHIPS.map((chip) => (
          <span
            key={chip}
            className="px-1.5 sm:px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-200/90 text-[9px] sm:text-[10px]"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="flex justify-end">
        <div className="rounded-lg rounded-tr-sm bg-purple-500/20 border border-purple-500/20 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/90 text-[11px] sm:text-sm leading-relaxed max-w-[94%]">
          I got the job. The one in Portland I've been talking about with Mom — the one I almost didn't
          apply for because I convinced myself I wasn't ready.
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2.5 items-start">
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 mt-0.5" />
        <div className="rounded-lg rounded-tl-sm bg-white/[0.06] border border-white/5 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/80 text-[11px] sm:text-sm leading-relaxed min-w-0">
          That's the role you mentioned after your call with Mom in March — when you said Portland felt
          like starting over without losing yourself. You talked yourself out of applying twice; Alex
          flagged the same hesitation pattern when you passed on the Austin offer last year.
        </div>
      </div>

      <div className="flex justify-end">
        <div className="rounded-lg rounded-tr-sm bg-purple-500/20 border border-purple-500/20 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/90 text-[11px] sm:text-sm leading-relaxed max-w-[92%] sm:max-w-[88%]">
          Exactly. I didn't have to re-explain Mom, Alex, or why Portland mattered. You already had all of
          that.
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2.5 items-start">
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 mt-0.5" />
        <div className="rounded-lg rounded-tl-sm bg-white/[0.06] border border-white/5 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/75 text-[11px] sm:text-sm leading-relaxed min-w-0">
          I've added <span className="text-primary/90 font-medium">New job · Portland</span> to your timeline
          and linked it to Mom, Alex, and the move you've been processing since February. Want to capture
          how you're feeling before the first day?
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 sm:px-3.5 py-2 sm:py-2.5 mt-0.5">
        <span className="text-white/20 text-[10px] sm:text-xs flex-1 truncate">What's on your mind…</span>
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
          <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-white" />
        </div>
      </div>
    </div>
  </div>
);

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-0 md:min-h-[92vh] px-4 sm:px-6 lg:px-8 pt-[max(5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-12 md:pb-16">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-purple-950 to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(154,77,255,0.18),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_60%,rgba(255,31,174,0.1),transparent_55%)]" />

      <div className="relative z-10 max-w-7xl mx-auto w-full min-w-0">
        <div className="hero-layout">
          <div className="hero-headline-panel">
            <RotatingHeroHeadline />
          </div>

          <div className="hero-logo-column">
            <HeroLogo variant="hero" />
            <p className="hero-logo-tagline">Life memory · Early access</p>

            <div className="hero-logo-support">
              <p className="hero-copy-lead">
                Every conversation adds to a record of your life. Mention someone once —
                LoreBook carries them forward.
              </p>

              <div className="hero-copy-actions">
                <Button
                  type="button"
                  onClick={() => navigate('/login')}
                  size="lg"
                  className="w-full sm:w-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-sm sm:text-base px-5 sm:px-6 py-4 sm:py-5 min-h-[48px] shadow-lg shadow-purple-500/35"
                >
                  Start a conversation
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate('/demo')}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto border-white/15 text-white/80 hover:bg-white/5 hover:border-white/30 text-sm sm:text-base px-5 sm:px-6 py-4 sm:py-5 min-h-[48px]"
                >
                  Try demo
                </Button>
              </div>

              <div className="hero-copy-trust">
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <span>Private by default</span>
                </div>
                <span className="hidden sm:inline text-white/15">·</span>
                <span>Export anytime</span>
                <span className="hidden sm:inline text-white/15">·</span>
                <span>Free to start</span>
              </div>
            </div>
          </div>

          <div className="hero-content-column">
            <ChatPreview />
          </div>
        </div>

        <div className="mt-8 sm:mt-10 lg:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 border-t border-white/5 pt-6 sm:pt-8 lg:pt-10">
          {[
            { value: 'Talk', sub: 'Journal, vent, think out loud' },
            { value: 'Record', sub: 'People & moments accumulate' },
            { value: 'Compile', sub: 'Turn lore into readable books' },
            { value: 'Return', sub: 'Context already there' },
          ].map(({ value, sub }) => (
            <div key={value} className="text-center lg:text-left px-0.5">
              <p className="text-sm sm:text-lg md:text-xl font-bold text-primary mb-0.5">{value}</p>
              <p className="text-[10px] sm:text-xs text-white/35 leading-snug">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
