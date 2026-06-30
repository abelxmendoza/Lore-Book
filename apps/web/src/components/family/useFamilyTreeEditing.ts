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
    dispatchStoryDataUpdated({ scopes: ['family'] });
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

  const editHandlers = enabled
    ? {
        onEditRelationship: (m: FamilyMember) => setEditorMember(m),
        onExclude: (m: FamilyMember) => void excludeMember(m),
        onDelete: (m: FamilyMember) => void deleteMember(m),
        onKeep: (m: FamilyMember) => void keepMember(m),
      }
    : {};

  return { editHandlers, editorMember, setEditorMember, saveRelationship, ToastContainer };
}
