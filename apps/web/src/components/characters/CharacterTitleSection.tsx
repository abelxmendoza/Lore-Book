import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import { characterTitleApi, type CharacterDisplayTitle } from '../../api/characterTitle';
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
  onUpdated,
}: Props) {
  const [displayTitle, setDisplayTitle] = useState<CharacterDisplayTitle | null>(
    (character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null
  );
  const [subtitle, setSubtitle] = useState<string | null>(getCharacterSubtitle(character));
  const [removingAlias, setRemovingAlias] = useState<string | null>(null);

  useEffect(() => {
    setSubtitle(getCharacterSubtitle(character));
    setDisplayTitle((character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null);
  }, [character]);

  const primary = displayTitle?.primaryTitle ?? getCharacterDisplayTitle(character);
  const isContextual =
    displayTitle?.titleType === 'role_contextual' ||
    displayTitle?.titleType === 'unknown_contextual_reference';
  const aliases = getCharacterAliases(character).map((value, i) => {
    const fromTitle = displayTitle?.aliases?.find(
      (alias) => alias.value.trim().toLowerCase() === value.toLowerCase(),
    );
    return (
      fromTitle ?? {
        id: `legacy-${i}`,
        value,
        aliasType: 'nickname',
        prominenceScore: 0,
        evidenceCount: 0,
      }
    );
  });

  const removeAlias = async (alias: { id: string; value: string }) => {
    if (!onUpdated || removingAlias) return;
    const nextAliases = (character.alias ?? []).filter(
      (value) => value.trim().toLowerCase() !== alias.value.trim().toLowerCase(),
    );
    const nextTitle = displayTitle
      ? {
          ...displayTitle,
          aliases: (displayTitle.aliases ?? []).filter(
            (item) => item.value.trim().toLowerCase() !== alias.value.trim().toLowerCase(),
          ),
        }
      : null;
    setDisplayTitle(nextTitle);
    onUpdated({
      alias: nextAliases,
      metadata: {
        ...((character.metadata ?? {}) as Record<string, unknown>),
        ...(nextTitle ? { display_title: nextTitle } : {}),
      },
    });
    if (character.id.startsWith('dummy-') || character.id.startsWith('temp-')) return;
    setRemovingAlias(alias.value);
    try {
      const result = await characterTitleApi.removeAlias(character.id, alias.id || alias.value);
      onUpdated({
        alias: result.displayTitle.aliases.map((item) => item.value),
        metadata: {
          ...((character.metadata ?? {}) as Record<string, unknown>),
          display_title: result.displayTitle,
        },
      });
      setDisplayTitle(result.displayTitle);
    } catch {
      // Optimistic local update already applied; Info → Save names will persist.
    } finally {
      setRemovingAlias(null);
    }
  };

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
              className={`${compact ? 'max-w-[12rem] truncate px-1.5 py-0 text-[10px]' : 'text-xs'} inline-flex items-center gap-1`}
            >
              <span className="truncate">{alias.value}</span>
              {onUpdated ? (
                <button
                  type="button"
                  className="text-white/45 hover:text-white/85 disabled:opacity-40"
                  aria-label={`Remove alias ${alias.value}`}
                  disabled={removingAlias === alias.value}
                  onClick={() => void removeAlias(alias)}
                >
                  ×
                </button>
              ) : null}
            </Badge>
          ))
        ) : !isContextual ? (
          <span className="truncate text-[11px] text-white/45">Also known as…</span>
        ) : null}
      </div>
    </div>
  );
}
