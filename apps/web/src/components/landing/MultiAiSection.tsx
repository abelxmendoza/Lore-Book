// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';
import { Plug, Sparkles } from 'lucide-react';

interface AiPartner {
  name: string;
  maker: string;
  domain: string;
  description: string;
}

const AI_PARTNERS: AiPartner[] = [
  {
    name: 'Muse',
    maker: 'Meta',
    domain: 'muse.ai',
    description:
      'Your personal AI agent. Career moves, project milestones, and life updates from your Muse chats land in your lore.',
  },
  {
    name: 'ChatGPT',
    maker: 'OpenAI',
    domain: 'chatgpt.com',
    description:
      'Plan, write, and think it through with ChatGPT — what matters joins the same record, not a separate silo.',
  },
  {
    name: 'Claude',
    maker: 'Anthropic',
    domain: 'claude.ai',
    description:
      'Add LoreBook as a custom connector. Claude reads your lore before it writes, so you stop re-explaining your own life.',
  },
  {
    name: 'Codex',
    maker: 'OpenAI',
    domain: 'openai.com',
    description:
      'For builders. Codex sessions can record decisions, milestones, and what shipped — as lore, not just commits.',
  },
  {
    name: 'Grok',
    maker: 'xAI',
    domain: 'grok.com',
    description:
      'Point Grok at LoreBook and its side of your story syncs into the same lore as every other AI.',
  },
  {
    name: 'Gemini',
    maker: 'Google',
    domain: 'gemini.google.com',
    description:
      'Connect Gemini the same way — one lore, no matter which AI you happened to talk to that day.',
  },
];

const AiLogo = ({ name, domain }: { name: string; domain: string }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
        <span className="text-lg font-bold text-white">{name.charAt(0)}</span>
      </div>
    );
  }

  return (
    <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt={`${name} logo`}
        width={32}
        height={32}
        loading="lazy"
        className="w-8 h-8 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export const MultiAiSection = () => {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-medium text-primary mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            COMING SOON · FUTURE FEATURE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4 px-2 sm:px-0">
            Connect your AI. <span className="text-primary">Keep one story.</span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-3xl mx-auto px-4 sm:px-0">
            Your life doesn&apos;t happen in one app. Connect the LLM chatbot of your choice to
            LoreBook — it can read your lore before it answers, and write new lore back when
            something important comes up.
          </p>
          <p className="text-sm sm:text-base text-white/50 max-w-2xl mx-auto mt-3 px-4 sm:px-0">
            People, projects, decisions, chapters — extracted, connected, and stamped with which
            AI recorded it. One lore. Every AI. Yours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {AI_PARTNERS.map((ai) => (
            <div
              key={ai.name}
              className="rounded-2xl border border-white/10 bg-black/40 p-6 hover:border-primary/50 transition-all duration-300"
            >
              <div className="flex items-center gap-4 mb-3">
                <AiLogo name={ai.name} domain={ai.domain} />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-white leading-tight">{ai.name}</h3>
                  <p className="text-xs text-white/50">{ai.maker}</p>
                </div>
                <div className="ml-auto flex gap-1.5 shrink-0">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                    Read
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                    Write
                  </span>
                </div>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{ai.description}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-dashed border-white/20 bg-black/30 p-6">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                <Plug className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white leading-tight">Any MCP AI</h3>
                <p className="text-xs text-white/50">Model Context Protocol</p>
              </div>
              <div className="ml-auto flex gap-1.5 shrink-0">
                <span className="text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                  Read
                </span>
                <span className="text-[10px] uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Write
                </span>
              </div>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              LoreBook speaks MCP. Any chatbot or agent that connects over MCP can read and write
              your lore — with your permission, and only yours.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mt-10 sm:mt-14 max-w-5xl mx-auto">
          <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
            <div className="text-3xl font-bold text-primary mb-3">01</div>
            <h3 className="text-white font-semibold text-lg mb-2">Connect each AI once</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              OAuth sign-in per AI, each with its own permission. No shared keys, no passwords
              handed over.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
            <div className="text-3xl font-bold text-primary mb-3">02</div>
            <h3 className="text-white font-semibold text-lg mb-2">Talk to any of them</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              When relevant lore comes up, that AI records it. The others can read it right away.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-black/40 p-6 text-left">
            <div className="text-3xl font-bold text-primary mb-3">03</div>
            <h3 className="text-white font-semibold text-lg mb-2">You stay the author</h3>
            <p className="text-white/70 text-sm leading-relaxed">
              Every entry shows which AI wrote it. Corrections are yours alone, and you can
              disconnect any AI anytime.
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/40 max-w-3xl mx-auto mt-8 px-4">
          Multi-AI connections are a future feature, rolling out one AI at a time — each AI
          connects separately, with your permission. Logos are trademarks of their respective
          owners and are shown only to identify the AIs you can connect. LoreBook is not
          affiliated with or endorsed by them.
        </p>
      </div>
    </section>
  );
};
