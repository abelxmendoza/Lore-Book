import { Character, CharacterProfileCard } from './CharacterProfileCard';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

type CharacterBookPageProps = {
  character: Character;
  pageNumber: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onGoToPage?: (page: number) => void;
  onClick?: () => void;
};

export const CharacterBookPage = ({
  character,
  pageNumber,
  totalPages,
  onPrevious,
  onNext,
  onGoToPage,
  onClick
}: CharacterBookPageProps) => {
  return (
    <div className="relative w-full h-[600px]" style={{ perspective: '1000px' }}>
      {/* Book Page Container */}
      <div className="relative w-full h-full bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
        {/* Page Content */}
        <div className="absolute inset-0 p-8 flex flex-col">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-800/20">
            <div className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-amber-600/60" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                  Character Book
                </h3>
                <p className="text-xs text-amber-700/50 mt-0.5">
                  Page {pageNumber} of {totalPages}
                </p>
              </div>
            </div>
            <div className="text-xs text-amber-700/40 font-mono">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          {/* Character Content - Full Page */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-2xl">
              <CharacterProfileCard
                character={character}
                onClick={onClick}
              />
            </div>
          </div>

          {/* Page Footer with Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-amber-800/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPrevious();
              }}
              disabled={pageNumber === 1}
              className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pageNumber <= 3) {
                  pageNum = i + 1;
                } else if (pageNumber >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = pageNumber - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onGoToPage) {
                        onGoToPage(pageNum);
                      }
                    }}
                    className={`w-2 h-2 rounded-full transition ${
                      pageNumber === pageNum
                        ? 'bg-amber-600 w-6'
                        : 'bg-amber-700/30 hover:bg-amber-700/50'
                    }`}
                    aria-label={`Go to page ${pageNum}`}
                  />
                );
              })}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              disabled={pageNumber === totalPages}
              className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Book Binding Effect */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
      </div>
    </div>
  );
};

