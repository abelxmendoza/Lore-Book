// =====================================================
// EVENT DETAIL PANEL
// Purpose: Show event details with source messages and event-scoped chat
// =====================================================

import { useState, useEffect } from 'react';
import { X, Clock, MapPin, Users, MessageSquare, Send, Sparkles, AlertCircle, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';

interface EventDetail {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  source_messages: Array<{
    id: string;
    role: string;
    content: string;
    original_text?: string;
    created_at: string;
    session_id: string;
  }>;
  source_unit_ids: string[];
  linked_decisions?: Array<{
    id: string;
    title: string;
    description: string;
    created_at: string;
  }>;
  linked_insights?: Array<{
    id: string;
    category: string;
    text: string;
    confidence: number;
    created_at: string;
  }>;
}

interface EventDetailPanelProps {
  eventId: string;
  onClose: () => void;
}

export const EventDetailPanel: React.FC<EventDetailPanelProps> = ({ eventId, onClose }) => {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; created_at?: string }>>([]);

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  const loadEvent = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean; event: EventDetail }>(
        `/api/conversation/events/${eventId}`
      );
      if (result.success) {
        setEvent(result.event);
      } else {
        setError('Failed to load event');
      }
    } catch (err: any) {
      console.error('Failed to load event:', err);
      setError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || sending) return;

    const userMessage = chatMessage.trim();
    setChatMessage('');
    setSending(true);

    // Add user message to chat immediately
    setChatMessages(prev => [...prev, { role: 'user' as const, content: userMessage }]);

    try {
      const result = await fetchJson<{ success: boolean; response: string }>(`/api/conversation/events/${eventId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: userMessage }),
      });

      if (result.success && result.response) {
        // Add AI response to chat
        setChatMessages(prev => [...prev, { role: 'assistant' as const, content: result.response }]);
        
        // Reload event to get updated information after refinement
        setTimeout(() => {
          loadEvent();
        }, 1000);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Remove user message on error
      setChatMessages(prev => prev.slice(0, -1));
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 bg-white/10 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white/10 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <AlertCircle className="w-5 h-5" />
              <p>{error || 'Event not found'}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose} variant="outline">
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={loadEvent} variant="outline">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Button onClick={onClose} variant="ghost" size="sm">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Events
            </Button>
          </div>
          <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
          <p className="text-sm text-white/60 mb-4">
            This event was assembled from conversations
          </p>
        </div>
        <Badge
          variant="outline"
          className={`${getConfidenceColor(event.confidence)} border-current`}
        >
          {Math.round(event.confidence * 100)}% confidence
        </Badge>
      </div>

      {/* Event Summary */}
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle>Event Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                <Clock className="w-4 h-4" />
                <span>When</span>
              </div>
              <p className="text-sm">{formatDate(event.start_time)}</p>
              {event.end_time && (
                <p className="text-sm text-white/60">to {formatDate(event.end_time)}</p>
              )}
            </div>

            {event.locations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                  <MapPin className="w-4 h-4" />
                  <span>Where</span>
                </div>
                <p className="text-sm">{event.locations.length} location(s)</p>
              </div>
            )}

            {event.people.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                  <Users className="w-4 h-4" />
                  <span>Who</span>
                </div>
                <p className="text-sm">{event.people.length} person(s)</p>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                <MessageSquare className="w-4 h-4" />
                <span>Sources</span>
              </div>
              <p className="text-sm">{event.source_unit_ids.length} source(s)</p>
            </div>
          </div>

          {event.summary && (
            <div>
              <div className="text-sm text-white/60 mb-1">What</div>
              <p className="text-sm">{event.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source Messages */}
      {event.source_messages.length > 0 && (
        <Card className="border-border/60 bg-black/40">
          <CardHeader>
            <CardTitle>Source Conversations</CardTitle>
            <CardDescription>
              Messages that contributed to this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {event.source_messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className="border border-border/40 rounded-lg p-4 bg-black/20"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {msg.role === 'user' ? 'You' : 'AI'}
                    </Badge>
                    <span className="text-xs text-white/40">
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 whitespace-pre-wrap">
                    {msg.original_text || msg.content}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Decisions */}
      {event.linked_decisions && event.linked_decisions.length > 0 && (
        <Card className="border-border/60 bg-black/40">
          <CardHeader>
            <CardTitle>Linked Decisions</CardTitle>
            <CardDescription>
              Decisions related to this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {event.linked_decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="border border-border/40 rounded-lg p-4 bg-black/20"
                >
                  <h4 className="font-medium mb-1">{decision.title}</h4>
                  <p className="text-sm text-white/80">{decision.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Insights */}
      {event.linked_insights && event.linked_insights.length > 0 && (
        <Card className="border-border/60 bg-black/40">
          <CardHeader>
            <CardTitle>Linked Insights</CardTitle>
            <CardDescription>
              Insights derived from this event
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {event.linked_insights.map((insight) => (
                <div
                  key={insight.id}
                  className="border border-border/40 rounded-lg p-4 bg-black/20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs">
                      {insight.category}
                    </Badge>
                    <span className="text-xs text-white/40">
                      {Math.round(insight.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-white/80">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Event-Scoped Chat */}
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle>Talk About This Event</CardTitle>
          <CardDescription>
            Share more details, corrections, or reflections. The system will learn and refine this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Chat Messages */}
            {chatMessages.length > 0 && (
              <div className="space-y-3 max-h-64 overflow-y-auto border border-border/40 rounded-lg p-4 bg-black/20">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === 'user'
                          ? 'bg-blue-500/20 text-blue-100'
                          : 'bg-white/10 text-white/80'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Talk about this event..."
                className="flex-1"
                disabled={sending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!chatMessage.trim() || sending}
              >
                {sending ? (
                  <Sparkles className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-white/40">
              Your message will be processed to refine this event. Corrections and new information will be handled automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

