import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { reactionApi } from '../../api/reactions';
import { perceptionReactionEngineApi } from '../../api/perceptionReactionEngine';
import { REACTION_LABELS, type ReactionTriggerType, type ReactionType, type CreateReactionInput } from '../../types/reaction';

interface ReactionFormProps {
  triggerType: ReactionTriggerType;
  triggerId: string;
  onClose: () => void;
  onSave: () => void;
}

export const ReactionForm: React.FC<ReactionFormProps> = ({
  triggerType,
  triggerId,
  onClose,
  onSave
}) => {
  const [reactionType, setReactionType] = useState<ReactionType>('emotional');
  const [reactionLabel, setReactionLabel] = useState('');
  const [intensity, setIntensity] = useState<number>(0.5);
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const [copingResponse, setCopingResponse] = useState('');
  const [resolutionState, setResolutionState] = useState<'active' | 'resolved' | 'lingering' | 'recurring'>('active');
  const [outcome, setOutcome] = useState<'avoided' | 'confronted' | 'self_soothed' | 'escalated' | 'processed' | 'other' | ''>('');
  const [saving, setSaving] = useState(false);

  const availableLabels = REACTION_LABELS[reactionType] || [];

  const handleSave = async () => {
    if (!reactionLabel.trim()) {
      alert('Please select or enter a reaction label');
      return;
    }

    setSaving(true);
    try {
      const input: CreateReactionInput = {
        trigger_type: triggerType,
        trigger_id: triggerId,
        reaction_type: reactionType,
        reaction_label: reactionLabel,
        intensity,
        duration: duration || undefined,
        description: description || undefined,
        automatic,
        coping_response: copingResponse || undefined,
        timestamp_started: new Date().toISOString()
      };

      const created = await reactionApi.createReaction(input);

      // If resolved, update resolution state and outcome
      if (resolutionState !== 'active') {
        await perceptionReactionEngineApi.updateResolution(
          created.id,
          resolutionState,
          outcome || undefined
        );
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to create reaction:', error);
      alert('Failed to create reaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-black/90 border border-orange-500/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Add Reaction</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Reaction Type */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Reaction Type</label>
          <div className="grid grid-cols-4 gap-2">
            {(['emotional', 'behavioral', 'cognitive', 'physical'] as ReactionType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setReactionType(type);
                  setReactionLabel(''); // Reset label when type changes
                }}
                className={`px-3 py-2 rounded text-sm transition-colors ${
                  reactionType === type
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : 'bg-black/40 text-white/60 border border-white/10 hover:bg-white/5'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Reaction Label */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Reaction</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {availableLabels.map((label) => (
              <button
                key={label}
                onClick={() => setReactionLabel(label)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  reactionLabel === label
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                    : 'bg-black/40 text-white/60 border border-white/10 hover:bg-white/5'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Input
            value={reactionLabel}
            onChange={(e) => setReactionLabel(e.target.value)}
            placeholder="Or enter custom reaction..."
            className="bg-black/60 border-border/50 text-white"
          />
        </div>

        {/* Intensity */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">
            Intensity: {Math.round(intensity * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Duration (optional)</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
          >
            <option value="">Select duration...</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Description (optional)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-black/60 border-border/50 text-white resize-none"
            placeholder="Describe the reaction..."
          />
        </div>

        {/* Automatic */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="automatic"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="automatic" className="text-sm text-white/70">
            Automatic/reflexive (unchecked = deliberate)
          </label>
        </div>

        {/* Coping Response */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Coping Response (optional)</label>
          <Textarea
            value={copingResponse}
            onChange={(e) => setCopingResponse(e.target.value)}
            rows={2}
            className="bg-black/60 border-border/50 text-white resize-none"
            placeholder="What did you do to handle it?"
          />
        </div>

        {/* Resolution State (if resolved) */}
        <div>
          <label className="text-sm font-medium text-white/70 mb-2 block">Resolution State</label>
          <select
            value={resolutionState}
            onChange={(e) => setResolutionState(e.target.value as any)}
            className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
          >
            <option value="active">Active (ongoing)</option>
            <option value="resolved">Resolved</option>
            <option value="lingering">Lingering (low-level ongoing)</option>
            <option value="recurring">Recurring (comes back)</option>
          </select>
        </div>

        {/* Outcome (if resolved) */}
        {resolutionState === 'resolved' && (
          <div>
            <label className="text-sm font-medium text-white/70 mb-2 block">Outcome (optional)</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as any)}
              className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
            >
              <option value="">Select outcome...</option>
              <option value="avoided">Avoided</option>
              <option value="confronted">Confronted</option>
              <option value="self_soothed">Self-soothed</option>
              <option value="escalated">Escalated</option>
              <option value="processed">Processed</option>
              <option value="other">Other</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-orange-500/30">
        <Button
          onClick={handleSave}
          disabled={saving || !reactionLabel.trim()}
          leftIcon={<Save className="h-4 w-4" />}
          className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30"
        >
          {saving ? 'Saving...' : 'Save Reaction'}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
