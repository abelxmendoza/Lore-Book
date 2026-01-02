import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry, CreatePerceptionInput, PerceptionSource, PerceptionSentiment, PerceptionStatus } from '../../types/perception';

type PerceptionEntryModalProps = {
  perception?: PerceptionEntry;
  personId?: string;
  personName?: string;
  onClose: () => void;
  onSave: () => void;
};

export const PerceptionEntryModal = ({
  perception,
  personId,
  personName,
  onClose,
  onSave
}: PerceptionEntryModalProps) => {
  const [loading, setLoading] = useState(false);
  // HARD RULE: Content must be framed as YOUR belief, not objective fact
  const [formData, setFormData] = useState<CreatePerceptionInput & { status?: PerceptionStatus; resolution_note?: string; retracted?: boolean }>({
    subject_person_id: personId,
    subject_alias: personName || '',
    source: 'told_by',
    content: '',
    confidence_level: 0.3, // Default LOW
    timestamp_heard: new Date().toISOString()
  });

  useEffect(() => {
    if (perception) {
      setFormData({
        subject_person_id: perception.subject_person_id || undefined,
        subject_alias: perception.subject_alias,
        source: perception.source,
        source_detail: perception.source_detail || undefined,
        content: perception.content,
        sentiment: perception.sentiment || undefined,
        confidence_level: perception.confidence_level,
        timestamp_heard: perception.timestamp_heard,
        related_memory_id: perception.related_memory_id || undefined,
        status: perception.status,
        resolution_note: perception.resolution_note || undefined,
        retracted: perception.retracted
      });
    }
  }, [perception]);

  const handleSave = async () => {
    // HARD RULE: Validation - content must be framed as YOUR belief
    if (!formData.content.trim()) {
      alert('Content is required');
      return;
    }
    if (!formData.subject_alias?.trim()) {
      alert('Subject alias is required');
      return;
    }
    if (!formData.impact_on_me?.trim()) {
      alert('Impact on Me is required - How did believing this affect your actions, emotions, or decisions?');
      return;
    }

    // Auto-frame content if missing perception framing
    let content = formData.content.trim();
    const contentLower = content.toLowerCase();
    const perceptionFraming = [
      'i believed', 'i heard', 'i thought', 'i assumed', 'i perceived',
      'people said', 'rumor has it', 'i was told', 'someone told me',
      'i overheard', 'i saw on', 'i read that', 'i think', 'i feel like'
    ];
    
    const hasFraming = perceptionFraming.some(phrase => contentLower.startsWith(phrase));
    if (!hasFraming && content.length > 20) {
      content = `I believed that ${content}`;
    }

    setLoading(true);
    try {
      if (perception) {
        await perceptionApi.updatePerception(perception.id, {
          ...formData,
          content
        });
      } else {
        await perceptionApi.createPerception({
          ...formData,
          content
        });
      }
      onSave();
    } catch (error) {
      console.error('Failed to save perception:', error);
      alert('Failed to save perception');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-black via-black/95 to-black border-2 border-orange-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl shadow-orange-500/20">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-orange-500/20 via-orange-900/20 to-orange-500/20 border-b-2 border-orange-500/30 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-orange-400" />
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {perception ? 'Edit Perception' : 'New Perception Entry'}
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  What you heard, believed, or assumed — not objective truth
                </p>
              </div>
            </div>
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0 hover:bg-white/10">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-black/40">
          {/* Warning */}
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-sm text-orange-200/90">
            <p className="font-medium mb-1">Remember: This is your perception</p>
            <p className="text-orange-200/70">
              Track what you heard, believed, or assumed. This may be incomplete, biased, or false.
              You can retract or resolve it later as your understanding evolves.
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">
              About (Person) <span className="text-red-400">*</span>
            </label>
            <Input
              value={formData.subject_alias || ''}
              onChange={(e) => setFormData({ ...formData, subject_alias: e.target.value })}
              placeholder="Name/alias of person this perception is about (required)"
              className="bg-black/60 border-border/50 text-white"
              disabled={!!personId}
            />
            {personId && (
              <p className="text-xs text-white/50 mt-1">Linked to character: {personName}</p>
            )}
          </div>

          {/* Source */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">Source</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as PerceptionSource })}
                className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
              >
                <option value="overheard">Overheard</option>
                <option value="told_by">Told By Someone</option>
                <option value="rumor">Rumor</option>
                <option value="social_media">Social Media</option>
                <option value="intuition">Intuition</option>
                <option value="assumption">Assumption</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">Confidence Level</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={formData.confidence_level ?? 0.3}
                onChange={(e) => setFormData({ ...formData, confidence_level: parseFloat(e.target.value) })}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-white/50 mt-1">
                <span>0% (Very Low)</span>
                <span className="font-medium text-white">{Math.round((formData.confidence_level ?? 0.3) * 100)}%</span>
                <span>100% (Very High)</span>
              </div>
              <p className="text-xs text-white/50 mt-1">Default: 30% (Low) - Never auto-raised</p>
            </div>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">Source Detail (Optional)</label>
              <Input
                value={formData.source_detail || ''}
                onChange={(e) => setFormData({ ...formData, source_detail: e.target.value })}
                placeholder="e.g., 'told by Alex', 'Instagram post'"
                className="bg-black/60 border-border/50 text-white"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-white/90 mb-2 block">Source Detail (Optional)</label>
              <Input
                value={formData.source_detail || ''}
                onChange={(e) => setFormData({ ...formData, source_detail: e.target.value })}
                placeholder="e.g., 'told by Alex', 'Instagram post'"
                className="bg-black/60 border-border/50 text-white"
              />
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">
              What you heard/believed <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={formData.content}
              onChange={(e) => {
                const value = e.target.value;
                setFormData({ ...formData, content: value });
                // Soft Language Enforcement: Auto-suggest perception framing
                if (value.length > 20 && !value.toLowerCase().match(/^(i believed|i heard|i thought|i assumed|people said|rumor|i was told)/i)) {
                  // This will be handled by backend validation, but we can show a subtle hint
                }
              }}
              placeholder='Frame as YOUR belief: "I believed that...", "I heard that...", "People said..."'
              rows={4}
              className="bg-black/60 border-border/50 text-white resize-none"
            />
            <p className="text-xs text-orange-400/70 mt-1 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>Always frame as YOUR perception (e.g., "I believed X did Y", not "X did Y")</span>
            </p>
          </div>

          {/* Impact on Me (REQUIRED - Key Insight Lever) */}
          <div>
            <label className="text-sm font-semibold text-white/90 mb-2 block">
              Impact on Me <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={formData.impact_on_me || ''}
              onChange={(e) => setFormData({ ...formData, impact_on_me: e.target.value })}
              placeholder="How did believing this affect my actions, emotions, or decisions? (Required - shifts focus away from others)"
              rows={3}
              className="bg-black/60 border-border/50 text-white resize-none"
            />
            <p className="text-xs text-purple-400/70 mt-1">
              Key Insight Lever: Reframes gossip as decision input, not drama. Even false beliefs can have real consequences.
            </p>
          </div>

          {/* High Emotion Flag */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="high-emotion"
              checked={formData.created_in_high_emotion || false}
              onChange={(e) => setFormData({ ...formData, created_in_high_emotion: e.target.checked })}
              className="w-4 h-4 rounded border-border/50 bg-black/60 text-primary focus:ring-primary"
            />
            <label htmlFor="high-emotion" className="text-sm text-white/70 cursor-pointer">
              Created in high-emotion mode (will trigger cool-down review reminder)
            </label>
          </div>

          {/* Resolution/Status (for existing perceptions - tracks evolution) */}
          {perception && (
            <div className="space-y-3 pt-4 border-t border-border/30">
              <label className="text-sm font-semibold text-white/90 block">Status Evolution</label>
              <p className="text-xs text-white/50 mb-2">
                Track how your belief evolved over time (unverified → confirmed/disproven/retracted)
              </p>
              <select
                value={formData.status || 'unverified'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as PerceptionStatus })}
                className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
              >
                <option value="unverified">Unverified</option>
                <option value="confirmed">Confirmed</option>
                <option value="disproven">Disproven</option>
                <option value="retracted">Retracted</option>
              </select>
              {formData.status && formData.status !== 'unverified' && (
                <Textarea
                  value={formData.resolution_note || ''}
                  onChange={(e) => setFormData({ ...formData, resolution_note: e.target.value })}
                  placeholder="Notes on resolution/retraction (tracks evolution)..."
                  rows={2}
                  className="bg-black/60 border-border/50 text-white resize-none text-sm"
                />
              )}
              <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.retracted || false}
                  onChange={(e) => setFormData({ ...formData, retracted: e.target.checked, status: e.target.checked ? 'retracted' : formData.status })}
                  className="w-4 h-4 rounded border-border/50 bg-black/60 text-primary focus:ring-primary"
                />
                Retract this perception
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 p-4 flex items-center justify-end gap-3 bg-black/40">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} leftIcon={<Save className="h-4 w-4" />}>
            {loading ? 'Saving...' : 'Save Perception'}
          </Button>
        </div>
      </div>
    </div>
  );
};
