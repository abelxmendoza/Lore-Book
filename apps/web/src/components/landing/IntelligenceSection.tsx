// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import {
  ScanText,
  Network,
  Layers,
  GitBranch,
  ShieldCheck,
  GitCompareArrows,
  Workflow,
  ArrowRight,
} from 'lucide-react';

/**
 * "How LoreBook Thinks" — a credibility section for technical readers
 * (engineers, researchers, recruiters, investors) without hurting conversion
 * for everyone else. Every claim maps to a real, live subsystem in the codebase;
 * anything still maturing is labelled "Early" rather than overstated.
 */

type Stage = { icon: typeof ScanText; label: string; detail: string };

const PIPELINE: Stage[] = [
  { icon: ScanText, label: 'Read', detail: 'Deterministic lexical pass' },
  { icon: Layers, label: 'Classify', detail: 'Typed ontology' },
  { icon: Network, label: 'Connect', detail: 'Entity graph' },
  { icon: GitCompareArrows, label: 'Reconcile', detail: 'Contradictions resolved' },
  { icon: GitBranch, label: 'Record', detail: 'Provenance kept' },
];

type System = {
  icon: typeof ScanText;
  color: string;
  title: string;
  body: string;
  status: 'Live' | 'Early';
};

const SYSTEMS: System[] = [
  {
    icon: ScanText,
    color: 'purple',
    title: 'Lexical analysis layer',
    body: 'A deterministic pass reads kinship, places, and relationships from plain language before any model runs — cheap, predictable, and auditable.',
    status: 'Live',
  },
  {
    icon: Layers,
    color: 'cyan',
    title: 'Typed ontology',
    body: 'Every person, place, organization, and event resolves to a stable type in a shared ontology — not freeform tags that drift over time.',
    status: 'Live',
  },
  {
    icon: Network,
    color: 'pink',
    title: 'Knowledge graph',
    body: 'People, places, and groups become a connected graph with relationships, not isolated notes — so context relates across years of conversation.',
    status: 'Live',
  },
  {
    icon: Workflow,
    color: 'green',
    title: 'Working-memory assembly',
    body: 'Each message assembles only the relevant slice of your record on the fly, instead of stuffing everything into the model and hoping.',
    status: 'Live',
  },
  {
    icon: ShieldCheck,
    color: 'amber',
    title: 'Identity integrity',
    body: 'Merge, alias, and parent/child decisions keep one person from splintering into many — and keep you distinct from someone who shares your name.',
    status: 'Live',
  },
  {
    icon: GitBranch,
    color: 'indigo',
    title: 'Provenance tracking',
    body: 'Derived facts record where they came from and which run produced them, so the record can be inspected and corrected — not taken on faith.',
    status: 'Live',
  },
];

// Static Tailwind class maps (no dynamic class strings, so JIT keeps them).
const ICON_WRAP: Record<string, string> = {
  purple: 'bg-purple-500/20 text-purple-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  pink: 'bg-pink-500/20 text-pink-400',
  green: 'bg-green-500/20 text-green-400',
  amber: 'bg-amber-500/20 text-amber-300',
  indigo: 'bg-indigo-500/20 text-indigo-300',
};

export function IntelligenceSection() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-xs font-mono text-primary/70 uppercase tracking-widest mb-3">
            Under the hood
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
            How LoreBook <span className="text-primary">thinks</span>
          </h2>
          <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto">
            The continuity you feel isn&apos;t a long prompt. It&apos;s the output of a real
            pipeline — lexical analysis, a typed ontology, a knowledge graph, and provenance
            on every derived fact.
          </p>
        </div>

        {/* Pipeline strip */}
        <div className="rounded-xl border border-border/60 bg-black/40 p-5 sm:p-7 mb-10 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-stretch sm:justify-between gap-3 sm:gap-2">
            {PIPELINE.map((stage, i) => (
              <div key={stage.label} className="flex sm:flex-1 sm:flex-col items-center sm:text-center gap-3 sm:gap-2">
                <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5">
                    <stage.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="sm:mt-1">
                    <div className="text-white font-semibold text-sm leading-tight">{stage.label}</div>
                    <div className="text-white/50 text-xs leading-tight">{stage.detail}</div>
                  </div>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="hidden sm:block h-4 w-4 text-white/25 self-center shrink-0 rotate-90 sm:rotate-0" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Subsystem grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SYSTEMS.map((s) => (
            <div
              key={s.title}
              className="rounded-lg border border-border/60 bg-black/40 p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`rounded-lg p-2.5 ${ICON_WRAP[s.color]}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <span
                  className={
                    s.status === 'Live'
                      ? 'text-[10px] font-mono uppercase tracking-widest text-green-400/80 border border-green-500/30 rounded-full px-2 py-0.5'
                      : 'text-[10px] font-mono uppercase tracking-widest text-amber-300/80 border border-amber-500/30 rounded-full px-2 py-0.5'
                  }
                >
                  {s.status}
                </span>
              </div>
              <h3 className="text-white font-semibold text-base mb-2">{s.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Honest footnote — matches the page's existing tone */}
        <p className="text-center text-white/35 text-xs mt-8 max-w-2xl mx-auto">
          Marked <span className="text-green-400/70">Live</span> is running today.
          Narrative-arc reconstruction and long-range pattern mapping are{' '}
          <span className="text-amber-300/70">Early</span> — built, not yet load-bearing.
          We&apos;d rather show you the seams than oversell the machine.
        </p>
      </div>
    </section>
  );
}
