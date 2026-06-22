// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { FeatureCard } from '../components/landing/FeatureCard';
import { CTASection } from '../components/landing/CTASection';
import { FounderContact } from '../components/landing/FounderContact';
import { CONTACT_MAILTO } from '../lib/contact';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileSearch,
  Gauge,
  GitBranch,
  Handshake,
  LockKeyhole,
  Network,
  Server,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

const proofPoints = [
  {
    label: 'Core wedge',
    value: 'Memory with receipts',
    detail: 'Every important claim is grounded to source evidence, confidence, and provenance.',
  },
  {
    label: 'Product stage',
    value: 'Production app',
    detail: 'Live web app, auth, privacy pages, memory graph, and ChatGPT MCP submission assets.',
  },
  {
    label: 'Go-to-market',
    value: 'Founder-led beta',
    detail: 'Focused on users importing real history and testing recall, correction, and continuity.',
  },
];

const milestones = [
  'Instrument cost per message, recall hit rate, ingestion success, and activation.',
  'Ship durable memory ingestion so the core loop survives deploys and restarts.',
  'Complete ChatGPT app review for read-only memory retrieval.',
  'Run a narrow beta around imported histories and weekly continuity summaries.',
];

export default function Investors() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,#050505,#101114_48%,#050505)]">
      <LandingHeader />
      
      <main className="pt-20">
        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/20 px-3 py-1.5 text-xs font-medium text-cyan-200 sm:text-sm">
                <TrendingUp className="h-4 w-4" />
                Investor brief
              </div>
              <h1 className="max-w-4xl text-3xl font-bold tracking-normal text-white sm:text-4xl md:text-5xl lg:text-6xl">
                LoreBook is building trustworthy memory infrastructure for personal AI.
            </h1>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/70 sm:text-lg md:text-xl">
                The problem is not whether AI can remember. The problem is whether users can trust what it remembers.
                LoreBook turns conversations, imports, and life events into a provenance-aware graph that can be searched,
                corrected, and cited before an assistant answers.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href={CONTACT_MAILTO}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-cyan-400"
                >
                  Request investor materials
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#thesis"
                  className="inline-flex items-center justify-center rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:bg-white/5"
                >
                  Read the thesis
                </a>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {proofPoints.map((point) => (
                <div key={point.label} className="rounded-lg border border-white/10 bg-black/45 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">{point.label}</p>
                  <p className="mt-2 text-xl font-semibold text-white">{point.value}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{point.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Thesis */}
        <section id="thesis" className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Why LoreBook can matter</h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                Assistant memory is becoming a platform primitive. Most products treat memory as a hidden preference store.
                LoreBook treats memory as an inspectable system of record: what happened, who was involved, what changed,
                what is uncertain, and which source supports the answer.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              <FeatureCard
                icon={FileSearch}
                title="Provenance as the wedge"
                description="Answers can point back to journal entries, imported history, source IDs, and confidence labels instead of asking users to trust a black-box memory."
              />
              <FeatureCard
                icon={GitBranch}
                title="Correction loop"
                description="A personal memory system must be wrong gracefully. LoreBook is designed around review, contradiction handling, and user-controlled canon."
              />
              <FeatureCard
                icon={Network}
                title="Life graph, not notes"
                description="People, places, projects, events, relationships, and claims become connected memory objects that can be searched and reused across assistants."
              />
            </div>
          </div>
        </section>

        {/* Product */}
        <section className="bg-black/25 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">The product wedge</h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                LoreBook starts with a high-intent user job: import or capture personal history, then ask questions that
                require continuity. The product wins when a user can ask "what happened, what changed, and why do you think
                that?" and get an answer with receipts.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FeatureCard
                icon={BrainCircuit}
                title="Conversation in, lasting memory out"
                description="Chat and imports feed a structured autobiographical graph instead of disappearing into an uninspectable transcript."
              />
              <FeatureCard
                icon={CheckCircle2}
                title="Grounded assistant responses"
                description="The response compiler treats assistant claims as non-authoritative until they are grounded, labeled as inference, or rejected."
              />
              <FeatureCard
                icon={Server}
                title="ChatGPT app distribution"
                description="A production MCP server exposes five read-only tools for memory search, entity lookup, timeline retrieval, and relationship inspection."
              />
              <FeatureCard
                icon={LockKeyhole}
                title="Private by design"
                description="The current external integration is read-only, OAuth-scoped, and centered on user-owned memory rather than public posting or background mutation."
              />
            </div>
          </div>
        </section>

        {/* Business Model and Market */}
        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Business model</h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                  The near-term model is direct subscription revenue from power users who need memory continuity,
                  followed by team, family, creator, and professional workflows once the core trust metrics are proven.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3 lg:col-span-2">
                <div className="rounded-lg border border-white/10 bg-black/40 p-5">
                  <Users className="h-6 w-6 text-cyan-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Consumer pro</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Paid memory, import, recall, summaries, and advanced continuity features for individual users.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/40 p-5">
                  <Handshake className="h-6 w-6 text-emerald-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Professional use</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Therapists, coaches, writers, and founders need structured context that remains user-controlled.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/40 p-5">
                  <Target className="h-6 w-6 text-amber-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Memory API</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Long-term opportunity: trustworthy personal-memory infrastructure for other AI surfaces.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Readiness */}
        <section className="bg-black/25 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">What is ready now</h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                  LoreBook has enough product and infrastructure to run diligence around the core loop. The next phase is
                  not more surface area; it is measured retention, reliability, and cost.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/45 p-5">
                  <FileSearch className="h-6 w-6 text-cyan-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Memory graph</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Entities, claims, relationships, timelines, and provenance are represented as durable product concepts.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/45 p-5">
                  <BrainCircuit className="h-6 w-6 text-emerald-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Response compiler</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Assistant output is checked against evidence so LoreBook can separate known facts from inference.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/45 p-5">
                  <Server className="h-6 w-6 text-amber-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">MCP integration</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Production OAuth and read-only memory tools are prepared for ChatGPT app review.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/45 p-5">
                  <Gauge className="h-6 w-6 text-rose-300" />
                  <h3 className="mt-4 text-lg font-semibold text-white">Next metrics</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    The immediate diligence gap is quantified activation, recall accuracy, ingestion reliability, and unit cost.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Fundraising focus</h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                  The right capital helps convert a technically differentiated system into a narrow, measurable product wedge.
                  The next milestones are intentionally concrete.
                </p>
              </div>
              <div className="grid gap-3">
                {milestones.map((milestone, index) => (
                  <div key={milestone} className="flex gap-4 rounded-lg border border-white/10 bg-black/40 p-4">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-sm font-semibold text-cyan-200">
                      {index + 1}
                    </div>
                    <p className="pt-1 text-sm leading-relaxed text-white/75 sm:text-base">{milestone}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="bg-black/25 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-6 text-2xl font-bold text-white sm:mb-8 sm:text-3xl">Founder</h2>
            <div className="max-w-4xl rounded-lg border border-white/10 bg-black/45 p-5 sm:p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6">
                <img
                  src="/branding/mePro.JPG"
                  alt="Abel Mendoza, Founder"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 mx-auto sm:mx-0 border-2 border-white/10"
                />
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">Abel Mendoza</h3>
                  <p className="text-sm sm:text-base text-white/70 mb-3 sm:mb-4">
                    Founder and lead developer. Building LoreBook from the conviction that personal AI needs an explicit,
                    inspectable memory layer before it can become a durable companion or professional tool.
                  </p>
                  <p className="text-sm sm:text-base text-white/70">
                    <strong className="text-white">Current priority:</strong> narrow the product around reliable recall,
                    trusted provenance, and measurable user activation.
                  </p>
                  <FounderContact className="text-center sm:text-left" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Partner Fit */}
        <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <h2 className="text-2xl font-bold text-white sm:text-3xl">Best-fit investors</h2>
                <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
                  LoreBook is best matched with investors who are comfortable with early technical depth and can help turn
                  the memory wedge into a focused market entry.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3 lg:col-span-2">
                <div className="rounded-lg border border-cyan-400/20 bg-cyan-950/15 p-5">
                  <h3 className="text-lg font-semibold text-white">AI infrastructure</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Investors who understand memory, agents, retrieval, data rights, and model reliability.
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-950/15 p-5">
                  <h3 className="text-lg font-semibold text-white">Consumer SaaS</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Operators who can help with activation, retention, pricing, onboarding, and lifecycle loops.
                  </p>
                </div>
                <div className="rounded-lg border border-amber-400/20 bg-amber-950/15 p-5">
                  <h3 className="text-lg font-semibold text-white">Distribution</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Partners with access to creators, founders, coaches, therapists, or knowledge workers.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <CTASection
          title="Request the investor memo"
          description="Contact LoreBook for the current deck, product demo, technical diligence notes, and fundraising conversation."
          primaryAction={{
            label: 'Contact Founder',
            path: CONTACT_MAILTO,
          }}
          secondaryAction={{
            label: 'Explore Product',
            path: '/',
          }}
          variant="investor"
        />
      </main>

      <LandingFooter />
    </div>
  );
}
