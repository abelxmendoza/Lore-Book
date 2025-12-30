import React, { useState, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { ReactionChip } from './ReactionChip';
import { ReactionForm } from './ReactionForm';
import { reactionApi } from '../../api/reactions';
import type { ReactionEntry, ReactionTriggerType } from '../../types/reaction';

interface ReactionListProps {
  triggerType: ReactionTriggerType;
  triggerId: string;
  onReactionChange?: () => void;
}

export const ReactionList: React.FC<ReactionListProps> = ({
  triggerType,
  triggerId,
  onReactionChange
}) => {
  const [reactions, setReactions] = useState<ReactionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void loadReactions();
  }, [triggerType, triggerId]);

  const loadReactions = async () => {
    setLoading(true);
    try {
      const data = await reactionApi.getReactionsForTrigger(triggerType, triggerId);
      setReactions(data);
    } catch (error) {
      console.error('Failed to load reactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReactionSaved = () => {
    void loadReactions();
    onReactionChange?.();
  };

  const handleRemove = async (reactionId: string) => {
    try {
      await reactionApi.deleteReaction(reactionId);
      void loadReactions();
      onReactionChange?.();
    } catch (error) {
      console.error('Failed to delete reaction:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-white/60 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading reactions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/70">Reactions</h4>
        {!showForm && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowForm(true)}
            leftIcon={<Plus className="h-3 w-3" />}
            className="text-orange-400 hover:text-orange-300"
          >
            Add Reaction
          </Button>
        )}
      </div>

      {showForm && (
        <ReactionForm
          triggerType={triggerType}
          triggerId={triggerId}
          onClose={() => setShowForm(false)}
          onSave={handleReactionSaved}
        />
      )}

      {reactions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {reactions.map((reaction) => (
            <ReactionChip
              key={reaction.id}
              reaction={reaction}
              onRemove={handleRemove}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-xs text-white/40 italic">
            No reactions yet. Click "Add Reaction" to track how you responded.
          </p>
        )
      )}
    </div>
  );
};
