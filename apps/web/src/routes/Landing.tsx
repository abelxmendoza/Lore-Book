// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { HeroSection } from '../components/landing/HeroSection';
import { FeatureCard } from '../components/landing/FeatureCard';
import { IntelligenceSection } from '../components/landing/IntelligenceSection';
import { CTASection } from '../components/landing/CTASection';
import {
  Brain,
  BookOpen,
  Users,
  TrendingUp,
  Database,
  Lock,
  Layers,
  MapPin,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />

      <main>
        {/* 1. Hero — grounded continuity promise */}
        <HeroSection />

        {/* 2. What carries forward — concrete, immediate value */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">
                What <span className="text-primary">carries forward</span>
              </h2>
              <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-2xl mx-auto px-4 sm:px-0">
                Every conversation adds to a running record. No categories, no tags — just context that builds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard
                icon={Users}
                title="Recurring People"
                highlight="No re-introducing"
                description="Next time you mention someone from your life, LoreBook already knows who they are. No backstory required."
              />
              <FeatureCard
                icon={MapPin}
                title="Familiar Places"
                highlight="Context that sticks"
                description="The places that keep coming up stop being just names. They become part of your world — with history."
              />
              <FeatureCard
                icon={FolderOpen}
                title="Ongoing Projects"
                highlight="History intact"
                description="Your work-in-progress carries its full record. Every update layers on what came before — nothing gets lost."
              />
              <FeatureCard
                icon={RefreshCw}
                title="Recurring Situations"
                highlight="Patterns noticed"
                description="When the same situation keeps repeating, LoreBook begins to see it — not just remember it happened."
              />
            </div>
          </div>
        </section>

        {/* 3. How it works — grounded, step-by-step */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 px-2 sm:px-0">
              How it builds
            </h2>
            <p className="text-white/60 text-sm sm:text-base mb-8 px-4 sm:px-0">
              Every conversation adds to your record. Here's what happens.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">01</div>
                <h3 className="text-white font-semibold text-lg mb-2">Talk naturally</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  No tags, no categories, no format. Write the way you'd text a close friend. LoreBook listens for what matters.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">02</div>
                <h3 className="text-white font-semibold text-lg mb-2">It extracts what matters</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  After every conversation, LoreBook identifies the people, decisions, and recurring situations you mentioned — and adds them to your record.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
                <div className="text-3xl font-bold text-primary mb-3">03</div>
                <h3 className="text-white font-semibold text-lg mb-2">Context carries forward</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  Next time you mention someone, LoreBook already knows who they are. No re-explaining. No starting over. The record grows with you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. The longer arc — vision, honestly framed */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                The longer arc
              </h2>
              <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto">
                LoreBook is early. But the direction is clear: a system that accumulates
                the full texture of a life — not just facts, but the threads that run through years.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-purple-500/20 p-2">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <h3 className="text-white font-semibold">Autobiographical continuity</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  A living record that fills in as you talk. Not a static journal — an evolving picture of where you've been and where you're going.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-pink-500/20 p-2">
                    <RefreshCw className="h-5 w-5 text-pink-400" />
                  </div>
                  <h3 className="text-white font-semibold">Recurring scenes</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  The same argument. The same kind of problem. The same person, different chapter. LoreBook maps the recurring arcs of your life.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-cyan-500/20 p-2">
                    <TrendingUp className="h-5 w-5 text-cyan-400" />
                  </div>
                  <h3 className="text-white font-semibold">Timeline formation</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  Over time, your conversations layer into a timeline — not manually organized, just accumulated. You don't maintain it. It builds.
                </p>
              </div>

              <div className="rounded-lg border border-border/40 bg-black/40 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-green-500/20 p-2">
                    <Layers className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="text-white font-semibold">Connected life context</h3>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  People, places, decisions, and situations that aren't isolated — they start to relate to each other across years of conversation.
                </p>
              </div>
            </div>

            <p className="text-center text-white/35 text-xs mt-8 max-w-xl mx-auto">
              Some of this is live. All of it is the direction. We'd rather earn your trust slowly than promise everything at once.
            </p>
          </div>
        </section>

        {/* 5. Built differently — clean differentiation, no comparison table */}
        <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                Built <span className="text-primary">differently</span>
              </h2>
              <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto">
                Most AI tools reset when the conversation ends. LoreBook is built from the ground up around continuity — not queries.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-purple-500/20 p-3 flex-shrink-0">
                    <Database className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Persistent, not transient
                    </h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      General AI tools are built for one-off queries. Every conversation starts blank. LoreBook is built around accumulation — your record grows every session, without you doing anything extra.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-pink-500/20 p-3 flex-shrink-0">
                    <Brain className="h-6 w-6 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Purpose-built for personal continuity
                    </h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      You could paste your journal into ChatGPT and ask for analysis. But it wouldn't remember next time. LoreBook is built specifically to hold your context — and do something with it over time.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-black/40 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-cyan-500/20 p-3 flex-shrink-0">
                    <Lock className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Your record, yours alone
                    </h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      GDPR compliant, encrypted by default. Your data is never sold, never shared, and never used to train models. What you tell LoreBook stays in your record — not a corporate database.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5b. How LoreBook thinks — technical credibility, late placement so it
             deepens trust at the decision point without disrupting the pitch above */}
        <IntelligenceSection />

        {/* 6. CTA */}
        <CTASection
          title="Ready to stop starting over?"
          description="Join LoreBook and let context carry forward. Start free."
          primaryAction={{
            label: 'Get Started Free',
            path: '/login',
          }}
          secondaryAction={{
            label: 'Explore Features',
            path: '/features',
          }}
        />

        {/* 9. Founder */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8 text-center px-2 sm:px-0">Team</h2>
            <div className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza, Founder"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover flex-shrink-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-1">Founder & Lead Developer</p>
                  <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">Abel Mendoza</h3>
                  <p className="text-sm sm:text-base text-white/70 leading-relaxed">
                    Building LoreBook, an AI designed to remember, connect, and preserve the story of a human life over time.
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
