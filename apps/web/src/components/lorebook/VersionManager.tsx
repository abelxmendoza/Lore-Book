import { useEffect, useState } from 'react';
import { FileText, GitBranch, Eye, Download, RefreshCw, Clock } from 'lucide-react';
import { fetchJson } from '../../lib/api';

interface BiographyVersion {
  id: string;
  version: string;
  title: string;
  generatedAt: string;
  memorySnapshotAt: string;
  atomSnapshotHash: string;
}

interface VersionComparison {
  baseId: string;
  versionId: string;
  differences: {
    chapterId: string;
    chapterTitle: string;
    differences: {
      type: 'content' | 'filtering' | 'structure';
      description: string;
    }[];
  }[];
  sharedTimeline: {
    chapters: any[];
    timeSpan: { start: string; end: string };
  };
}

interface VersionManagerProps {
  lorebookName: string;
  baseBiographyId?: string;
}

export const VersionManager = ({ lorebookName, baseBiographyId }: VersionManagerProps) => { => {
  const [versions, setVersions] = useState<BiographyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparing, setComparing] = useState<{ id1: string; id2: string } | null>(null);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [generatingVersion, setGeneratingVersion] = useState<string | null>(null);

  useEffect(() => {
    if (lorebookName) {
      loadVersions();
    }
  }, [lorebookName]);

  const loadVersions = async () => {
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

  const compareVersions = async (id1: string, id2: string) => {
    try {
      setComparing({ id1, id2 });
      const result = await fetchJson<{ comparison: VersionComparison }>(
        `/api/biography/versions/compare`,
        {
          method: 'POST',
          body: JSON.stringify({ biographyId1: id1, biographyId2: id2 })
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
    : versions.find(v => v.version === 'main') || versions[0];

  return (
    <div className="p-4 md:p-6 space-y-6 bg-black/40 rounded-lg border border-border/50">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          Version Management
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
              <div
                key={version.id}
                className="bg-black/60 rounded-lg p-4 border border-border/30 hover:border-border/60 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
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
                    <button
                      onClick={() => {
                        if (baseVersion && version.id !== baseVersion.id) {
                          compareVersions(baseVersion.id, version.id);
                        }
                      }}
                      className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
                      title="Compare with base"
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
            ))}
          </div>

          {/* Generate New Version */}
          {baseVersion && (
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
          {comparison && (
            <div className="bg-black/60 rounded-lg p-4 border border-border/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Version Comparison</h3>
                <button
                  onClick={() => setComparison(null)}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Close
                </button>
              </div>

              {comparison.differences.length === 0 ? (
                <p className="text-sm text-white/60">No differences found between versions.</p>
              ) : (
                <div className="space-y-3">
                  {comparison.differences.map((diff, idx) => (
                    <div key={idx} className="border-l-2 border-primary/50 pl-3">
                      <div className="text-sm font-medium text-white mb-1">{diff.chapterTitle}</div>
                      <div className="space-y-1">
                        {diff.differences.map((d, dIdx) => (
                          <div key={dIdx} className="text-xs text-white/60">
                            <span className="capitalize">{d.type}:</span> {d.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
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
