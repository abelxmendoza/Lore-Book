import { useEffect, useState } from 'react';
import { FileText, GitBranch, Eye, Download, RefreshCw, Clock, Info, BookOpen, X, Sparkles, PlusCircle, MinusCircle, Pencil, ArrowLeftRight } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import {
  compareDemoVersions,
  getDemoManifest,
  getDemoVersionHistory,
} from '../../services/demoBookVersioning';
import { generateDemoEdition } from '../../lib/storyForge/demoCoreLorebookStore';
import { runForgeForPreset } from '../../lib/storyForge/forgeReadinessBridge';
import { useLoreReadinessSimulationOptional } from '../../contexts/LoreReadinessSimulationContext';

interface BiographyVersion {
  id: string;
  /** Build flag (main/safe/explicit/private) — a different axis from edition lineage. */
  version: string;
  /** Core Lorebook edition number; undefined for non-core biographies. */
  lorebookVersion?: number;
  status?: 'published' | 'superseded';
  title: string;
  generatedAt: string;
  memorySnapshotAt: string;
  atomSnapshotHash: string;
  baseBiographyId?: string;
}

type ChapterChangeType = 'added' | 'removed' | 'changed' | 'reordered';

interface VersionComparison {
  baseId: string;
  versionId: string;
  differences: {
    chapterId: string;
    chapterTitle: string;
    changeType: ChapterChangeType;
    differences: {
      type: 'content' | 'filtering' | 'structure' | 'position';
      description: string;
    }[];
  }[];
  metadataChanges: string[];
  sharedTimeline: {
    chapters: any[];
    timeSpan: { start: string; end: string };
  };
}

interface EditionManifest {
  editionId: string;
  publicationHandle: string | null;
  lorebookVersion: number | null;
  knowledgeSnapshot: {
    atomCount: number;
    atomSnapshotHash: string | null;
    memorySnapshotAt: string | null;
  };
  buildSettings: {
    buildFlag: string | null;
    scope: string | null;
    tone: string | null;
    depth: string | null;
    audience: string | null;
    form?: string;
  };
  filtersApplied: string[];
  generatorVersion: string | null;
  promptVersion: string | null;
  modelVersion: string | null;
  filterVersion: string | null;
}

interface VersionManagerProps {
  lorebookName: string;
  baseBiographyId?: string;
  /** Safe/explicit/private build-target generation is Phase Two — off by default in Milestone 1. */
  showGenerateVariants?: boolean;
  onRead?: (biographyId: string) => void;
  /** Renders a close (X) button next to Refresh — set when hosted inside a modal. */
  onClose?: () => void;
}

const CHANGE_TYPE_STYLE: Record<
  ChapterChangeType,
  { label: string; border: string; text: string; bg: string; icon: typeof PlusCircle }
> = {
  added: { label: 'Added', border: 'border-emerald-500/40', text: 'text-emerald-300', bg: 'bg-emerald-500/10', icon: PlusCircle },
  removed: { label: 'Removed', border: 'border-red-500/40', text: 'text-red-300', bg: 'bg-red-500/10', icon: MinusCircle },
  changed: { label: 'Changed', border: 'border-amber-500/40', text: 'text-amber-300', bg: 'bg-amber-500/10', icon: Pencil },
  reordered: { label: 'Reordered', border: 'border-sky-500/40', text: 'text-sky-300', bg: 'bg-sky-500/10', icon: ArrowLeftRight },
};

export const VersionManager = ({ lorebookName, baseBiographyId, showGenerateVariants = false, onRead, onClose }: VersionManagerProps) => {
  const shouldUseMock = useShouldUseMockData();
  const simulation = useLoreReadinessSimulationOptional();
  const [versions, setVersions] = useState<BiographyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState<{ id1: string; id2: string } | null>(null);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [generatingVersion, setGeneratingVersion] = useState<string | null>(null);
  const [manifestFor, setManifestFor] = useState<string | null>(null);
  const [manifest, setManifest] = useState<EditionManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);

  useEffect(() => {
    if (lorebookName) {
      loadVersions();
    }
  }, [lorebookName, shouldUseMock]);

  const loadVersions = async () => {
    try {
      setLoading(true);
      setError(null);
      if (shouldUseMock) {
        const result = getDemoVersionHistory(lorebookName);
        setVersions(result.versions);
      } else {
        const result = await fetchJson<{ versions: BiographyVersion[] }>(
          `/api/biography/versions/${encodeURIComponent(lorebookName)}`
        );
        setVersions(result.versions);
      }
    } catch (err) {
      console.error('Failed to load versions:', err);
      setError('Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  const generateVersion = async (baseId: string, versionType: 'safe' | 'explicit' | 'private') => {
    try {
      setGeneratingVersion(versionType);
      if (shouldUseMock) {
        const forge = runForgeForPreset(simulation?.preset ?? 'rich');
        generateDemoEdition(lorebookName, versionType, forge);
      } else {
        await fetchJson('/api/biography/versions/generate', {
          method: 'POST',
          body: JSON.stringify({
            baseBiographyId: baseId,
            versionType
          })
        });
      }
      await loadVersions();
    } catch (err) {
      console.error('Failed to generate version:', err);
      alert('Failed to generate version');
    } finally {
      setGeneratingVersion(null);
    }
  };

  // Always diff earlier -> later by edition number so "added" means "added
  // since then" rather than depending on click order.
  const compareVersions = async (idA: string, idB: string) => {
    const a = versions.find(v => v.id === idA);
    const b = versions.find(v => v.id === idB);
    const [fromId, toId] =
      (a?.lorebookVersion ?? 0) <= (b?.lorebookVersion ?? 0) ? [idA, idB] : [idB, idA];
    try {
      setComparing({ id1: fromId, id2: toId });
      if (shouldUseMock) {
        const result = compareDemoVersions(fromId, toId);
        if (!result) throw new Error('Demo comparison unavailable');
        setComparison(result.comparison);
      } else {
        const result = await fetchJson<{ comparison: VersionComparison }>(
          `/api/biography/versions/compare`,
          {
            method: 'POST',
            body: JSON.stringify({ biographyId1: fromId, biographyId2: toId })
          }
        );
        setComparison(result.comparison);
      }
    } catch (err) {
      console.error('Failed to compare versions:', err);
      alert('Failed to compare versions');
    } finally {
      setComparing(null);
    }
  };

  const toggleManifest = async (versionId: string) => {
    if (manifestFor === versionId) {
      setManifestFor(null);
      setManifest(null);
      return;
    }
    setManifestFor(versionId);
    setManifest(null);
    setManifestLoading(true);
    try {
      if (shouldUseMock) {
        const result = getDemoManifest(versionId);
        setManifest(result?.manifest ?? null);
      } else {
        const result = await fetchJson<{ manifest: EditionManifest }>(`/api/biography/${versionId}/manifest`);
        setManifest(result.manifest);
      }
    } catch (err) {
      console.error('Failed to load manifest:', err);
    } finally {
      setManifestLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getVersionLabel = (version: string): string => {
    const labels: Record<string, string> = {
      main: 'Main',
      safe: 'Safe',
      explicit: 'Explicit',
      private: 'Private'
    };
    return labels[version] || version;
  };

  const getVersionColor = (version: string): string => {
    const colors: Record<string, string> = {
      main: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
      safe: 'bg-green-500/20 text-green-300 border-green-500/50',
      explicit: 'bg-red-500/20 text-red-300 border-red-500/50',
      private: 'bg-purple-500/20 text-purple-300 border-purple-500/50'
    };
    return colors[version] || 'bg-gray-500/20 text-gray-300 border-gray-500/50';
  };

  if (loading) {
    return (
      <div className="relative">
        <div className="h-1.5 w-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-sky-500" />
        <div className="p-10 text-center text-white/60 relative">
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close edition history"
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="animate-spin rounded-full h-9 w-9 border-2 border-white/10 border-t-fuchsia-400 mx-auto"></div>
          <p className="mt-3 text-sm">Loading versions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative">
        <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-amber-500" />
        <div className="p-10 text-center text-red-400 relative">
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close edition history"
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <p>{error}</p>
          <button
            onClick={loadVersions}
            className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white font-medium hover:from-fuchsia-500 hover:to-purple-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const baseVersion = baseBiographyId
    ? versions.find(v => v.id === baseBiographyId)
    : versions.find(v => v.status === 'published') || versions.find(v => v.version === 'main') || versions[0];

  return (
    <div className="relative bg-gradient-to-b from-[#160a24] via-black to-black rounded-lg overflow-hidden border border-white/10 shadow-[0_0_60px_-15px_rgba(192,38,211,0.35)]">
      <div className="h-1.5 w-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-sky-500" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(217,70,239,0.10),transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_10%,rgba(56,189,248,0.06),transparent_40%)]" />
      </div>

      <div className="relative p-5 md:p-7 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 rounded-xl p-2.5 bg-gradient-to-br from-fuchsia-500/25 to-purple-600/25 border border-fuchsia-400/30 shadow-[0_0_18px_-4px_rgba(217,70,239,0.55)]">
            <GitBranch className="h-5 w-5 text-fuchsia-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white leading-tight">Edition History</h2>
            {lorebookName && (
              <p className="text-xs text-white/45 truncate mt-0.5">
                {versions.length} {versions.length === 1 ? 'edition' : 'editions'} · {lorebookName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={loadVersions}
            title="Refresh"
            className="p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close edition history"
              className="p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <FileText className="h-12 w-12 mx-auto mb-4 text-white/25" />
          <p>No versions found for this lorebook.</p>
        </div>
      ) : (
        <>
          {/* Version List — a timeline rail connects each edition, newest at top */}
          <div className="relative space-y-4">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-fuchsia-500/50 via-white/10 to-transparent" />
            {versions.map((version) => {
              const isLatest = version.status === 'published';
              return (
                <div key={version.id} className="relative pl-11">
                  <div
                    className={`absolute left-[13px] top-5 h-3.5 w-3.5 rounded-full border-2 ${
                      isLatest
                        ? 'bg-fuchsia-400 border-fuchsia-200 shadow-[0_0_10px_2px_rgba(232,121,249,0.65)]'
                        : 'bg-black border-white/25'
                    }`}
                  />
                  <div
                    className={`rounded-xl p-4 border transition-all ${
                      isLatest
                        ? 'bg-gradient-to-br from-fuchsia-500/[0.08] to-purple-600/[0.05] border-fuchsia-400/30 shadow-[0_0_24px_-8px_rgba(217,70,239,0.5)]'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {version.lorebookVersion != null && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                                isLatest
                                  ? 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200/70'
                              }`}
                            >
                              v{version.lorebookVersion}
                            </span>
                          )}
                          {isLatest && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-gradient-to-r from-fuchsia-500/25 to-purple-500/25 border border-fuchsia-400/30 text-fuchsia-200">
                              <Sparkles className="h-2.5 w-2.5" />
                              Latest
                            </span>
                          )}
                          {version.status === 'superseded' && (
                            <span className="px-2 py-0.5 rounded-md text-xs font-medium border border-white/10 bg-white/5 text-white/40">
                              Superseded
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getVersionColor(
                              version.version
                            )}`}
                          >
                            {getVersionLabel(version.version)}
                          </span>
                        </div>
                        <p className="text-sm text-white/85 font-medium truncate">{version.title}</p>
                        <div className="flex items-center gap-3 text-xs text-white/45 mt-1.5">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(version.generatedAt)}
                          </div>
                          {version.atomSnapshotHash && (
                            <div className="font-mono text-white/30">
                              {version.atomSnapshotHash.substring(0, 8)}...
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 -ml-2 min-[420px]:ml-0">
                        {onRead && (
                          <button
                            onClick={() => onRead(version.id)}
                            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title="Read this edition"
                          >
                            <BookOpen className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleManifest(version.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            manifestFor === version.id
                              ? 'text-fuchsia-300 bg-fuchsia-500/15'
                              : 'text-white/50 hover:text-white hover:bg-white/10'
                          }`}
                          title="Why does this edition look like this?"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (baseVersion && version.id !== baseVersion.id) {
                              compareVersions(baseVersion.id, version.id);
                            }
                          }}
                          className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Compare with latest"
                          disabled={!baseVersion || version.id === baseVersion.id}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            // Download functionality would go here
                            alert('Download functionality coming soon');
                          }}
                          className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {manifestFor === version.id && (
                    <div className="mt-2 rounded-xl border border-sky-400/20 bg-gradient-to-br from-sky-500/[0.06] to-transparent p-4 text-xs">
                      {manifestLoading ? (
                        <p className="text-white/50">Loading manifest…</p>
                      ) : manifest ? (
                        <div className="space-y-2 text-white/60">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-300 mb-2.5">
                            <Info className="h-3 w-3" />
                            Why this edition looks like this
                          </div>
                          <div>
                            <span className="text-white/40">Knowledge snapshot: </span>
                            {manifest.knowledgeSnapshot.atomCount} atoms
                            {manifest.knowledgeSnapshot.memorySnapshotAt &&
                              ` · queried ${formatDate(manifest.knowledgeSnapshot.memorySnapshotAt)}`}
                          </div>
                          {manifest.knowledgeSnapshot.atomSnapshotHash && (
                            <div>
                              <span className="text-white/40">Snapshot hash: </span>
                              <span className="font-mono px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-white/70">
                                {manifest.knowledgeSnapshot.atomSnapshotHash.substring(0, 16)}…
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-white/40">Build: </span>
                            {[manifest.buildSettings.buildFlag, manifest.buildSettings.scope, manifest.buildSettings.tone, manifest.buildSettings.depth]
                              .filter(Boolean)
                              .join(' · ') || 'default'}
                          </div>
                          {manifest.filtersApplied.length > 0 && (
                            <div>
                              <span className="text-white/40">Filters applied: </span>
                              {manifest.filtersApplied.join(', ')}
                            </div>
                          )}
                          <div className="text-white/30 pt-1.5 border-t border-white/5 mt-2.5">
                            Generator / prompt / model version: not recorded for this edition.
                          </div>
                        </div>
                      ) : (
                        <p className="text-white/50">Manifest unavailable.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Generate New Version — Phase Two (build targets); hidden by default in Milestone 1 */}
          {showGenerateVariants && baseVersion && (
            <div className="rounded-xl p-4 border border-white/10 bg-white/[0.02]">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
                Generate New Version
              </h3>
              <div className="flex flex-wrap gap-2">
                {(['safe', 'explicit', 'private'] as const).map((versionType) => {
                  const exists = versions.some(v => v.version === versionType);
                  return (
                    <button
                      key={versionType}
                      onClick={() => generateVersion(baseVersion.id, versionType)}
                      disabled={exists || generatingVersion === versionType}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        exists
                          ? 'bg-gray-500/20 text-gray-400 border border-gray-500/50 cursor-not-allowed'
                          : generatingVersion === versionType
                          ? 'bg-fuchsia-500/50 text-white border border-fuchsia-500/50 cursor-wait'
                          : 'bg-gradient-to-r from-fuchsia-500/15 to-purple-500/15 text-fuchsia-200 border border-fuchsia-400/30 hover:from-fuchsia-500/25 hover:to-purple-500/25'
                      }`}
                    >
                      {exists ? `${getVersionLabel(versionType)} (exists)` : `Generate ${getVersionLabel(versionType)}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comparison View */}
          {comparing && (
            <div className="rounded-xl p-4 border border-white/10 bg-white/[0.02] text-sm text-white/60 flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-fuchsia-300" />
              Comparing editions…
            </div>
          )}
          {comparison && (
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.02]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-sky-300" />
                  What changed
                </h3>
                <button
                  onClick={() => setComparison(null)}
                  className="text-xs text-white/50 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>

              <div className="p-4">
                {comparison.metadataChanges.length > 0 && (
                  <div className="mb-4 space-y-1 rounded-lg border border-white/10 bg-black/30 p-3">
                    {comparison.metadataChanges.map((change, idx) => (
                      <div key={idx} className="text-xs text-white/65">{change}</div>
                    ))}
                  </div>
                )}

                {comparison.differences.length === 0 && comparison.metadataChanges.length === 0 ? (
                  <p className="text-sm text-white/60">No differences found between editions.</p>
                ) : (
                  <div className="space-y-2">
                    {comparison.differences.map((diff, idx) => {
                      const style = CHANGE_TYPE_STYLE[diff.changeType];
                      const Icon = style.icon;
                      return (
                        <div key={idx} className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
                          <div className="flex items-start gap-2 mb-1.5">
                            <span
                              className={`inline-flex items-center gap-1 shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-black/25 border ${style.border}`}
                            >
                              <Icon className={`h-3 w-3 ${style.text}`} />
                              <span className={`text-[10px] font-mono uppercase tracking-wide ${style.text}`}>
                                {style.label}
                              </span>
                            </span>
                            <span className="text-sm font-medium text-white leading-snug">{diff.chapterTitle}</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {diff.differences.map((d, dIdx) => (
                              <div key={dIdx} className="text-xs text-white/55">
                                {d.description}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-white/50">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {comparison.sharedTimeline.timeSpan.start} → {comparison.sharedTimeline.timeSpan.end}
                    {' · '}
                    {comparison.sharedTimeline.chapters.length} shared chapters
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};
