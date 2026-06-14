import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitMerge, X } from 'lucide-react';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import type { Organization } from '../organizations/OrganizationProfileCard';
import { GROUP_TYPE_LABELS } from '../../lib/groupTypes';

export type OrganizationDuplicateCluster = {
  match_type: 'same_name' | 'member_overlap';
  canonical_name: string;
  primary_id: string;
  organizations: Array<{
    id: string;
    name: string;
    group_type?: string;
    aliases?: string[];
    member_count?: number;
    usage_count?: number;
  }>;
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

function buildDemoDuplicateClusters(organizations: Organization[]): OrganizationDuplicateCluster[] {
  const byKey = new Map<string, Organization[]>();
  for (const org of organizations) {
    const keys = new Set([normalizeNameKey(org.name), ...(org.aliases ?? []).map(normalizeNameKey)]);
    for (const key of keys) {
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      if (!byKey.get(key)!.some(existing => existing.id === org.id)) {
        byKey.get(key)!.push(org);
      }
    }
  }

  const used = new Set<string>();
  const clusters: OrganizationDuplicateCluster[] = [];

  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const unseen = group.filter(org => !used.has(org.id));
    if (unseen.length < 2) continue;
    unseen.forEach(org => used.add(org.id));
    const primary = [...unseen].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0))[0];
    clusters.push({
      match_type: 'same_name',
      canonical_name: primary.name,
      primary_id: primary.id,
      organizations: unseen.map(org => ({
        id: org.id,
        name: org.name,
        group_type: org.group_type,
        aliases: org.aliases,
        member_count: org.member_count,
        usage_count: org.usage_count,
      })),
    });
  }

  return clusters;
}

function enrichClusters(
  clusters: ApiDuplicateCluster[],
  organizations: Organization[]
): OrganizationDuplicateCluster[] {
  return clusters
    .map(cluster => {
      const ids = [cluster.primary_id, ...cluster.duplicate_ids];
      const orgs = ids
        .map(id => organizations.find(org => org.id === id))
        .filter((org): org is Organization => Boolean(org));
      return {
        match_type: cluster.reason,
        canonical_name: cluster.primary_name,
        primary_id: cluster.primary_id,
        organizations: orgs.map(org => ({
          id: org.id,
          name: org.name,
          group_type: org.group_type,
          aliases: org.aliases,
          member_count: org.member_count,
          usage_count: org.usage_count,
        })),
      };
    })
    .filter(cluster => cluster.organizations.length >= 2);
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

  const loadDuplicateClusters = useCallback(async () => {
    if (demoMode) {
      setDuplicateClusters(buildDemoDuplicateClusters(organizations));
      return;
    }
    setChecking(true);
    try {
      const response = await fetchJson<{ success: boolean; clusters: ApiDuplicateCluster[] }>(
        '/api/organizations/duplicates'
      );
      setDuplicateClusters(enrichClusters(response.clusters ?? [], organizations));
    } catch {
      setDuplicateClusters([]);
    } finally {
      setChecking(false);
    }
  }, [demoMode, organizations]);

  useEffect(() => {
    void loadDuplicateClusters();
  }, [loadDuplicateClusters]);

  const selectedOrganizations = useMemo(
    () => organizations.filter(org => selectedForMerge.has(org.id)),
    [organizations, selectedForMerge]
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
      const duplicateIds = cluster.organizations.filter(org => org.id !== targetId).map(org => org.id);
      const mergedName = cluster.organizations.find(org => org.id === targetId)?.name ?? 'the selected group';
      if (duplicateIds.length === 0) return;

      if (demoMode) {
        setDuplicateClusters(prev =>
          prev.filter(existing => existing.canonical_name !== cluster.canonical_name)
        );
        setMergeNotice(
          `Demo merge preview: consolidated ${duplicateIds.length} duplicate ${duplicateIds.length === 1 ? 'card' : 'cards'} into ${mergedName}.`
        );
        onMerged();
        return;
      }

      await fetchJson('/api/organizations/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: targetId, duplicate_ids: duplicateIds }),
      });
      await loadDuplicateClusters();
      onMerged();
      setMergeNotice(
        `Merged ${duplicateIds.length} duplicate ${duplicateIds.length === 1 ? 'card' : 'cards'} into ${mergedName}. Members, stories, and events were consolidated.`
      );
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge duplicate groups');
    } finally {
      setMergeBusy(false);
    }
  };

  const mergeSelectedOrganizations = async (targetId: string) => {
    const duplicateIds = Array.from(selectedForMerge).filter(id => id !== targetId);
    if (duplicateIds.length === 0) return;

    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const mergedName = organizations.find(org => org.id === targetId)?.name ?? 'the selected group';
      if (demoMode) {
        cancelManualMerge();
        setMergeNotice(
          `Demo merge preview: merged ${duplicateIds.length + 1} selected cards into ${mergedName}.`
        );
        onMerged();
        return;
      }

      await fetchJson('/api/organizations/merge', {
        method: 'POST',
        body: JSON.stringify({ primary_id: targetId, duplicate_ids: duplicateIds }),
      });
      cancelManualMerge();
      await loadDuplicateClusters();
      onMerged();
      setMergeNotice(`Merged ${duplicateIds.length + 1} selected cards into ${mergedName}.`);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge selected groups');
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <>
      {duplicateClusters.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-100">
                {duplicateClusters.length} possible duplicate group {duplicateClusters.length === 1 ? 'cluster' : 'clusters'}
              </p>
              <p className="text-xs text-amber-100/65">
                Same crew may appear under different names — merge to keep one card.
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
          {selectedOrganizations.length >= 2 && (
            <div className="flex flex-wrap gap-2">
              {selectedOrganizations.map(org => (
                <Button
                  key={org.id}
                  size="sm"
                  disabled={mergeBusy}
                  onClick={() => void mergeSelectedOrganizations(org.id)}
                  leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                  className="text-xs"
                >
                  Keep {org.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1117] px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">Review duplicate groups</h3>
                <p className="text-xs text-white/45">Pick the card to keep. Other names become aliases on the survivor.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeDialog(false)}
                className="rounded-lg p-2 text-white/40 hover:text-white hover:bg-white/5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {mergeError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {mergeError}
                </div>
              )}
              {duplicateClusters.map((cluster, index) => (
                <div key={`${cluster.canonical_name}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {cluster.match_type === 'member_overlap' ? 'Shared members' : 'Likely duplicate'}
                      </p>
                      <p className="text-xs text-white/45">{cluster.canonical_name}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-white/35">
                      {cluster.organizations.length} cards
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {cluster.organizations.map(org => {
                      const typeLabel = org.group_type
                        ? GROUP_TYPE_LABELS[org.group_type as keyof typeof GROUP_TYPE_LABELS] ?? org.group_type
                        : 'group';
                      return (
                        <div
                          key={org.id}
                          className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-white">{org.name}</p>
                            <p className="text-xs text-white/45">
                              {org.aliases && org.aliases.length > 0
                                ? `Aliases: ${org.aliases.join(', ')}`
                                : `${typeLabel}${org.member_count != null ? ` · ${org.member_count} members` : ''}`}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            disabled={mergeBusy || cluster.organizations.length < 2}
                            onClick={() => void mergeCluster(cluster, org.id)}
                            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                          >
                            Keep this
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
