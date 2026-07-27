import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { CharacterDisplayTitle } from '../../api/characterTitle';
import {
  getCharacterAliases,
  getCharacterDisplayTitle,
  getCharacterSubtitle,
} from '../../lib/characterDisplayTitle';
import type { Character } from './CharacterProfileCard';

type Props = {
  character: Character;
  onUpdated?: (patch: Partial<Character>) => void;
  /** Dense header treatment for modals where vertical space is scarce. */
  compact?: boolean;
  /** Skip repeating the primary title when the parent already renders it. */
  omitTitle?: boolean;
};

/**
 * Display-only name chips for the character modal header.
 * Add/edit nicknames, usernames, aliases, and first/middle/last live in Info.
 */
export function CharacterTitleSection({
  character,
  compact = false,
  omitTitle = false,
}: Props) {
  const [displayTitle, setDisplayTitle] = useState<CharacterDisplayTitle | null>(
    (character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null
  );
  const [subtitle, setSubtitle] = useState<string | null>(getCharacterSubtitle(character));

  useEffect(() => {
    setSubtitle(getCharacterSubtitle(character));
    setDisplayTitle((character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null);
  }, [character]);

  const primary = displayTitle?.primaryTitle ?? getCharacterDisplayTitle(character);
  const isContextual =
    displayTitle?.titleType === 'role_contextual' ||
    displayTitle?.titleType === 'unknown_contextual_reference';
  const aliases = displayTitle?.aliases?.length
    ? displayTitle.aliases
    : getCharacterAliases(character).map((value, i) => ({
        id: `legacy-${i}`,
        value,
        aliasType: 'nickname',
        prominenceScore: 0,
        evidenceCount: 0,
      }));

  const showTitleBlock = !omitTitle;

  return (
    <div
      className={`rounded-lg border border-white/10 bg-white/5 ${
        compact ? 'space-y-1 p-1.5' : 'space-y-2 p-3'
      }`}
      data-testid={compact ? 'character-title-compact' : 'character-title-section'}
    >
      {showTitleBlock ? (
        <div className="min-w-0">
          <h3 className={`${compact ? 'truncate text-sm' : 'text-lg'} font-semibold text-white leading-snug`}>
            {primary}
          </h3>
          {!compact && subtitle ? (
            <p className="mt-1 text-sm text-white/60 italic">{subtitle}</p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex min-w-0 items-center ${compact ? 'gap-1 flex-wrap' : 'flex-wrap gap-1.5'}`}
        data-testid="character-also-known-as"
      >
        {isContextual ? (
          <span className="inline-flex shrink-0 items-center text-[10px] text-white/50">
            <Sparkles className="mr-0.5 h-3 w-3" /> Contextual
          </span>
        ) : null}
        {aliases.length > 0 ? (
          aliases.map((alias) => (
            <Badge
              key={alias.id}
              variant="outline"
              className={`${compact ? 'max-w-[12rem] truncate px-1.5 py-0 text-[10px]' : 'text-xs'}`}
            >
              {alias.value}
            </Badge>
          ))
        ) : !isContextual ? (
          <span className="truncate text-[11px] text-white/45">Also known as…</span>
        ) : null}
      </div>
    </div>
  );
}
