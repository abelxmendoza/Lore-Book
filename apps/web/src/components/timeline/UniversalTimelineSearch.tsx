import { CalendarSearch, Sparkles } from 'lucide-react';
import './UniversalTimelineSearch.css';

type Props = {
  genInput: string;
  genQuery: string;
  suggestions: readonly string[];
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
  onSuggestionClick: (query: string) => void;
  dateInput?: string;
  onDateInputChange?: (value: string) => void;
  onDateSubmit?: () => void;
  variant?: 'desktop' | 'mobile';
  suggestionLimit?: number;
};

export function UniversalTimelineSearch({
  genInput,
  genQuery,
  suggestions,
  onInputChange,
  onSubmit,
  onClear,
  onSuggestionClick,
  dateInput = '',
  onDateInputChange,
  onDateSubmit,
  variant = 'desktop',
  suggestionLimit,
}: Props) {
  const isMobile = variant === 'mobile';
  const visibleSuggestions = suggestions.slice(0, suggestionLimit ?? suggestions.length);
  const showSuggestions = !genQuery && visibleSuggestions.length > 0;

  return (
    <div
      className={['omni-search-card', isMobile ? 'omni-search-card--mobile' : ''].filter(Boolean).join(' ')}
      data-testid={isMobile ? 'universal-timeline-search-mobile' : 'universal-timeline-search-desktop'}
    >
      <div className="omni-search-card__header">
        <span
          className={[
            'omni-search-card__icon',
            isMobile ? 'omni-search-card__icon--mobile' : 'omni-search-card__icon--desktop',
          ].join(' ')}
        >
          <Sparkles className={isMobile ? 'h-3.5 w-3.5 text-white' : 'h-4 w-4 text-white'} />
        </span>
        <div className="min-w-0">
          <h3
            className={[
              'omni-search-card__title',
              isMobile ? 'omni-search-card__title--mobile' : 'omni-search-card__title--desktop',
            ].join(' ')}
          >
            Universal Timeline Search
          </h3>
          {!isMobile && (
            <p className="omni-search-card__subtitle">
              Spin up any timeline from every conversation &amp; lorebook
            </p>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="omni-search-form"
      >
        <div className="omni-search-input-wrap">
          {!isMobile && <div className="omni-search-input-glow" aria-hidden="true" />}
          <div className="omni-search-input-inner">
            <Sparkles className="omni-search-input-icon h-4 w-4" />
            <input
              autoFocus={isMobile}
              value={genInput}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={
                isMobile
                  ? 'Generate any timeline from your story…'
                  : 'Generate any timeline… "my nightlife", "everything with Alex", "2024 career"'
              }
              aria-label="Generate a timeline"
              className="omni-search-input"
            />
          </div>
        </div>
        <div className="omni-search-actions">
          <button type="submit" className="omni-search-submit">
            <Sparkles className="h-4 w-4" />
            {isMobile ? 'Generate timeline' : 'Generate'}
          </button>
          {genQuery && onClear && (
            <button type="button" onClick={onClear} className="omni-search-clear">
              Clear
            </button>
          )}
        </div>
      </form>

      {onDateInputChange && onDateSubmit && (
        <form
          className="omni-date-search"
          onSubmit={(e) => {
            e.preventDefault();
            onDateSubmit();
          }}
        >
          <label className="omni-date-search__label" htmlFor={`omni-date-search-${variant}`}>
            <CalendarSearch className="h-3.5 w-3.5" />
            Search by date
          </label>
          <div className="omni-date-search__controls">
            <input
              id={`omni-date-search-${variant}`}
              type="date"
              value={dateInput}
              onChange={(e) => onDateInputChange(e.target.value)}
              max="9999-12-31"
              aria-label="Search timeline by date"
              className="omni-date-search__input"
            />
            <button type="submit" disabled={!dateInput} className="omni-date-search__submit">
              <CalendarSearch className="h-4 w-4" />
              Search date
            </button>
          </div>
        </form>
      )}

      {showSuggestions && (
        <SuggestionChips suggestions={visibleSuggestions} onSelect={onSuggestionClick} />
      )}
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: readonly string[];
  onSelect: (query: string) => void;
}) {
  return (
    <div className="omni-search-chips">
      <span className="omni-search-chips__label">Try</span>
      {suggestions.map((s) => (
        <button key={s} type="button" onClick={() => onSelect(s)} className="omni-search-chip">
          <Sparkles className="h-2.5 w-2.5" />
          {s}
        </button>
      ))}
    </div>
  );
}
