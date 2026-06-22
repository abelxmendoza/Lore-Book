import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  GitMerge,
  Info,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { invalidateCache } from '../../lib/requestCache';
import { apiCache } from '../../lib/cache';
import { isSelfCharacter } from '../../lib/isSelfCharacter';
import { useGetCharactersBookQuery } from '../../store/api/entitiesApi';
import { invalidateEntityTags } from '../../store/invalidateEntityCache';
import type { Character } from './CharacterProfileCard';

export type CharacterDuplicateGroup = {
  match_type: 'exact' | 'alias' | 'containment';
  confidence?: number;
  recommendation?: 'merge' | 'review';
  reason?: string;
  canonical_name: string;
  characters: Character[];
};

type Props = {
  characters: Character[];
  demoMode?: boolean;
  onConsolidated: (result?: { demoCharacters?: Character[] }) => void;
  selectionMode: boolean;
  onSelectionModeChange: (active: boolean) => void;
  selectedForMerge: Set<string>;
  onToggleSelected: (characterId: string) => void;
  onClearSelection: () => void;
};

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function mergeCharactersLocally(
  currentCharacters: Character[],
  targetId: string,
  sourceIds: string[]
): Character[] {
  const target = currentCharacters.find(character => character.id === targetId);
  if (!target) return currentCharacters;

  const sources = currentCharacters.filter(character => sourceIds.includes(character.id));
  const aliases = new Set(
    [...(target.alias ?? []), ...sources.flatMap(character => [character.name, ...(character.alias ?? [])])].filter(
      Boolean
    )
  );
  aliases.delete(target.name);

  const mergedTarget: Character = {
    ...target,
    alias: Array.from(aliases),
    memory_count:
      (target.memory_count ?? 0) + sources.reduce((sum, character) => sum + (character.memory_count ?? 0), 0),
    relationship_count:
      (target.relationship_count ?? 0) +
      sources.reduce((sum, character) => sum + (character.relationship_count ?? 0), 0),
    summary: `${target.summary ?? ''} Demo merge preview: combined aliases, memories, facts, and relationships from ${sources.map(character => character.name).join(', ')}.`.trim(),
  };

  return currentCharacters
    .filter(character => !sourceIds.includes(character.id))
    .map(character => (character.id === targetId ? mergedTarget : character));
}

function isMergeEligible(character: Character): boolean {
  return (
    !isSelfCharacter(character) &&
    character.status !== 'archived' &&
    character.status !== 'pending_deletion'
  );
}

function isArchiveEligible(character: Character): boolean {
  return !isSelfCharacter(character);
}

export const CharacterMergePanel = ({
  characters,
  demoMode = false,
  onConsolidated,
  selectionMode,
  onSelectionModeChange,
  selectedForMerge,
  onToggleSelected: _onToggleSelected,
  onClearSelection,
}: Props) => {
  const [duplicateGroups, setDuplicateGroups] = useState<CharacterDuplicateGroup[]>([]);
  const [showHub, setShowHub] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { dataUpdatedAt } = useGetCharactersBookQuery(undefined, { skip: demoMode });

  const loadDuplicateGroups = useCallback(async () => {
    if (demoMode) {
      const active = characters.filter(isMergeEligible);
      const byName = new Map<string, Character[]>();
      for (const character of active) {
        const key = character.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(character);
      }
      setDuplicateGroups(
        [...byName.entries()]
          .filter(([, group]) => group.length > 1)
          .map(([canonical_name, group]) => ({
            match_type: 'exact' as const,
            canonical_name,
            confidence: 0.98,
            recommendation: 'merge' as const,
            reason: 'same canonical name',
            characters: group,
          }))
      );
      return;
    }
    try {
      const response = await fetchJson<{ duplicate_groups: CharacterDuplicateGroup[] }>('/api/characters/duplicates');
      setDuplicateGroups(response.duplicate_groups ?? []);
    } catch {
      setDuplicateGroups([]);
    }
  }, [characters, demoMode]);

  useEffect(() => {
    void loadDuplicateGroups();
  }, [demoMode, loadDuplicateGroups, dataUpdatedAt]);

  const selectedCharacters = useMemo(
    () => characters.filter(character => selectedForMerge.has(character.id) && isArchiveEligible(character)),
    [characters, selectedForMerge]
  );

  const selectedActiveCharacters = useMemo(
    () => selectedCharacters.filter(isMergeEligible),
    [selectedCharacters]
  );

  const selectedArchivedCharacters = useMemo(
    () => selectedCharacters.filter(character => character.status === 'archived'),
    [selectedCharacters]
  );

  const selectedPendingDeletionCharacters = useMemo(
    () => selectedCharacters.filter(character => character.status === 'pending_deletion'),
    [selectedCharacters]
  );

  const cancelManualMerge = () => {
    onSelectionModeChange(false);
    onClearSelection();
    setMergeError(null);
    setShowDeleteConfirm(false);
    setDeleteConfirmName('');
  };

  const afterConsolidation = async (notice: string, result?: { demoCharacters?: Character[] }) => {
    if (!demoMode) {
      apiCache.deletePattern(/\/api\/(characters|entity-resolution|omega-memory|knowledge)/);
    }
    await loadDuplicateGroups();
    onConsolidated(result);
    setMergeNotice(notice);
    window.setTimeout(() => setMergeNotice(null), 12000);
    if (!demoMode) invalidateEntityTags(['Character']);
  };

  const mergeDuplicateGroup = async (group: CharacterDuplicateGroup, targetId: string) => {
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const sources = group.characters.filter(character => character.id !== targetId);
      let mergedName = group.characters.find(character => character.id === targetId)?.name ?? 'the selected character';
      if (demoMode) {
        const merged = mergeCharactersLocally(characters, targetId, sources.map(source => source.id));
        setDuplicateGroups(prev => prev.filter(existing => existing.canonical_name !== group.canonical_name));
        await afterConsolidation(
          `Demo merge preview: consolidated ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'} into ${mergedName}.`,
          { demoCharacters: merged }
        );
        return;
      }
      for (const source of sources) {
        const result = await fetchJson<{
          character?: Character | null;
          report?: { canonicalName?: string };
        }>('/api/characters/merge', {
          method: 'POST',
          body: JSON.stringify({
            source_id: source.id,
            target_id: targetId,
            reason: `Merged from duplicate review (${group.match_type})`,
          }),
        });
        mergedName = result.character?.name ?? result.report?.canonicalName ?? mergedName;
      }
      invalidateCache(); // a merge rewrites cross-references broadly — clear all cached reads
      await afterConsolidation(
        `Merged ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'} into ${mergedName}. Aliases, memories, facts, relationships, and knowledge links were consolidated.`
      );
      setShowHub(false);
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to merge duplicate characters'));
    } finally {
      setMergeBusy(false);
    }
  };

  const mergeSelectedCharacters = async (targetId: string) => {
    const sources = selectedActiveCharacters.filter(character => character.id !== targetId);
    if (sources.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      let mergedName = selectedActiveCharacters.find(character => character.id === targetId)?.name ?? 'the selected character';
      if (demoMode) {
        const merged = mergeCharactersLocally(characters, targetId, sources.map(source => source.id));
        cancelManualMerge();
        await afterConsolidation(
          `Demo merge preview: merged ${sources.length + 1} selected cards into ${mergedName}.`,
          { demoCharacters: merged }
        );
        return;
      }
      for (const source of sources) {
        const result = await fetchJson<{
          character?: Character | null;
          report?: { canonicalName?: string };
        }>('/api/characters/merge', {
          method: 'POST',
          body: JSON.stringify({
            source_id: source.id,
            target_id: targetId,
            reason: 'Merged from manual character selection',
          }),
        });
        mergedName = result.character?.name ?? result.report?.canonicalName ?? mergedName;
      }
      invalidateCache(); // a merge rewrites cross-references broadly — clear all cached reads
      cancelManualMerge();
      await afterConsolidation(
        `Merged ${sources.length + 1} selected cards into ${mergedName}. The survivor now combines aliases, memories, facts, relationships, and knowledge links.`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to merge selected characters'));
    } finally {
      setMergeBusy(false);
    }
  };

  const archiveSelectedCharacters = async () => {
    const targets = selectedActiveCharacters;
    if (targets.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice(`Demo: archived ${targets.length} selected card(s). Sign in to persist.`);
        window.setTimeout(() => setMergeNotice(null), 12000);
        return;
      }
      await Promise.all(
        targets.map(character =>
          fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'archived' }),
          })
        )
      );
      cancelManualMerge();
      await afterConsolidation(
        `Archived ${targets.length} card${targets.length === 1 ? '' : 's'}. Their knowledge stays in your database — use Rescan conversations to restore if needed.`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to archive characters'));
    } finally {
      setMergeBusy(false);
    }
  };

  const restoreSelectedCharacters = async () => {
    const targets = [...selectedArchivedCharacters, ...selectedPendingDeletionCharacters];
    if (targets.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice(`Demo: restored ${selectedArchivedCharacters.length} card(s) to the book.`);
        window.setTimeout(() => setMergeNotice(null), 12000);
        return;
      }
      await Promise.all(
        targets.map(character =>
          fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'active' }),
          })
        )
      );
      cancelManualMerge();
      await afterConsolidation(
        `Restored ${targets.length} card${targets.length === 1 ? '' : 's'} to your Character Book.`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to restore characters'));
    } finally {
      setMergeBusy(false);
    }
  };

  const queueSelectedForDeletion = async () => {
    const targets = selectedArchivedCharacters;
    if (targets.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice(`Demo: queued ${targets.length} card(s) for deletion review.`);
        window.setTimeout(() => setMergeNotice(null), 12000);
        return;
      }
      await Promise.all(
        targets.map(character =>
          fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'pending_deletion' }),
          })
        )
      );
      cancelManualMerge();
      await afterConsolidation(
        `Queued ${targets.length} archived card${targets.length === 1 ? '' : 's'} for deletion review. Open Pending deletion to double-check before removing permanently.`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to queue characters for deletion'));
    } finally {
      setMergeBusy(false);
    }
  };

  const restorePendingDeletion = async () => {
    const targets = selectedPendingDeletionCharacters;
    if (targets.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice('Demo: restored queued cards to archived.');
        return;
      }
      await Promise.all(
        targets.map(character =>
          fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'archived' }),
          })
        )
      );
      cancelManualMerge();
      await afterConsolidation(
        `Moved ${targets.length} card${targets.length === 1 ? '' : 's'} back to archived (deletion cancelled).`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to cancel deletion queue'));
    } finally {
      setMergeBusy(false);
    }
  };

  const permanentlyDeleteSelected = async () => {
    if (selectedPendingDeletionCharacters.length !== 1) return;
    const character = selectedPendingDeletionCharacters[0];
    if (deleteConfirmName.trim() !== character.name) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice('Demo: permanent delete preview only.');
        return;
      }
      await fetchJson(`/api/characters/${character.id}?redistribute=true`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'wrong_or_duplicate_entity_card' }),
      });
      cancelManualMerge();
      await afterConsolidation(
        `Removed ${character.name}. Their conversation evidence is being reprocessed — facts were preserved and the system recorded this as a correction.`
      );
    } catch (error) {
      setMergeError(apiErrorMessage(error, 'Failed to delete character'));
    } finally {
      setMergeBusy(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmName('');
    }
  };

  const protocolCards = [
    {
      title: 'Merge',
      icon: GitMerge,
      tone: 'text-primary border-primary/30 bg-primary/10',
      when: 'Two or more cards describe the same real person.',
      effect: 'One card survives with combined aliases, facts, memories, and relationships. Other cards are removed after their data moves over.',
    },
    {
      title: 'Archive',
      icon: Archive,
      tone: 'text-amber-200 border-amber-500/30 bg-amber-500/10',
      when: 'A card is wrong, duplicate-ish, or clutter — but you might want the evidence later.',
      effect: 'Hides the card from your book. Mention them in chat to restore, or queue for deletion later.',
    },
    {
      title: 'Pending deletion',
      icon: Trash2,
      tone: 'text-orange-200 border-orange-500/30 bg-orange-500/10',
      when: 'You archived a card and want one last review before it is gone forever.',
      effect: 'Moves to a review queue. Permanent delete only works from this stage.',
    },
    {
      title: 'Delete permanently',
      icon: Trash2,
      tone: 'text-red-200 border-red-500/30 bg-red-500/10',
      when: 'Only after archive → pending deletion review. Rare junk you never want again.',
      effect: 'Removes the card but preserves facts as lore claims and reprocesses source conversations.',
    },
  ];

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Info className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white/85">Consolidate your cast</p>
            <p className="text-[11px] text-white/45 leading-relaxed">
              Merge same-person duplicates, archive mistaken cards, or permanently delete junk — each action has a different recovery path.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
            onClick={() => setShowHub(true)}
            className="text-xs"
          >
            Consolidate characters
          </Button>
          <Button
            size="sm"
            variant={selectionMode ? 'subtle' : 'outline'}
            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
            onClick={() => {
              if (selectionMode) cancelManualMerge();
              else onSelectionModeChange(true);
            }}
            className="text-xs"
          >
            {selectionMode ? 'Cancel selection' : 'Select cards'}
          </Button>
        </div>
      </div>

      {duplicateGroups.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-100">
                {duplicateGroups.length} possible duplicate {duplicateGroups.length === 1 ? 'group' : 'groups'}
              </p>
              <p className="text-xs text-amber-100/65">
                Exact matches are usually safe to merge. Containment or alias matches need your judgment.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowHub(true)}
            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30"
          >
            Review duplicates
          </Button>
        </div>
      )}

      {mergeNotice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {mergeNotice}
        </div>
      )}

      {selectionMode && (
        <div className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Manual consolidation</p>
              <p className="text-xs text-white/55">
                Tap cards to select them, then merge same-person duplicates, archive mistakes, or permanently delete junk.
              </p>
            </div>
            <span className="text-xs text-white/45">{selectedCharacters.length} selected</span>
          </div>

          {mergeError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {mergeError}
            </div>
          )}

          {selectedActiveCharacters.length >= 2 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-white/60 uppercase tracking-wide">Merge — same person</p>
              <div className="flex flex-wrap gap-2">
                {selectedActiveCharacters.map(character => (
                  <Button
                    key={character.id}
                    size="sm"
                    disabled={mergeBusy}
                    onClick={() => void mergeSelectedCharacters(character.id)}
                    leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                    className="text-xs"
                  >
                    Keep {character.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {selectedCharacters.length >= 1 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
              {selectedActiveCharacters.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mergeBusy}
                  onClick={() => void archiveSelectedCharacters()}
                  leftIcon={<Archive className="h-3.5 w-3.5" />}
                  className="text-xs border-amber-500/30 text-amber-100 hover:bg-amber-500/10"
                >
                  Archive selected
                </Button>
              )}
              {selectedArchivedCharacters.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mergeBusy}
                    onClick={() => void restoreSelectedCharacters()}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    className="text-xs border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/10"
                  >
                    Restore to book
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mergeBusy}
                    onClick={() => void queueSelectedForDeletion()}
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    className="text-xs border-orange-500/30 text-orange-100 hover:bg-orange-500/10"
                  >
                    Queue for deletion…
                  </Button>
                </>
              )}
              {selectedPendingDeletionCharacters.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={mergeBusy}
                  onClick={() => void restorePendingDeletion()}
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                  className="text-xs border-emerald-500/30 text-emerald-100 hover:bg-emerald-500/10"
                >
                  Back to archived
                </Button>
              )}
              {selectedPendingDeletionCharacters.length === 1 && selectedArchivedCharacters.length === 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={mergeBusy}
                  onClick={() => setShowDeleteConfirm(true)}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  className="text-xs text-red-300/80 hover:text-red-200 hover:bg-red-500/10"
                >
                  Delete permanently…
                </Button>
              )}
            </div>
          )}

          {showDeleteConfirm && selectedPendingDeletionCharacters.length === 1 && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 space-y-2">
              <p className="text-xs text-red-100/90">
                Final check — type{' '}
                <span className="font-mono">{selectedPendingDeletionCharacters[0].name}</span> to permanently delete
                this card. Facts stay in your lore; the card cannot be undone after this.
              </p>
              <input
                className="w-full rounded-md border border-red-500/20 bg-black/40 px-3 py-2 text-sm text-white"
                value={deleteConfirmName}
                onChange={event => setDeleteConfirmName(event.target.value)}
                placeholder={selectedPendingDeletionCharacters[0].name}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    mergeBusy ||
                    deleteConfirmName.trim() !== selectedPendingDeletionCharacters[0].name
                  }
                  onClick={() => void permanentlyDeleteSelected()}
                  className="bg-red-500/20 text-red-100 border border-red-500/30"
                >
                  Delete permanently
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {showHub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-neutral-950 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Consolidate characters</h3>
                <p className="text-xs text-white/50">
                  Choose the right action for duplicate or incorrect cards. Your cast stays unified in the database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHub(false)}
                className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-3">
                {protocolCards.map(card => (
                  <div key={card.title} className={`rounded-lg border p-3 ${card.tone}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <card.icon className="h-4 w-4" />
                      <p className="text-sm font-semibold">{card.title}</p>
                    </div>
                    <p className="text-[11px] text-white/70 mb-1">
                      <span className="font-medium text-white/85">When:</span> {card.when}
                    </p>
                    <p className="text-[11px] text-white/55">{card.effect}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/55 space-y-1">
                <p className="font-medium text-white/75">Recommended workflow</p>
                <p>1. Review auto-detected duplicate groups below and merge when they are clearly the same person.</p>
                <p>2. For odd cases, use Select cards on the book grid, then Keep [name] to merge or Archive selected.</p>
                <p>3. After any consolidation, Rescan conversations refreshes suggestions and can restore archived people.</p>
              </div>

              {mergeError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {mergeError}
                </div>
              )}

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Auto-detected duplicate groups</h4>
                {duplicateGroups.length === 0 ? (
                  <p className="text-sm text-white/55">No duplicate groups detected right now.</p>
                ) : (
                  duplicateGroups.map((group, index) => (
                    <div
                      key={`${group.canonical_name}-${index}`}
                      className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {group.match_type === 'exact'
                              ? 'Exact duplicate'
                              : group.match_type === 'alias'
                                ? 'Alias match'
                                : 'Review possible duplicate'}
                          </p>
                          <p className="text-xs text-white/45">
                            {group.canonical_name}
                            {typeof group.confidence === 'number'
                              ? ` · ${Math.round(group.confidence * 100)}% confidence`
                              : ''}
                            {group.reason ? ` · ${group.reason}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-white/35">
                          {group.characters.length} cards
                        </span>
                      </div>
                      <div className="grid gap-2">
                        {group.characters.map(character => (
                          <div
                            key={character.id}
                            className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-white">{character.name}</p>
                              <p className="text-xs text-white/45">
                                {(character.alias ?? []).length > 0
                                  ? `Aliases: ${(character.alias ?? []).join(', ')}`
                                  : 'No aliases'}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              disabled={mergeBusy || group.characters.length < 2 || isSelfCharacter(character)}
                              onClick={() => void mergeDuplicateGroup(group, character.id)}
                              leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                            >
                              Keep this
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowHub(false);
                  onSelectionModeChange(true);
                }}
              >
                Select cards manually
              </Button>
              <Button size="sm" onClick={() => setShowHub(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
