// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useNavigate } from 'react-router-dom';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { CTASection } from '../components/landing/CTASection';
import {
  Brain,
  BookOpen,
  Shield,
  Sparkles,
  Users,
  Heart,
  Target,
  Lock,
  GitBranch,
  Calendar,
  MessageSquare,
  TrendingUp,
  Search,
  Zap,
  ArrowRight,
  CheckCircle,
  Eye,
} from 'lucide-react';

// ─── Reusable small components ────────────────────────────────────────────────

const Pill = ({ text }: { text: string }) => (
  <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary/80 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
    {text}
  </span>
);

const Check = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-3 text-white/70">
    <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
    <span className="text-sm leading-relaxed">{children}</span>
  </div>
);

// ─── Feature row — alternating left/right layout ──────────────────────────────

interface FeatureRowProps {
  pill: string;
  headline: string;
  body: string;
  bullets: string[];
  example?: string;
  reverse?: boolean;
  accentColor?: string;
}

const FeatureRow = ({
  pill,
  headline,
  body,
  bullets,
  example,
  reverse = false,
  accentColor = 'from-purple-500/10 to-pink-500/10',
}: FeatureRowProps) => (
  <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-8 lg:gap-16 items-center`}>
    {/* Text side */}
    <div className="flex-1 space-y-5">
      <Pill text={pill} />
      <h3 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{headline}</h3>
      <p className="text-white/60 leading-relaxed">{body}</p>
      <div className="space-y-3">
        {bullets.map(b => <Check key={b}>{b}</Check>)}
      </div>
    </div>

    {/* Visual side */}
    <div className="flex-1 w-full">
      <div className={`rounded-2xl border border-border/60 bg-gradient-to-br ${accentColor} bg-black/40 backdrop-blur-sm p-6 sm:p-8`}>
        {example && (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">What it looks like</p>
            <p className="text-white/80 text-sm leading-relaxed italic">"{example}"</p>
          </>
        )}
      </div>
    </div>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Features() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <LandingHeader />

      <main className="pt-20">

        {/* ── HERO ── */}
        <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Pill text="How it works" />
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              The first AI that reads your{' '}
              <span className="text-primary">whole life</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
              Not notes. Not summaries. A system that builds genuine understanding of who you are,
              where you've been, and what it all means — getting smarter every time you talk.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-neon"
              >
                Start for free <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/guide')}
                className="px-8 py-4 border border-border/60 text-white/70 hover:text-white hover:border-primary/50 font-semibold rounded-xl transition-all"
              >
                See how it works →
              </button>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                Most AI reads your message. LoreBook reads your life.
              </h2>
              <p className="text-white/60 max-w-2xl mx-auto">
                Every conversation adds to a growing picture. Over time, the system knows things
                about you that you might have forgotten yourself.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  n: '01',
                  title: 'You talk naturally',
                  body: 'Journal, vent, think out loud. Tell it about your day, your relationships, your goals. No structure required.',
                },
                {
                  n: '02',
                  title: 'It extracts what matters',
                  body: 'People, places, events, patterns, feelings, decisions — pulled from everything you say and organized automatically.',
                },
                {
                  n: '03',
                  title: 'Context carries forward',
                  body: 'Every future conversation is informed by everything that came before. The AI already knows your history.',
                },
              ].map(item => (
                <div key={item.n} className="rounded-xl border border-border/60 bg-black/40 p-6">
                  <div className="text-3xl font-bold text-primary mb-3">{item.n}</div>
                  <h3 className="text-white font-semibold text-lg mb-2">{item.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── THREE PILLARS ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Three things no other app does</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: <Brain className="w-7 h-7 text-purple-400" />,
                  bg: 'from-purple-500/10 to-purple-900/20',
                  border: 'border-purple-500/20',
                  title: 'An AI that knows your history',
                  body: 'When you start a conversation, LoreBook already knows who Jordan is, what happened last year, what you care about, and what patterns keep showing up in your life.',
                },
                {
                  icon: <Heart className="w-7 h-7 text-pink-400" />,
                  bg: 'from-pink-500/10 to-pink-900/20',
                  border: 'border-pink-500/20',
                  title: 'Your love life has a home',
                  body: 'Describe a date, process a breakup, decode a confusing text. The system tracks your relationships, detects patterns, and advises from full context — not generic advice.',
                },
                {
                  icon: <Calendar className="w-7 h-7 text-blue-400" />,
                  bg: 'from-blue-500/10 to-blue-900/20',
                  border: 'border-blue-500/20',
                  title: 'A timeline that builds itself',
                  body: 'Your entries are automatically organized into eras, arcs, chapters, and scenes. The structure of your life story emerges without you managing it.',
                },
              ].map(p => (
                <div key={p.title} className={`rounded-2xl border ${p.border} bg-gradient-to-br ${p.bg} bg-black/40 backdrop-blur-sm p-6 sm:p-8`}>
                  <div className="mb-4">{p.icon}</div>
                  <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── KNOWLEDGE LAYER ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-purple-950/60 to-black/60 backdrop-blur-sm overflow-hidden">
              <div className="p-8 sm:p-12">
                <div className="grid lg:grid-cols-2 gap-10 items-center">
                  <div className="space-y-5">
                    <Pill text="Knowledge Crystallization" />
                    <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                      LoreBook believes things about you.{' '}
                      <span className="text-primary">With receipts.</span>
                    </h2>
                    <p className="text-white/60 leading-relaxed">
                      Most AI tells you things it guessed. LoreBook earns knowledge from behavioral evidence —
                      what you repeatedly do, not just what you say about yourself. And it can show you exactly why
                      it believes what it believes.
                    </p>
                    <div className="space-y-3">
                      <Check>Knowledge claims build from observed patterns, not self-description</Check>
                      <Check>Every conclusion is traceable to specific events and interactions</Check>
                      <Check>Claims evolve over time — old beliefs become historical, new ones emerge</Check>
                      <Check>AI-generated claims are never used as evidence — only your life is</Check>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-5">
                      What a knowledge claim looks like
                    </p>
                    {[
                      {
                        type: 'behavioral pattern',
                        claim: 'You commit to long technical projects under pressure.',
                        confidence: '84%',
                        evidence: '8 recurring scenes over 26 months',
                      },
                      {
                        type: 'value',
                        claim: 'Emotional reciprocity is non-negotiable for you in relationships.',
                        confidence: '71%',
                        evidence: 'Red flag pattern across 3 relationships + 1 reflection',
                      },
                      {
                        type: 'lesson',
                        claim: 'Creative partnerships with a partner tend to blur the work and the relationship.',
                        confidence: '74%',
                        evidence: '3 matching interactions + user reflection (April 2024)',
                      },
                    ].map(c => (
                      <div key={c.claim} className="rounded-lg border border-white/10 bg-black/40 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-primary/70 uppercase tracking-wider">{c.type}</span>
                          <div className="flex items-center gap-1.5">
                            <Eye className="w-3 h-3 text-white/30" />
                            <span className="text-xs text-white/40">confidence {c.confidence}</span>
                          </div>
                        </div>
                        <p className="text-sm text-white/80 leading-snug mb-2">"{c.claim}"</p>
                        <p className="text-xs text-white/30">Evidence: {c.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── RELATIONSHIP ADVISOR ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <FeatureRow
              pill="Dating & Romance"
              headline="An advisor who has actually read your journals"
              body="When you talk about your love life, LoreBook doesn't give you generic advice. It knows the history — who this person is, what pattern you're in, what happened last time, whether things are getting closer or drifting. It reasons from evidence."
              bullets={[
                'Automatic detection: dates, calls, fights, and milestones logged from natural conversation',
                'Drift direction: growing closer, pulling away, or volatile — tracked over time',
                'Push-pull, hot-cold, and on-again-off-again patterns identified across months',
                'Cross-relationship learning: what keeps showing up across your relationship history',
                'The advisor never judges the other person — only describes what was observed',
              ]}
              example="The last three times communication slowed after a strong connection, the relationship drifted apart. That's not a prediction — it's a pattern. Worth paying attention to before you assume this time is different."
              accentColor="from-pink-500/10 to-rose-900/20"
            />
          </div>
        </section>

        {/* ── TIMELINE & ARCS ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-5xl mx-auto">
            <FeatureRow
              pill="Temporal Intelligence"
              headline="Your life organized into the structure it actually has"
              body="Life doesn't happen in bullet points. It unfolds in eras, arcs, chapters, and turning points — and LoreBook builds that structure automatically from what you share. The 'College Years.' The 'With Jordan' chapter. The 'Startup Period.' Named, dated, connected."
              bullets={[
                '9-layer timeline hierarchy: Mythos → Epoch → Era → Saga → Arc → Chapter → Scene → Action',
                'Life arcs inferred from behavioral patterns and event clusters',
                'Arcs connect causally: the breakup arc spawned the self-discovery arc',
                'Gap periods are typed: recovery, transition, identity shift',
                'Causal chains: what events led to which outcomes, traced through time',
              ]}
              example="When you started building Lorekeeper (career arc, early 2026), you were simultaneously navigating growing closer with someone (relationships arc) and questioning your creative identity (inner arc). Those three threads ran together for months."
              reverse
              accentColor="from-blue-500/10 to-indigo-900/20"
            />
          </div>
        </section>

        {/* ── BIOGRAPHY ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <FeatureRow
              pill="Biography Generation"
              headline="Your story, written from your own evidence"
              body="LoreBook generates a real biography from your entries — not a summary of what you wrote, but a narrative constructed from the events, milestones, patterns, and lessons it has extracted. Read it like a book. Edit it. Export it."
              bullets={[
                'Chapter structure derived from your actual arc hierarchy',
                'Relationship chapters built from interactions, dates, drift, and breakups',
                'Lessons and values appear at the end of each life period',
                'Tone options: neutral, reflective, dramatic, or mythic',
                'Private by default — publish only when you choose to',
              ]}
              example="The period from 2022 to 2024 was shaped significantly by the relationship with Jordan. You were building your first company and falling in love at the same time — two arcs that overlapped and shaped each other. What the relationship left behind was more than memory."
              accentColor="from-amber-500/10 to-orange-900/20"
            />
          </div>
        </section>

        {/* ── AI COMPANIONS ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <Pill text="AI Companions" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-4 mb-3">
                One AI. Multiple ways of being useful.
              </h2>
              <p className="text-white/60 max-w-xl mx-auto">
                The system adapts to what you need — processing grief, planning a strategy, decoding a situation,
                or just needing someone who already knows the backstory.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: <MessageSquare className="w-5 h-5 text-pink-400" />,
                  title: 'Relationship Advisor',
                  body: 'Knows your full relationship history. Reasons from evidence. Direct about patterns without judging anyone.',
                },
                {
                  icon: <Brain className="w-5 h-5 text-purple-400" />,
                  title: 'Life Historian',
                  body: 'Maintains truth and continuity across your entire narrative. Never forgets. Connects the present to the past.',
                },
                {
                  icon: <Target className="w-5 h-5 text-blue-400" />,
                  title: 'Strategist',
                  body: 'Goal-oriented and actionable. Uses your patterns and history to give guidance grounded in what you have actually lived.',
                },
                {
                  icon: <Heart className="w-5 h-5 text-rose-400" />,
                  title: 'Processing Partner',
                  body: 'Reflective, warm, no judgment. Validates and helps you untangle complex emotional situations.',
                },
                {
                  icon: <Users className="w-5 h-5 text-green-400" />,
                  title: 'Gossip Buddy',
                  body: 'Curious and engaged. Asks the right questions about the people in your life. Loves a good story.',
                },
                {
                  icon: <BookOpen className="w-5 h-5 text-amber-400" />,
                  title: 'Biography Writer',
                  body: 'Turns your history into readable narrative. Crafts chapters, finds the arc, writes your story beautifully.',
                },
              ].map(c => (
                <div key={c.title} className="rounded-xl border border-border/60 bg-black/40 backdrop-blur-sm p-5 hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    {c.icon}
                    <h3 className="text-white font-semibold">{c.title}</h3>
                  </div>
                  <p className="text-white/60 text-sm leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── MORE FEATURES ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Everything else</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: <Search className="w-5 h-5 text-primary" />,
                  title: 'Semantic Memory Search',
                  body: 'Search by meaning, not keywords. "When was I last truly happy?" returns real answers.',
                },
                {
                  icon: <Users className="w-5 h-5 text-primary" />,
                  title: 'Character System',
                  body: 'Every person in your life gets a profile. Relationship tracking, arc history, AI insights.',
                },
                {
                  icon: <Sparkles className="w-5 h-5 text-primary" />,
                  title: 'Discovery Hub',
                  body: 'Patterns, identity, soul profile, relationship analytics. What the data shows about who you are.',
                },
                {
                  icon: <TrendingUp className="w-5 h-5 text-primary" />,
                  title: 'Life Arc Intelligence',
                  body: 'Named life periods inferred from your history. Arcs open, close, and connect causally.',
                },
                {
                  icon: <GitBranch className="w-5 h-5 text-primary" />,
                  title: 'Causal Chains',
                  body: 'Which events led to which outcomes? The system traces the threads forward and backward.',
                },
                {
                  icon: <Zap className="w-5 h-5 text-primary" />,
                  title: 'Threads',
                  body: 'Persistent conversations that remember exactly where you left off, always.',
                },
                {
                  icon: <BookOpen className="w-5 h-5 text-primary" />,
                  title: 'Intelligent LoreBook',
                  body: 'Natural language queries against your personal lore. Ask anything about your own story.',
                },
                {
                  icon: <Eye className="w-5 h-5 text-primary" />,
                  title: 'Evidence View',
                  body: '"Why does LoreBook believe this about me?" — full traceability with source citations.',
                },
              ].map(f => (
                <div key={f.title} className="rounded-xl border border-border/60 bg-black/40 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    {f.icon}
                    <h3 className="text-white font-semibold text-sm">{f.title}</h3>
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRIVACY ── */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-green-500/20 bg-green-950/10 backdrop-blur-sm p-8 sm:p-12">
              <div className="grid lg:grid-cols-2 gap-10 items-center">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-green-400" />
                    <Pill text="Privacy First" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white">
                    You're trusting us with your real life. We take that seriously.
                  </h2>
                  <p className="text-white/60 leading-relaxed">
                    LoreBook is built on the assumption that what you share here is the most personal thing you have.
                    Everything is private until you decide otherwise.
                  </p>
                </div>
                <ul className="space-y-4">
                  {[
                    { icon: <Lock className="w-4 h-4 text-green-400 flex-shrink-0" />, text: 'AES-256-GCM encryption in transit and at rest' },
                    { icon: <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />, text: 'Your data is never sold or shared with advertisers' },
                    { icon: <Lock className="w-4 h-4 text-green-400 flex-shrink-0" />, text: 'No human ever reviews your entries or conversations' },
                    { icon: <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />, text: 'Export everything or delete everything — your choice, anytime' },
                    { icon: <Lock className="w-4 h-4 text-green-400 flex-shrink-0" />, text: 'Biography publishing is opt-in only — private by default' },
                  ].map(item => (
                    <li key={item.text} className="flex items-start gap-3">
                      {item.icon}
                      <span className="text-sm text-white/70 leading-relaxed">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <CTASection
          title="The longer you use it, the more it knows."
          description="Start building your life's record today. Every conversation adds to a picture that gets clearer over time."
          primaryAction={{ label: 'Start for free', path: '/login' }}
          secondaryAction={{ label: 'Read the guide', path: '/guide' }}
        />
      </main>

      <LandingFooter />
    </div>
  );
}
