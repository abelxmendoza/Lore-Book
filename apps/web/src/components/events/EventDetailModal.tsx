// =====================================================
// EVENT DETAIL MODAL
// Purpose: Modal for viewing and chatting about specific events
// =====================================================

import { useState, useEffect, useRef } from 'react';
import { X, Clock, MapPin, Users, MessageSquare, Send, Sparkles, AlertCircle, FileText, Brain, Calendar, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { EventConfidenceHistory } from './EventConfidenceHistory';
import { EventActionsMenu } from './EventActionsMenu';
import { EventMetaTags } from './EventMetaTags';

interface Event {
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
  source_count?: number;
  source_messages?: Array<{
    id: string;
    role: string;
    content: string;
    original_text?: string;
    created_at: string;
    session_id: string;
  }>;
  source_unit_ids?: string[];
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
  confidence_history?: Array<{
    id: string;
    confidence: number;
    reason: string;
    recorded_at: string;
    metadata?: {
      old_confidence?: number;
      change_amount?: number;
    };
  }>;
  continuity_notes?: string[];
}

interface EventDetailModalProps {
  event: Event;
  onClose: () => void;
}

type TabKey = 'chat' | 'details' | 'sources' | 'questions';

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [eventData, setEventData] = useState<Event>(event);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp?: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { streamChat } = useChatStream();

  useEffect(() => {
    loadEvent();
  }, [event.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadEvent = async () => {
    setLoading(true);
    try {
      // For mock data, just use the event prop directly
      if (event.id.startsWith('event-')) {
        setEventData(event);
        setLoading(false);
        return;
      }
      
      const result = await fetchJson<{ success: boolean; event: Event }>(
        `/api/conversation/events/${event.id}`
      );
      if (result.success) {
        setEventData(result.event);
      }
    } catch (err: any) {
      console.error('Failed to load event:', err);
      // Fallback to event prop if API fails
      setEventData(event);
    } finally {
      setLoading(false);
    }
  };

  const handleChatMessage = async () => {
    if (!chatInput.trim() || sending) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setSending(true);

    // Add user message immediately
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);

    try {
      // Send to event-scoped chat endpoint
      const result = await fetchJson<{ 
        success: boolean; 
        response: string;
        meta?: {
          uncertainty_level?: string;
          confidence_level?: string;
          why?: string;
          confidence_humanized?: string;
        };
      }>(
        `/api/conversation/events/${event.id}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({ message: userMessage }),
        }
      );

      if (result.success && result.response) {
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: result.response, 
          timestamp: new Date(),
          meta: result.meta
        }]);
        // Reload event to get updated information
        setTimeout(() => loadEvent(), 1000);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-black border border-border/60 rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border/60">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h2 className="text-2xl font-bold">{eventData.title}</h2>
              <div className="flex items-center gap-2">
                <EventActionsMenu
                  eventId={eventData.id}
                  onOverrideApplied={() => {
                    loadEvent(); // Reload to show updated overrides
                  }}
                />
                <Button onClick={onClose} variant="ghost" size="sm">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
            <EventMetaTags eventId={eventData.id} />
            <div className="flex items-center gap-4 text-sm text-white/60 mt-2">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatDate(eventData.start_time)}</span>
              </div>
              {eventData.locations.length > 0 && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{eventData.locations.length} location(s)</span>
                </div>
              )}
              {eventData.people.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{eventData.people.length} person(s)</span>
                </div>
              )}
              <Badge
                variant="outline"
                className={`${getConfidenceColor(eventData.confidence)} border-current`}
              >
                {Math.round(eventData.confidence * 100)}% confidence
              </Badge>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border/60">
            <TabsList>
              <TabsTrigger value="chat">
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="details">
                <FileText className="w-4 h-4 mr-2" />
                Details
              </TabsTrigger>
              <TabsTrigger value="sources">
                <Calendar className="w-4 h-4 mr-2" />
                Sources
              </TabsTrigger>
              <TabsTrigger value="questions">
                <MessageCircle className="w-4 h-4 mr-2" />
                Ask Questions
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="chat" className="mt-0 h-full flex flex-col">
              <div className="flex-1 space-y-4 mb-4 overflow-y-auto">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-white/20" />
                    <p className="text-lg font-medium mb-2">Start a conversation</p>
                    <p className="text-sm">Talk about this event to refine and update it</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
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
                      {msg.role === 'assistant' && msg.meta && (
                        <div className="mt-1 px-1 text-xs text-white/40 flex items-center gap-2">
                          {msg.meta.why && <span>{msg.meta.why}</span>}
                          {msg.meta.confidence_humanized && (
                            <>
                              {msg.meta.why && <span>·</span>}
                              <span>Confidence: {msg.meta.confidence_humanized}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChatMessage();
                    }
                  }}
                  placeholder="Talk about this event..."
                  className="flex-1"
                  disabled={sending}
                />
                <Button onClick={handleChatMessage} disabled={!chatInput.trim() || sending}>
                  {sending ? (
                    <Sparkles className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="details" className="mt-0 space-y-4">
              {/* Confidence History */}
              {eventData.confidence_history && eventData.confidence_history.length > 0 ? (
                <EventConfidenceHistory
                  snapshots={eventData.confidence_history}
                  currentConfidence={eventData.confidence}
                />
              ) : null}

              {/* Continuity Section */}
              {eventData.continuity_notes && eventData.continuity_notes.length > 0 ? (
                <Card className="border-border/60 bg-black/40">
                  <CardHeader>
                    <CardTitle className="text-sm">Context</CardTitle>
                    <CardDescription className="text-xs text-white/50">
                      Observational connections to past events
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {eventData.continuity_notes.map((note, idx) => (
                        <p key={idx} className="text-sm text-white/70 italic">
                          {note}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-border/60 bg-black/40">
                <CardHeader>
                  <CardTitle>Event Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {eventData.summary && (
                    <div>
                      <div className="text-sm text-white/60 mb-1">What</div>
                      <p className="text-sm">{eventData.summary}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                        <Clock className="w-4 h-4" />
                        <span>When</span>
                      </div>
                      <p className="text-sm">{formatDate(eventData.start_time)}</p>
                      {eventData.end_time && (
                        <p className="text-sm text-white/60">to {formatDate(eventData.end_time)}</p>
                      )}
                    </div>
                    {eventData.locations.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                          <MapPin className="w-4 h-4" />
                          <span>Where</span>
                        </div>
                        <p className="text-sm">{eventData.locations.length} location(s)</p>
                      </div>
                    )}
                    {eventData.people.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                          <Users className="w-4 h-4" />
                          <span>Who</span>
                        </div>
                        <p className="text-sm">{eventData.people.length} person(s)</p>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                        <MessageSquare className="w-4 h-4" />
                        <span>Sources</span>
                      </div>
                      <p className="text-sm">{eventData.source_unit_ids?.length || eventData.source_count || 0} source(s)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {eventData.linked_decisions && eventData.linked_decisions.length > 0 ? (
                <Card className="border-border/60 bg-black/40">
                  <CardHeader>
                    <CardTitle>Linked Decisions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {eventData.linked_decisions.map((decision) => (
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
              ) : null}

              {eventData.linked_insights && eventData.linked_insights.length > 0 ? (
                <Card className="border-border/60 bg-black/40">
                  <CardHeader>
                    <CardTitle>Linked Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {eventData.linked_insights.map((insight) => (
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
              ) : null}
            </TabsContent>

            <TabsContent value="sources" className="mt-0 space-y-4">
              {eventData.source_messages && eventData.source_messages.length > 0 ? (
                <div className="space-y-3">
                  {eventData.source_messages.map((msg) => (
                    <Card key={msg.id} className="border-border/60 bg-black/40">
                      <CardContent className="pt-6">
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-white/60">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-white/20" />
                  <p>No source messages available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="questions" className="mt-0">
              <Card className="border-border/60 bg-black/40">
                <CardHeader>
                  <CardTitle>Ask Questions About This Event</CardTitle>
                  <CardDescription>
                    Get answers about this event from your memory
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleChatMessage();
                          }
                        }}
                        placeholder="Ask a question about this event..."
                        className="flex-1"
                        disabled={sending}
                      />
                      <Button onClick={handleChatMessage} disabled={!chatInput.trim() || sending}>
                        {sending ? (
                          <Sparkles className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {chatMessages.length > 0 && (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
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
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

