import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, TreePine } from 'lucide-react';
import { Button } from '../ui/button';
import { FamilyTreeView } from '../family/FamilyTreeView';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';
import type { Organization } from '../organizations/OrganizationProfileCard';

type Scope = 'mine' | 'character' | 'organization';

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
  const [tree, setTree] = useState<FamilyTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const endpoint = scope === 'mine'
    ? '/api/family-trees/mine'
    : scope === 'organization'
      ? `/api/family-trees/organization/${entityId}`
      : `/api/family-trees/character/${entityId}`;

  const load = useCallback(async () => {
    if (scope !== 'mine' && !entityId) return;
    setLoading(true);
    try {
      const r = await fetchJson<{ success: boolean; tree: FamilyTree }>(endpoint);
      if (r.success) setTree(r.tree);
    } catch {
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [endpoint, scope, entityId]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-white/50 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Building family tree from your conversations…
      </div>
    );
  }

  if (!tree || tree.members.length === 0) {
    return (
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
