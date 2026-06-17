import { BookOpen } from 'lucide-react';

export type ReadingTheme = 'lore' | 'parchment' | 'daylight';

interface BookCoverPageProps {
  title: string;
  scope?: string;
  period?: string;
  chapterCount?: number;
  theme?: ReadingTheme;
  onOpen: () => void;
  onEdit?: () => void;
}

const ORNAMENT = '— ✦ —';

// Theme-specific cover styles
const COVER_THEMES: Record<ReadingTheme, { bg: string; text: string; sub: string; border: string; btnBg: string; btnText: string; ornament: string }> = {
  lore: {
    bg: 'bg-gradient-to-b from-[#0d0814] via-[#120c1e] to-[#0a0612]',
    text: 'text-white',
    sub: 'text-white/50',
    border: 'border-white/10',
    btnBg: 'bg-white/8 hover:bg-white/14 border border-white/15',
    btnText: 'text-white/80',
    ornament: 'text-purple-400/60',
  },
  parchment: {
    bg: 'bg-gradient-to-b from-[#1a1208] via-[#231808] to-[#1a1208]',
    text: 'text-[#e8d5a0]',
    sub: 'text-[#a08040]/70',
    border: 'border-[#a08040]/20',
    btnBg: 'bg-[#a08040]/10 hover:bg-[#a08040]/20 border border-[#a08040]/25',
    btnText: 'text-[#e8d5a0]/80',
    ornament: 'text-[#c8a060]/60',
  },
  daylight: {
    bg: 'bg-gradient-to-b from-[#f5f0e8] via-[#f0ebe0] to-[#f5f0e8]',
    text: 'text-[#1a1208]',
    sub: 'text-[#6b5a3a]/70',
    border: 'border-[#6b5a3a]/15',
    btnBg: 'bg-[#6b5a3a]/8 hover:bg-[#6b5a3a]/15 border border-[#6b5a3a]/20',
    btnText: 'text-[#1a1208]/70',
    ornament: 'text-[#8b6a3a]/50',
  },
};

export const BookCoverPage = ({
  title,
  scope,
  period,
  chapterCount,
  theme = 'lore',
  onOpen,
  onEdit,
}: BookCoverPageProps) => {
  const t = COVER_THEMES[theme];

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center ${t.bg} cursor-pointer select-none`}
      onClick={onOpen}
      role="button"
      aria-label="Open book — click to begin reading"
    >
      {/* Inner frame */}
      <div className={`relative flex flex-col items-center justify-center text-center px-10 sm:px-16 py-14 sm:py-20 max-w-lg w-full mx-auto border ${t.border} rounded-sm`}
        style={{ boxShadow: theme === 'lore' ? '0 0 60px rgba(139,92,246,0.06), inset 0 0 80px rgba(0,0,0,0.4)' : undefined }}
      >
        {/* Top ornament */}
        <div className={`font-serif text-lg mb-8 ${t.ornament}`}>{ORNAMENT}</div>

        {/* Book icon */}
        <BookOpen className={`h-8 w-8 mb-6 opacity-40 ${t.text}`} />

        {/* Title */}
        <h1
          className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 ${t.text}`}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.2 }}
        >
          {title}
        </h1>

        {/* Scope / type */}
        {scope && (
          <p className={`text-sm uppercase tracking-[0.25em] font-mono mb-6 ${t.sub}`}>
            {scope}
          </p>
        )}

        {/* Middle ornament */}
        <div className={`font-serif text-lg mb-6 ${t.ornament}`}>{ORNAMENT}</div>

        {/* Period + chapter count */}
        <div className={`flex items-center gap-4 text-sm ${t.sub} mb-10`}>
          {period && <span style={{ fontFamily: 'Georgia, serif' }}>{period}</span>}
          {period && chapterCount && <span className="opacity-40">·</span>}
          {chapterCount && (
            <span style={{ fontFamily: 'Georgia, serif' }}>
              {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
            </span>
          )}
        </div>

        {/* Open CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className={`px-8 py-2.5 rounded-full text-sm tracking-widest uppercase font-mono transition-all ${t.btnBg} ${t.btnText}`}
          >
            Begin Reading
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className={`px-6 py-2.5 rounded-full text-sm tracking-widest uppercase font-mono transition-all border ${t.border} ${t.sub} hover:opacity-80`}
            >
              Edit Book
            </button>
          )}
        </div>

        {/* Bottom ornament */}
        <div className={`font-serif text-lg mt-8 ${t.ornament}`}>{ORNAMENT}</div>
      </div>

      {/* Click anywhere hint */}
      <p className={`mt-6 text-xs font-mono tracking-widest uppercase opacity-25 ${t.text}`}>
        Click anywhere to open
      </p>
    </div>
  );
};
