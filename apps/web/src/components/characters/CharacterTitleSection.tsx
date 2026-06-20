import { useCallback, useEffect, useState } from 'react';
import { Lock, Sparkles, Pencil, ArrowUpCircle, Plus, Link2, AlertCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { characterTitleApi, type CharacterDisplayTitle, type TitleStability } from '../../api/characterTitle';
import {
  getCharacterAliases,
  getCharacterDisplayTitle,
  getCharacterSubtitle,
  getTitleStabilityLabel,
} from '../../lib/characterDisplayTitle';
import type { Character } from './CharacterProfileCard';

type Props = {
  character: Character;
  onUpdated?: (patch: Partial<Character>) => void;
};

const STABILITY_VARIANT: Record<TitleStability, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  locked: 'default',
  stable: 'secondary',
  suggested_update: 'outline',
  temporary: 'outline',
  needs_resolution: 'destructive',
};

export function CharacterTitleSection({ character, onUpdated }: Props) {
  const [displayTitle, setDisplayTitle] = useState<CharacterDisplayTitle | null>(
    (character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null
  );
  const [subtitle, setSubtitle] = useState<string | null>(getCharacterSubtitle(character));
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(getCharacterDisplayTitle(character));
  const [draftSubtitle, setDraftSubtitle] = useState(subtitle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAliasForm, setShowAliasForm] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [namedPerson, setNamedPerson] = useState('');
  const [preferContextual, setPreferContextual] = useState(false);

  useEffect(() => {
    setDraftTitle(getCharacterDisplayTitle(character));
    setSubtitle(getCharacterSubtitle(character));
    setDisplayTitle((character.metadata?.display_title as CharacterDisplayTitle | undefined) ?? null);
  }, [character]);

  const refresh = useCallback(async () => {
    const res = await characterTitleApi.get(character.id);
    setDisplayTitle(res.displayTitle);
    setSubtitle(res.characterSubtitle ?? null);
    onUpdated?.({
      name: res.displayTitle.primaryTitle,
      metadata: {
        ...(character.metadata ?? {}),
        display_title: res.displayTitle,
        character_subtitle: res.characterSubtitle,
      },
    });
  }, [character.id, character.metadata, onUpdated]);

  const saveTitle = async () => {
    setBusy(true);
    setError(null);
    try {
      await characterTitleApi.patch(character.id, {
        primaryTitle: draftTitle.trim(),
        characterSubtitle: draftSubtitle.trim() || undefined,
        userConfirmed: true,
      });
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save title');
    } finally {
      setBusy(false);
    }
  };

  const lockTitle = async () => {
    setBusy(true);
    try {
      await characterTitleApi.lockTitle(character.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const promoteSuggestion = async () => {
    setBusy(true);
    try {
      const { suggestion } = await characterTitleApi.suggestUpdate(character.id);
      const s = suggestion as { proposedPrimaryTitle?: string } | null;
      if (s?.proposedPrimaryTitle) {
        await characterTitleApi.patch(character.id, {
          primaryTitle: s.proposedPrimaryTitle,
          userConfirmed: true,
        });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const addAlias = async () => {
    const value = newAlias.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      await characterTitleApi.addAlias(character.id, { value, aliasType: 'nickname' });
      setNewAlias('');
      setShowAliasForm(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add alias');
    } finally {
      setBusy(false);
    }
  };

  const promoteAlias = async (aliasId: string) => {
    setBusy(true);
    setError(null);
    try {
      await characterTitleApi.promoteAlias(character.id, aliasId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not promote alias');
    } finally {
      setBusy(false);
    }
  };

  const resolveReference = async () => {
    const name = namedPerson.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const result = await characterTitleApi.resolveReference(character.id, {
        namedPerson: name,
        preferContextualPrimary: preferContextual,
        subtitle: draftSubtitle.trim() || undefined,
        userConfirmed: true,
      });
      if (!result.applied) {
        setError('Merge requires confirmation — try again or check the name.');
      } else {
        setShowResolveForm(false);
        setNamedPerson('');
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve reference');
    } finally {
      setBusy(false);
    }
  };

  const markUnresolved = async () => {
    setBusy(true);
    try {
      await characterTitleApi.patch(character.id, {
        primaryTitle: displayTitle?.primaryTitle ?? getCharacterDisplayTitle(character),
        stability: 'needs_resolution',
        userConfirmed: true,
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const primary = displayTitle?.primaryTitle ?? getCharacterDisplayTitle(character);
  const stability = displayTitle?.stability ?? 'stable';
  const isContextual = displayTitle?.titleType === 'role_contextual' || displayTitle?.titleType === 'unknown_contextual_reference';
  const aliases = displayTitle?.aliases?.length
    ? displayTitle.aliases
    : getCharacterAliases(character).map((value, i) => ({
        id: `legacy-${i}`,
        value,
        aliasType: 'nickname',
        prominenceScore: 0,
        evidenceCount: 0,
      }));

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                aria-label="Primary title"
              />
              <input
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/80"
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                placeholder="Context subtitle (optional)"
                aria-label="Context subtitle"
              />
            </div>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-white leading-snug">{primary}</h3>
              {subtitle ? (
                <p className="text-sm text-white/60 mt-1 italic">{subtitle}</p>
              ) : null}
            </>
          )}
        </div>
        <Badge variant={STABILITY_VARIANT[stability]}>
          {getTitleStabilityLabel({ metadata: { display_title: displayTitle } })}
        </Badge>
      </div>

      {aliases.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 items-center">
          {aliases.slice(0, 8).map((alias) => (
            <span key={alias.id} className="inline-flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {alias.value}
              </Badge>
              {!editing && stability !== 'locked' && alias.value !== primary ? (
                <button
                  type="button"
                  className="text-[10px] text-white/50 hover:text-white/80 underline"
                  onClick={() => promoteAlias(alias.id)}
                  disabled={busy}
                  title="Promote to primary title"
                >
                  promote
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {showAliasForm ? (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="Nickname, stage name, or alias"
            aria-label="New alias"
          />
          <Button size="sm" onClick={addAlias} disabled={busy || !newAlias.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAliasForm(false)} disabled={busy}>Cancel</Button>
        </div>
      ) : null}

      {showResolveForm ? (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-white/60">Merge this contextual reference with a real name.</p>
          <input
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white"
            value={namedPerson}
            onChange={(e) => setNamedPerson(e.target.value)}
            placeholder="Real name (e.g. Jiho Kang)"
            aria-label="Named person"
          />
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={preferContextual}
              onChange={(e) => setPreferContextual(e.target.checked)}
            />
            Keep contextual title as primary
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={resolveReference} disabled={busy || !namedPerson.trim()}>
              Merge
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowResolveForm(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button size="sm" onClick={saveTitle} disabled={busy}>Save title</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit title
            </Button>
            {stability !== 'locked' ? (
              <Button size="sm" variant="outline" onClick={lockTitle} disabled={busy}>
                <Lock className="h-3.5 w-3.5 mr-1" /> Lock
              </Button>
            ) : null}
            {stability === 'suggested_update' ? (
              <Button size="sm" variant="outline" onClick={promoteSuggestion} disabled={busy}>
                <ArrowUpCircle className="h-3.5 w-3.5 mr-1" /> Apply suggestion
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setShowAliasForm((v) => !v)} disabled={busy}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add alias
            </Button>
            {isContextual ? (
              <Button size="sm" variant="outline" onClick={() => setShowResolveForm((v) => !v)} disabled={busy}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Merge with name
              </Button>
            ) : null}
            {stability !== 'needs_resolution' ? (
              <Button size="sm" variant="ghost" onClick={markUnresolved} disabled={busy}>
                <AlertCircle className="h-3.5 w-3.5 mr-1" /> Mark unresolved
              </Button>
            ) : null}
          </>
        )}
        {isContextual ? (
          <span className="inline-flex items-center text-xs text-white/50">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Contextual reference
          </span>
        ) : null}
      </div>
    </div>
  );
}
