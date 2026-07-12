import { useLocation } from 'react-router-dom';
import {
  Bot,
  Heart,
  Paperclip,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  Lock,
  Sparkles,
  Link2,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  Calendar,
  Shield,
} from 'lucide-react';
import { LoreReadinessQuestChips } from './LoreReadinessQuestChips';

const LOVE_STARTERS = [
  'I went on a date last night…',
  'I need to decode a text they sent me.',
  "There's someone I've been thinking about.",
  'Something happened with [Name] and I need to process it.',
  'I want to talk through a pattern I keep seeing in my relationships.',
  'I just got out of something and I need to think.',
];

function fillComposer(text: string, placeholderHint?: string) {
  const selector = placeholderHint
    ? `textarea[placeholder*="${placeholderHint}"]`
    : 'textarea[placeholder]';
  const input = document.querySelector<HTMLTextAreaElement>(selector);
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  nativeInputValueSetter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

const LoveEmptyState = () => (
  <div className="chat-empty-root chat-message-enter-system relative mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-18">
    <div className="chat-empty-glow" aria-hidden />
    <div className="relative text-center">
      <div className="chat-empty-hero-orb mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl">
        <Heart className="h-8 w-8 text-pink-300" />
      </div>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        Your Relationship Advisor
      </h2>
      <p className="mx-auto mb-2 max-w-md text-sm text-pink-300/85 sm:text-base">
        I know your full love life — who you&apos;ve been with, what happened, the patterns, the drift.
      </p>
      <p className="mb-10 text-base leading-relaxed text-white/65 sm:text-lg">
        Tell me about a date. Decode a situation. Talk through what keeps happening.
        <br />
        Everything you share is tracked quietly in the background.
      </p>

      <div className="mb-10 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
        {LOVE_STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => fillComposer(starter)}
            className="rounded-xl border border-pink-500/20 bg-black/40 px-4 py-3 text-left text-sm text-white/60 transition-all hover:border-pink-500/40 hover:bg-pink-950/25 hover:text-white/85"
          >
            &quot;{starter}&quot;
          </button>
        ))}
      </div>

      <div className="mb-8 flex items-center justify-center">
        <div className="chat-empty-privacy inline-flex items-center gap-2.5 rounded-full px-4 py-2.5">
          <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-xs text-emerald-300/90">
            <strong className="font-semibold text-emerald-200">Private:</strong> Your conversations
            are encrypted and never shared.
          </p>
        </div>
      </div>

      <p className="text-xs text-white/35">
        What you tell me automatically updates your relationship timeline, patterns, and history.
      </p>
    </div>
  </div>
);

const CAPABILITIES = [
  {
    icon: Calendar,
    text: "I'll track dates, times, and occurrences",
    accent: 'text-violet-300',
  },
  {
    icon: Link2,
    text: "I'll make connections to your past entries",
    accent: 'text-fuchsia-300',
  },
  {
    icon: BookOpen,
    text: "I'll update your timeline, memoir, and chapters",
    accent: 'text-purple-300',
  },
  {
    icon: AlertTriangle,
    text: "I'll check for continuity and conflicts",
    accent: 'text-amber-300',
  },
  {
    icon: Lightbulb,
    text: "I'll provide strategic guidance based on your patterns",
    accent: 'text-cyan-300',
  },
] as const;

const DOC_TYPES = ['Biographies', 'Autobiographies', 'Diaries', 'Journals'] as const;

export const ChatEmptyState = () => {
  const location = useLocation();
  const isLoveSurface = location.pathname === '/love';

  if (isLoveSurface) return <LoveEmptyState />;

  return (
    <div className="chat-empty-root chat-message-enter-system relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <div className="chat-empty-glow" aria-hidden />

      {/* ── Hero ── */}
      <header className="relative mb-8 text-center sm:mb-10">
        <div className="chat-empty-hero-orb-wrap mx-auto mb-5 sm:mb-6">
          {/* Purple soulflame — rising wisps, no spinning rim */}
          <div className="chat-empty-soulflame" aria-hidden="true">
            <svg className="chat-empty-soulflame__svg" width="0" height="0" aria-hidden="true">
              <defs>
                <filter id="soulflame-wisp" x="-40%" y="-40%" width="180%" height="180%">
                  <feTurbulence
                    type="fractalNoise"
                    baseFrequency="0.04 0.09"
                    numOctaves="3"
                    seed="7"
                    result="noise"
                  >
                    <animate
                      attributeName="baseFrequency"
                      values="0.04 0.09;0.055 0.12;0.035 0.07;0.04 0.09"
                      dur="5s"
                      repeatCount="indefinite"
                    />
                  </feTurbulence>
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="soulflame-soft" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feColorMatrix
                    in="blur"
                    type="matrix"
                    values="
                      1.1 0 0 0 0.05
                      0 0.4 0.6 0 0.02
                      1.2 0 1.4 0 0.12
                      0 0 0 1.1 0"
                  />
                </filter>
              </defs>
            </svg>

            <span className="chat-empty-soulflame__glow" />
            <span className="chat-empty-soulflame__envelope chat-empty-soulflame__envelope--back" />
            <span className="chat-empty-soulflame__envelope chat-empty-soulflame__envelope--front" />

            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--1" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--2" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--3" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--4" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--5" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--6" />
            <span className="chat-empty-soulflame__wisp chat-empty-soulflame__wisp--7" />

            <span className="chat-empty-soulflame__spark chat-empty-soulflame__spark--1" />
            <span className="chat-empty-soulflame__spark chat-empty-soulflame__spark--2" />
            <span className="chat-empty-soulflame__spark chat-empty-soulflame__spark--3" />
            <span className="chat-empty-soulflame__spark chat-empty-soulflame__spark--4" />

            <span className="chat-empty-soulflame__core" />
            <span className="chat-empty-soulflame__willo chat-empty-soulflame__willo--left" />
            <span className="chat-empty-soulflame__willo chat-empty-soulflame__willo--right" />
          </div>

          <div className="chat-empty-hero-orb chat-empty-hero-orb--aflame relative z-[2] flex h-16 w-16 items-center justify-center rounded-2xl sm:h-20 sm:w-20 sm:rounded-3xl">
            <Bot className="relative z-[1] h-8 w-8 text-primary sm:h-10 sm:w-10" />
          </div>
        </div>

        <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-primary/70 sm:text-[11px]">
          Lore Book · Chat
        </p>
        <h2 className="mb-3 bg-gradient-to-b from-white via-white to-white/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:mb-4 sm:text-3xl lg:text-4xl">
          AI Life Guidance Chat
        </h2>
        <p className="mx-auto mb-4 max-w-xl text-sm leading-relaxed text-primary/85 sm:mb-5 sm:text-base">
          This is where your story is built. Timelines, characters, and quests fill in as you talk.
        </p>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg sm:leading-relaxed">
          Dump everything freely here. I&apos;ll reflect back, make connections,
          and help you understand your story while automatically updating your timeline.
        </p>
      </header>

      {/* ── Lore readiness ── */}
      <div className="relative mb-8 max-w-2xl mx-auto sm:mb-10">
        <LoreReadinessQuestChips
          compact
          className="chat-empty-panel overflow-hidden rounded-2xl border border-violet-500/25"
          onSelectPrompt={(prompt) => fillComposer(prompt, 'Message Lore Book')}
        />
      </div>

      {/* ── Privacy ── */}
      <div className="relative mb-8 flex justify-center sm:mb-10">
        <div className="chat-empty-privacy flex max-w-2xl items-start gap-3 rounded-2xl px-4 py-3.5 sm:items-center sm:px-5 sm:py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30 sm:mt-0">
            <Shield className="h-4 w-4 text-emerald-400" />
          </span>
          <p className="text-left text-sm leading-relaxed text-emerald-100/90 sm:text-base">
            <strong className="font-semibold text-emerald-200">Private &amp; Secure:</strong>{' '}
            Your conversations are encrypted and never shared. Only you can access your data.
          </p>
        </div>
      </div>

      {/* ── Import / upload cards ── */}
      <section className="relative mb-10 grid grid-cols-1 gap-3 sm:mb-12 sm:grid-cols-2 sm:gap-4 lg:gap-5">
        {/* Documents — spans full width as primary */}
        <article className="chat-empty-card chat-empty-card--primary sm:col-span-2">
          <div className="mb-3 flex items-center gap-3">
            <span className="chat-empty-card-icon bg-primary/15 text-primary ring-1 ring-primary/30">
              <Paperclip className="h-5 w-5" />
            </span>
            <h3 className="text-base font-semibold text-white sm:text-lg">Upload Other Documents</h3>
          </div>
          <p className="mb-4 text-sm text-white/65 sm:text-base">You can also upload:</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {DOC_TYPES.map((label) => (
              <span key={label} className="chat-empty-chip">
                <FileText className="h-3 w-3 text-primary/80" />
                {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-white/45 sm:text-sm">
            Supported formats: .txt, .md, .pdf, .doc, .docx, images
          </p>
        </article>

        <article className="chat-empty-card">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="chat-empty-card-icon bg-amber-500/12 text-amber-300 ring-1 ring-amber-400/25">
              <MessageSquare className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-white sm:text-base">
              Import ChatGPT Conversations
            </h3>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-white/60 sm:text-sm">
            Click the <MessageSquare className="inline h-3 w-3 text-amber-300" /> message button
            below to paste ChatGPT conversations.
          </p>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-100/75 sm:text-[13px]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/90" />
            <span>
              All information will be automatically fact-checked and verified against your existing
              memories. Contradictions will be flagged for review.
            </span>
          </p>
        </article>

        <article className="chat-empty-card">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="chat-empty-card-icon bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25">
              <FileText className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-white sm:text-base">Upload Your Resume</h3>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-white/60 sm:text-sm">
            Click the <Paperclip className="inline h-3 w-3 text-primary" /> paperclip button below to
            upload your resume (PDF, DOC, DOCX, or TXT).
          </p>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-violet-100/75 sm:text-[13px]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300/90" />
            <span>
              Automatically extracts skills, experience, and achievements to track your career
              growth.
            </span>
          </p>
        </article>

        <article className="chat-empty-card sm:col-span-2 lg:col-span-2">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="chat-empty-card-icon bg-sky-500/12 text-sky-300 ring-1 ring-sky-400/25">
              <ImageIcon className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-white sm:text-base">Upload Photos</h3>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-white/60 sm:text-sm">
            Upload photos and the AI will analyze them to suggest where they belong in your lore
            book.
          </p>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-sky-100/75 sm:text-[13px]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300/90" />
            <span>
              Photos of documents will extract text. Memory photos can be added to your lore book.
              Junk photos are automatically filtered.
            </span>
          </p>
        </article>
      </section>

      {/* ── What I'll do ── */}
      <section className="relative mb-8 sm:mb-10">
        <h3 className="mb-3 text-center text-[10px] font-mono uppercase tracking-[0.2em] text-white/35 sm:mb-4 sm:text-[11px]">
          What happens as you talk
        </h3>
        <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
          {CAPABILITIES.map(({ icon: Icon, text, accent }) => (
            <li key={text} className="chat-empty-capability">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10 ${accent}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm text-white/60 sm:text-[15px]">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Commands ── */}
      <footer className="relative text-center">
        <div className="chat-empty-commands inline-flex flex-wrap items-center justify-center gap-2 rounded-full px-4 py-2.5 sm:gap-3 sm:px-5">
          <span className="text-xs text-white/40 sm:text-sm">Try commands:</span>
          {['/recent', '/search', '/characters'].map((cmd) => (
            <code key={cmd} className="chat-empty-cmd">
              {cmd}
            </code>
          ))}
        </div>
      </footer>
    </div>
  );
};
