import { useCallback, useState } from 'react';

import { dispatchStoryDataUpdated } from '../../lib/storyRefresh';
import { fetchJson } from '../../lib/api';
import { useToast } from '../ui/toast';

import type { FamilyMember } from '../../types/socialRoles';
import type { RelationshipEdit } from './RelationshipEditor';

/**
 * Family-tree editing handlers, factored out of FamilyBook so the same
 * exclude / delete / keep / edit-relationship actions work anywhere a family tree
 * is shown — e.g. inside the character modal, "just like you can edit the ones
 * for the user". Backed by the same `/api/family-trees/member/:id/*` endpoints.
 */
export function useFamilyTreeEditing(opts: { enabled: boolean; onChanged?: () => void }) {
  const { enabled, onChanged } = opts;
  const [editorMember, setEditorMember] = useState<FamilyMember | null>(null);
  const { success, error: toastError, ToastContainer } = useToast();

  const refresh = useCallback(() => {
    dispatchStoryDataUpdated({ scopes: ['family', 'characters'] });
    onChanged?.();
  }, [onChanged]);

  const runEdit = useCallback(
    async (action: () => Promise<unknown>, okMessage: string, failMessage: string): Promise<boolean> => {
      try {
        await action();
        refresh();
        success(okMessage);
        return true;
      } catch (e) {
        const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
        toastError(`${failMessage}${detail}`);
        return false;
      }
    },
    [refresh, success, toastError],
  );

  const excludeMember = useCallback(
    (member: FamilyMember) =>
      runEdit(
        () =>
          fetchJson(`/api/family-trees/member/${member.id}/exclude`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'Removed from family tree by user' }),
          }),
        `Removed ${member.name} from the family tree`,
        `Couldn't remove ${member.name}`,
      ),
    [runEdit],
  );

  const deleteMember = useCallback(
    (member: FamilyMember) => {
      const ok =
        typeof window === 'undefined'
          ? true
          : window.confirm(`Delete "${member.name}" entirely? This removes the character and teaches LoreBook not to recreate it.`);
      if (!ok) return;
      void runEdit(
        () =>
          fetchJson(`/api/family-trees/member/${member.id}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: 'Not a real person (family tree)' }),
          }),
        `Deleted ${member.name}`,
        `Couldn't delete ${member.name}`,
      );
    },
    [runEdit],
  );

  /** Mis-filed collective (e.g. "popular e girls") → Groups & Organizations book. */
  const moveMemberToGroup = useCallback(
    (member: FamilyMember) => {
      const ok =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `Move "${member.name}" to Groups & Organizations? They leave the family tree and become a group card.`,
            );
      if (!ok) return;
      void runEdit(
        async () => {
          await fetchJson(`/api/characters/${member.id}/reclassify`, {
            method: 'POST',
            body: JSON.stringify({ targetDomain: 'organization' }),
          });
          dispatchStoryDataUpdated({ scopes: ['family', 'organizations', 'characters'] });
        },
        `Moved ${member.name} to Groups & Organizations`,
        `Couldn't move ${member.name} to Groups`,
      );
    },
    [runEdit],
  );

  const keepMember = useCallback(
    (member: FamilyMember) =>
      runEdit(
        () => fetchJson(`/api/family-trees/member/${member.id}/keep`, { method: 'POST', body: JSON.stringify({}) }),
        `Kept ${member.name} in the family`,
        `Couldn't update ${member.name}`,
      ),
    [runEdit],
  );

  const saveRelationship = useCallback(
    async (member: FamilyMember, edit: RelationshipEdit): Promise<void> => {
      await runEdit(
        () =>
          fetchJson(`/api/family-trees/member/${member.id}/relationship`, {
            method: 'PATCH',
            body: JSON.stringify(edit),
          }),
        `Updated ${member.name}'s relationship`,
        `Couldn't update ${member.name}'s relationship`,
      );
    },
    [runEdit],
  );

  /** Persist a drag-drop or tap-tap connect gesture. "parent" writes the
   *  target's existing relation unchanged plus connectsToId = the dragged-
   *  from person, fixing the structural line without touching their
   *  relation-to-you. "spouse" links them as partners via spouseId, same
   *  write path the relationship editor's married-to picker uses. */
  const connectMembers = useCallback(
    async (from: FamilyMember, to: FamilyMember, kind: 'parent' | 'spouse'): Promise<void> => {
      await runEdit(
        () =>
          kind === 'parent'
            ? fetchJson(`/api/family-trees/member/${to.id}/relationship`, {
                method: 'PATCH',
                body: JSON.stringify({ relation: to.relation, connectsToId: from.id }),
              })
            : fetchJson(`/api/family-trees/member/${to.id}/relationship`, {
                method: 'PATCH',
                body: JSON.stringify({ relation: to.relation, spouseId: from.id }),
              }),
        kind === 'parent' ? `Connected ${from.name} as ${to.name}'s parent` : `Linked ${from.name} and ${to.name} as partners`,
        `Couldn't connect ${from.name} and ${to.name}`,
      );
    },
    [runEdit],
  );

  const disconnectParent = useCallback(
    (member: FamilyMember) =>
      runEdit(
        () => fetchJson(`/api/family-trees/member/${member.id}/disconnect-parent`, { method: 'POST', body: JSON.stringify({}) }),
        `Disconnected ${member.name}`,
        `Couldn't disconnect ${member.name}`,
      ),
    [runEdit],
  );

  /** Persist a drag-to-reorder within one generation row. Silent on success —
   *  the row visibly settling into place is enough feedback; a toast per row
   *  saved would be noisy when the user rearranged more than one row. */
  const reorderRow = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      try {
        await fetchJson('/api/family-trees/reorder', {
          method: 'PATCH',
          body: JSON.stringify({ orderedIds }),
        });
        refresh();
      } catch (e) {
        const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
        toastError(`Couldn't save that order${detail}`);
      }
    },
    [refresh, toastError],
  );

  const editHandlers = enabled
    ? {
        onEditRelationship: (m: FamilyMember) => setEditorMember(m),
        onExclude: (m: FamilyMember) => void excludeMember(m),
        onMoveToGroup: (m: FamilyMember) => void moveMemberToGroup(m),
        onDelete: (m: FamilyMember) => void deleteMember(m),
        onKeep: (m: FamilyMember) => void keepMember(m),
        onReorderRow: reorderRow,
        onConnectMembers: connectMembers,
        onDisconnectParent: (m: FamilyMember) => void disconnectParent(m),
      }
    : {};

  return { editHandlers, editorMember, setEditorMember, saveRelationship, ToastContainer };
}
