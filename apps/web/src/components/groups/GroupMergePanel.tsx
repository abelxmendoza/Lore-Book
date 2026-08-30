import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, GitMerge, Layers, X } from 'lucide-react';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { MergeKeepSelectionBar, mergeNoticeWithReview } from '../common/MergeKeepSelectionBar';
import { entityAuthorityApi } from '../../api/entityAuthority';
import type { Organization, OrganizationMember } from '../organizations/OrganizationProfileCard';
import { GROUP_TYPE_LABELS } from '../../lib/groupTypes';
import { cn } from '../../lib/cn';

type ClusterMember = {
  id: string;
  character_id?: string;
  character_name: string;
  role?: string;
  status?: OrganizationMember['status'];
};

type ClusterOrg = {
  id: string;
  name: string;
  group_type?: string;
  aliases?: string[];
  member_count?: number;
  usage_count?: number;
  members?: ClusterMember[];
};

export type OrganizationDuplicateCluster = {
  match_type: 'same_name' | 'member_overlap';
  canonical_name: string;
  primary_id: string;
  organizations: ClusterOrg[];
};

type ApiDuplicateCluster = {
  primary_id: string;
  primary_name: string;
  duplicate_ids: string[];
  names: string[];
  reason: 'same_name' | 'member_overlap';
};

type Props = {
  organizations: Organization[];
  demoMode?: boolean;
  onMerged: () => void;
  selectionMode: boolean;
  onSelectionModeChange: (active: boolean) => void;
  selectedForMerge: Set<string>;
  onToggleSelected: (organizationId: string) => void;
  onClearSelection: () => void;
};

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function memberKey(name: string): string {
  return name.trim().toLowerCase();
}

function toClusterOrg(org: Organization): ClusterOrg {
  const members = (org.members ?? []).map((member) => ({
    id: member.id,
    character_id: member.character_id,
    character_name: member.character_name,
    role: member.role,
    status: member.status,
  }));
  return {
    id: org.id,
    name: org.name,
    group_type: org.group_type,
    aliases: org.aliases,
    member_count: members.length || org.member_count,
    usage_count: org.usage_count,
    members,
  };
}

function clusterKey(cluster: OrganizationDuplicateCluster): string {
  return cluster.organizations.map((org) => org.id).sort().join('+');
}

function memberNameSet(org: { members?: ClusterMember[] }): Set<string> {
  return new Set((org.members ?? []).map((member) => memberKey(member.character_name)).filter(Boolean));
}

function sharedMemberLabels(orgs: ClusterOrg[]): string[] {
  if (orgs.length < 2) return [];
  const sets = orgs.map(memberNameSet);
  const labels = new Map<string, string>();
  for (const org of orgs) {
    for (const member of org.members ?? []) {
      const key = memberKey(member.character_name);
      if (key && !labels.has(key)) labels.set(key, member.character_name);
    }
  }
  return [...sets[0]]
    .filter((key) => sets.every((set) => set.has(key)))
    .map((key) => labels.get(key) ?? key);
}

function membersOverlapStrongly(a: Organization, b: Organization): boolean {
  const aMembers = memberNameSet(toClusterOrg(a));
  const bMembers = memberNameSet(toClusterOrg(b));
  const smaller = Math.min(aMembers.size, bMembers.size);
  if (smaller < 2) return false;
  const overlap = [...aMembers].filter((name) => bMembers.has(name)).length;
  return overlap >= Math.ceil(smaller * 0.7);
}

function otherOverlapCandidates(
  cluster: OrganizationDuplicateCluster,
  allOrganizations: Organization[],
): Array<{ org: Organization; shared: string[] }> {
  const clusterIds = new Set(cluster.organizations.map((org) => org.id));
  const clusterNames = new Set(
    cluster.organizations.flatMap((org) => (org.members ?? []).map((member) => memberKey(member.character_name))),
  );
  return allOrganizations
    .filter((org) => !clusterIds.has(org.id))
    .map((org) => {
      const seen = new Set<string>();
      const shared: string[] = [];
      for (const member of org.members ?? []) {
        const key = memberKey(member.character_name);
        if (!key || !clusterNames.has(key) || seen.has(key)) continue;
        seen.add(key);
        shared.push(member.character_name);
      }
      return { org, shared };
    })
    .filter((candidate) => candidate.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 6);
}

function patchClusterOrg(
  clusters: OrganizationDuplicateCluster[],
  orgId: string,
  patch: (org: ClusterOrg) => ClusterOrg,
): OrganizationDuplicateCluster[] {
  return clusters.map((cluster) => ({
    ...cluster,
    organizations: cluster.organizations.map((org) => (org.id === orgId ? patch(org) : org)),
  }));
}

function buildDemoDuplicateClusters(organizations: Organization[]): OrganizationDuplicateCluster[] {
  const byKey = new Map<string, Organization[]>();
  for (const org of organizations) {
    const keys = new Set([normalizeNameKey(org.name), ...(org.aliases ?? []).map(normalizeNameKey)]);
    for (const key of keys) {
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      if (!byKey.get(key)!.some((existing) => existing.id === org.id)) {
        byKey.get(key)!.push(org);
      }
    }
  }

  const used = new Set<string>();
  const clusters: OrganizationDuplicateCluster[] = [];

  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const unseen = group.filter((org) => !used.has(org.id));
    if (unseen.length < 2) continue;
    unseen.forEach((org) => used.add(org.id));
    const primary = [...unseen].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))[0];
    clusters.push({
      match_type: 'same_name',
      canonical_name: primary.name,
      primary_id: primary.id,
      organizations: unseen.map(toClusterOrg),
    });
  }

  for (let i = 0; i < organizations.length; i++) {
    const a = organizations[i];
    if (used.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < organizations.length; j++) {
      const b = organizations[j];
      if (used.has(b.id)) continue;
      if (membersOverlapStrongly(a, b)) group.push(b);
    }
    if (group.length < 2) continue;
    group.forEach((org) => used.add(org.id));
    const primary = [...group].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))[0];
    clusters.push({
      match_type: 'member_overlap',
      canonical_name: primary.name,
      primary_id: primary.id,
      organizations: group.map(toClusterOrg),
    });
  }

  return clusters;
}

function enrichClusters(
  clusters: ApiDuplicateCluster[],
  organizations: Organization[],
): OrganizationDuplicateCluster[] {
  return clusters
    .map((cluster) => {
      const ids = [cluster.primary_id, ...cluster.duplicate_ids];
      const orgs = ids
        .map((id) => organizations.find((org) => org.id === id))
        .filter((org): org is Organization => Boolean(org));
      return {
        match_type: cluster.reason,
        canonical_name: cluster.primary_name,
        primary_id: cluster.primary_id,
        organizations: orgs.map(toClusterOrg),
      };
    })
    .filter((cluster) => cluster.organizations.length >= 2);
}

export const GroupMergePanel = ({
  organizations,
  demoMode = false,
  onMerged,
  selectionMode,
  onSelectionModeChange,
  selectedForMerge,
  onToggleSelected,
  onClearSelection,
}: Props) => {
  const [duplicateClusters, setDuplicateClusters] = useState<OrganizationDuplicateCluster[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [rosterBusyId, setRosterBusyId] = useState<string | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});
  const rosterFetchStarted = useRef(new Set<string>());

  const loadDuplicateClusters = useCallback(async () => {
    if (demoMode) {
      setDuplicateClusters(buildDemoDuplicateClusters(organizations));
      return;
    }
    setChecking(true);
    try {
      const response = await fetchJson<{ success: boolean; clusters: ApiDuplicateCluster[] }>(
        '/api/organizations/duplicates',
      );
      setDuplicateClusters(enrichClusters(response.clusters ?? [], organizations));
    } catch {
      setDuplicateClusters([]);
    } finally {
      setChecking(false);
    }
  }, [demoMode, organizations]);

  useEffect(() => {
    if (showMergeDialog) return;
    void loadDuplicateClusters();
  }, [loadDuplicateClusters, showMergeDialog]);

  useEffect(() => {
    if (!showMergeDialog || demoMode) return;
    const missingIds = [
      ...new Set(
        duplicateClusters
          .flatMap((cluster) => cluster.organizations)
          .filter((org) => !(org.members && org.members.length > 0) && (org.member_count ?? 0) > 0)
          .map((org) => org.id)
          .filter((id) => !rosterFetchStarted.current.has(id)),
      ),
    ];
    if (missingIds.length === 0) return;
    missingIds.forEach((id) => rosterFetchStarted.current.add(id));

    void (async () => {
      const fetched = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const response = await fetchJson<{ success: boolean; organization?: Organization }>(
              `/api/organizations/${id}`,
            );
            return { id, members: response.organization?.members ?? [] };
          } catch {
            return { id, members: [] as OrganizationMember[] };
          }
        }),
      );
      setDuplicateClusters((prev) =>
        prev.map((cluster) => ({
          ...cluster,
          organizations: cluster.organizations.map((org) => {
            const hit = fetched.find((row) => row.id === org.id);
            if (!hit) return org;
            return {
              ...org,
              members: hit.members.map((member) => ({
                id: member.id,
                character_id: member.character_id,
                character_name: member.character_name,
                role: member.role,
                status: member.status,
              })),
              member_count: hit.members.length || org.member_count,
            };
          }),
        })),
      );
    })();
  }, [showMergeDialog, demoMode, duplicateClusters]);

  const selectedOrganizations = useMemo(
    () => organizations.filter((org) => selectedForMerge.has(org.id)),
    [organizations, selectedForMerge],
  );

  const cancelManualMerge = () => {
    onSelectionModeChange(false);
    onClearSelection();
    setMergeError(null);
  };

  const mergeCluster = async (cluster: OrganizationDuplicateCluster, targetId: string) => {
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const duplicateIds = cluster.organizations.filter((org) => org.id !== targetId).map((org) => org.id);
      const mergedName = cluster.organizations.find((org) => org.id === targetId)?.name ?? 'the selected group';
      let reviewCount = 0;
      if (duplicateIds.length === 0) return;

      if (demoMode) {
        setDuplicateClusters((prev) => prev.filter((existing) => clusterKey(existing) !== clusterKey(cluster)));
        setMergeNotice(
          `Demo merge preview: consolidated ${duplicateIds.length} duplicate ${duplicateIds.length === 1 ? 'card' : 'cards'} into ${mergedName}.`,
        );
        onMerged();
        return;
      }

      const result = await fetchJson<{ report?: { reviewFlags?: string[] } }>('/api/organizations/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: targetId, duplicate_ids: duplicateIds }),
      });
      reviewCount = result.report?.reviewFlags?.length ?? 0;
      await loadDuplicateClusters();
      onMerged();
      setMergeNotice(
        mergeNoticeWithReview(
          mergedName,
          reviewCount,
          `members, stories, and events from ${duplicateIds.length} duplicate ${duplicateIds.length === 1 ? 'card' : 'cards'} were consolidated`,
        ),
      );
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge duplicate groups');
    } finally {
      setMergeBusy(false);
    }
  };

  const nestCluster = async (cluster: OrganizationDuplicateCluster, parentId: string) => {
    const parent = cluster.organizations.find((org) => org.id === parentId);
    const children = cluster.organizations.filter((org) => org.id !== parentId);
    if (!parent || children.length === 0) return;

    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      if (demoMode) {
        setDuplicateClusters((prev) => prev.filter((existing) => clusterKey(existing) !== clusterKey(cluster)));
        setMergeNotice(`Demo preview: nested ${children.map((child) => child.name).join(', ')} under ${parent.name}.`);
        onMerged();
        return;
      }

      for (const child of children) {
        const result = await entityAuthorityApi.confirm({
          a: { id: child.id, name: child.name, kind: 'ORGANIZATION', aliases: child.aliases },
          b: { id: parent.id, name: parent.name, kind: 'ORGANIZATION', aliases: parent.aliases },
          decision: 'PARENT_CHILD',
          source_id: child.id,
          target_id: parent.id,
          reason: `Nested subgroup under ${parent.name} from duplicate review`,
        });
        if (result.error) throw new Error(result.error);
      }

      await loadDuplicateClusters();
      onMerged();
      setMergeNotice(
        `Nested ${children.length} group${children.length === 1 ? '' : 's'} under ${parent.name}. Both cards stay visible.`,
      );
      setShowMergeDialog(false);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to nest duplicate groups');
    } finally {
      setMergeBusy(false);
    }
  };

  const mergeSelectedOrganizations = async (targetId: string) => {
    const duplicateIds = Array.from(selectedForMerge).filter((id) => id !== targetId);
    if (duplicateIds.length === 0) return;

    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const mergedName = organizations.find((org) => org.id === targetId)?.name ?? 'the selected group';
      let reviewCount = 0;
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice(`Demo merge preview: merged ${duplicateIds.length + 1} selected cards into ${mergedName}.`);
        onMerged();
        return;
      }

      const result = await fetchJson<{ report?: { reviewFlags?: string[] } }>('/api/organizations/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: targetId, duplicate_ids: duplicateIds }),
      });
      reviewCount = result.report?.reviewFlags?.length ?? 0;
      cancelManualMerge();
      await loadDuplicateClusters();
      onMerged();
      setMergeNotice(mergeNoticeWithReview(mergedName, reviewCount, `combined ${duplicateIds.length + 1} selected cards`));
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge selected groups');
    } finally {
      setMergeBusy(false);
    }
  };

  const addMemberToRoster = async (orgId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRosterBusyId(orgId);
    setMergeError(null);
    try {
      if (demoMode) {
        const member: ClusterMember = {
          id: `demo-member-${orgId}-${trimmed}`,
          character_name: trimmed,
          status: 'active',
        };
        setDuplicateClusters((prev) =>
          patchClusterOrg(prev, orgId, (org) => ({
            ...org,
            members: [...(org.members ?? []), member],
            member_count: (org.members?.length ?? 0) + 1,
          })),
        );
        setMemberDrafts((prev) => ({ ...prev, [orgId]: '' }));
        return;
      }

      const result = await fetchJson<{ success: boolean; member?: OrganizationMember }>(
        `/api/organizations/${orgId}/members`,
        { method: 'POST', body: JSON.stringify({ character_name: trimmed, status: 'active' }) },
      );
      const saved = result.member;
      setDuplicateClusters((prev) =>
        patchClusterOrg(prev, orgId, (org) => ({
          ...org,
          members: [
            ...(org.members ?? []),
            {
              id: saved?.id ?? `temp-${trimmed}`,
              character_id: saved?.character_id,
              character_name: saved?.character_name ?? trimmed,
              role: saved?.role,
              status: saved?.status ?? 'active',
            },
          ],
          member_count: (org.members?.length ?? 0) + 1,
        })),
      );
      setMemberDrafts((prev) => ({ ...prev, [orgId]: '' }));
      onMerged();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to add member');
    } finally {
      setRosterBusyId(null);
    }
  };

  const removeMemberFromRoster = async (orgId: string, memberId: string) => {
    setRosterBusyId(orgId);
    setMergeError(null);
    try {
      if (!demoMode) {
        await fetchJson(`/api/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
      }
      setDuplicateClusters((prev) =>
        patchClusterOrg(prev, orgId, (org) => {
          const members = (org.members ?? []).filter((member) => member.id !== memberId);
          return { ...org, members, member_count: members.length };
        }),
      );
      if (!demoMode) onMerged();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to remove member');
    } finally {
      setRosterBusyId(null);
    }
  };

  const includeCandidateInCluster = (cluster: OrganizationDuplicateCluster, org: Organization) => {
    setDuplicateClusters((prev) =>
      prev.map((existing) => {
        if (clusterKey(existing) !== clusterKey(cluster)) return existing;
        if (existing.organizations.some((item) => item.id === org.id)) return existing;
        return { ...existing, organizations: [...existing.organizations, toClusterOrg(org)] };
      }),
    );
  };

  const dismissCluster = (cluster: OrganizationDuplicateCluster) => {
    setDuplicateClusters((prev) => prev.filter((existing) => clusterKey(existing) !== clusterKey(cluster)));
  };

  return (
    <>
      {duplicateClusters.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-100">
                {duplicateClusters.length} possible duplicate group{' '}
                {duplicateClusters.length === 1 ? 'cluster' : 'clusters'}
              </p>
              <p className="text-xs text-amber-100/65">
                Review each roster, correct membership, then merge or nest if they really belong together.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setShowMergeDialog(true)}
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

      <div className="flex flex-col items-start gap-1">
        <p className="text-[11px] leading-tight text-white/45">
          Duplicate group cards (e.g. “Summit Staffing” vs “Summit Staffing agency”) can be merged here.
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
            {selectionMode ? 'Cancel merge' : 'Select to merge'}
          </Button>
          {!demoMode && (
            <Button
              size="sm"
              variant="outline"
              disabled={checking}
              onClick={() => void loadDuplicateClusters()}
              className="text-xs"
            >
              {checking ? 'Checking…' : 'Recheck duplicates'}
            </Button>
          )}
        </div>
      </div>

      {selectionMode && (
        <div className="rounded-lg border border-purple-500/25 bg-purple-500/10 px-3 py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Manual group merge</p>
              <p className="text-xs text-white/55">
                Select duplicate cards, then choose which group keeps the combined members, stories, and events.
              </p>
            </div>
            <span className="text-xs text-white/45">{selectedForMerge.size} selected</span>
          </div>
          {mergeError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {mergeError}
            </div>
          )}
        </div>
      )}

      <MergeKeepSelectionBar
        visible={selectionMode && selectedOrganizations.length >= 2}
        selectedCount={selectedOrganizations.length}
        options={selectedOrganizations.map((org) => ({ id: org.id, name: org.name }))}
        busy={mergeBusy}
        onKeep={(targetId) => void mergeSelectedOrganizations(targetId)}
      />

      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1117] px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">Review duplicate groups</h3>
                <p className="text-xs text-white/45">
                  Compare rosters, fix membership, then merge into one card or nest one group inside another.
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!demoMode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={checking}
                    onClick={() => void loadDuplicateClusters()}
                    className="text-xs"
                  >
                    {checking ? 'Checking…' : 'Recheck'}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMergeDialog(false)}
                  className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {mergeError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {mergeError}
                </div>
              )}
              {duplicateClusters.map((cluster) => {
                const sharedNames = sharedMemberLabels(cluster.organizations);
                const sharedKeys = new Set(sharedNames.map(memberKey));
                const extras = otherOverlapCandidates(cluster, organizations);
                const typeLabel = (org: ClusterOrg) =>
                  org.group_type
                    ? GROUP_TYPE_LABELS[org.group_type as keyof typeof GROUP_TYPE_LABELS] ?? org.group_type
                    : 'group';

                return (
                  <div key={clusterKey(cluster)} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {cluster.match_type === 'member_overlap' ? 'Shared members' : 'Likely duplicate'}
                        </p>
                        <p className="text-xs text-white/45">{cluster.canonical_name}</p>
                        {sharedNames.length > 0 ? (
                          <p className="text-xs text-amber-100/80 mt-1">
                            Shared people: {sharedNames.join(', ')}
                          </p>
                        ) : (
                          <p className="text-xs text-white/45 mt-1">
                            Flagged by similar names. Check whether the rosters actually belong together.
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-white/35">
                        {cluster.organizations.length} cards
                      </span>
                    </div>
                    <div className="grid gap-3">
                      {cluster.organizations.map((org) => {
                        const rosterBusy = rosterBusyId === org.id;
                        return (
                          <div key={org.id} className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-white">{org.name}</p>
                                <p className="text-xs text-white/45">
                                  {typeLabel(org)}
                                  {org.member_count != null ? ` · ${org.member_count} members` : ''}
                                  {org.aliases && org.aliases.length > 0 ? ` · Aliases: ${org.aliases.join(', ')}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  disabled={mergeBusy || cluster.organizations.length < 2}
                                  onClick={() => void mergeCluster(cluster, org.id)}
                                  leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                                >
                                  Keep {org.name}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={mergeBusy || cluster.organizations.length < 2}
                                  onClick={() => void nestCluster(cluster, org.id)}
                                  leftIcon={<Layers className="h-3.5 w-3.5" />}
                                  className="border-primary/30 text-primary hover:bg-primary/10"
                                >
                                  Nest others here
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">Roster</p>
                              {(org.members ?? []).length === 0 ? (
                                <p className="text-xs text-white/40">No people on this card yet.</p>
                              ) : (
                                <ul className="flex flex-wrap gap-1.5">
                                  {(org.members ?? []).map((member) => {
                                    const shared = sharedKeys.has(memberKey(member.character_name));
                                    return (
                                      <li key={member.id}>
                                        <span
                                          className={cn(
                                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                                            shared
                                              ? 'border-amber-400/40 bg-amber-500/15 text-amber-100'
                                              : 'border-white/10 bg-white/5 text-white/75',
                                          )}
                                        >
                                          {member.character_name}
                                          {member.role ? (
                                            <span className="text-white/40">· {member.role}</span>
                                          ) : null}
                                          <button
                                            type="button"
                                            disabled={mergeBusy || rosterBusy || !member.id}
                                            onClick={() => void removeMemberFromRoster(org.id, member.id)}
                                            className="rounded-full p-0.5 text-white/40 hover:text-white disabled:opacity-40"
                                            aria-label={`Remove ${member.character_name} from ${org.name}`}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                              <form
                                className="flex gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void addMemberToRoster(org.id, memberDrafts[org.id] ?? '');
                                }}
                              >
                                <input
                                  type="text"
                                  value={memberDrafts[org.id] ?? ''}
                                  onChange={(event) =>
                                    setMemberDrafts((prev) => ({ ...prev, [org.id]: event.target.value }))
                                  }
                                  placeholder="Add a person…"
                                  aria-label={`Add a person to ${org.name}`}
                                  className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/35"
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={mergeBusy || rosterBusy || !(memberDrafts[org.id] ?? '').trim()}
                                  aria-label={`Add person to ${org.name}`}
                                  className="text-xs"
                                >
                                  Add
                                </Button>
                              </form>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {extras.length > 0 && (
                      <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-2">
                        <p className="text-xs font-semibold text-white/80">Other groups that share people</p>
                        <p className="text-[11px] text-white/45">
                          Possible merge candidates that were not auto-clustered with these cards.
                        </p>
                        <ul className="space-y-2">
                          {extras.map(({ org, shared }) => (
                            <li
                              key={org.id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <div>
                                <p className="text-sm text-white">{org.name}</p>
                                <p className="text-[11px] text-white/45">
                                  Shares {shared.join(', ')}
                                  {org.member_count != null ? ` · ${org.member_count} members` : ''}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={mergeBusy}
                                onClick={() => includeCandidateInCluster(cluster, org)}
                                className="text-xs"
                              >
                                Add to this review
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mergeBusy}
                        onClick={() => dismissCluster(cluster)}
                        className="text-xs text-white/55"
                      >
                        Keep these separate
                      </Button>
                    </div>
                  </div>
                );
              })}
              {duplicateClusters.length === 0 && (
                <p className="text-sm text-white/55">No duplicate groups found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
