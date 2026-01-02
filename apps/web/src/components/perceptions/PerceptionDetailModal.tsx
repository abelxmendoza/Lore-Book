import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, FileText, Eye, Save, RefreshCw, Loader2, AlertTriangle, Clock, User } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage } from '../../features/chat/message/ChatMessage';
import type { Message } from '../../features/chat/message/ChatMessage';
import { useChatStream } from '../../hooks/useChatStream';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry, PerceptionStatus } from '../../types/perception';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '../ui/textarea';
import { ReactionList } from '../reactions/ReactionList';

interface PerceptionDetailModalProps {
  perception: PerceptionEntry;
  onClose: () => void;
  onUpdate?: (perception: PerceptionEntry) => void;
}

type TabKey = 'chat' | 'details' | 'evolution';

const tabs: Array<{ key: TabKey; label: string; icon: typeof MessageSquare }> = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'details', label: 'Details', icon: FileText },
  { key: 'evolution', label: 'Evolution', icon: Eye }
];

export const PerceptionDetailModal: React.FC<PerceptionDetailModalProps> = ({
  perception: initialPerception,
  onClose,
  onUpdate
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [perception, setPerception] = useState<PerceptionEntry>(initialPerception);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    content: perception.content,
    impact_on_me: perception.impact_on_me,
    status: perception.status,
    resolution_note: perception.resolution_note || ''
  });
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const { streamChat } = useChatStream();

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

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle chat with perception context
  const handleChatMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const contextPrompt = buildContextPrompt(perception);
      const fullMessage = `${contextPrompt}\n\nUser: ${message}`;
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      let accumulatedContent = '';
      await streamChat(
        fullMessage,
        [], // conversation history
        (chunk: string) => {
          accumulatedContent += chunk;
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = accumulatedContent;
            }
            return updated;
          });
        },
        () => {}, // onMetadata
        () => {
          setIsLoading(false);
        },
        (error: string) => {
          console.error('Chat error:', error);
          setIsLoading(false);
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
    }
  }, [perception, isLoading, streamChat]);

  // Build context prompt for chat
  const buildContextPrompt = (perception: PerceptionEntry): string => {
    let prompt = `You are discussing a perception entry about ${perception.subject_alias}.\n\n`;
    prompt += `HARD RULE: This is the user's perception, not objective truth about others.\n\n`;
    prompt += `Perception Details:\n`;
    prompt += `- Subject: ${perception.subject_alias}\n`;
    prompt += `- Content: ${perception.content}\n`;
    prompt += `- Source: ${perception.source}${perception.source_detail ? ` (${perception.source_detail})` : ''}\n`;
    prompt += `- Confidence: ${Math.round(perception.confidence_level * 100)}%\n`;
    prompt += `- Status: ${perception.status}\n`;
    prompt += `- Impact on User: ${perception.impact_on_me}\n`;
    if (perception.sentiment) {
      prompt += `- Sentiment: ${perception.sentiment}\n`;
    }
    if (perception.resolution_note) {
      prompt += `- Resolution: ${perception.resolution_note}\n`;
    }
    if (perception.evolution_notes && perception.evolution_notes.length > 0) {
      prompt += `- Evolution Notes: ${perception.evolution_notes.join('; ')}\n`;
    }
    if (perception.original_content && perception.original_content !== perception.content) {
      prompt += `- Original Belief: ${perception.original_content}\n`;
    }
    
    prompt += `\nHelp the user understand, reflect on, or update this perception. `;
    prompt += `Remember: This is their perception at a point in time, not objective truth. `;
    prompt += `They can retract, resolve, or add evolution notes. `;
    prompt += `Be conversational and help them process how this belief affected them.`;
    
    return prompt;
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
          ) : activeTab === 'chat' ? (
            <div className="h-full flex flex-col">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-white/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Start a conversation</h3>
                    <p className="text-sm text-white/60 mb-4">
                      Ask questions, reflect on, or update this perception about {perception.subject_alias}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => handleChatMessage(`Tell me more about this perception of ${perception.subject_alias}`)}
                        className="text-xs px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded hover:bg-orange-500/30 transition-colors"
                      >
                        Tell me more
                      </button>
                      <button
                        onClick={() => handleChatMessage(`How did this perception affect me?`)}
                        className="text-xs px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded hover:bg-orange-500/30 transition-colors"
                      >
                        Impact analysis
                      </button>
                      <button
                        onClick={() => handleChatMessage(`Should I retract or resolve this perception?`)}
                        className="text-xs px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded hover:bg-orange-500/30 transition-colors"
                      >
                        Resolution help
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} />
                  ))
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-border/60 pt-4">
                <ChatComposer
                  onSubmit={handleChatMessage}
                  loading={isLoading}
                  disabled={isLoading}
                />
              </div>
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

                      {/* Source & Confidence */}
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
                          <label className="text-xs text-white/60 mb-1 block">Confidence</label>
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
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <h3 className="text-lg font-semibold text-white">Belief Evolution</h3>
                  <p className="text-sm text-white/60 mt-1">
                    Track how your belief changed over time
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Original Content */}
                  {perception.original_content && perception.original_content !== perception.content && (
                    <div>
                      <label className="text-xs text-white/60 mb-1 block">Original Belief</label>
                      <p className="text-sm text-white/60 italic line-through opacity-70">{perception.original_content}</p>
                    </div>
                  )}

                  {/* Current Content */}
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">Current Belief</label>
                    <p className="text-sm text-white/80">{perception.content}</p>
                  </div>

                  {/* Evolution Notes */}
                  {perception.evolution_notes && perception.evolution_notes.length > 0 ? (
                    <div>
                      <label className="text-xs text-white/60 mb-2 block">Evolution Timeline</label>
                      <div className="space-y-2">
                        {perception.evolution_notes.map((note, idx) => (
                          <div key={idx} className="text-sm text-white/70 pl-4 border-l-2 border-orange-500/30">
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-white/40">
                      <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No evolution notes yet</p>
                      <p className="text-xs text-white/30 mt-1">Add notes as your understanding changes</p>
                    </div>
                  )}

                  {/* Status Changes */}
                  <div>
                    <label className="text-xs text-white/60 mb-2 block">Status History</label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className={getStatusColor(perception.status)}>
                          {perception.status}
                        </Badge>
                        <span className="text-white/50 text-xs">
                          Current status
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
