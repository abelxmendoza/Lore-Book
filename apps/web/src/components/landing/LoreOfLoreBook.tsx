// © 2026 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';
import { BookOpen, Clock, Layers, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
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
      <section className="lore-page-hero-glow pt-8 pb-10 sm:pb-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-mono text-primary/80 uppercase tracking-[0.2em] mb-4">
            Living project history
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Lore of <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-violet-300 to-pink-400">LoreBook</span>
          </h1>
          <p className="text-base sm:text-lg text-white/55 max-w-2xl mx-auto leading-relaxed">
            Most products ship changelogs. LoreBook remembers its own story — milestones, eras, and how the vision evolved.
          </p>
        </div>
      </section>

      {/* Tab bar */}
      <div className="sticky top-16 z-40 border-y border-white/8 bg-black/70 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex gap-1 sm:gap-2 py-2 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all border',
                  active
                    ? 'lore-tab-active border-primary/35 text-white'
                    : 'border-transparent text-white/45 hover:text-white/75 hover:bg-white/5',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-white/40')} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      <section className="py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">

          {/* Timeline */}
          {tab === 'timeline' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-8">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold text-white">Timeline</h2>
              </div>
              <div className="relative pl-8 sm:pl-10">
                <div className="absolute left-[11px] sm:left-[15px] top-2 bottom-2 w-0.5 lore-timeline-rail rounded-full" />
                <ul className="space-y-8">
                  {LOREBOOK_TIMELINE.map((m, i) => (
                    <li key={m.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-8 sm:-left-10 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[#0a0612] ring-2',
                          m.significance >= 5
                            ? 'bg-gradient-to-br from-primary to-pink-500 ring-primary/40'
                            : m.significance >= 4
                              ? 'bg-primary/90 ring-primary/30'
                              : 'bg-violet-600/80 ring-violet-500/25',
                        )}
                      >
                        <span className="sr-only">Milestone {i + 1}</span>
                      </span>
                      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm p-5 sm:p-6 hover:border-primary/25 transition-colors">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-primary/70 mb-1">
                          {m.monthLabel}
                        </p>
                        <h3 className="text-lg font-semibold text-white mb-2">{m.title}</h3>
                        <p className="text-sm text-white/55 leading-relaxed mb-3">{m.summary}</p>
                        <p className="text-xs text-amber-400/90 tracking-wide">{significanceStars(m.significance)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Chapters */}
          {tab === 'chapters' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-8">
                <Layers className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold text-white">Chapters</h2>
              </div>
              <p className="text-white/50 text-sm mb-8 max-w-xl">
                The story of LoreBook unfolds in eras — each chapter groups major milestones into a narrative arc.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {LOREBOOK_CHAPTERS.map((ch, i) => (
                  <article
                    key={ch.id}
                    className="lore-chapter-card rounded-2xl border border-white/10 overflow-hidden"
                  >
                    <div className={cn('h-1 bg-gradient-to-r', CHAPTER_ACCENTS[i % CHAPTER_ACCENTS.length])} />
                    <div className="p-5 sm:p-6">
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/35 mb-2">
                        {ch.eraLabel}
                      </p>
                      <h3 className="text-xl font-semibold text-white font-serif mb-2">{ch.title}</h3>
                      <p className="text-sm text-white/55 leading-relaxed">{ch.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-8 rounded-xl border border-white/8 bg-white/[0.02] px-5 py-4 flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-emerald-400/80 shrink-0 mt-0.5" />
                <p className="text-sm text-white/45 leading-relaxed">
                  Phase 2 will extend this engine to every entity — people, organizations, projects, and relationships
                  each earn their own living biography from evidence.
                </p>
              </div>
            </div>
          )}

          {/* Vision */}
          {tab === 'vision' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex items-center gap-2 mb-8">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold text-white">Vision Evolution</h2>
              </div>
              <p className="text-white/50 text-sm mb-10 max-w-xl">
                One thing founders forget: the vision changes. LoreBook tracks how its purpose evolved over time.
              </p>
              <div className="space-y-0">
                {LOREBOOK_VISIONS.map((v) => (
                  <div key={v.version} className="lore-vision-step relative pl-14 sm:pl-16 pb-10 last:pb-0">
                    <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-pink-500/20 border border-primary/40 text-sm font-bold text-primary">
                      v{v.version}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-black/50 to-purple-950/30 p-5 sm:p-6 backdrop-blur-sm">
                      <p className="text-sm font-semibold text-primary/90 mb-2">{v.label}</p>
                      <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-4">{v.vision}</p>
                      <p className="text-xs font-mono text-white/35 uppercase tracking-wider">{v.dateLabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
