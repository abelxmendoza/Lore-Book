import { useCallback, useEffect, useMemo, useState } from 'react';
import { TreePine, Home, Users, BarChart3, Loader2, GitBranch, Check, X } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { booksApi, type PossibleFamilyMatch } from '../../api/books';
import { onStoryDataUpdated, dispatchStoryDataUpdated } from '../../lib/storyRefresh';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { DEMO_FAMILY_SUMMARY, DEMO_FAMILY_CHARACTERS_BY_ID } from '../../mocks/family';
import { mockDataService } from '../../services/mockDataService';
import { FamilyTreePanel } from './FamilyTreePanel';
import { FamilyTreeCopyAllButton } from './FamilyTreeCopyAllButton';
import { HierarchicalFamilyTree } from './HierarchicalFamilyTree';
import { FamilyTreeView } from './FamilyTreeView';
import { filterHouseholdsToListedFamily, HouseholdDirectory, type HouseholdDTO } from './HouseholdDirectory';
import { FamilyAnalyticsPanel, type RelationshipAnalyticDTO } from './FamilyAnalyticsPanel';
import { FamilyExtendedNetworkPanel } from './FamilyExtendedNetworkPanel';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { useToast } from '../ui/toast';
import { RelationshipEditor, type RelationshipEdit } from './RelationshipEditor';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';
import type { Character } from '../characters/CharacterProfileCard';

type Tab = 'tree' | 'households' | 'groups' | 'analytics' | 'extended';

type SummaryResponse = {
  success: boolean;
  tree: FamilyTree;
  households: HouseholdDTO[];
  familyGroups: Array<{ id: string; name: string; metadata?: Record<string, unknown> }>;
  analytics: RelationshipAnalyticDTO[];
  possibleFamilyMatches?: PossibleFamilyMatch[];
};

export function FamilyBook() {
  const shouldUseMock = useShouldUseMockData();
  const [tab, setTab] = useState<Tab>('tree');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [demoTree, setDemoTree] = useState<FamilyTree | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [viewMode, setViewMode] = useState<'hierarchical' | 'visual'>('visual');
  const [editorMember, setEditorMember] = useState<FamilyMember | null>(null);
  const { success, error: toastError, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (shouldUseMock) {
      const base = DEMO_FAMILY_SUMMARY as SummaryResponse;
      setSummary((prev) => prev ?? base);
      setDemoTree((prev) => prev ?? base.tree);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await booksApi.loadFamily();
      if (data.tree) setSummary({ success: true, ...data } as unknown as SummaryResponse);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [shouldUseMock]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'family'), [load]);

  const activeTree = demoTree || summary?.tree || null;

  const familyCandidates = useMemo(
    () =>
      (activeTree?.members ?? [])
        .filter((m) => m.id && !m.is_placeholder && !String(m.id).startsWith('__') && !String(m.id).startsWith('head-'))
        .map((m) => ({ id: m.id, name: m.name, relationLabel: m.relation_label || m.kinship_title })),
    [activeTree],
  );

  const visibleHouseholds = useMemo(
    () => filterHouseholdsToListedFamily(summary?.households ?? [], familyCandidates.map((c) => c.id)),
    [summary?.households, familyCandidates],
  );

  const patchDemoHouseholds = useCallback((updater: (prev: HouseholdDTO[]) => HouseholdDTO[]) => {
    setSummary((prev) => (prev ? { ...prev, households: updater(prev.households ?? []) } : prev));
  }, []);

  const dropDemoFamilyIds = useCallback((ids: Iterable<string>) => {
    const dropped = new Set([...ids].filter(Boolean));
    if (dropped.size === 0) return;
    setDemoTree((prev) => (prev ? { ...prev, members: prev.members.filter((m) => !dropped.has(m.id)) } : prev));
    setSummary((prev) => {
      if (!prev) return prev;
      const members = (prev.tree?.members ?? []).filter((m) => !dropped.has(m.id));
      return {
        ...prev,
        tree: { ...prev.tree, members },
        households: filterHouseholdsToListedFamily(prev.households ?? [], members.map((m) => m.id)),
      };
    });
  }, []);

  const openCharacter = async (characterId: string, name: string) => {
    if (characterId.startsWith('head-') || characterId.startsWith('group-') || characterId.startsWith('__')) return;

    if (shouldUseMock) {
      const mockCharacter = DEMO_FAMILY_CHARACTERS_BY_ID[characterId];
      setSelectedCharacter(
        mockCharacter ?? ({ id: characterId, name, user_id: '', status: 'active' } as Character)
      );
      return;
    }

    try {
      const r = await fetchJson<{ character?: Character }>(`/api/characters/${characterId}`);
      if (r.character) {
        setSelectedCharacter(r.character);
        return;
      }
      // No saved card for this node — create + link one on demand so every node
      // resolves to a real character, then open it (not an ephemeral stub).
      const ensured = await fetchJson<{ success: boolean; character?: Character; created?: boolean }>(
        `/api/family-trees/member/${characterId}/ensure-card`,
        { method: 'POST', body: JSON.stringify({ name }) },
      );
      if (ensured.character) {
        setSelectedCharacter(ensured.character);
        if (ensured.created) {
          dispatchStoryDataUpdated({ scopes: ['family', 'characters'] });
          void load();
        }
      } else {
        setSelectedCharacter({ id: characterId, name, user_id: '', status: 'active' } as Character);
      }
    } catch {
      setSelectedCharacter({ id: characterId, name, user_id: '', status: 'active' } as Character);
    }
  };

  // ── Manual tree edits (real accounts only) ─────────────────────────────────
  const refreshFamily = useCallback(() => {
    dispatchStoryDataUpdated({ scopes: ['family', 'characters'] });
    void load();
  }, [load]);

  // Run a mutation, surface success/failure to the user, and only refresh on
  // success. Errors used to be swallowed (.catch(() => {})), which made a
  // failed delete look like nothing happened.
  const runEdit = useCallback(async (
    action: () => Promise<unknown>,
    okMessage: string,
    failMessage: string,
  ): Promise<boolean> => {
    try {
      await action();
      refreshFamily();
      success(okMessage);
      return true;
    } catch (e) {
      const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
      toastError(`${failMessage}${detail}`);
      return false;
    }
  }, [refreshFamily, success, toastError]);

  const excludeMember = useCallback((member: FamilyMember) =>
    runEdit(
      () => fetchJson(`/api/family-trees/member/${member.id}/exclude`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Removed from family tree by user' }),
      }),
      `Removed ${member.name} from your family tree`,
      `Couldn't remove ${member.name}`,
    ), [runEdit]);

  const deleteMember = useCallback((member: FamilyMember) => {
    const ok = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete "${member.name}" entirely? This removes the character and teaches LoreBook not to recreate it.`);
    if (!ok) return;
    void runEdit(
      () => fetchJson(`/api/family-trees/member/${member.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Not a real person (family tree)' }),
      }),
      `Deleted ${member.name}`,
      `Couldn't delete ${member.name}`,
    );
  }, [runEdit]);

  const moveMemberToGroup = useCallback((member: FamilyMember) => {
    const ok = typeof window === 'undefined'
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
  }, [runEdit]);

  const keepMember = useCallback((member: FamilyMember) =>
    runEdit(
      () => fetchJson(`/api/family-trees/member/${member.id}/keep`, { method: 'POST', body: JSON.stringify({}) }),
      `Kept ${member.name} in your family`,
      `Couldn't update ${member.name}`,
    ), [runEdit]);

  const connectMembers = useCallback(
    (from: FamilyMember, to: FamilyMember, kind: 'parent' | 'spouse') =>
      runEdit(
        () =>
          fetchJson(`/api/family-trees/member/${to.id}/relationship`, {
            method: 'PATCH',
            body: JSON.stringify(
              kind === 'parent'
                ? { relation: to.relation, connectsToId: from.id }
                : { relation: to.relation, spouseId: from.id },
            ),
          }),
        kind === 'parent'
          ? `Connected ${from.name} as ${to.name}'s parent`
          : `Linked ${from.name} and ${to.name} as partners`,
        `Couldn't connect ${from.name} and ${to.name}`,
      ),
    [runEdit],
  );

  const disconnectParent = useCallback((member: FamilyMember) =>
    runEdit(
      () => fetchJson(`/api/family-trees/member/${member.id}/disconnect-parent`, { method: 'POST', body: JSON.stringify({}) }),
      `Disconnected ${member.name}`,
      `Couldn't disconnect ${member.name}`,
    ), [runEdit]);

  // ── Household edits ─────────────────────────────────────────────────────
  const createHousehold = useCallback((name: string, locationName?: string) =>
    runEdit(
      () => fetchJson('/api/family/household', { method: 'POST', body: JSON.stringify({ name, locationName }) }),
      `Created the ${name} household`,
      `Couldn't create ${name}`,
    ), [runEdit]);

  const addHouseholdMember = useCallback((householdId: string, characterName: string, reason?: string, characterId?: string) =>
    runEdit(
      () => fetchJson(`/api/family/household/${householdId}/members`, {
        method: 'POST',
        body: JSON.stringify({ characterName, characterId, reason }),
      }),
      `Added ${characterName} to the household`,
      `Couldn't add ${characterName}`,
    ), [runEdit]);

  const removeHouseholdMember = useCallback((householdId: string, characterId: string, characterName: string, reason?: string) =>
    runEdit(
      () => fetchJson(`/api/family/household/${householdId}/members/${characterId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      }),
      `Removed ${characterName} from the household`,
      `Couldn't remove ${characterName}`,
    ), [runEdit]);

  const moveHousehold = useCallback((householdId: string, locationName: string, reason?: string) =>
    runEdit(
      () => fetchJson(`/api/family/household/${householdId}/location`, {
        method: 'PATCH',
        body: JSON.stringify({ locationName, reason }),
      }),
      `Moved the household to ${locationName}`,
      `Couldn't move the household`,
    ), [runEdit]);

  const deleteHousehold = useCallback((householdId: string, householdName: string, reason: string) =>
    runEdit(
      () => fetchJson(`/api/family/household/${householdId}`, { method: 'DELETE', body: JSON.stringify({ reason }) }),
      `Deleted the ${householdName} household`,
      `Couldn't delete ${householdName}`,
    ), [runEdit]);

  const updateHousehold = useCallback((householdId: string, patch: { name?: string; locationName?: string; reason?: string }) =>
    runEdit(
      () => fetchJson(`/api/family/household/${householdId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      'Updated the household',
      "Couldn't update the household",
    ), [runEdit]);

  const mergeHouseholds = useCallback((primaryId: string, sourceId: string, reason?: string) =>
    runEdit(
      () => fetchJson('/api/family/household/merge', { method: 'POST', body: JSON.stringify({ primaryId, sourceId, reason }) }),
      'Merged households',
      "Couldn't merge those households",
    ), [runEdit]);

  const fetchHouseholdHistory = useCallback(async (householdId: string) => {
    try {
      const r = await fetchJson<{ history?: unknown[] }>(`/api/family/household/${householdId}/history`);
      return (r.history ?? []) as import('./HouseholdDirectory').HouseholdHistoryEntry[];
    } catch {
      return [];
    }
  }, []);

  const confirmFamilyMatch = useCallback((match: PossibleFamilyMatch) =>
    runEdit(
      () => fetchJson(`/api/relationships/character-links/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ relationship_type: 'family', status: 'active' }),
      }),
      `Connected ${match.characterAName} and ${match.characterBName} as family`,
      `Couldn't confirm this match`,
    ), [runEdit]);

  const dismissFamilyMatch = useCallback((match: PossibleFamilyMatch) =>
    runEdit(
      () => fetchJson(`/api/relationships/character-links/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      }),
      `Dismissed suggestion`,
      `Couldn't dismiss this match`,
    ), [runEdit]);

  const saveRelationship = useCallback(async (member: FamilyMember, edit: RelationshipEdit): Promise<void> => {
    if (shouldUseMock && demoTree) {
      const updatedMembers = demoTree.members.map(mem =>
        mem.id === member.id
          ? { ...mem, relation: edit.relation as FamilyMember['relation'], side: edit.side || undefined, parent_id: edit.connectsToId || undefined }
          : mem
      );
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(`Updated ${member.name}'s relationship (demo)`);
      setEditorMember(null);
      return;
    }
    await runEdit(
      () => fetchJson(`/api/family-trees/member/${member.id}/relationship`, {
        method: 'PATCH',
        body: JSON.stringify(edit),
      }),
      `Updated ${member.name}'s relationship`,
      `Couldn't update ${member.name}'s relationship`,
    );
  }, [runEdit, shouldUseMock, demoTree, summary, success]);

  const reorderRow = useCallback(async (orderedIds: string[]): Promise<void> => {
    try {
      await fetchJson('/api/family-trees/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      });
      refreshFamily();
    } catch (e) {
      const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
      toastError(`Couldn't save that order${detail}`);
    }
  }, [refreshFamily, toastError]);

  // Demo mode: local editing on the mock tree (no API calls)
  const mockEditHandlers = shouldUseMock ? {
    onEditRelationship: (m: FamilyMember) => setEditorMember(m),
    onExclude: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) {
        setSummary({
          ...summary,
          tree: updatedTree,
          households: filterHouseholdsToListedFamily(summary.households ?? [], updatedMembers.map((mem) => mem.id)),
        });
      }
      success(`Removed ${m.name} (demo)`);
    },
    onDelete: (m: FamilyMember) => {
      const ok = typeof window === 'undefined' ? true : window.confirm(`Delete "${m.name}" in demo?`);
      if (!ok || !demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) {
        setSummary({
          ...summary,
          tree: updatedTree,
          households: filterHouseholdsToListedFamily(summary.households ?? [], updatedMembers.map((mem) => mem.id)),
        });
      }
      success(`Deleted ${m.name} (demo)`);
    },
    onMoveToGroup: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) {
        setSummary({
          ...summary,
          tree: updatedTree,
          households: filterHouseholdsToListedFamily(summary.households ?? [], updatedMembers.map((mem) => mem.id)),
        });
      }
      success(`Moved ${m.name} to Groups (demo)`);
    },
    onKeep: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.map(mem =>
        mem.id === m.id ? { ...mem, inference_status: 'asserted' as const } : mem
      );
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(`Kept ${m.name} (demo)`);
    },
    onReorderRow: (orderedIds: string[]) => {
      if (!demoTree) return;
      const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
      const updatedMembers = [...demoTree.members].sort((a, b) => {
        const ai = orderIndex.get(a.id);
        const bi = orderIndex.get(b.id);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return 0;
      });
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
    },
    onConnectMembers: (from: FamilyMember, to: FamilyMember, kind: 'parent' | 'spouse') => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.map((mem) => {
        if (mem.id !== to.id) return mem;
        if (kind === 'parent') {
          return { ...mem, parent_id: from.id, disconnected_parent: undefined };
        }
        return { ...mem, paired_with_id: from.id };
      });
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(
        kind === 'parent'
          ? `Connected ${from.name} as ${to.name}'s parent (demo)`
          : `Linked ${from.name} and ${to.name} as partners (demo)`,
      );
    },
    onDisconnectParent: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.map((mem) =>
        mem.id === m.id ? { ...mem, parent_id: undefined, disconnected_parent: true } : mem,
      );
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(`Disconnected ${m.name} (demo)`);
    },
  } : {};

  const editHandlers = shouldUseMock
    ? mockEditHandlers
    : {
        onEditRelationship: (m: FamilyMember) => setEditorMember(m),
        onExclude: (m: FamilyMember) => void excludeMember(m),
        onMoveToGroup: (m: FamilyMember) => void moveMemberToGroup(m),
        onDelete: (m: FamilyMember) => void deleteMember(m),
        onReorderRow: reorderRow,
        onKeep: (m: FamilyMember) => void keepMember(m),
        onConnectMembers: connectMembers,
        onDisconnectParent: (m: FamilyMember) => void disconnectParent(m),
      };

  const tabs: Array<{ key: Tab; label: string; icon: typeof TreePine }> = [
    { key: 'tree', label: 'Family Tree', icon: TreePine },
    { key: 'households', label: 'Households', icon: Home },
    { key: 'groups', label: 'Family Groups', icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'extended', label: 'Extended family', icon: GitBranch },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white flex flex-wrap items-center gap-3">
          <TreePine className="h-7 w-7 text-emerald-400" />
          Family
          {shouldUseMock && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-200">
              Demo mode
            </span>
          )}
        </h1>
        <p className="text-sm text-white/55 max-w-2xl">
          Living family graphs inferred from your conversations — trees, households, groups, and relationship strength.
        </p>
      </header>

      {!!summary?.possibleFamilyMatches?.length && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-white/70 flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-400" />
            Possible Family Matches
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {summary.possibleFamilyMatches.map((match) => (
              <article
                key={match.id}
                className="rounded-xl border border-amber-500/25 bg-amber-950/10 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {match.characterAName} &amp; {match.characterBName}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Both share the last name &quot;{match.sharedLastName}&quot; — possibly related
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => void confirmFamilyMatch(match)}
                    aria-label={`Confirm ${match.characterAName} and ${match.characterBName} as family`}
                    className="p-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void dismissFamilyMatch(match)}
                    aria-label={`Dismiss possible match between ${match.characterAName} and ${match.characterBName}`}
                    className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
              tab === key
                ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                : 'text-white/55 hover:text-white/80 hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading family graph…
        </div>
      ) : (
        <>
          {tab === 'tree' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('visual')}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${viewMode === 'visual' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/50'}`}
                >
                  Visual graph
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('hierarchical')}
                  className={`text-xs px-3 py-1.5 rounded-lg border ${viewMode === 'hierarchical' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-white/10 text-white/50'}`}
                >
                  Tree view
                </button>
                <div className="ml-auto">
                  <FamilyTreeCopyAllButton
                    tree={activeTree}
                    title="Your family tree"
                    filters={[`view=${viewMode}`, shouldUseMock ? 'mode=demo' : 'mode=live']}
                    size="md"
                    data-testid="family-book-copy-all"
                  />
                </div>
              </div>
              {viewMode === 'hierarchical' && activeTree?.members?.length ? (
                <HierarchicalFamilyTree
                  tree={activeTree}
                  onMemberClick={(m) => void openCharacter(m.id, m.name)}
                />
              ) : viewMode === 'visual' && shouldUseMock && activeTree?.members?.length ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <FamilyTreeView
                    tree={activeTree}
                    onMemberClick={(m) => void openCharacter(m.id, m.name)}
                    {...editHandlers}
                  />
                </div>
              ) : (
                <FamilyTreePanel
                  scope="mine"
                  title="Your family tree"
                  hint="Mention relatives in chat — LoreBook builds your tree automatically."
                  onMemberClick={(id, name) => void openCharacter(id, name)}
                  {...editHandlers}
                />
              )}
            </div>
          )}

          {tab === 'households' && (
            <HouseholdDirectory
              households={visibleHouseholds}
              familyCandidates={familyCandidates}
              onMemberClick={(id, name) => void openCharacter(id, name)}
              onCreateHousehold={shouldUseMock
                ? (name, locationName) => {
                    patchDemoHouseholds((hs) => [
                      ...hs,
                      {
                        id: `demo-hh-${Date.now()}`,
                        name,
                        locationName: locationName || name,
                        residents: [],
                        visitors: [],
                        residentCount: 0,
                        confidence: 1,
                      },
                    ]);
                    success(`Created the ${name} household`);
                  }
                : (name, locationName) => void createHousehold(name, locationName)}
              onUpdateHousehold={shouldUseMock
                ? (id, patch) => {
                    patchDemoHouseholds((hs) => hs.map((h) => (
                      h.id === id
                        ? { ...h, name: patch.name?.trim() || h.name, locationName: patch.locationName?.trim() || h.locationName }
                        : h
                    )));
                    success('Updated the household');
                  }
                : (id, patch) => void updateHousehold(id, patch)}
              onAddMember={shouldUseMock
                ? (id, name, _reason, characterId) => {
                    if (!characterId) return;
                    patchDemoHouseholds((hs) => hs.map((h) => {
                      if (h.id !== id) return h;
                      if (h.residents.some((m) => m.characterId === characterId) || h.visitors.some((m) => m.characterId === characterId)) {
                        return h;
                      }
                      const residents = [...h.residents, { characterId, name, householdRole: 'resident', confidence: 1 }];
                      return { ...h, residents, residentCount: residents.length };
                    }));
                    success(`Added ${name} to the household`);
                  }
                : (id, name, reason, characterId) => void addHouseholdMember(id, name, reason, characterId)}
              onRemoveMember={shouldUseMock
                ? (hid, cid, name) => {
                    patchDemoHouseholds((hs) => hs.map((h) => {
                      if (h.id !== hid) return h;
                      const residents = h.residents.filter((m) => m.characterId !== cid);
                      const visitors = h.visitors.filter((m) => m.characterId !== cid);
                      return {
                        ...h,
                        residents,
                        visitors,
                        residentCount: residents.length,
                        headOfHousehold: h.headOfHousehold === name ? undefined : h.headOfHousehold,
                      };
                    }));
                    success(`Removed ${name} from the household`);
                  }
                : (hid, cid, name, reason) => void removeHouseholdMember(hid, cid, name, reason)}
              onMoveHousehold={shouldUseMock
                ? (id, loc) => {
                    patchDemoHouseholds((hs) => hs.map((h) => (h.id === id ? { ...h, locationName: loc } : h)));
                    success(`Moved the household to ${loc}`);
                  }
                : (id, loc, reason) => void moveHousehold(id, loc, reason)}
              onDeleteHousehold={shouldUseMock
                ? (id, name) => {
                    patchDemoHouseholds((hs) => hs.filter((h) => h.id !== id));
                    success(`Deleted the ${name} household`);
                  }
                : (id, name, reason) => void deleteHousehold(id, name, reason)}
              onMergeHouseholds={shouldUseMock
                ? (primaryId, sourceId) => {
                    patchDemoHouseholds((hs) => {
                      const source = hs.find((h) => h.id === sourceId);
                      if (!source) return hs;
                      return hs.filter((h) => h.id !== sourceId).map((h) => {
                        if (h.id !== primaryId) return h;
                        const existing = new Set([...h.residents, ...h.visitors].map((m) => m.characterId));
                        const extraResidents = source.residents.filter((m) => !existing.has(m.characterId));
                        const extraVisitors = source.visitors.filter(
                          (m) => !existing.has(m.characterId) && !extraResidents.some((r) => r.characterId === m.characterId),
                        );
                        const residents = [...h.residents, ...extraResidents];
                        return { ...h, residents, visitors: [...h.visitors, ...extraVisitors], residentCount: residents.length };
                      });
                    });
                    success('Merged households');
                  }
                : (primaryId, sourceId, reason) => void mergeHouseholds(primaryId, sourceId, reason)}
              onFetchHistory={shouldUseMock ? async () => [] : fetchHouseholdHistory}
            />
          )}

          {tab === 'groups' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(summary?.familyGroups ?? []).length === 0 ? (
                <p className="text-sm text-white/45 col-span-2 py-8 text-center">
                  Family groups form when multiple relatives appear together in chat.
                </p>
              ) : (
                summary!.familyGroups.map((g) => (
                  <article
                    key={g.id}
                    className="rounded-xl border border-purple-500/25 bg-purple-950/20 p-4"
                  >
                    <h3 className="font-medium text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-400" />
                      {g.name}
                    </h3>
                    <p className="text-xs text-white/40 mt-2">Inferred from kinship co-mentions</p>
                    {!!g.metadata && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(g.metadata).map(([k, v]) => (
                          <span
                            key={`${g.id}-${k}`}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-purple-400/20 bg-purple-500/10 text-purple-200/80"
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <FamilyAnalyticsPanel
              analytics={summary?.analytics ?? []}
              onMemberClick={(id, name) => void openCharacter(id, name)}
            />
          )}

          {tab === 'extended' && (
            <FamilyExtendedNetworkPanel
              onMemberClick={(id, name) => void openCharacter(id, name)}
            />
          )}
        </>
      )}

      {selectedCharacter && (
        <CharacterDetailModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onUpdate={() => {
            if (shouldUseMock) {
              dropDemoFamilyIds(
                mockDataService.get.characters()
                  .filter((c) => c.status === 'archived' || c.status === 'pending_deletion' || c.status === 'reclassified')
                  .map((c) => c.id),
              );
              return;
            }
            void load();
          }}
        />
      )}

      {editorMember && (
        <RelationshipEditor
          member={editorMember}
          members={summary?.tree?.members ?? []}
          onSave={(edit) => saveRelationship(editorMember, edit)}
          onClose={() => setEditorMember(null)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
