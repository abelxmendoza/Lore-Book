import { useState } from 'react';
import { CheckCircle2, XCircle, Edit, FileText, Save, Undo2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent } from '../ui/card';
import { Modal } from '../ui/modal';

type ResolutionAction = 'accept_left' | 'accept_right' | 'merge' | 'resolve_with_notes' | 'dismiss';

type ResolutionActionsProps = {
  onAcceptLeft?: () => void;
  onAcceptRight?: () => void;
  onMerge?: () => void;
  onResolveWithNotes?: (notes: string) => void;
  onDismiss?: () => void;
  onSaveDraft?: (draft: string) => void;
  hasDraft?: boolean;
  onUndo?: () => void;
  loading?: boolean;
};

export const ResolutionActions = ({
  onAcceptLeft,
  onAcceptRight,
  onMerge,
  onResolveWithNotes,
  onDismiss,
  onSaveDraft,
  hasDraft = false,
  onUndo,
  loading = false,
}: ResolutionActionsProps) => {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);

  const handleResolveWithNotes = () => {
    if (notes.trim()) {
      onResolveWithNotes?.(notes);
      setShowNotes(false);
      setNotes('');
    }
  };

  const handleAction = (action: ResolutionAction, handler?: () => void) => {
    if (action === 'resolve_with_notes') {
      setShowNotes(true);
      return;
    }
    if (action === 'dismiss') {
      setShowDismissConfirm(true);
      return;
    }
    handler?.();
  };

  const confirmDismiss = () => {
    onDismiss?.();
    setShowDismissConfirm(false);
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Main Actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleAction('accept_left', onAcceptLeft)}
              disabled={loading}
              className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/30 h-12"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Accept Original
              <span className="ml-2 text-xs opacity-70">(⌘L)</span>
            </Button>
            <Button
              onClick={() => handleAction('accept_right', onAcceptRight)}
              disabled={loading}
              className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30 h-12"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Accept Contradicting
              <span className="ml-2 text-xs opacity-70">(⌘R)</span>
            </Button>
            <Button
              onClick={() => handleAction('merge', onMerge)}
              disabled={loading}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border-purple-500/30 h-12"
            >
              <Edit className="h-4 w-4 mr-2" />
              Merge & Edit
            </Button>
            <Button
              onClick={() => handleAction('resolve_with_notes')}
              disabled={loading}
              className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/30 h-12"
            >
              <FileText className="h-4 w-4 mr-2" />
              Resolve with Notes
            </Button>
          </div>

          {/* Secondary Actions */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleAction('dismiss')}
              disabled={loading}
              variant="outline"
              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
            {onSaveDraft && (
              <Button
                onClick={() => onSaveDraft(notes)}
                disabled={loading}
                variant="outline"
                className="border-border/60 text-white/60 hover:text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
            )}
            {hasDraft && onUndo && (
              <Button
                onClick={onUndo}
                disabled={loading}
                variant="outline"
                className="border-border/60 text-white/60 hover:text-white"
              >
                <Undo2 className="h-4 w-4 mr-2" />
                Undo
              </Button>
            )}
          </div>

          {/* Notes Input */}
          {showNotes && (
            <div className="space-y-2 animate-in slide-in-from-top-2">
              <label className="text-sm font-medium text-white">Resolution Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain how you resolved this contradiction..."
                className="bg-black/60 border-border/60 text-white min-h-[100px]"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleResolveWithNotes}
                  disabled={!notes.trim() || loading}
                  className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
                >
                  Save Resolution
                </Button>
                <Button
                  onClick={() => {
                    setShowNotes(false);
                    setNotes('');
                  }}
                  variant="outline"
                  className="border-border/60 text-white/60 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Confirmation Dialog */}
          <Modal
            isOpen={showDismissConfirm}
            onClose={() => setShowDismissConfirm(false)}
            title="Dismiss Contradiction?"
            maxWidth="md"
          >
            <div className="space-y-4">
              <p className="text-sm text-white/70">
                This will mark the contradiction as a false positive. You can always review it again later. Are you sure?
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => setShowDismissConfirm(false)}
                  variant="outline"
                  className="border-border/60 text-white/60 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDismiss}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border-red-500/30"
                >
                  Yes, Dismiss
                </Button>
              </div>
            </div>
          </Modal>

          {/* Keyboard Shortcuts Help */}
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs text-white/50">
              Keyboard shortcuts: <kbd className="px-1 py-0.5 bg-black/60 rounded text-xs">⌘L</kbd> Accept Left,{' '}
              <kbd className="px-1 py-0.5 bg-black/60 rounded text-xs">⌘R</kbd> Accept Right
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

