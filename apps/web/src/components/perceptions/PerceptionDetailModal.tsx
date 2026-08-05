import React, { useState, useEffect } from 'react';
import { X, MessageSquare, FileText, Eye, Save, Loader2, AlertTriangle, Clock, User, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry, PerceptionStatus } from '../../types/perception';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '../ui/textarea';
import { ReactionList } from '../reactions/ReactionList';
import { PerceptionEvolutionTimeline } from './PerceptionEvolutionTimeline';
import { openChatWithFocus } from '../../lib/openChatWithFocus';

interface PerceptionDetailModalProps {
  perception: PerceptionEntry;
  onClose: () => void;
  onUpdate?: (perception: PerceptionEntry) => void;
}

type TabKey = 'details' | 'evolution';

const tabs: Array<{ key: TabKey; label: string; icon: typeof MessageSquare }> = [
  { key: 'details', label: 'Details', icon: FileText },
  { key: 'evolution', label: 'Evolution', icon: Eye }
];

export const PerceptionDetailModal: React.FC<PerceptionDetailModalProps> = ({
  perception: initialPerception,
  onClose,
  onUpdate
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [perception, setPerception] = useState<PerceptionEntry>(initialPerception);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    content: perception.content,
    impact_on_me: perception.impact_on_me,
    status: perception.status,
    resolution_note: perception.resolution_note || ''
  });

  // Load full perception details
  useEffect(() => {
    const loadPerception = async () => {
      setLoading(true);
      try {
        // Could fetch full details if needed
        setPerception(initialPerception);
      } catch (error) {
        console.error('Failed to load perception:', error);
      } finally {
        setLoading(false);
      }
    };
    void loadPerception();
  }, [initialPerception.id]);

  const openPerceptionInMainChat = () => {
    onClose();
    openChatWithFocus({
      entityId: perception.id,
      entityName: `Perception about ${perception.subject_alias}`,
      entityType: 'perception',
      sourceSurface: 'perceptions',
      sourceLabel: 'Perception Book',
      knowledgeScope: 'the recorded belief, its source, certainty, impact, status, and evolution',
      initialPrompt:
        `Let’s examine my recorded perception about ${perception.subject_alias}. Start with a grounded response ` +
        'that clearly treats it as my belief at the time, not an objective fact about another person. Summarize the ' +
        'recorded evidence, uncertainty, impact on me, and evolution, then invite me to clarify, resolve, or retract it.',
      autoSubmit: true,
      startNewThread: true,
    });
  };

  const handleSave = async () => {
    setUpdating(true);
    try {
      const updated = await perceptionApi.updatePerception(perception.id, {
        content: editForm.content,
        impact_on_me: editForm.impact_on_me,
        status: editForm.status,
        resolution_note: editForm.resolution_note || undefined
      });
      setPerception(updated);
      setEditing(false);
      onUpdate?.(updated);
    } catch (error) {
      console.error('Failed to update perception:', error);
      alert('Failed to update perception');
    } finally {
      setUpdating(false);
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'overheard':
        return <Eye className="h-4 w-4" />;
      case 'told_by':
        return <MessageSquare className="h-4 w-4" />;
      case 'rumor':
        return <AlertTriangle className="h-4 w-4" />;
      case 'social_media':
        return <User className="h-4 w-4" />;
      case 'intuition':
        return <Eye className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'overheard':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'told_by':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'rumor':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'social_media':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'intuition':
        return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusColor = (status: PerceptionStatus) => {
    switch (status) {
      case 'unverified':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'confirmed':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'disproven':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'retracted':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-black/90 border border-border/60 rounded-2xl shadow-panel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(255,165,0,0.35),_transparent)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Eye className="w-6 h-6 text-orange-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white truncate">
                Perception: {perception.subject_alias}
              </h2>
              <p className="text-sm text-white/60">Your perception, not objective truth</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {updating && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="border-b border-border/60 bg-orange-500/[0.06] px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={openPerceptionInMainChat}
            data-testid="perception-open-main-chat"
            className="group flex w-full items-center justify-between gap-4 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-left transition hover:border-orange-400/60 hover:bg-orange-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-300">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">Focus this perception in main chat</span>
                <span className="block text-xs text-white/60">LoreBook responds first while preserving uncertainty and evidence.</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-orange-300 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 border-b border-border/60">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-orange-500/20 text-white border-b-2 border-orange-500'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : activeTab === 'details' ? (
            <div className="space-y-6">
              {/* Warning Banner */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-200/90">
                    <p className="font-medium mb-1">This is your perception, not objective truth</p>
                    <p className="text-orange-200/70">
                      This entry represents what you heard, believed, or assumed about {perception.subject_alias}.
                      It may be incomplete, biased, or false.
                    </p>
                  </div>
                </div>
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-white/90 mb-2 block">
                      What you heard/believed <span className="text-red-400">*</span>
                    </label>
                    <Textarea
                      value={editForm.content}
                      onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                      rows={4}
                      className="bg-black/60 border-border/50 text-white resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white/90 mb-2 block">
                      Impact on Me <span className="text-red-400">*</span>
                    </label>
                    <Textarea
                      value={editForm.impact_on_me}
                      onChange={(e) => setEditForm({ ...editForm, impact_on_me: e.target.value })}
                      rows={3}
                      className="bg-black/60 border-border/50 text-white resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white/90 mb-2 block">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as PerceptionStatus })}
                      className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
                    >
                      <option value="unverified">Unverified</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="disproven">Disproven</option>
                      <option value="retracted">Retracted</option>
                    </select>
                  </div>

                  {editForm.status !== 'unverified' && (
                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Resolution Note</label>
                      <Textarea
                        value={editForm.resolution_note}
                        onChange={(e) => setEditForm({ ...editForm, resolution_note: e.target.value })}
                        rows={2}
                        className="bg-black/60 border-border/50 text-white resize-none"
                        placeholder="Notes on resolution/retraction..."
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Button onClick={handleSave} disabled={updating} leftIcon={<Save className="h-4 w-4" />}>
                      {updating ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(false)} disabled={updating}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Card className="bg-black/40 border-border/60">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Perception Details</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(true)}
                          className="text-orange-400 hover:text-orange-300"
                        >
                          Edit
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Subject */}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">About</label>
                        <p className="text-sm text-white font-medium">{perception.subject_alias}</p>
                      </div>

                      {/* Content */}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">What you heard/believed</label>
                        <p className="text-sm text-white/80 leading-relaxed">{perception.content}</p>
                      </div>

                      {/* Impact on Me */}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Impact on Me</label>
                        <p className="text-sm text-white/80 italic">{perception.impact_on_me}</p>
                      </div>

                      {/* Source & Certainty */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Source</label>
                          <Badge
                            variant="outline"
                            className={`${getSourceColor(perception.source)} text-xs px-2 py-1 flex items-center gap-1 w-fit`}
                          >
                            {getSourceIcon(perception.source)}
                            <span className="capitalize">{perception.source.replace('_', ' ')}</span>
                          </Badge>
                          {perception.source_detail && (
                            <p className="text-xs text-white/50 mt-1">{perception.source_detail}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Certainty</label>
                          <p className="text-sm text-white">{Math.round(perception.confidence_level * 100)}%</p>
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Status</label>
                        <Badge
                          variant="outline"
                          className={`${getStatusColor(perception.status)} text-xs px-2 py-1 w-fit`}
                        >
                          {perception.status.charAt(0).toUpperCase() + perception.status.slice(1)}
                        </Badge>
                      </div>

                      {/* Timestamp */}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">When you heard this</label>
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatDistanceToNow(new Date(perception.timestamp_heard), { addSuffix: true })}</span>
                          <span className="text-white/50">({new Date(perception.timestamp_heard).toLocaleDateString()})</span>
                        </div>
                      </div>

                      {/* Resolution Note */}
                      {perception.resolution_note && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">
                            {perception.status === 'retracted' ? 'Retraction' : 'Resolution'}
                          </label>
                          <p className="text-sm text-white/70 italic">{perception.resolution_note}</p>
                        </div>
                      )}

                      {/* Reactions */}
                      <div className="pt-4 border-t border-border/50">
                        <ReactionList
                          triggerType="perception"
                          triggerId={perception.id}
                          onReactionChange={() => {
                            // Could reload perception if needed
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ) : activeTab === 'evolution' ? (
            <div className="space-y-4">
              <PerceptionEvolutionTimeline perception={perception} />
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
};
