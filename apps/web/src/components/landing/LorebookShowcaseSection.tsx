// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { BookOpen, Edit3, Download } from 'lucide-react';

const SAMPLE_BOOKS = [
  {
    title: 'The Portland Chapter',
    scope: 'An era',
    period: '2023 – 2025',
    gradient: 'from-blue-600 to-cyan-700',
    border: 'border-sky-500/25',
  },
  {
    title: 'People Who Changed Me',
    scope: 'Relationships',
    period: 'Selected stories',
    gradient: 'from-pink-600 to-rose-700',
    border: 'border-pink-500/25',
  },
  {
    title: 'My Working Life',
    scope: 'Career',
    period: 'Full arc',
    gradient: 'from-amber-600 to-orange-700',
    border: 'border-amber-500/25',
  },
];

export function LorebookShowcaseSection() {
  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-black/20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-xs font-mono text-emerald-400/70 uppercase tracking-widest mb-3">
            Compiled lorebooks
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Your life, as a <span className="text-primary">book</span>
          </h2>
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
            When enough of your story is collected, LoreBook compiles it into readable chapters —
            a biography of a person, an era, a relationship, or your whole arc. Read, refine, download.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-8">
          {SAMPLE_BOOKS.map((book) => (
            <article
              key={book.title}
              className={`rounded-2xl border ${book.border} overflow-hidden bg-white/3`}
            >
              <div className={`h-1.5 bg-gradient-to-r ${book.gradient}`} />
              <div className="p-5">
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                  {book.scope}
                </p>
                <h3 className="text-lg font-semibold text-white font-serif mb-1">{book.title}</h3>
                <p className="text-xs text-white/40 mb-4">{book.period}</p>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-medium">
                  <span className="rounded-lg bg-primary/15 border border-primary/25 text-primary py-2 text-center">
                    Read
                  </span>
                  <span className="rounded-lg bg-white/5 border border-white/10 text-white/60 py-2 text-center inline-flex items-center justify-center gap-1">
                    <Edit3 className="h-3 w-3" />
                    Edit
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 py-2 text-center inline-flex items-center justify-center gap-1">
                    <Download className="h-3 w-3" />
                    PDF
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-black/40 px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 shrink-0">
            <BookOpen className="h-5 w-5 text-emerald-300" />
          </div>
          <p className="text-sm text-white/60 leading-relaxed flex-1">
            Chat is where your lore enters. The library is where it lives — compiled editions you can
            return to, edit like a manuscript, and export when you're ready to share or keep offline.
          </p>
        </div>
      </div>
    </section>
  );
}
