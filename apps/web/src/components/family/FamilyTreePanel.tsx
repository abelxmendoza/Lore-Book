import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, RefreshCw, TreePine } from 'lucide-react';
import { Button } from '../ui/button';
import { FamilyTreeView } from '../family/FamilyTreeView';
import { fetchJson } from '../../lib/api';
import { fetchCharacterList } from '../../api/characterList';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { createMockUserFamilyTree, createMockFamilyTreeForCharacter } from '../family/FamilyTreeView';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';
import type { Organization } from '../organizations/OrganizationProfileCard';
import type { Character } from '../characters/CharacterProfileCard';

type Scope = 'mine' | 'character' | 'organization';

const FAMILY_RELATION_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'step_parent', label: 'Step-parent' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'child', label: 'Child' },
  { value: 'step_child', label: 'Step-child' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'half_sibling', label: 'Half-sibling' },
  { value: 'step_sibling', label: 'Step-sibling' },
  { value: 'aunt', label: 'Aunt' },
  { value: 'uncle', label: 'Uncle' },
  { value: 'niece', label: 'Niece' },
  { value: 'nephew', label: 'Nephew' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'in_law', label: 'In-law' },
  { value: 'related', label: 'Other relative' },
] as const;

const FAMILY_SIDE_OPTIONS = [
  { value: '', label: 'Side unknown' },
  { value: 'maternal', label: "Mother's side" },
  { value: 'paternal', label: "Father's side" },
  { value: 'both', label: 'Both sides' },
  { value: 'other', label: 'Other side' },
] as const;

interface FamilyTreePanelProps {
  scope: Scope;
  entityId?: string;
  title?: string;
  hint?: string;
  compact?: boolean;
  refreshKey?: number;
  onMemberClick?: (memberId: string, memberName: string) => void;
  onEditRelationship?: (member: FamilyMember) => void;
  onExclude?: (member: FamilyMember) => void;
  onDelete?: (member: FamilyMember) => void;
  onKeep?: (member: FamilyMember) => void;
}

export const FamilyTreePanel = ({
  scope,
  entityId,
  title,
  hint,
  compact,
  refreshKey = 0,
  onMemberClick,
  onEditRelationship,
  onExclude,
  onDelete,
  onKeep,
}: FamilyTreePanelProps) => {
  const shouldUseMock = useShouldUseMockData();
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [characterOptions, setCharacterOptions] = useState<Character[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedRelation, setSelectedRelation] = useState('parent');
  const [selectedSide, setSelectedSide] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const endpoint = scope === 'mine'
    ? '/api/family-trees/mine'
    : scope === 'organization'
      ? `/api/family-trees/organization/${entityId}`
      : `/api/family-trees/character/${entityId}`;

  const load = useCallback(async () => {
    if (scope !== 'mine' && !entityId) return;
    if (shouldUseMock) {
      const mock = scope === 'mine'
        ? createMockUserFamilyTree()
        : createMockFamilyTreeForCharacter('') || createMockUserFamilyTree();
      setTree(mock);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetchJson<{ success: boolean; tree: FamilyTree }>(endpoint);
      if (r.success) setTree(r.tree);
    } catch {
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [endpoint, scope, entityId, shouldUseMock]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    return onStoryDataUpdated(() => { void load(); }, 'family');
  }, [load]);

  const rebuild = async () => {
    if (scope !== 'character' || !entityId) return;
    setRebuilding(true);
    try {
      const r = await fetchJson<{ success: boolean; tree: FamilyTree }>(
        `/api/family-trees/character/${entityId}/rebuild`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (r.success) setTree(r.tree);
    } finally {
      setRebuilding(false);
    }
  };

  const loadCharacterOptions = async () => {
    if (charactersLoading || characterOptions.length > 0) return;
    setCharactersLoading(true);
    setAddError(null);
    try {
      const list = await fetchCharacterList<Character>();
      setCharacterOptions(list.filter((item) => item.status !== 'archived'));
    } catch (error) {
      console.error('Failed to load characters for family tree:', error);
      setAddError('Could not load character cards.');
    } finally {
      setCharactersLoading(false);
    }
  };

  const toggleAdd = async () => {
    const next = !addOpen;
    setAddOpen(next);
    if (next) await loadCharacterOptions();
  };

  const addExistingCharacter = async () => {
    if (!selectedCharacterId) return;
    setAdding(true);
    setAddError(null);
    try {
      if (scope === 'character' && entityId) {
        await fetchJson(`/api/family-trees/${entityId}/members`, {
          method: 'POST',
          body: JSON.stringify({
            characterId: selectedCharacterId,
            relation: selectedRelation,
            side: selectedSide || undefined,
          }),
        });
      } else {
        await fetchJson(`/api/family-trees/member/${selectedCharacterId}/relationship`, {
          method: 'PATCH',
          body: JSON.stringify({
            relation: selectedRelation,
            side: selectedSide || undefined,
          }),
        });
      }
      setSelectedCharacterId('');
      setSelectedRelation('parent');
      setSelectedSide('');
      setAddOpen(false);
      await load();
    } catch (error) {
      console.error('Failed to add existing character to family tree:', error);
      setAddError(error instanceof Error ? error.message : 'Could not add family member.');
    } finally {
      setAdding(false);
    }
  };

  const existingMemberIds = new Set((tree?.members ?? []).map((member) => member.id));
  const availableCharacterOptions = characterOptions.filter(
    (option) => !existingMemberIds.has(option.id) && option.id !== entityId
  );
  const canManuallyAdd = scope !== 'organization';

  const manualAddPanel = canManuallyAdd ? (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-white/80">Add existing person</p>
          <p className="text-[10px] text-white/35">Use a character card already in your People book.</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-white/55" onClick={() => void toggleAdd()}>
          <Plus className="h-3.5 w-3.5" />
          <span className="ml-1.5">{addOpen ? 'Close' : 'Add'}</span>
        </Button>
      </div>
      {addOpen && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={selectedCharacterId}
            onChange={(e) => setSelectedCharacterId(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-emerald-400/60 focus:outline-none"
            disabled={charactersLoading}
            aria-label="Existing character"
          >
            <option value="">{charactersLoading ? 'Loading...' : 'Select person'}</option>
            {availableCharacterOptions.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <select
            value={selectedRelation}
            onChange={(e) => setSelectedRelation(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-emerald-400/60 focus:outline-none"
            aria-label="Family relationship"
          >
            {FAMILY_RELATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            value={selectedSide}
            onChange={(e) => setSelectedSide(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-emerald-400/60 focus:outline-none"
            aria-label="Family side"
          >
            {FAMILY_SIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <Button size="sm" className="h-8 text-xs" disabled={!selectedCharacterId || adding} onClick={() => void addExistingCharacter()}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Add</span>
          </Button>
          {addError && <p className="text-xs text-red-300 sm:col-span-4">{addError}</p>}
        </div>
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-white/50 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Building family tree from your conversations…
      </div>
    );
  }

  if (!tree || tree.members.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-10 px-4">
          <TreePine className="h-10 w-10 mx-auto mb-3 text-white/20" />
          <p className="text-sm font-medium text-white/55">{title ?? 'No family tree yet'}</p>
          <p className="text-xs text-white/35 mt-1 max-w-sm mx-auto">
            {hint ?? 'Mention family members in chat — LoreBook infers positions and updates the tree as you share more.'}
          </p>
          {scope === 'character' && entityId && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => void rebuild()} disabled={rebuilding}>
              {rebuilding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              Scan conversations
            </Button>
          )}
        </div>
        {manualAddPanel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-white/40">
          {tree.members.length} relative{tree.members.length !== 1 ? 's' : ''} · inferred from your stories
        </p>
        {scope === 'character' && entityId && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-white/50" onClick={() => void rebuild()} disabled={rebuilding}>
            {rebuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="ml-1.5">Refresh</span>
          </Button>
        )}
      </div>
      {manualAddPanel}
      <FamilyTreeView
        tree={tree}
        compact={compact}
        onMemberClick={member => {
          if (member.is_self || member.is_placeholder) return;
          onMemberClick?.(member.id, member.name);
        }}
        onEditRelationship={onEditRelationship}
        onExclude={onExclude}
        onDelete={onDelete}
        onKeep={onKeep}
      />
    </div>
  );
};

/** Load all group affiliations for a character (teams, cliques, employers, …). */
export function CharacterAffiliationsPanel({
  characterId,
  characterName,
  onOrgClick,
}: {
  characterId: string;
  characterName: string;
  onOrgClick?: (org: Organization) => void;
}) {
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; group_type?: string; type?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchJson<{ success: boolean; organizations: typeof orgs }>(
      `/api/family-trees/character/${characterId}/affiliations?name=${encodeURIComponent(characterName)}`
    )
      .then(r => { if (r.success) setOrgs(r.organizations ?? []); })
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, [characterId, characterName]);

  useEffect(() => {
    return onStoryDataUpdated(() => {
      setLoading(true);
      fetchJson<{ success: boolean; organizations: typeof orgs }>(
        `/api/family-trees/character/${characterId}/affiliations?name=${encodeURIComponent(characterName)}`
      )
        .then(r => { if (r.success) setOrgs(r.organizations ?? []); })
        .catch(() => setOrgs([]))
        .finally(() => setLoading(false));
    }, 'organizations');
  }, [characterId, characterName]);

  if (loading) {
    return <p className="text-xs text-white/40 py-2">Loading groups…</p>;
  }
  if (orgs.length === 0) {
    return (
      <p className="text-xs text-white/35 py-2">
        No groups detected yet. Teams, cliques, and workplaces appear here as conversations mention them.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {orgs.map(org => (
        <button
          key={org.id}
          type="button"
          onClick={() => onOrgClick?.(org as Organization)}
          className="px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 text-xs text-purple-200 hover:bg-purple-500/20 transition"
        >
          {org.name}
          {(org.group_type ?? org.type) && (
            <span className="ml-1.5 text-purple-300/50">· {(org.group_type ?? org.type)?.replace(/_/g, ' ')}</span>
          )}
        </button>
      ))}
    </div>
  );
}
