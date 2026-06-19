import { useMemo, useState } from 'react';
import { BookHeart, ChevronRight, Users, MessageSquareQuote } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  ROMANTIC_LORE_SYNOPSIS,
  ROMANTIC_LORE_CHAPTERS,
  ROMANTIC_LORE_CHARACTERS,
  ROMANTIC_LORE_TEST_CASES,
  getLoreTestCasesByCategory,
  type RomanticLoreCategory,
} from '../../mocks/romanticLoreStory';

const CATEGORY_LABELS: Record<RomanticLoreCategory, string> = {
  active_committed: 'Committed',
  crush: 'Crush',
  situationship: 'Situationship',
  ghosted: 'Ghosted',
  past_ended: 'Past / Ended',
  intense_past: 'Intense past',
  infatuation: 'Infatuation',
  blocked: 'Blocked',
  rekindled: 'Rekindled',
  dating_new: 'New dating',
  talking: 'Talking stage',
  on_break: 'On a break',
  complicated: 'Complicated',
  unrequited: 'Unrequited',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as RomanticLoreCategory[];

type Props = {
  demoMode?: boolean;
};

export const RomanticStoryShowcase = ({ demoMode = true }: Props) => {
  const [activeCategory, setActiveCategory] = useState<RomanticLoreCategory | 'all'>('all');

  const visibleCases = useMemo(() => {
    if (activeCategory === 'all') return ROMANTIC_LORE_TEST_CASES;
    return getLoreTestCasesByCategory(activeCategory);
  }, [activeCategory]);

  if (!demoMode) return null;

  return (
    <div
      className="rounded-lg border border-rose-500/25 bg-gradient-to-br from-rose-950/20 via-black/40 to-purple-950/15 overflow-hidden"
      data-testid="romantic-story-showcase"
    >
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-rose-500/15">
        <BookHeart className="h-4 w-4 text-rose-300 flex-shrink-0" />
        <h3 className="text-sm sm:text-base font-semibold text-white">Connected lore timeline</h3>
        <Badge variant="outline" className="text-[9px] bg-rose-500/15 text-rose-200 border-rose-500/25 ml-auto">
          Demo story
        </Badge>
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-4">
        <p className="text-[11px] text-white/60 leading-relaxed" data-testid="romantic-lore-synopsis">
          {ROMANTIC_LORE_SYNOPSIS}
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ROMANTIC_LORE_CHAPTERS.map((ch) => (
            <div
              key={ch.chapter}
              className="rounded-lg border border-white/8 bg-black/30 px-3 py-2"
              data-testid={`lore-chapter-${ch.chapter}`}
            >
              <p className="text-[10px] font-mono text-rose-300/80">Ch. {ch.chapter}</p>
              <p className="text-xs font-medium text-white mt-0.5">{ch.title}</p>
              <p className="text-[10px] text-white/45 mt-1 leading-relaxed">{ch.summary}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-3.5 w-3.5 text-white/50" />
            <p className="text-xs font-medium text-white/70">Cast & connections</p>
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="lore-character-web">
            {ROMANTIC_LORE_CHARACTERS.map((c) => (
              <span
                key={c.id}
                title={`${c.role}: ${c.connection}`}
                className="text-[9px] px-2 py-1 rounded-full bg-white/5 text-white/70 border border-white/10"
                data-testid={`lore-character-${c.id}`}
              >
                {c.name}
                <span className="text-white/35 ml-1">· {c.role}</span>
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-white/70 mb-2 flex items-center gap-2">
            <MessageSquareQuote className="h-3.5 w-3.5 text-white/50" />
            Parser test cases
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`text-[9px] px-2 py-1 rounded-full border ${
                activeCategory === 'all'
                  ? 'bg-rose-500/20 text-rose-100 border-rose-500/30'
                  : 'bg-black/30 text-white/50 border-white/10'
              }`}
            >
              All ({ROMANTIC_LORE_TEST_CASES.length})
            </button>
            {ALL_CATEGORIES.map((cat) => {
              const count = getLoreTestCasesByCategory(cat).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`text-[9px] px-2 py-1 rounded-full border ${
                    activeCategory === cat
                      ? 'bg-rose-500/20 text-rose-100 border-rose-500/30'
                      : 'bg-black/30 text-white/50 border-white/10'
                  }`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 lg:grid-cols-3">
            {visibleCases.map((tc) => (
              <div
                key={tc.id}
                className="flex h-full flex-col rounded-lg border border-white/8 bg-black/25 px-2.5 py-2 sm:px-3 sm:py-2.5"
                data-testid={`lore-test-case-${tc.id}`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[8px] bg-purple-500/10 text-purple-200 border-purple-500/20">
                    Ch.{tc.chapter}
                  </Badge>
                  <span className="text-xs font-medium text-white">{tc.label}</span>
                  <span className="text-[9px] text-white/35 ml-auto font-mono">{tc.expectedPartner}</span>
                </div>
                <p className="text-[10px] text-white/45 mt-1 leading-relaxed">{tc.storyBeat}</p>
                <p className="text-[10px] text-white/55 italic mt-1.5 border-l-2 border-rose-500/25 pl-2">
                  &ldquo;{tc.chatSnippet}&rdquo;
                </p>
                <div className="flex flex-wrap gap-2 mt-2 text-[9px] text-white/35 font-mono">
                  <span>type: {tc.expectedType}</span>
                  <span>status: {tc.expectedStatus}</span>
                  <span>filter: {tc.filterTab}</span>
                  <span>cue: {tc.glossaryCue}</span>
                </div>
                {tc.connectedCharacterIds.length > 0 && (
                  <p className="text-[9px] text-white/30 mt-1 flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    linked: {tc.connectedCharacterIds.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
