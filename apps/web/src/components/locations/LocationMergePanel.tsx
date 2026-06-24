import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitMerge, X } from 'lucide-react';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { MergeKeepSelectionBar, mergeNoticeWithReview } from '../common/MergeKeepSelectionBar';
import type { LocationProfile } from './LocationProfileCard';

export type LocationDuplicateGroup = {
  match_type: 'exact' | 'containment' | 'alias';
  canonical_name: string;
  confidence?: number;
  reason?: string;
  /** Subtype-aware label from the backend ("Private residence alias", "City alias", …). */
  label?: string;
  place_subtype?: string;
  owner_display_name?: string;
  privacy_sensitive?: boolean;
  variant_reason?: string;
  evidence?: string[];
  locations: Array<{
    id: string;
    name: string;
    type?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

type Props = {
  locations: LocationProfile[];
  demoMode?: boolean;
  onMerged: () => void;
  selectionMode: boolean;
  onSelectionModeChange: (active: boolean) => void;
  selectedForMerge: Set<string>;
  onToggleSelected: (locationId: string) => void;
  onClearSelection: () => void;
};

function mergeLocationsLocally(
  locations: LocationProfile[],
  targetId: string,
  sourceIds: string[]
): LocationProfile[] {
  const target = locations.find(loc => loc.id === targetId);
  const sources = locations.filter(loc => sourceIds.includes(loc.id));
  if (!target || sources.length === 0) return locations;

  const aliases = new Set<string>([
    ...(Array.isArray(target.metadata?.aliases) ? (target.metadata!.aliases as string[]) : []),
    ...sources.map(loc => loc.name),
  ]);
  aliases.delete(target.name);

  const merged: LocationProfile = {
    ...target,
    visitCount: target.visitCount + sources.reduce((sum, loc) => sum + loc.visitCount, 0),
    metadata: {
      ...(target.metadata ?? {}),
      aliases: [...aliases],
      merge_preview: sources.map(loc => loc.name),
    },
  };

  return locations
    .filter(loc => !sourceIds.includes(loc.id))
    .map(loc => (loc.id === targetId ? merged : loc));
}

export const LocationMergePanel = ({
  locations,
  demoMode = false,
  onMerged,
  selectionMode,
  onSelectionModeChange,
  selectedForMerge,
  onToggleSelected,
  onClearSelection,
}: Props) => {
  const [duplicateGroups, setDuplicateGroups] = useState<LocationDuplicateGroup[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);

  const loadDuplicateGroups = useCallback(async () => {
    if (demoMode) {
      const byName = new Map<string, LocationProfile[]>();
      for (const loc of locations) {
        const key = loc.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(loc);
      }
      setDuplicateGroups(
        [...byName.entries()]
          .filter(([, group]) => group.length > 1)
          .map(([canonical_name, group]) => ({
            match_type: 'exact' as const,
            canonical_name,
            locations: group.map(loc => ({ id: loc.id, name: loc.name, type: loc.type, metadata: loc.metadata })),
          }))
      );
      return;
    }
    try {
      const response = await fetchJson<{ duplicate_groups: LocationDuplicateGroup[] }>('/api/locations/duplicates');
      setDuplicateGroups(response.duplicate_groups ?? []);
    } catch {
      setDuplicateGroups([]);
    }
  }, [demoMode, locations]);

  useEffect(() => {
    void loadDuplicateGroups();
  }, [loadDuplicateGroups]);

  const selectedLocations = useMemo(
    () => locations.filter(loc => selectedForMerge.has(loc.id)),
    [locations, selectedForMerge]
  );

  const cancelManualMerge = () => {
    onSelectionModeChange(false);
    onClearSelection();
    setMergeError(null);
  };

  const mergeDuplicateGroup = async (group: LocationDuplicateGroup, targetId: string) => {
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      const sources = group.locations.filter(loc => loc.id !== targetId);
      let mergedName = group.locations.find(loc => loc.id === targetId)?.name ?? 'the selected place';
      let reviewCount = 0;
      if (demoMode) {
        setMergeNotice(
          `Demo merge preview: consolidated ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'} into ${mergedName}.`
        );
        setDuplicateGroups(prev => prev.filter(g => g.canonical_name !== group.canonical_name));
        onMerged();
        return;
      }
      for (const source of sources) {
        const result = await fetchJson<{ location?: { name?: string } | null; report?: { canonicalName?: string; reviewFlags?: string[] } }>(
          '/api/locations/merge',
          {
            method: 'POST',
            body: JSON.stringify({
              source_id: source.id,
              target_id: targetId,
              reason: `Merged from duplicate review (${group.match_type})`,
            }),
          }
        );
        mergedName = result.location?.name ?? result.report?.canonicalName ?? mergedName;
        reviewCount += result.report?.reviewFlags?.length ?? 0;
      }
      await loadDuplicateGroups();
      onMerged();
      setMergeNotice(
        mergeNoticeWithReview(
          mergedName,
          reviewCount,
          `consolidated ${sources.length} duplicate ${sources.length === 1 ? 'card' : 'cards'}`
        )
      );
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge duplicate places');
    } finally {
      setMergeBusy(false);
    }
  };

  const mergeSelectedLocations = async (targetId: string) => {
    const sources = Array.from(selectedForMerge).filter(id => id !== targetId);
    if (sources.length === 0) return;
    setMergeBusy(true);
    setMergeError(null);
    setMergeNotice(null);
    try {
      let mergedName = locations.find(loc => loc.id === targetId)?.name ?? 'the selected place';
      let reviewCount = 0;
      if (demoMode) {
        mergeLocationsLocally(locations, targetId, sources);
        cancelManualMerge();
        setMergeNotice(`Demo merge preview: merged ${sources.length + 1} selected cards into ${mergedName}.`);
        onMerged();
        return;
      }
      for (const sourceId of sources) {
        const result = await fetchJson<{ location?: { name?: string } | null; report?: { canonicalName?: string; reviewFlags?: string[] } }>(
          '/api/locations/merge',
          {
            method: 'POST',
            body: JSON.stringify({
              source_id: sourceId,
              target_id: targetId,
              reason: 'Merged from manual place selection',
            }),
          }
        );
        mergedName = result.location?.name ?? result.report?.canonicalName ?? mergedName;
        reviewCount += result.report?.reviewFlags?.length ?? 0;
      }
      cancelManualMerge();
      await loadDuplicateGroups();
      onMerged();
      setMergeNotice(
        mergeNoticeWithReview(
          mergedName,
          reviewCount,
          `combined ${sources.length + 1} selected cards`
        )
      );
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to merge selected places');
    } finally {
      setMergeBusy(false);
    }
  };

  return (
    <>
      {duplicateGroups.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-300 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-100">
                {duplicateGroups.length} possible duplicate place {duplicateGroups.length === 1 ? 'group' : 'groups'}
              </p>
              <p className="text-xs text-amber-100/65">
                Same place may appear under different nicknames — merge to keep one card.
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
          Duplicate place cards (e.g. “Abuela&apos;s House” vs “The couch at Abuela&apos;s house”) can be merged here.
        </p>
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
      </div>

      {selectionMode && (
        <div className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Manual place merge</p>
              <p className="text-xs text-white/55">
                Select duplicate cards, then choose which card keeps the combined visits, tags, and facts.
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
        visible={selectionMode && selectedLocations.length >= 2}
        selectedCount={selectedLocations.length}
        options={selectedLocations.map((location) => ({ id: location.id, name: location.name }))}
        busy={mergeBusy}
        onKeep={(targetId) => void mergeSelectedLocations(targetId)}
      />

      {showMergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1117] px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">Review duplicate places</h3>
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
              {duplicateGroups.map((group, index) => (
                <div key={`${group.canonical_name}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {group.label
                          ? group.label
                          : group.match_type === 'exact'
                            ? 'Exact duplicate'
                            : group.match_type === 'alias'
                              ? 'Place alias'
                              : 'Possible duplicate'}
                      </p>
                      {group.variant_reason && (
                        <p className="text-[10px] text-white/40">{group.variant_reason}</p>
                      )}
                      <p className="text-xs text-white/45">{group.canonical_name}</p>
                      {group.confidence != null && (
                        <p className="text-[10px] text-amber-200/80 mt-0.5">
                          {(group.confidence * 100).toFixed(0)}% confidence
                          {group.reason ? ` — ${group.reason}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-white/35">
                      {group.locations.length} cards
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {group.locations.map(location => {
                      const aliases = Array.isArray(location.metadata?.aliases)
                        ? (location.metadata!.aliases as string[])
                        : [];
                      return (
                        <div
                          key={location.id}
                          className="rounded-lg border border-white/10 bg-black/25 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-white">{location.name}</p>
                            <p className="text-xs text-white/45">
                              {aliases.length > 0 ? `Aliases: ${aliases.join(', ')}` : location.type ?? 'place'}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            disabled={mergeBusy || group.locations.length < 2}
                            onClick={() => void mergeDuplicateGroup(group, location.id)}
                            leftIcon={<GitMerge className="h-3.5 w-3.5" />}
                          >
                            Keep {location.name}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {duplicateGroups.length === 0 && (
                <p className="text-sm text-white/55">No duplicate groups found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export { mergeLocationsLocally };
