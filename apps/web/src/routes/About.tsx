// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { CTASection } from '../components/landing/CTASection';
import { FounderContact } from '../components/landing/FounderContact';
import { Logo } from '../components/Logo';
import { Shield } from 'lucide-react';

// ─── Belief statement component ───────────────────────────────────────────────

const Belief = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-4 py-4 border-b border-border/40 last:border-0">
    <div className="w-1 h-1 mt-3 rounded-full bg-primary flex-shrink-0" />
    <p className="text-lg sm:text-xl text-white/80 leading-relaxed">{children}</p>
  </div>
);

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />

      <main className="pt-20">

        {/* ── OPENING ── */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="flex justify-center mb-4">
              <Logo size="lg" showText={true} />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              Memory is who you are.
            </h1>
            <p className="text-lg sm:text-xl text-white/50 max-w-xl mx-auto leading-relaxed">
              LoreBook exists because continuity shouldn't be something you have to rebuild every time.
            </p>
          </div>
        </section>

        {/* ── THE STORY ── */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-8 sm:p-12 space-y-6">

              <div className="text-xs font-semibold uppercase tracking-widest text-primary/60 mb-6">
                Why LoreBook exists
              </div>

              <p className="text-base sm:text-lg text-white/80 leading-relaxed">
                I built LoreBook because I started telling ChatGPT everything.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                Not just random questions. My history, my stories, old memories, relationships,
                career changes, things I was trying to figure out about myself. I wanted to see
                if it would eventually remember enough to understand who I was.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                But it always forgot.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                I'd spend hours explaining my past, only to have to explain it again the next time.
                The conversations were useful. The continuity was missing.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                Around the same time, I was writing my own autobiography. I'd always been fascinated
                by how people leave a piece of themselves behind — through books, music, art, inventions,
                history. That's what first got me thinking about digital immortality.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                When I started writing my life story, I ran into a different problem. There was too much
                to write. Every memory connected to another memory. Every story led to a tangent. Every
                person connected to a different chapter of my life. I wasn't struggling to
                remember things — I was struggling to make sense of them.
              </p>

              <div className="border-l-2 border-primary/40 pl-6 my-8">
                <p className="text-lg sm:text-xl text-white/90 leading-relaxed font-medium">
                  That's where the idea for LoreBook came from.
                </p>
              </div>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                What if you could write things down once and never lose them? What if an AI could
                remember your history, understand the connections between events, recognize patterns
                you couldn't see, and help organize the story of your life? What if it could
                automatically generate different versions of your autobiography, memoir, or biography
                based on the same underlying history?
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                Today, LoreBook is a system for memory, continuity, relationships, timelines,
                and personal knowledge. But the long-term vision is bigger.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                I want to build a system that can preserve a person's experiences, understand the
                story connecting them, and help make sense of a life as it unfolds.
              </p>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                And yes — part of me is still fascinated by the original question that started all of this:
              </p>

              <div className="border-l-2 border-white/20 pl-6 my-8">
                <p className="text-base sm:text-lg text-white/60 leading-relaxed italic">
                  If you recorded enough memories, enough experiences, enough thoughts, and an AI
                  understood all of it deeply enough — at what point does it stop being a record of
                  you and start becoming something new?
                </p>
              </div>

              <p className="text-base sm:text-lg text-white/70 leading-relaxed">
                I don't know the answer to that yet.
              </p>

              <p className="text-base sm:text-lg text-white/80 leading-relaxed font-medium">
                LoreBook is my attempt to explore it.
              </p>

            </div>
          </div>
        </section>

        {/* ── THE FOUNDER ── */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm p-8 sm:p-12">
              <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover flex-shrink-0 mx-auto sm:mx-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Abel Mendoza</h3>
                    <p className="text-primary/70 text-sm font-medium mt-1">Founder & Lead Developer</p>
                  </div>
                  <p className="text-white/70 leading-relaxed">
                    I started as a robotics and software engineer, drawn to systems that bridge
                    the physical and digital. Over time, that curiosity drifted toward a different
                    kind of system — the one we use to understand ourselves.
                  </p>
                  <p className="text-white/70 leading-relaxed">
                    I've been journaling for years. I've had conversations that changed how I think,
                    then watched them disappear. I worked on an autobiography and realized that even
                    with all the material, the shape of the story was hard to see. LoreBook is
                    the tool I needed before I could build it.
                  </p>
                  <p className="text-white/60 leading-relaxed text-sm">
                    Building Omega Technologies out of Los Angeles.
                  </p>
                  <FounderContact className="text-center sm:text-left" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── WHAT WE BELIEVE ── */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary/60 mb-2">
                What we believe
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Five things we keep coming back to.
              </h2>
            </div>
            <div className="rounded-2xl border border-border/60 bg-black/40 backdrop-blur-sm px-8 sm:px-12 py-6">
              <Belief>
                Memory matters. Not as nostalgia — as infrastructure. What you've lived shapes
                what you understand about yourself now.
              </Belief>
              <Belief>
                Understanding matters more than remembering. Having the data isn't enough.
                The pattern is what changes you.
              </Belief>
              <Belief>
                People are more than their latest conversation. Context shouldn't have to be
                rebuilt from scratch every time.
              </Belief>
              <Belief>
                Knowledge should be explainable. If the system believes something about you,
                it should be able to show you why — with specific evidence, not a confidence score.
              </Belief>
              <Belief>
                Your life deserves continuity. The story you're living is worth understanding
                as it unfolds, not just in retrospect.
              </Belief>
            </div>
          </div>
        </section>

        {/* ── PRIVACY ── */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-green-500/20 bg-green-950/10 backdrop-blur-sm p-8 sm:p-12">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-5 h-5 text-green-400" />
                <p className="text-xs font-semibold uppercase tracking-widest text-green-400/80">
                  Privacy
                </p>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-5">
                If LoreBook is going to remember your life, it has to earn your trust.
              </h2>
              <p className="text-white/70 leading-relaxed mb-4">
                Everything you share — journal entries, conversations, relationships, memories — is
                encrypted and accessible only to you. No human ever reads your data. We don't sell it,
                share it with advertisers, or use it to train anything without your explicit consent.
                Your LoreBook is private until you decide otherwise, and you can export or delete
                everything at any time.
              </p>
              <p className="text-white/50 text-sm leading-relaxed">
                This is the trust contract. It's not a feature. It's the foundation.
              </p>
            </div>
          </div>
        </section>

        {/* ── TECHNOLOGY ── (minimal — for those who care) */}
        <section className="py-8 sm:py-12 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-3xl mx-auto">
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center justify-between rounded-xl border border-border/60 bg-black/40 px-6 py-4 hover:border-primary/30 transition-colors">
                <span className="text-white/60 text-sm font-medium">How it's built</span>
                <span className="text-white/30 text-xs group-open:hidden">For the curious →</span>
                <span className="text-white/30 text-xs hidden group-open:block">↑</span>
              </summary>
              <div className="mt-2 rounded-xl border border-border/60 bg-black/40 p-6">
                <div className="grid sm:grid-cols-3 gap-6">
                  {[
                    {
                      label: 'Frontend',
                      items: ['React + TypeScript', 'Tailwind CSS', 'React Router'],
                    },
                    {
                      label: 'Backend',
                      items: ['Node.js + Express', 'Supabase + PostgreSQL', 'TypeScript throughout'],
                    },
                    {
                      label: 'AI & Data',
                      items: ['Claude + OpenAI APIs', 'Vector embeddings', 'Custom reasoning layers'],
                    },
                  ].map(col => (
                    <div key={col.label}>
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-3">
                        {col.label}
                      </p>
                      <ul className="space-y-1.5">
                        {col.items.map(item => (
                          <li key={item} className="text-sm text-white/60">{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </section>

        {/* ── CTA ── */}
        <CTASection
          title="Start building your story."
          description="LoreBook gets smarter the longer you use it. Every conversation adds to a picture that grows clearer over time."
          primaryAction={{
            label: 'Get started free',
            path: '/login',
          }}
          secondaryAction={{
            label: 'See how it works',
            path: '/features',
          }}
        />

      </main>

      <LandingFooter />
    </div>
  );
}
