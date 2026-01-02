import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft, Info, HelpCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { ContradictionList } from '../truth-seeker/ContradictionList';
import { ContradictionResolutionView } from '../truth-seeker/ContradictionResolutionView';
import { useContradictionResolution } from '../../hooks/useContradictionResolution';
import { useToast } from '../ui/toast';
import type { ContinuityEvent } from '../../types/continuity';

export const TruthSeekerPanel = () => {
  const { contradictions, loading, refresh, setSelectedContradiction } = useContradictionResolution();
  const [selectedContradiction, setSelected] = useState<ContinuityEvent | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'resolution'>('list');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const toast = useToast();

  // Auto-refresh on mount to get latest contradictions
  useEffect(() => {
    handleRefresh(true); // Silent refresh on mount
  }, []);

  const handleRefresh = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }
    try {
      await refresh();
      if (!silent) {
        toast.success('Contradictions list refreshed');
      }
    } catch (error) {
      console.error('Failed to refresh contradictions:', error);
      if (!silent) {
        toast.error('Failed to refresh contradictions');
      }
    } finally {
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  };

  const handleResolutionComplete = () => {
    // Auto-refresh after resolution
    handleRefresh(true);
    toast.success('Contradiction resolved successfully');
    setViewMode('list');
    setSelected(null);
    setSelectedContradiction(null);
  };

  const handleContradictionClick = (contradiction: ContinuityEvent) => {
    setSelected(contradiction);
    setSelectedContradiction(contradiction);
    setViewMode('resolution');
  };

  const handleCloseResolution = () => {
    setSelected(null);
    setSelectedContradiction(null);
    setViewMode('list');
  };

  const currentIndex = selectedContradiction
    ? contradictions.findIndex((c) => c.id === selectedContradiction.id)
    : -1;
  const hasNext = currentIndex >= 0 && currentIndex < contradictions.length - 1;
  const hasPrevious = currentIndex > 0;

  const handleNext = () => {
    if (hasNext && currentIndex >= 0) {
      const next = contradictions[currentIndex + 1];
      setSelected(next);
      setSelectedContradiction(next);
    }
  };

  const handlePrevious = () => {
    if (hasPrevious && currentIndex >= 0) {
      const prev = contradictions[currentIndex - 1];
      setSelected(prev);
      setSelectedContradiction(prev);
    }
  };

  const resolvedCount = contradictions.filter((c) => c.metadata?.resolved).length;
  const unresolvedCount = contradictions.length - resolvedCount;
  const [showHelp, setShowHelp] = useState(false);

  if (viewMode === 'resolution' && selectedContradiction) {
    return (
      <>
        <toast.ToastContainer />
        <div className="space-y-6">
          <Card className="bg-black/40 border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCloseResolution}
                    className="text-white/60 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to List
                  </Button>
                  <CardTitle className="font-techno text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-cyan-400" />
                    Truth Seeker - Resolution
                  </CardTitle>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-white/60">
                    {currentIndex + 1} of {contradictions.length}
                  </div>
                  {isRefreshing && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Refreshing" />
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
          <div className="rounded-2xl border border-border/60 bg-black/40 shadow-panel h-[calc(100vh-12rem)] overflow-auto">
            <ContradictionResolutionView
              contradiction={selectedContradiction}
              onClose={handleCloseResolution}
              onNext={handleNext}
              onPrevious={handlePrevious}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              onResolutionComplete={handleResolutionComplete}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <toast.ToastContainer />
      <Card className="neon-surface border border-cyan/30">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="font-techno text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-cyan-400" />
              Truth Seeker
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(true)}
              className="text-white/60 hover:text-white"
              title="What is Truth Seeker?"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            {(loading || isRefreshing) && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Loading" />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRefresh()}
            disabled={loading || isRefreshing}
            className="text-white/60 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Description */}
          <CardDescription className="text-sm text-white/70">
            Truth Seeker automatically detects contradictions in your journal entries by comparing 
            statements across time. Review and resolve contradictions to maintain consistency in your story.
          </CardDescription>

          {/* Quick Guide */}
          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <h4 className="text-sm font-semibold text-cyan-400 mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              How it works
            </h4>
            <ul className="text-xs text-white/70 space-y-1 list-disc list-inside">
              <li>Click any contradiction to view details</li>
              <li>Compare original vs contradicting statements side-by-side</li>
              <li>Review evidence and timeline context</li>
              <li>Accept one version, merge both, or add resolution notes</li>
              <li>Use AI suggestions for guidance (optional)</li>
            </ul>
          </div>
        {/* Statistics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Total</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{contradictions.length}</p>
          </div>
          <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 p-3">
            <div className="flex items-center gap-2 text-yellow-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Unresolved</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{unresolvedCount}</p>
          </div>
          <div className="rounded-lg border border-green-400/30 bg-green-400/10 p-3">
            <div className="flex items-center gap-2 text-green-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Resolved</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{resolvedCount}</p>
          </div>
        </div>

        {/* Progress Indicator */}
        {contradictions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Resolution Progress</span>
              <span>{resolvedCount} / {contradictions.length} resolved</span>
            </div>
            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                style={{ width: `${contradictions.length > 0 ? (resolvedCount / contradictions.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Contradictions List */}
        <ContradictionList
          contradictions={contradictions}
          loading={loading}
          onContradictionClick={handleContradictionClick}
        />
      </CardContent>
      </Card>

      {/* Help Modal */}
      <Modal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="About Truth Seeker"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-sm text-white/80">
          <p>
            Truth Seeker automatically analyzes your journal entries to detect contradictions 
            and inconsistencies across time. This helps maintain accuracy and coherence in your story.
          </p>
          <div>
            <h4 className="font-semibold mb-2 text-white">How it works:</h4>
            <ul className="list-disc list-inside space-y-1 text-white/70">
              <li>Compares statements about the same topics across different entries</li>
              <li>Uses semantic analysis to detect contradictions</li>
              <li>Shows evidence and timeline context for each contradiction</li>
              <li>Provides AI suggestions to help you resolve conflicts</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2 text-white">Resolution options:</h4>
            <ul className="list-disc list-inside space-y-1 text-white/70">
              <li><strong>Accept Original:</strong> Keep the earlier statement</li>
              <li><strong>Accept Contradicting:</strong> Keep the newer statement</li>
              <li><strong>Merge:</strong> Combine both statements</li>
              <li><strong>Resolve with Notes:</strong> Add your own explanation</li>
              <li><strong>Dismiss:</strong> Mark as false positive</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2 text-white">Severity levels:</h4>
            <ul className="list-disc list-inside space-y-1 text-white/70">
              <li><strong>High (8-10):</strong> Major contradictions requiring immediate attention</li>
              <li><strong>Medium (5-7):</strong> Moderate inconsistencies</li>
              <li><strong>Low (1-4):</strong> Minor discrepancies</li>
            </ul>
          </div>
        </div>
      </Modal>
    </>
  );
};
