import { useEffect, useState } from 'react';
import { FileText, GitBranch, Eye, Download, RefreshCw, Clock, Info, BookOpen } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import {
  compareDemoEditions,
  getDemoVersionsForName,
  type ChapterChangeType,
  type DemoVersionComparison,
} from '../../lib/storyForge/demoCoreLorebookStore';

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

type VersionComparison = DemoVersionComparison;

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
}

const CHANGE_TYPE_STYLE: Record<ChapterChangeType, { label: string; border: string; text: string }> = {
  added: { label: 'Added', border: 'border-emerald-500/50', text: 'text-emerald-300' },
  removed: { label: 'Removed', border: 'border-red-500/50', text: 'text-red-300' },
  changed: { label: 'Changed', border: 'border-amber-500/50', text: 'text-amber-300' },
  reordered: { label: 'Reordered', border: 'border-sky-500/50', text: 'text-sky-300' },
};

export const VersionManager = ({ lorebookName, baseBiographyId, showGenerateVariants = false, onRead }: VersionManagerProps) => {
  const shouldUseMock = useShouldUseMockData();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lorebookName, shouldUseMock]);

  const loadVersions = async () => {
    if (shouldUseMock) {
      setLoading(true);
      setError(null);
      const records = getDemoVersionsForName(lorebookName);
      const highestMainVersion = Math.max(
        0,
        ...records.filter((r) => r.edition === 'main').map((r) => r.lorebookVersion),
      );
      setVersions(
        records.map((record) => ({
          id: record.bookId,
          version: record.edition,
          lorebookVersion: record.lorebookVersion,
          status: record.edition === 'main' && record.lorebookVersion === highestMainVersion ? 'published' : 'superseded',
          title: record.compiledBook.title,
          generatedAt: record.createdAt,
          memorySnapshotAt: record.createdAt,
          atomSnapshotHash: record.snapshotHash,
        })),
      );
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await fetchJson<{ versions: BiographyVersion[] }>(
        `/api/biography/versions/${encodeURIComponent(lorebookName)}`
      );
      setVersions(result.versions);
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
      await fetchJson('/api/biography/versions/generate', {
        method: 'POST',
        body: JSON.stringify({
          baseBiographyId: baseId,
          versionType
        })
      });
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

    if (shouldUseMock) {
      const records = getDemoVersionsForName(lorebookName);
      const fromRecord = records.find((r) => r.bookId === fromId);
      const toRecord = records.find((r) => r.bookId === toId);
      if (!fromRecord || !toRecord) return;
      setComparing({ id1: fromId, id2: toId });
      setComparison(compareDemoEditions(fromRecord.compiledBook, toRecord.compiledBook));
      setComparing(null);
      return;
    }

    try {
      setComparing({ id1: fromId, id2: toId });
      const result = await fetchJson<{ comparison: VersionComparison }>(
        `/api/biography/versions/compare`,
        {
          method: 'POST',
          body: JSON.stringify({ biographyId1: fromId, biographyId2: toId })
        }
      );
      setComparison(result.comparison);
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

    if (shouldUseMock) {
      const record = getDemoVersionsForName(lorebookName).find((r) => r.bookId === versionId);
      if (record) {
        setManifest({
          editionId: record.id,
          publicationHandle: null,
          lorebookVersion: record.lorebookVersion,
          knowledgeSnapshot: {
            atomCount: record.compiledBook.latestVersion.atomCount,
            atomSnapshotHash: record.snapshotHash,
            memorySnapshotAt: record.createdAt,
          },
          buildSettings: {
            buildFlag: record.edition,
            scope: null,
            tone: null,
            depth: null,
            audience: null,
          },
          filtersApplied: record.edition === 'main' ? [] : [record.edition],
          generatorVersion: null,
          promptVersion: null,
          modelVersion: null,
          filterVersion: null,
        });
      }
      return;
    }

    setManifestLoading(true);
    try {
      const result = await fetchJson<{ manifest: EditionManifest }>(`/api/biography/${versionId}/manifest`);
      setManifest(result.manifest);
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
      <div className="p-6 text-center text-white/60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2">Loading versions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        <p>{error}</p>
        <button
          onClick={loadVersions}
          className="mt-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80"
        >
          Retry
        </button>
      </div>
    );
  }

  const baseVersion = baseBiographyId
    ? versions.find(v => v.id === baseBiographyId)
    : versions.find(v => v.status === 'published') || versions.find(v => v.version === 'main') || versions[0];

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black/40 rounded-lg border border-border/50">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          Edition History
        </h2>
        <button
          onClick={loadVersions}
          className="text-xs text-white/60 hover:text-white transition-colors flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          <FileText className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p>No versions found for this lorebook.</p>
        </div>
      ) : (
        <>
          {/* Version List */}
          <div className="space-y-3">
            {versions.map((version) => (
              <div key={version.id}>
                <div
                  className="bg-black/60 rounded-lg p-4 border border-border/30 hover:border-border/60 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {version.lorebookVersion != null && (
                          <span className="px-2 py-1 rounded text-xs font-mono border border-amber-500/40 bg-amber-500/10 text-amber-200/80">
                            v{version.lorebookVersion}
                          </span>
                        )}
                        {version.status === 'superseded' && (
                          <span className="px-2 py-1 rounded text-xs font-medium border border-white/15 bg-white/5 text-white/45">
                            Superseded
                          </span>
                        )}
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium border ${getVersionColor(
                            version.version
                          )}`}
                        >
                          {getVersionLabel(version.version)}
                        </span>
                        <span className="text-sm text-white/80">{version.title}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-white/60">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(version.generatedAt)}
                        </div>
                        {version.atomSnapshotHash && (
                          <div className="font-mono text-white/40">
                            {version.atomSnapshotHash.substring(0, 8)}...
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {onRead && (
                        <button
                          onClick={() => onRead(version.id)}
                          className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
                          title="Read this edition"
                        >
                          <BookOpen className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleManifest(version.id)}
                        className={`p-2 rounded transition-colors ${
                          manifestFor === version.id ? 'text-primary bg-primary/10' : 'text-white/60 hover:text-white hover:bg-white/5'
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
                        className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
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
                        className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {manifestFor === version.id && (
                  <div className="mt-1 ml-2 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
                    {manifestLoading ? (
                      <p className="text-white/50">Loading manifest…</p>
                    ) : manifest ? (
                      <div className="space-y-1.5 text-white/60">
                        <div>
                          <span className="text-white/40">Knowledge snapshot: </span>
                          {manifest.knowledgeSnapshot.atomCount} atoms
                          {manifest.knowledgeSnapshot.memorySnapshotAt &&
                            ` · queried ${formatDate(manifest.knowledgeSnapshot.memorySnapshotAt)}`}
                        </div>
                        {manifest.knowledgeSnapshot.atomSnapshotHash && (
                          <div>
                            <span className="text-white/40">Snapshot hash: </span>
                            <span className="font-mono">{manifest.knowledgeSnapshot.atomSnapshotHash.substring(0, 16)}…</span>
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
                        <div className="text-white/30 pt-1">
                          Generator / prompt / model version: not recorded for this edition.
                        </div>
                      </div>
                    ) : (
                      <p className="text-white/50">Manifest unavailable.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Generate New Version — Phase Two (build targets); hidden by default in Milestone 1 */}
          {showGenerateVariants && baseVersion && (
            <div className="bg-black/60 rounded-lg p-4 border border-border/30">
              <h3 className="text-sm font-semibold text-white mb-3">Generate New Version</h3>
              <div className="flex flex-wrap gap-2">
                {(['safe', 'explicit', 'private'] as const).map((versionType) => {
                  const exists = versions.some(v => v.version === versionType);
                  return (
                    <button
                      key={versionType}
                      onClick={() => generateVersion(baseVersion.id, versionType)}
                      disabled={exists || generatingVersion === versionType}
                      className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                        exists
                          ? 'bg-gray-500/20 text-gray-400 border border-gray-500/50 cursor-not-allowed'
                          : generatingVersion === versionType
                          ? 'bg-primary/50 text-white border border-primary/50 cursor-wait'
                          : 'bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30'
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
            <div className="bg-black/60 rounded-lg p-4 border border-border/30 text-sm text-white/60 flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Comparing editions…
            </div>
          )}
          {comparison && (
            <div className="bg-black/60 rounded-lg p-4 border border-border/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">What changed</h3>
                <button
                  onClick={() => setComparison(null)}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Close
                </button>
              </div>

              {comparison.metadataChanges.length > 0 && (
                <div className="mb-4 space-y-1">
                  {comparison.metadataChanges.map((change, idx) => (
                    <div key={idx} className="text-xs text-white/70">{change}</div>
                  ))}
                </div>
              )}

              {comparison.differences.length === 0 && comparison.metadataChanges.length === 0 ? (
                <p className="text-sm text-white/60">No differences found between editions.</p>
              ) : (
                <div className="space-y-3">
                  {comparison.differences.map((diff, idx) => {
                    const style = CHANGE_TYPE_STYLE[diff.changeType];
                    return (
                      <div key={idx} className={`border-l-2 ${style.border} pl-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono uppercase tracking-wide ${style.text}`}>
                            {style.label}
                          </span>
                          <span className="text-sm font-medium text-white">{diff.chapterTitle}</span>
                        </div>
                        <div className="space-y-1">
                          {diff.differences.map((d, dIdx) => (
                            <div key={dIdx} className="text-xs text-white/60">
                              {d.description}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border/30">
                <div className="text-xs text-white/60 mb-2">Shared Timeline</div>
                <div className="text-sm text-white/80">
                  {comparison.sharedTimeline.timeSpan.start} → {comparison.sharedTimeline.timeSpan.end}
                </div>
                <div className="text-xs text-white/60 mt-1">
                  {comparison.sharedTimeline.chapters.length} chapters
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
