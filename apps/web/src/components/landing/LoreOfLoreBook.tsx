// © 2026 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';
import { BookOpen, Clock, Layers, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FounderContact } from './FounderContact';
import {
  LOREBOOK_CHAPTERS,
  LOREBOOK_TIMELINE,
  LOREBOOK_VISIONS,
  significanceStars,
} from '../../data/lorebookPublicChronicle';
import './LoreOfLoreBook.css';

type LoreTab = 'timeline' | 'chapters' | 'vision';

const TABS: { id: LoreTab; label: string; icon: typeof Clock }[] = [
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'chapters', label: 'Chapters', icon: Layers },
  { id: 'vision', label: 'Vision', icon: Sparkles },
];

const CHAPTER_ACCENTS = [
  'from-violet-500/80 to-purple-600/80',
  'from-blue-500/70 to-cyan-600/70',
  'from-amber-500/70 to-orange-600/70',
  'from-pink-500/70 to-rose-600/70',
  'from-emerald-500/70 to-teal-600/70',
];

export function LoreOfLoreBookContent() {
  const [tab, setTab] = useState<LoreTab>('vision');

  return (
    <div className="lore-of-lorebook">
      {/* Hero */}
      <section className="lore-page-hero-glow pt-6 sm:pt-8 pb-8 sm:pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] sm:text-xs font-mono text-primary/80 uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-3 sm:mb-4">
            Living project history
          </p>
          <h1 className="text-[1.85rem] leading-tight sm:text-5xl md:text-6xl font-bold text-white mb-3 sm:mb-4 tracking-tight px-1">
            Lore of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-violet-300 to-pink-400">
              LoreBook
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-white/55 max-w-2xl mx-auto leading-relaxed px-1">
            Most products ship changelogs. LoreBook remembers its own story — milestones, eras, and how the vision evolved.
          </p>
        </div>
      </section>

      {/* Tab bar — equal-width on mobile */}
      <div className="lore-sticky-tabs sticky z-40 border-y border-white/8 bg-black/80 backdrop-blur-xl supports-[backdrop-filter]:bg-black/70">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5">
          <div className="lore-tab-strip" role="tablist" aria-label="Lore sections">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    'lore-tab-btn flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all border',
                    active
                      ? 'lore-tab-active border-primary/35 text-white'
                      : 'border-transparent text-white/45 hover:text-white/75 hover:bg-white/5',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0', active ? 'text-primary' : 'text-white/40')} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab panels */}
      <section className="py-8 sm:py-16 px-4 sm:px-6 lg:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto min-w-0">

          {/* Timeline */}
          {tab === 'timeline' && (
            <div className="animate-in fade-in duration-300" role="tabpanel">
              <div className="flex items-center gap-2 mb-6 sm:mb-8">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-xl sm:text-2xl font-bold text-white">Timeline</h2>
              </div>
              <div className="relative lore-timeline-list">
                <div className="absolute lore-timeline-rail-pos top-2 bottom-2 w-0.5 lore-timeline-rail rounded-full" />
                <ul className="space-y-5 sm:space-y-8">
                  {LOREBOOK_TIMELINE.map((m, i) => (
                    <li key={m.id} className="relative min-w-0">
                      <span
                        className={cn(
                          'lore-timeline-dot absolute top-1.5 flex h-[18px] w-[18px] sm:h-[22px] sm:w-[22px] items-center justify-center rounded-full border-2 border-[#0a0612] ring-2',
                          m.significance >= 5
                            ? 'bg-gradient-to-br from-primary to-pink-500 ring-primary/40'
                            : m.significance >= 4
                              ? 'bg-primary/90 ring-primary/30'
                              : 'bg-violet-600/80 ring-violet-500/25',
                        )}
                      >
                        <span className="sr-only">Milestone {i + 1}</span>
                      </span>
                      <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm p-4 sm:p-6 hover:border-primary/25 transition-colors min-w-0">
                        <p className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wide sm:tracking-wider text-primary/70 mb-1 break-words">
                          {m.monthLabel}
                        </p>
                        <h3 className="text-base sm:text-lg font-semibold text-white mb-1.5 sm:mb-2 break-words">
                          {m.title}
                        </h3>
                        <p className="text-sm text-white/55 leading-relaxed mb-2 sm:mb-3 break-words">
                          {m.summary}
                        </p>
                        <p className="text-[11px] sm:text-xs text-amber-400/90 tracking-wide">
                          {significanceStars(m.significance)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Chapters */}
          {tab === 'chapters' && (
            <div className="animate-in fade-in duration-300" role="tabpanel">
              <div className="flex items-center gap-2 mb-6 sm:mb-8">
                <Layers className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-xl sm:text-2xl font-bold text-white">Chapters</h2>
              </div>
              <p className="text-white/50 text-sm mb-6 sm:mb-8 max-w-xl">
                The story of LoreBook unfolds in eras — each chapter groups major milestones into a narrative arc.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {LOREBOOK_CHAPTERS.map((ch, i) => (
                  <article
                    key={ch.id}
                    className="lore-chapter-card rounded-xl sm:rounded-2xl border border-white/10 overflow-hidden min-w-0"
                  >
                    <div className={cn('h-1 bg-gradient-to-r', CHAPTER_ACCENTS[i % CHAPTER_ACCENTS.length])} />
                    <div className="p-4 sm:p-6">
                      <p className="text-[10px] font-mono uppercase tracking-[0.12em] sm:tracking-[0.15em] text-white/35 mb-2">
                        {ch.eraLabel}
                      </p>
                      <h3 className="text-lg sm:text-xl font-semibold text-white font-serif mb-1.5 sm:mb-2 break-words">
                        {ch.title}
                      </h3>
                      <p className="text-sm text-white/55 leading-relaxed break-words">{ch.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-6 sm:mt-8 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-emerald-400/80 shrink-0 mt-0.5" />
                <p className="text-sm text-white/45 leading-relaxed break-words">
                  Phase 2 will extend this engine to every entity — people, organizations, projects, and relationships
                  each earn their own living biography from evidence.
                </p>
              </div>
            </div>
          )}

          {/* Vision */}
          {tab === 'vision' && (
            <div className="animate-in fade-in duration-300" role="tabpanel">
              <div className="flex items-center gap-2 mb-6 sm:mb-8">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-xl sm:text-2xl font-bold text-white">Vision Evolution</h2>
              </div>
              <p className="text-white/50 text-sm mb-8 sm:mb-10 max-w-xl">
                One thing founders forget: the vision changes. LoreBook tracks how its purpose evolved over time.
              </p>
              <div className="space-y-0">
                {LOREBOOK_VISIONS.map((v) => (
                  <div key={v.version} className="lore-vision-step relative lore-vision-content pb-8 sm:pb-10 last:pb-0">
                    <div className="absolute left-0 top-0 lore-vision-badge flex items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-pink-500/20 border border-primary/40 font-bold text-primary">
                      v{v.version}
                    </div>
                    <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-gradient-to-br from-black/50 to-purple-950/30 p-4 sm:p-6 backdrop-blur-sm min-w-0">
                      <p className="text-sm font-semibold text-primary/90 mb-1.5 sm:mb-2">{v.label}</p>
                      <p className="text-[0.95rem] sm:text-lg text-white/85 leading-relaxed mb-3 sm:mb-4 break-words">
                        {v.vision}
                      </p>
                      <p className="text-[10px] sm:text-xs font-mono text-white/35 uppercase tracking-wider">
                        {v.dateLabel}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto rounded-xl border border-white/10 bg-black/30 px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-sm font-medium text-white mb-1">Abel Mendoza · Founder</p>
          <p className="text-xs text-white/45 mb-0">Questions about LoreBook&apos;s story or vision?</p>
          <FounderContact variant="block" label="Email" className="border-none pt-2 mt-2" />
        </div>
      </section>
    </div>
  );
}
