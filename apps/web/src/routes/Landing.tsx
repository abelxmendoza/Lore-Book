// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { HeroSection } from '../components/landing/HeroSection';
import { LorebookShowcaseSection } from '../components/landing/LorebookShowcaseSection';
import { FeatureCard } from '../components/landing/FeatureCard';
import { IntelligenceSection } from '../components/landing/IntelligenceSection';
import { CTASection } from '../components/landing/CTASection';
import {
  BookOpen,
  Users,
  TrendingUp,
  Lock,
  Layers,
  MapPin,
  FolderOpen,
  RefreshCw,
  Heart,
} from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black overflow-x-clip">
      <LandingHeader />

      <main>
        <HeroSection />

        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">
                What <span className="text-primary">carries forward</span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-2xl mx-auto px-4 sm:px-0">
                You talk naturally. LoreBook listens for what matters — and adds it to a running record
                you never have to maintain by hand.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard
                icon={Users}
                title="People"
                highlight="Named, not anonymous"
                description="Mention your sister, your ex, your collaborator — next time, LoreBook already knows who you mean."
              />
              <FeatureCard
                icon={MapPin}
                title="Places"
                highlight="History attached"
                description="Cities, homes, and haunts stop being throwaway details. They become part of your world."
              />
              <FeatureCard
                icon={FolderOpen}
                title="Projects & chapters"
                highlight="Progress preserved"
                description="The career pivot, the album, the move — ongoing arcs keep their full context as you update them."
              />
              <FeatureCard
                icon={RefreshCw}
                title="Recurring scenes"
                highlight="Patterns surface"
                description="The same argument, the same kind of win, the same turning point — noticed across time, not lost in chat scrollback."
              />
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 px-2 sm:px-0">
              How it builds
            </h2>
            <p className="text-white/60 text-sm sm:text-base mb-8 px-4 sm:px-0">
              The product gets better the longer you use it — not because of a longer prompt, but because your record grows.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">01</div>
                <h3 className="text-white font-semibold text-lg mb-2">Talk naturally</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  Journal, vent, think out loud. No tags, templates, or forms — just conversation.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">02</div>
                <h3 className="text-white font-semibold text-lg mb-2">Your record grows</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  People, events, decisions, and recurring situations are extracted and connected behind the scenes.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">03</div>
                <h3 className="text-white font-semibold text-lg mb-2">Context returns</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  Every future conversation starts from what came before. You stop re-explaining your own life.
                </p>
              </div>
            </div>
          </div>
        </section>

        <LorebookShowcaseSection />

        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                Built for a long story
              </h2>
              <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
                LoreBook is early — we'd rather earn trust slowly than promise everything at once.
                This is the direction: a system that holds the full texture of a life, not just facts.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-purple-500/20 p-2">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <h3 className="text-white font-semibold">Living autobiography</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  Not a static journal — an evolving picture of where you've been, who mattered, and what keeps repeating.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-pink-500/20 p-2">
                    <Heart className="h-5 w-5 text-pink-400" />
                  </div>
                  <h3 className="text-white font-semibold">Relationships have a home</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  Process a breakup, decode a pattern, track what you need — with full history, not generic advice.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-cyan-500/20 p-2">
                    <TrendingUp className="h-5 w-5 text-cyan-400" />
                  </div>
                  <h3 className="text-white font-semibold">Timeline that accumulates</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  Eras, arcs, and scenes layer in as you talk. You don't organize it — it builds.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-green-500/20 p-2">
                    <Layers className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="text-white font-semibold">Connected context</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  People, places, and decisions relate across years — so your story reads as one life, not scattered notes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                One job, done deeply
              </h2>
              <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto">
                LoreBook isn't a general assistant with memory bolted on. Continuity is the product —
                conversation in, lasting lore out.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-white mb-2">Persistent, not disposable</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  Most AI conversations reset when the window closes. LoreBook is built around accumulation —
                  your record grows every session without extra work from you.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-white mb-2">Evidence, not guesswork</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  Conclusions about your patterns come from what you actually said and did — traceable to moments
                  in your record, not invented backstory.
                </p>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-cyan-500/20 p-3 flex-shrink-0">
                    <Lock className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">Your record, yours alone</h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      Encrypted by default. Your data is never sold or used to train models. Export everything
                      LoreBook holds about you, anytime.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <IntelligenceSection />

        <CTASection
          title="Ready to stop starting over?"
          description="Start a conversation — or explore the demo with no account. Your lore builds from there."
          primaryAction={{
            label: 'Start a conversation',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Try demo',
            path: '/demo',
          }}
        />

        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">
              From the founder
            </h2>
            <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza, Founder"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover flex-shrink-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-1">
                    Abel Mendoza · Founder
                  </p>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-3">
                    I built LoreBook after pouring my life into general AI tools that forgot everything between
                    sessions — and after trying to write my own autobiography and drowning in tangents.
                  </p>
                  <p className="text-sm sm:text-base text-white/55 leading-relaxed">
                    The goal is simple: talk once, carry forward forever, and turn a life into lore you can
                    actually read.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
