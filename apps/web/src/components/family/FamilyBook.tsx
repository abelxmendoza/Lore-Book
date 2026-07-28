import { useCallback, useEffect, useMemo, useState } from 'react';
import { TreePine, Home, Users, BarChart3, Loader2, GitBranch, Check, X } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { booksApi, type PossibleFamilyMatch } from '../../api/books';
import { onStoryDataUpdated, dispatchStoryDataUpdated } from '../../lib/storyRefresh';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { DEMO_FAMILY_SUMMARY, DEMO_FAMILY_CHARACTERS_BY_ID } from '../../mocks/family';
import { FamilyTreePanel } from './FamilyTreePanel';
import { FamilyTreeCopyAllButton } from './FamilyTreeCopyAllButton';
import { HierarchicalFamilyTree } from './HierarchicalFamilyTree';
import { FamilyTreeView } from './FamilyTreeView';
import { HouseholdDirectory, type HouseholdDTO } from './HouseholdDirectory';
import { FamilyAnalyticsPanel, type RelationshipAnalyticDTO } from './FamilyAnalyticsPanel';
import { FamilyExtendedNetworkPanel } from './FamilyExtendedNetworkPanel';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { useToast } from '../ui/toast';
import { RelationshipEditor, type RelationshipEdit } from './RelationshipEditor';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';
import type { Character } from '../characters/CharacterProfileCard';
import type { FamilyQueryResponse, FamilyQueryResult } from '../../lib/api-contracts';
import { BookQueryPanel } from '../query/BookQueryPanel';

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
  const [familyQuery, setFamilyQuery] = useState('');
  const [familyQueryResult, setFamilyQueryResult] = useState<FamilyQueryResponse | null>(null);
  const [familyQueryLoading, setFamilyQueryLoading] = useState(false);
  const [familyQueryError, setFamilyQueryError] = useState<string | null>(null);
  const { success, error: toastError, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (shouldUseMock) {
      const base = DEMO_FAMILY_SUMMARY as SummaryResponse;
      setSummary(base);
      setDemoTree(base.tree);
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
  const visibleTree = useMemo(() => {
    if (!activeTree || !familyQueryResult) return activeTree;
    const ids = new Set(familyQueryResult.results.map((result) => result.characterId));
    return {
      ...activeTree,
      members: activeTree.members.filter((member) => member.is_self || ids.has(member.id)),
    };
  }, [activeTree, familyQueryResult]);

  const runDemoFamilyQuery = (query: string): FamilyQueryResponse => {
    const relationMap: Record<string, FamilyMember['relation']> = {
      mom: 'parent', mother: 'parent', dad: 'parent', father: 'parent', parent: 'parent',
      sister: 'sibling', brother: 'sibling', sibling: 'sibling', cousin: 'cousin',
      aunt: 'aunt', uncle: 'uncle', grandma: 'grandparent', grandpa: 'grandparent',
      grandparent: 'grandparent', child: 'child', daughter: 'child', son: 'child',
    };
    const relation = Object.entries(relationMap).find(([word]) =>
      new RegExp(`\\b${word}s?\\b`, 'i').test(query))?.[1];
    const side = /\bmaternal|mom'?s side\b/i.test(query)
      ? 'maternal'
      : /\bpaternal|dad'?s side\b/i.test(query)
        ? 'paternal'
        : undefined;
    const person = query.match(/\bhow is\s+(.+?)\s+related to me\??$/i)?.[1]?.trim();
    const wantsInferred = /\binferred|unconfirmed\b/i.test(query);
    const wantsReview = /\breview|uncertain|questionable\b/i.test(query);
    const household = (summary?.households ?? []).filter((item) =>
      /\bhousehold|who lives|residents?|head of household\b/i.test(query)
      && (!person || [...item.residents, ...item.visitors]
        .some((member) => member.name.toLowerCase().includes(person.toLowerCase())))
    );
    const analyticsById = new Map((summary?.analytics ?? []).map((item) => [item.characterId, item]));
    const results: FamilyQueryResult[] = (activeTree?.members ?? [])
      .filter((member) => !member.is_self)
      .filter((member) => !relation || member.relation === relation || (relation === 'sibling' && member.relation.includes('sibling')))
      .filter((member) => !side || member.side === side)
      .filter((member) => !person || member.name.toLowerCase().includes(person.toLowerCase()))
      .filter((member) => !wantsInferred || member.inference_status === 'inferred')
      .filter((member) => !wantsReview || member.needs_review)
      .map((member) => {
        const analytic = analyticsById.get(member.id);
        const householdNames = (summary?.households ?? [])
          .filter((item) => [...item.residents, ...item.visitors]
            .some((personItem) => personItem.characterId === member.id))
          .map((item) => item.name);
        return {
          characterId: member.id,
          name: member.name,
          relation: member.relation,
          relationLabel: member.relation_label,
          generation: member.generation,
          side: member.side ?? null,
          inferenceStatus: member.inference_status ?? null,
          closeness: member.closeness ?? null,
          confidence: member.inference_status === 'asserted' ? 0.95 : 0.8,
          evidenceCount: analytic?.evidenceCount ?? 0,
          mentionCount: analytic?.mentionCount ?? 0,
          trend: analytic?.trend ?? null,
          householdNames,
          hasCard: member.has_card !== false && !member.is_placeholder,
          needsReview: member.needs_review === true,
          matchedReasons: [
            relation && `Relationship: ${member.relation_label}`,
            side && `Branch: ${side}`,
            person && `Name matches ${person}`,
            wantsInferred && 'Status: inferred',
          ].filter(Boolean) as string[],
        };
      });
    const countFacet = (values: string[]) => [...new Set(values)]
      .map((value) => ({ value, count: values.filter((item) => item === value).length }));
    return {
      query,
      intent: household.length ? 'household' : relation ? 'kinship' : side ? 'branch' : wantsReview ? 'quality' : 'person',
      results,
      households: household.map((item) => ({
        householdId: item.id,
        name: item.name,
        locationName: item.locationName ?? null,
        headOfHousehold: item.headOfHousehold ?? null,
        residentCount: item.residentCount,
        matchedMemberNames: [...item.residents, ...item.visitors]
          .map((member) => member.name),
        confidence: item.confidence,
      })),
      total: results.length,
      limit: 100,
      offset: 0,
      facets: {
        relations: countFacet(results.map((item) => item.relation)),
        sides: countFacet(results.map((item) => item.side ?? '').filter(Boolean)),
        generations: countFacet(results.map((item) => String(item.generation))),
        inferenceStatuses: countFacet(results.map((item) => item.inferenceStatus ?? '').filter(Boolean)),
        trends: countFacet(results.map((item) => item.trend ?? '').filter(Boolean)),
      },
      warnings: [],
    };
  };

  const submitFamilyQuery = async () => {
    const query = familyQuery.trim();
    if (!query) return;
    setFamilyQueryLoading(true);
    setFamilyQueryError(null);
    try {
      const result = shouldUseMock
        ? runDemoFamilyQuery(query)
        : (await fetchJson<{ success: boolean; result: FamilyQueryResponse }>('/api/family/query', {
            method: 'POST',
            body: JSON.stringify({ query, limit: 100, includeFacets: true }),
          })).result;
      setFamilyQueryResult(result);
      if (result.households.length && result.results.length === 0) setTab('households');
      else setTab('tree');
    } catch (queryError) {
      setFamilyQueryError(queryError instanceof Error ? queryError.message : 'Could not query your family right now.');
    } finally {
      setFamilyQueryLoading(false);
    }
  };

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
          dispatchStoryDataUpdated({ scopes: ['family'] });
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
    dispatchStoryDataUpdated({ scopes: ['family'] });
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

  // Demo mode: local editing on the mock tree (no API calls)
  const mockEditHandlers = shouldUseMock ? {
    onEditRelationship: (m: FamilyMember) => setEditorMember(m),
    onExclude: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(`Removed ${m.name} (demo)`);
    },
    onDelete: (m: FamilyMember) => {
      const ok = typeof window === 'undefined' ? true : window.confirm(`Delete "${m.name}" in demo?`);
      if (!ok || !demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
      success(`Deleted ${m.name} (demo)`);
    },
    onMoveToGroup: (m: FamilyMember) => {
      if (!demoTree) return;
      const updatedMembers = demoTree.members.filter(mem => mem.id !== m.id);
      const updatedTree = { ...demoTree, members: updatedMembers };
      setDemoTree(updatedTree);
      if (summary) setSummary({ ...summary, tree: updatedTree });
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
  } : {};

  const editHandlers = shouldUseMock
    ? mockEditHandlers
    : {
        onEditRelationship: (m: FamilyMember) => setEditorMember(m),
        onExclude: (m: FamilyMember) => void excludeMember(m),
        onMoveToGroup: (m: FamilyMember) => void moveMemberToGroup(m),
        onDelete: (m: FamilyMember) => void deleteMember(m),
        onKeep: (m: FamilyMember) => void keepMember(m),
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
        <h1 className="text-2xl sm:text-3xl font-semibold text-white flex items-center gap-3">
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

      <BookQueryPanel
        demoMode={shouldUseMock}
        domains={['family']}
        title="Ask your Family & Family Tree"
        description="Search relatives, branches, generations, households, evidence, closeness, or records needing review."
        placeholder='Try “Show my maternal cousins” or “Who lives in the Solenne House?”'
        inputAriaLabel="Ask your Family and Family Tree"
        submitLabel="Ask Family"
        resultNoun="relative"
        compact
        controller={{
          query: familyQuery,
          onQueryChange: setFamilyQuery,
          onSubmit: submitFamilyQuery,
          onClear: () => {
            setFamilyQuery('');
            setFamilyQueryResult(null);
            setFamilyQueryError(null);
          },
          loading: familyQueryLoading,
          error: familyQueryError,
          total: familyQueryResult?.total,
          results: familyQueryResult?.results.map((result) => ({
            id: result.characterId,
            title: result.name,
            status: result.needsReview ? 'needs_review' : result.inferenceStatus,
            reason: result.matchedReasons[0] ?? result.relationLabel,
          })),
          warnings: familyQueryResult?.warnings,
        }}
        onSelectResult={(result) => void openCharacter(result.id, result.title)}
      />

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
                    tree={visibleTree}
                    title="Your family tree"
                    filters={[`view=${viewMode}`, shouldUseMock ? 'mode=demo' : 'mode=live']}
                    size="md"
                    data-testid="family-book-copy-all"
                  />
                </div>
              </div>
              {viewMode === 'hierarchical' && visibleTree?.members?.length ? (
                <HierarchicalFamilyTree
                  tree={visibleTree}
                  onMemberClick={(m) => void openCharacter(m.id, m.name)}
                />
              ) : viewMode === 'visual' && shouldUseMock && visibleTree?.members?.length ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <FamilyTreeView
                    tree={visibleTree}
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
              households={summary?.households ?? []}
              onMemberClick={(id, name) => void openCharacter(id, name)}
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
          onUpdate={() => void load()}
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
