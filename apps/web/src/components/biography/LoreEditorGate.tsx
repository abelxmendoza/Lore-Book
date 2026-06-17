import { useNavigate } from 'react-router-dom';
import { ChevronLeft, BookMarked } from 'lucide-react';
import { LoreReadinessPanel } from '../lorebook/LoreReadinessPanel';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';

type LoreEditorGateProps = {
  /** Shown when user opened editor for a book that failed to load */
  bookLoadFailed?: boolean;
  bookTitle?: string | null;
};

/**
 * Gate before the LoreBook Editor — editing is only available after compilation.
 * Shows knowledge readiness, topic progress, and links to compiled books.
 */
export const LoreEditorGate = ({ bookLoadFailed, bookTitle }: LoreEditorGateProps) => {
  const navigate = useNavigate();
  const { readiness, compiledBooks, loading, hasCompiledBook } = useLoreReadiness();

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-black via-[#0a0610] to-black overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 bg-black/60 shrink-0">
        <button
          type="button"
          onClick={() => navigate('/lorebook')}
          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors font-mono"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          LoreBooks
        </button>
        <div className="w-px h-3.5 bg-white/10" />
        <BookMarked className="h-4 w-4 text-primary/70" />
        <h1 className="text-sm font-semibold text-white">LoreBook Editor</h1>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wide text-amber-400/80 border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 rounded-full">
          Preview UI
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-4xl mx-auto w-full">
        {bookLoadFailed && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
            {bookTitle
              ? `"${bookTitle}" isn't compiled yet or couldn't be loaded. Generate it from the library first.`
              : 'This lorebook is not compiled yet. Generate it from the library first.'}
          </div>
        )}

        {!bookLoadFailed && !hasCompiledBook && readiness && !readiness.canGenerateAnyBook && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/3 px-4 py-3">
            <p className="text-sm text-white/70 leading-relaxed">
              <strong className="text-white font-medium">Editing unlocks after compilation.</strong>{' '}
              Right now LoreBook is still collecting knowledge. Chat more, then compile a book — the editor opens on that compiled artifact.
            </p>
          </div>
        )}

        {readiness && (
          <LoreReadinessPanel
            readiness={readiness}
            compiledBooks={compiledBooks}
            loading={loading}
            variant="full"
            onGenerateTopic={() => navigate('/lorebook')}
            onGoToChat={() => navigate('/')}
          />
        )}
      </div>
    </div>
  );
};
