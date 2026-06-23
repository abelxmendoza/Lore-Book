// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight, Shield } from 'lucide-react';
import { HeroLogo } from './HeroLogo';
import { RotatingHeroHeadline } from './RotatingHeroHeadline';
import { CompactEntityChip } from '../../features/chat/components/CompactEntityChip';
import { chipColorForEntity } from '../../lib/entityTypeColors';
import type { CertifiedEntityType } from '../../types/certifiedEntity';
import './HeroSection.css';

const ENTITY_CHIPS = [
  { label: 'Mom', type: 'character' },
  { label: 'Portland', type: 'location' },
  { label: 'New job', type: 'event' },
  { label: 'Alex', type: 'character' },
] satisfies Array<{ label: string; type: CertifiedEntityType }>;

// Semantic/theme chips — concepts extracted by lexical intelligence, not entities.
// Styled as a quieter, secondary category using existing neutral tokens.
const SEMANTIC_CHIPS = ['Self-doubt', 'Growth', 'New chapter'] as const;

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
          <CompactEntityChip
            key={chip.label}
            className={`px-1.5 sm:px-2 py-0.5 max-w-none ${chipColorForEntity({ type: chip.type, status: 'confirmed' })}`}
          >
            {chip.label}
          </CompactEntityChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-white/25">Themes</span>
        {SEMANTIC_CHIPS.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-dashed border-white/15 bg-white/[0.02] px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs italic text-white/50"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="flex justify-end">
        <div className="rounded-lg rounded-tr-sm bg-purple-500/20 border border-purple-500/20 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/90 text-[11px] sm:text-sm leading-relaxed max-w-[94%]">
          I finally got the job offer from Portland. I'm excited — but now that it's actually
          happening, I'm starting to second-guess everything again.
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2.5 items-start">
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 mt-0.5" />
        <div className="rounded-lg rounded-tl-sm bg-white/[0.06] border border-white/5 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/80 text-[11px] sm:text-sm leading-relaxed min-w-0">
          <span className="text-primary/80 font-medium">Noted.</span> This feels like your call with
          Mom in March — when Portland stopped being an idea and started feeling real. Hesitation tends
          to show up right before your big transitions: Austin, changing majors, now Portland. Same
          quiet question every time — <span className="italic text-white/70">"What if I'm not ready?"</span>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="rounded-lg rounded-tr-sm bg-purple-500/20 border border-purple-500/20 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/90 text-[11px] sm:text-sm leading-relaxed max-w-[92%] sm:max-w-[88%]">
          Damn. I didn't even realize I was doing it again. Alex said almost the same thing when I was
          talking myself out of accepting.
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2.5 items-start">
        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shrink-0 mt-0.5" />
        <div className="rounded-lg rounded-tl-sm bg-white/[0.06] border border-white/5 px-3 sm:px-3.5 py-2 sm:py-2.5 text-white/75 text-[11px] sm:text-sm leading-relaxed min-w-0">
          But none of those moments were
          ever actually stopped by the doubt — you move first and build the confidence after. The
          pattern isn't <span className="text-white/85 font-medium">self-doubt</span>. It's
          <span className="text-white/85 font-medium"> growth</span> showing up disguised as fear.
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
                Talk naturally. Mention someone once — LoreBook carries them into every conversation
                after.
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

        <div className="hero-flow-stats mt-8 sm:mt-10 lg:mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 border-t border-white/5 pt-6 sm:pt-8 lg:pt-10">
          {[
            { value: 'Talk', sub: 'Think out loud' },
            { value: 'Record', sub: 'Lore accumulates' },
            { value: 'Compile', sub: 'Story becomes books' },
            { value: 'Return', sub: 'Context is waiting' },
          ].map(({ value, sub }, stepIndex) => (
            <div
              key={value}
              className="hero-flow-stat text-center lg:text-left px-0.5"
              style={{ animationDelay: `${stepIndex * 140}ms` }}
            >
              <p className="text-sm sm:text-lg md:text-xl font-bold text-primary mb-0.5">{value}</p>
              <p className="text-[10px] sm:text-xs text-white/35 leading-snug">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
