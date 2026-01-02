import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, AlertTriangle, Calendar, Users, Tag, Info, Keyboard } from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import { EvidencePanel } from './EvidencePanel';
import { ContradictionTimeline } from './ContradictionTimeline';
import { AIResolutionSuggestions } from './AIResolutionSuggestions';
import { ResolutionActions } from './ResolutionActions';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Modal } from '../ui/modal';
import { useContradictionResolution } from '../../hooks/useContradictionResolution';
import { useToast } from '../ui/toast';
import type { ContinuityEvent } from '../../types/continuity';

type ContradictionResolutionViewProps = {
  contradiction: ContinuityEvent;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  onResolutionComplete?: () => void;
};

export const ContradictionResolutionView = ({
  contradiction,
  onClose,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  onResolutionComplete,
}: ContradictionResolutionViewProps) => {
  const { contradictionDetails, loading, resolveContradiction, getAISuggestion, setSelectedContradiction } =
    useContradictionResolution();
  const [resolvedText, setResolvedText] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showInstructions, setShowInstructions] = useState(() => {
    return !localStorage.getItem('truth-seeker-instructions-dismissed');
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const toast = useToast();

  // Set selected contradiction when component mounts
  useEffect(() => {
    setSelectedContradiction(contradiction);
  }, [contradiction, setSelectedContradiction]);

  useEffect(() => {
    if (contradictionDetails?.originalComponent && contradictionDetails?.contradictingComponent) {
      // Initialize resolved text with original
      setResolvedText(contradictionDetails.originalComponent.text);
    }
  }, [contradictionDetails]);

  const handleAcceptLeft = async () => {
    setResolving(true);
    try {
      await resolveContradiction(contradiction.id, 'accept_left');
      toast.success('Accepted original statement');
      onResolutionComplete?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to resolve contradiction:', error);
      toast.error('Failed to resolve contradiction. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleAcceptRight = async () => {
    setResolving(true);
    try {
      await resolveContradiction(contradiction.id, 'accept_right');
      toast.success('Accepted contradicting statement');
      onResolutionComplete?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to resolve contradiction:', error);
      toast.error('Failed to resolve contradiction. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleMerge = async () => {
    if (!resolvedText.trim()) {
      toast.warning('Please edit the resolved text before merging');
      return;
    }
    setResolving(true);
    try {
      await resolveContradiction(contradiction.id, 'merge', undefined, resolvedText);
      toast.success('Contradiction merged successfully');
      onResolutionComplete?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to merge contradiction:', error);
      toast.error('Failed to merge contradiction. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleResolveWithNotes = async (notes: string) => {
    setResolving(true);
    try {
      await resolveContradiction(contradiction.id, 'resolve_with_notes', notes, resolvedText);
      toast.success('Resolved with custom notes');
      onResolutionComplete?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to resolve contradiction:', error);
      toast.error('Failed to resolve contradiction. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleDismiss = async () => {
    setResolving(true);
    try {
      await resolveContradiction(contradiction.id, 'dismiss');
      toast.info('Contradiction dismissed');
      onResolutionComplete?.();
      onClose?.();
    } catch (error) {
      console.error('Failed to dismiss contradiction:', error);
      toast.error('Failed to dismiss contradiction. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleSaveDraft = () => {
    // Save to localStorage or backend
    localStorage.setItem(`contradiction-draft-${contradiction.id}`, resolvedText);
    toast.info('Draft saved locally');
  };

  const handleAISuggestion = async () => {
    setAiLoading(true);
    try {
      const suggestion = await getAISuggestion(contradiction.id);
      if (suggestion.action === 'accept_left') {
        await handleAcceptLeft();
      } else if (suggestion.action === 'accept_right') {
        await handleAcceptRight();
      } else if (suggestion.action === 'merge') {
        setResolvedText(suggestion.suggestion);
        toast.success('AI suggestion applied to resolved text');
      }
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
      toast.error('Failed to get AI suggestion. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading || !contradictionDetails) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white/60">Loading contradiction details...</div>
      </div>
    );
  }

  const { originalComponent, contradictingComponent, supportingEvidence, contradictingEvidence, timelineContext } =
    contradictionDetails;

  const handleDismissInstructions = () => {
    setShowInstructions(false);
    localStorage.setItem('truth-seeker-instructions-dismissed', 'true');
  };

  return (
    <>
      <div className="flex flex-col h-full bg-black/40">
      {/* Instructions Panel */}
      {showInstructions && (
        <div className="border-b border-border/60 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 p-4 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm text-white/80">
              <p className="font-medium mb-1">Resolving Contradictions</p>
              <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
                <li>Compare the two statements side-by-side</li>
                <li>Review evidence and timeline to understand context</li>
                <li>Choose to accept one version, merge both, or add notes</li>
                <li>Use <kbd className="px-1 py-0.5 bg-black/60 rounded text-xs">⌘L</kbd> or <kbd className="px-1 py-0.5 bg-black/60 rounded text-xs">⌘R</kbd> for quick resolution</li>
              </ul>
            </div>
            <button
              onClick={handleDismissInstructions}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="border-b border-border/60 bg-black/60 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="p-2 rounded hover:bg-black/40 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-2 rounded hover:bg-black/40 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">Contradiction Resolution</h2>
              <p className="text-xs text-white/60">Severity: {contradiction.severity}/10</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
            {contradiction.metadata?.method as string || 'semantic_cluster'}
          </Badge>
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-2 rounded hover:bg-black/40 text-white/60 hover:text-white"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="h-5 w-5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-black/40 text-white/60 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Main Panels */}
        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto min-h-0">
          {/* Diff Viewer */}
          <div className="flex-1 min-h-0">
            <DiffViewer
              leftText={originalComponent.text}
              rightText={contradictingComponent.text}
              leftLabel={`Original (${new Date(originalComponent.timestamp || originalComponent.created_at || '').toLocaleDateString()})`}
              rightLabel={`Contradicting (${new Date(contradictingComponent.timestamp || contradictingComponent.created_at || '').toLocaleDateString()})`}
              onAcceptLeft={handleAcceptLeft}
              onAcceptRight={handleAcceptRight}
            />
          </div>

          {/* Component Metadata */}
          <div className="grid grid-cols-2 gap-4 flex-shrink-0">
            <Card className="bg-black/40 border-border/60">
              <CardContent className="pt-4">
                <h4 className="text-sm font-semibold text-white mb-2">Original Component</h4>
                <div className="space-y-2 text-xs">
                  {originalComponent.characters_involved.length > 0 && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Users className="h-3 w-3" />
                      {originalComponent.characters_involved.join(', ')}
                    </div>
                  )}
                  {originalComponent.location && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Tag className="h-3 w-3" />
                      {originalComponent.location}
                    </div>
                  )}
                  {originalComponent.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {originalComponent.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-black/40 border-border/60">
              <CardContent className="pt-4">
                <h4 className="text-sm font-semibold text-white mb-2">Contradicting Component</h4>
                <div className="space-y-2 text-xs">
                  {contradictingComponent.characters_involved.length > 0 && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Users className="h-3 w-3" />
                      {contradictingComponent.characters_involved.join(', ')}
                    </div>
                  )}
                  {contradictingComponent.location && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Tag className="h-3 w-3" />
                      {contradictingComponent.location}
                    </div>
                  )}
                  {contradictingComponent.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {contradictingComponent.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resolved Version Editor */}
          <Card className="bg-black/40 border-border/60 flex-shrink-0">
            <CardContent className="pt-4">
              <h4 className="text-sm font-semibold text-white mb-2">Resolved Version (Editable)</h4>
              <Textarea
                value={resolvedText}
                onChange={(e) => setResolvedText(e.target.value)}
                placeholder="Edit the resolved version here..."
                className="bg-black/60 border-border/60 text-white min-h-[100px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Resolution Actions */}
          <div className="flex-shrink-0">
            <ResolutionActions
              onAcceptLeft={handleAcceptLeft}
              onAcceptRight={handleAcceptRight}
              onMerge={handleMerge}
              onResolveWithNotes={handleResolveWithNotes}
              onDismiss={handleDismiss}
              onSaveDraft={handleSaveDraft}
              loading={loading || resolving}
            />
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-80 border-l border-border/60 p-4 space-y-4 overflow-y-auto min-h-0 flex-shrink-0 relative">
            <button
              onClick={() => setShowSidebar(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded hover:bg-black/40 text-white/60 bg-black/60"
            >
              <X className="h-4 w-4" />
            </button>
            <EvidencePanel
              supportingEvidence={supportingEvidence}
              contradictingEvidence={contradictingEvidence}
            />
            <ContradictionTimeline
              originalDate={originalComponent.timestamp || originalComponent.created_at || ''}
              contradictingDate={contradictingComponent.timestamp || contradictingComponent.created_at || ''}
              contextEvents={timelineContext}
            />
            <AIResolutionSuggestions
              leftText={originalComponent.text}
              rightText={contradictingComponent.text}
              onSuggestionAccept={handleAISuggestion}
              loading={aiLoading}
            />
          </div>
        )}
      </div>
      </div>
    </>
  );
};

