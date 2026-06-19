// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, MessageSquare, CalendarDays, Users, MapPin,
  BookMarked, Sparkles, Heart, Shield, Lock, ChevronRight,
  Brain, Info, Zap, Compass, ScrollText, Edit3, Library,
  Target, ArrowRight, ChevronLeft,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { getRouteFromSurface } from '../../utils/routeMapping';
import { lorebookLibraryUrl } from '../../lib/lorebookLibrary';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';

// ─── Primitives ───────────────────────────────────────────────────────────────

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-w-0 items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 sm:px-4">
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
    <p className="min-w-0 break-words text-sm leading-relaxed text-white/75">{children}</p>
  </div>
);

const Example = ({ children }: { children: React.ReactNode }) => (
  <blockquote className="min-w-0 break-words rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm italic leading-relaxed text-white/65 sm:px-4">
    &ldquo;{children}&rdquo;
  </blockquote>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">
    {items.map((item) => (
      <li key={item} className="flex min-w-0 items-start gap-2 text-sm text-white/65">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
        <span className="min-w-0 break-words">{item}</span>
      </li>
    ))}
  </ul>
);

// ─── Guide sections ───────────────────────────────────────────────────────────

type GuideSection = {
  id: string;
  title: string;
  shortTitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  summary: string;
  content: React.ReactNode;
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Start here',
    icon: Compass,
    accent: 'from-violet-600/20 to-purple-600/5 border-violet-500/25',
    summary: 'Chat first. LoreBook listens, connects, and compiles when you are ready.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          LoreBook is built around one habit: talk to it like a journal that remembers everything.
          You do not need to organize, tag, or structure anything upfront. Mention people, places,
          feelings, and moments in plain language — the system extracts structure in the background.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:gap-3">
          {[
            { step: '1', label: 'Chat', detail: 'Share what happened' },
            { step: '2', label: 'Lore grows', detail: 'People, timeline, patterns' },
            { step: '3', label: 'Compile', detail: 'Generate a lorebook' },
            { step: '4', label: 'Read & edit', detail: 'Library + editor' },
          ].map((item) => (
            <div key={item.step} className="min-w-0 rounded-xl border border-white/8 bg-white/3 px-2 py-2.5 text-center sm:px-3 sm:py-3">
              <p className="text-base font-bold text-primary sm:text-lg">{item.step}</p>
              <p className="text-[11px] font-semibold text-white sm:text-xs">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-white/40 sm:mt-1 sm:text-[11px]">{item.detail}</p>
            </div>
          ))}
        </div>
        <Note>
          LoreBook may reply with a brief <strong className="text-white/90">&ldquo;Noted.&rdquo;</strong>{' '}
          when you drop a quick log — a signature acknowledgment that your entry was captured, not a
          conversation stopper.
        </Note>
      </div>
    ),
  },
  {
    id: 'chat',
    title: 'Chat',
    icon: MessageSquare,
    accent: 'from-sky-600/20 to-cyan-600/5 border-sky-500/25',
    summary: 'The primary interface. Everything else is populated from what you say here.',
    content: (
      <div className="space-y-4">
        <Example>
          I went on a date with Jordan last night. It went well — we laughed a lot and they stayed
          later than they planned. Still not sure what they want though.
        </Example>
        <p className="text-xs text-white/45">
          From a message like this, LoreBook can log the interaction, update relationship context,
          capture sentiment, and surface patterns over time.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-white/8 bg-black/30 p-3 sm:p-4">
            <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Personas</p>
            <BulletList
              items={[
                'Relationship advisor for love and dating',
                'Life historian when you reflect on the past',
                'Strategist for decisions and planning',
                'Processing partner when you need to think out loud',
              ]}
            />
          </div>
          <div className="min-w-0 rounded-xl border border-white/8 bg-black/30 p-3 sm:p-4">
            <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Slash commands</p>
            <ul className="space-y-2 font-mono text-xs text-white/60">
              <li className="break-words"><span className="text-primary">/recent</span> — latest entries</li>
              <li className="break-words"><span className="text-primary">/characters</span> — people in your life</li>
              <li className="break-words"><span className="text-primary">/search</span> — find anything</li>
              <li className="break-words"><span className="text-primary">/help</span> — full command list</li>
            </ul>
          </div>
        </div>
        <Note>Start a new thread when you shift topics. LoreBook keeps context within each conversation.</Note>
      </div>
    ),
  },
  {
    id: 'lorebooks',
    title: 'LoreBooks',
    icon: BookMarked,
    accent: 'from-purple-600/20 to-indigo-600/5 border-purple-500/25',
    summary: 'Compile chat knowledge into readable books — then refine them in the editor.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          A lorebook is a generated artifact — chapters woven from what LoreBook already knows.
          You compile when readiness is high enough, then the book lives in your library for
          reading and editing.
        </p>
        <BulletList
          items={[
            'Generate from LoreBook Library with a focus query or topic',
            'Watch the compile animation while chapters are assembled',
            'Compiled books appear in Your library — read like a book or open the editor',
            'Editing unlocks only after compilation; the editor works on saved books',
          ]}
        />
        <Example>
          my professional journey from 2020 to now — focus on the startup years
        </Example>
        <Note>
          Enter <strong className="text-white/90">LoreBook Library</strong> from the lorebook landing
          page to browse every compiled edition in one place.
        </Note>
      </div>
    ),
  },
  {
    id: 'timeline',
    title: 'Timeline & saga',
    shortTitle: 'Timeline',
    icon: CalendarDays,
    accent: 'from-amber-600/20 to-orange-600/5 border-amber-500/25',
    summary: 'Your history organizes itself into eras, arcs, and scenes.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          Timeline views build from entries automatically. Life arcs name periods the system
          infers from your patterns — not just calendar ranges. Gaps between entries are typed too:
          recovery, transition, or simply undocumented.
        </p>
        <BulletList
          items={[
            'Omni Timeline — calendar, swimlanes, and story views',
            'Life Saga — long-form narrative arcs across your history',
            'Events and scenes link back to people and places',
          ]}
        />
      </div>
    ),
  },
  {
    id: 'people',
    title: 'People & places',
    shortTitle: 'People',
    icon: Users,
    accent: 'from-emerald-600/20 to-teal-600/5 border-emerald-500/25',
    summary: 'Characters and locations populate as you mention them.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          Use real names consistently. Anyone you mention often gets a profile; places you return
          to get tracked with visit history and narrative context.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-white/8 bg-black/30 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-primary" /> Characters
            </div>
            <BulletList
              items={['Auto-detected from chat', 'Relationship history and knowledge base', 'Tap any name to open their book']}
            />
          </div>
          <div className="min-w-0 rounded-xl border border-white/8 bg-black/30 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <MapPin className="h-4 w-4 text-primary" /> Locations
            </div>
            <BulletList
              items={['Place detection from entries', 'Timeline and visit history', 'Geographic narrative context']}
            />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'love',
    title: 'Love & relationships',
    shortTitle: 'Love',
    icon: Heart,
    accent: 'from-pink-600/20 to-rose-600/5 border-pink-500/25',
    summary: 'Process dating, patterns, and relationship history with full context.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          Describe dates, conflicts, and confusing dynamics in chat. LoreBook tracks drift,
          milestones, and cross-relationship patterns — without forms or manual tagging.
        </p>
        <BulletList
          items={[
            'Dates, calls, fights, and support moments logged from conversation',
            'Drift direction and recurring cycles (push-pull, hot-cold)',
            'Pattern detection across relationships with evidence',
          ]}
        />
      </div>
    ),
  },
  {
    id: 'quests',
    title: 'Quest log',
    shortTitle: 'Quests',
    icon: Target,
    accent: 'from-orange-600/20 to-red-600/5 border-orange-500/25',
    summary: 'Story goals and open threads surfaced from your lore.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          Quests are narrative goals LoreBook detects or you define — unfinished arcs, people to
          revisit, themes worth exploring. Use the board to sort, filter, and track progress.
        </p>
        <BulletList
          items={[
            'Category tabs for relationship, career, creative, and more',
            'Suggested quests from detected story threads',
            'Detail panel for notes and next steps',
          ]}
        />
      </div>
    ),
  },
  {
    id: 'knowledge',
    title: 'What LoreBook believes',
    shortTitle: 'Knowledge',
    icon: Brain,
    accent: 'from-indigo-600/20 to-violet-600/5 border-indigo-500/25',
    summary: 'Knowledge claims with evidence — not black-box inference.',
    content: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/65">
          Over time LoreBook forms claims from behavioral evidence: patterns you repeat, values you
          consistently act on, lessons from specific experiences. Every claim can be traced back
          to receipts.
        </p>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="text-xs font-mono uppercase tracking-widest text-white/35">Example claim</p>
          <p className="mt-2 text-white/80">&ldquo;You commit to long technical projects under pressure.&rdquo;</p>
          <p className="mt-1 text-xs text-white/45">84% confidence · 8 scenes across 26 months</p>
        </div>
        <Note>Ask &ldquo;why do you believe that?&rdquo; in chat anytime — LoreBook should show its evidence.</Note>
      </div>
    ),
  },
  {
    id: 'privacy',
    title: 'Privacy',
    icon: Shield,
    accent: 'from-green-600/20 to-emerald-600/5 border-green-500/25',
    summary: 'Your story stays yours until you choose otherwise.',
    content: (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-green-500/20 bg-green-950/10 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Lock className="h-4 w-4 text-green-400" /> Protected
            </div>
            <BulletList
              items={['Entries encrypted in transit and at rest', 'No human reads your journal', 'No ads, no data selling']}
            />
          </div>
          <div className="min-w-0 rounded-xl border border-green-500/20 bg-green-950/10 p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-green-400" /> Your control
            </div>
            <BulletList
              items={['Export everything anytime', 'Delete account and all data permanently', 'Publishing is opt-in only']}
            />
          </div>
        </div>
        <p className="text-xs text-white/40">Settings → Privacy & Security for full controls.</p>
      </div>
    ),
  },
  {
    id: 'tips',
    title: 'Tips',
    icon: Zap,
    accent: 'from-yellow-600/20 to-amber-600/5 border-yellow-500/25',
    summary: 'Small habits that compound over months.',
    content: (
      <div className="space-y-4">
        <BulletList
          items={[
            'Write naturally — structure emerges later',
            'Include who, where, and what happened',
            'Use consistent names for people and places',
            'Revisit old events; reflection generates the richest insights',
            'Compile lorebooks when readiness says you are ready, not before',
          ]}
        />
        <div className="min-w-0 rounded-xl border border-white/8 bg-black/30 p-3 sm:p-4">
          <p className="mb-2 text-xs font-mono uppercase tracking-widest text-white/35">Keyboard</p>
          <ul className="space-y-2 font-mono text-xs text-white/60">
            <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <kbd className="rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-primary">Enter</kbd>
              <span>send</span>
              <span className="text-white/25">·</span>
              <kbd className="rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-primary">Shift+Enter</kbd>
              <span>new line</span>
            </li>
            <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <kbd className="rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-primary">Esc</kbd>
              <span>close modals</span>
            </li>
          </ul>
        </div>
      </div>
    ),
  },
];

const QUICK_LINKS = [
  { label: 'Chat', route: getRouteFromSurface('chat'), icon: MessageSquare },
  { label: 'LoreBooks', route: getRouteFromSurface('lorebook'), icon: BookOpen },
  { label: 'Library', route: lorebookLibraryUrl(), icon: Library },
  { label: 'Editor', route: getRouteFromSurface('memoir'), icon: Edit3 },
  { label: 'Timeline', route: getRouteFromSurface('timeline'), icon: CalendarDays },
  { label: 'Quests', route: getRouteFromSurface('quests'), icon: Target },
  { label: 'Discovery', route: getRouteFromSurface('discovery'), icon: Sparkles },
] as const;

const MOBILE_LAYOUT_BP = 1024;

function GuideArticleHeader({ section, compact }: { section: GuideSection; compact?: boolean }) {
  const Icon = section.icon;
  return (
    <div className={cn('flex flex-col gap-3', compact ? 'mb-4' : 'mb-5 sm:mb-6 sm:flex-row sm:items-start sm:gap-4')}>
      {!compact && (
        <div className="hidden w-fit rounded-xl border border-white/10 bg-black/30 p-2.5 sm:block sm:p-3">
          <Icon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
        </div>
      )}
      <div className="min-w-0">
        {!compact && (
          <h2 className="text-lg font-bold leading-snug text-white sm:text-2xl">{section.title}</h2>
        )}
        <p className={cn('text-sm leading-relaxed text-white/50', !compact && 'mt-1')}>{section.summary}</p>
      </div>
    </div>
  );
}

function GuideTopicCard({
  section,
  onSelect,
  featured,
}: {
  section: GuideSection;
  onSelect: (id: string) => void;
  featured?: boolean;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      className={cn(
        'flex min-h-[44px] flex-col items-start gap-2.5 rounded-2xl border border-white/10 bg-black/35 p-3.5 text-left touch-manipulation active:bg-white/5',
        featured && 'col-span-2 border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/15',
          featured && 'h-10 w-10',
        )}
      >
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-white">{section.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-white/45 line-clamp-2">{section.summary}</span>
      </span>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const UserGuide: React.FC = () => {
  const navigate = useNavigate();
  const isMobileLayout = useIsMobile(MOBILE_LAYOUT_BP);
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0].id);
  const [mobileScreen, setMobileScreen] = useState<'topics' | 'article'>('topics');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const skipInitialPanelScroll = useRef(true);

  const activeSection = useMemo(
    () => GUIDE_SECTIONS.find((s) => s.id === activeId) ?? GUIDE_SECTIONS[0],
    [activeId],
  );

  const activeIndex = useMemo(
    () => GUIDE_SECTIONS.findIndex((s) => s.id === activeId),
    [activeId],
  );

  const openTopic = useCallback((id: string) => {
    setActiveId(id);
    if (isMobileLayout) {
      setMobileScreen('article');
    }
  }, [isMobileLayout]);

  const backToTopics = useCallback(() => {
    setMobileScreen('topics');
  }, []);

  useEffect(() => {
    if (skipInitialPanelScroll.current) {
      skipInitialPanelScroll.current = false;
      return;
    }
    if (isMobileLayout) {
      if (mobileScreen === 'article') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeId, isMobileLayout, mobileScreen]);

  const prevSection = activeIndex > 0 ? GUIDE_SECTIONS[activeIndex - 1] : null;
  const nextSection = activeIndex < GUIDE_SECTIONS.length - 1 ? GUIDE_SECTIONS[activeIndex + 1] : null;

  const articlePanel = (compactHeader: boolean) => (
    <article
      ref={compactHeader ? undefined : panelRef}
      className={cn(
        'min-w-0 rounded-2xl border bg-gradient-to-br p-4 sm:p-6 lg:p-8',
        activeSection.accent,
      )}
    >
      <GuideArticleHeader section={activeSection} compact={compactHeader} />
      <div className="min-w-0">{activeSection.content}</div>
    </article>
  );

  /* ── Mobile: topic index ─────────────────────────────────────────────── */
  if (isMobileLayout && mobileScreen === 'topics') {
    return (
      <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-gradient-to-br from-black via-[#0a0610] to-black">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(139,92,246,0.1),transparent_55%)]" />
        </div>

        <div
          className="relative z-10 mx-auto w-full min-w-0 max-w-lg px-4 pt-2"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <header className="pb-5">
            <p className="text-sm leading-relaxed text-white/50">
              Chat first — everything else grows from what you share. Pick a topic to learn how it works.
            </p>
            <button
              type="button"
              onClick={() => navigate(getRouteFromSurface('chat'))}
              className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white touch-manipulation active:bg-primary/90"
            >
              <MessageSquare className="h-4 w-4" />
              Open Chat
            </button>
          </header>

          <section aria-label="Guide topics">
            <h2 className="mb-3 text-[10px] font-mono uppercase tracking-widest text-white/30">
              Topics
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {GUIDE_SECTIONS.map((section, index) => (
                <GuideTopicCard
                  key={section.id}
                  section={section}
                  onSelect={openTopic}
                  featured={index === 0}
                />
              ))}
            </div>
          </section>

          <section className="mt-6" aria-label="App shortcuts">
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex min-h-[48px] w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3 touch-manipulation active:bg-white/5"
            >
              <span className="text-sm font-medium text-white/80">Jump to an app area</span>
              <ChevronRight className="h-4 w-4 text-white/35" />
            </button>
          </section>

          <MobileBottomSheet
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
            title="Jump to"
          >
            <ul className="space-y-1.5 pb-4">
              {QUICK_LINKS.map(({ label, route, icon: Icon }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => {
                      setShortcutsOpen(false);
                      navigate(route);
                    }}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-3 text-left touch-manipulation active:bg-white/5"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/40">
                      <Icon className="h-4 w-4 text-primary/80" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-white/85">{label}</span>
                    <ArrowRight className="h-4 w-4 text-white/30" />
                  </button>
                </li>
              ))}
            </ul>
          </MobileBottomSheet>

          <footer className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">It compounds</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-white/55">
                  At six months, patterns emerge. At a year, LoreBook holds a grounded model of who you are.
                </p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  /* ── Mobile: article reader ──────────────────────────────────────────── */
  if (isMobileLayout && mobileScreen === 'article') {
    return (
      <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-gradient-to-br from-black via-[#0a0610] to-black">
        <div
          className="relative z-10 mx-auto w-full min-w-0 max-w-lg"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0610]/95 px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={backToTopics}
                className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary touch-manipulation active:bg-primary/10"
              >
                <ChevronLeft className="h-4 w-4" />
                Topics
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="truncate text-sm font-semibold text-white">{activeSection.title}</p>
                <p className="text-[10px] text-white/40">
                  {activeIndex + 1} of {GUIDE_SECTIONS.length}
                </p>
              </div>
              <div className="w-[72px]" aria-hidden />
            </div>
          </header>

          <div className="px-4 py-4">
            {articlePanel(true)}
          </div>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 backdrop-blur-md"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            aria-label="Topic navigation"
          >
            <div className="flex items-stretch gap-2 px-4 py-2.5">
              {prevSection ? (
                <button
                  type="button"
                  onClick={() => openTopic(prevSection.id)}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-medium text-white/75 touch-manipulation active:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span className="truncate">{prevSection.shortTitle ?? prevSection.title}</span>
                </button>
              ) : (
                <div className="flex-1" />
              )}
              {nextSection ? (
                <button
                  type="button"
                  onClick={() => openTopic(nextSection.id)}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/15 px-2 text-xs font-medium text-white touch-manipulation active:bg-primary/25"
                >
                  <span className="truncate">{nextSection.shortTitle ?? nextSection.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={backToTopics}
                  className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-medium text-white/75 touch-manipulation"
                >
                  All topics
                </button>
              )}
            </div>
          </nav>
        </div>
      </div>
    );
  }

  /* ── Desktop ─────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-full w-full min-w-0 overflow-x-hidden bg-gradient-to-br from-black via-[#0a0610] to-black">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(139,92,246,0.1),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_100%,rgba(236,72,153,0.06),transparent_55%)]" />
      </div>

      <div
        className="relative z-10 mx-auto w-full min-w-0 max-w-5xl px-4 sm:px-6 lg:px-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Hero — compact on mobile (app header already shows "User Guide") */}
        <header className="pb-4 pt-3 sm:pb-6 sm:pt-6 lg:pb-8 lg:pt-8">
          <div className="mb-3 hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 sm:mb-4 sm:inline-flex">
            <ScrollText className="h-3.5 w-3.5 text-primary/70" />
            <span className="font-mono text-xs uppercase tracking-wider text-primary/70">User Guide</span>
          </div>
          <h1 className="text-xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl" style={{ fontFamily: 'Georgia, serif' }}>
            How LoreBook works
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50 sm:mt-3 sm:text-base">
            Chat is the front door. LoreBooks, timeline, characters, and quests are views into the
            same living story — updated as you talk.
          </p>
        </header>

        {/* Quick links */}
        <div className="mb-8">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-white/30">
            Jump to
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(({ label, route, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => navigate(route)}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                {label}
                <ArrowRight className="h-3 w-3 shrink-0 opacity-40" />
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[240px_minmax(0,1fr)] gap-6">
          <nav className="sticky top-6 self-start" aria-label="Guide topics">
            <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-white/30">
              Topics
            </p>
            <div className="flex flex-col gap-2">
              {GUIDE_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => openTopic(section.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
                      isActive
                        ? 'border-primary/40 bg-primary/10 text-white'
                        : 'border-white/8 bg-black/20 text-white/55 hover:border-white/15 hover:bg-white/5 hover:text-white/80',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-white/40')} />
                    <span className="text-sm font-medium">{section.title}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {articlePanel(false)}
        </div>

        {/* Compound effect footer */}
        <footer className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:mt-10 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <Sparkles className="h-5 w-5 shrink-0 text-primary sm:mt-0.5" />
            <div className="min-w-0">
              <h3 className="font-semibold text-white">It compounds</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                At one month, LoreBook knows your main characters and recent history. At six months,
                patterns emerge. At a year, it holds a model of who you are that is grounded in
                hundreds of conversations — not just how you describe yourself.
              </p>
              <button
                type="button"
                onClick={() => navigate(getRouteFromSurface('chat'))}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary touch-manipulation active:text-primary/70 sm:min-h-0 hover:text-primary/80"
              >
                Open Chat
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default UserGuide;
