import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MessageSquare, Network, Calendar, MapPin, User, FileText, Sparkles, Link2, Save, RefreshCw, Loader2, Search } from 'lucide-react';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage } from '../../features/chat/message/ChatMessage';
import type { Message } from '../../features/chat/message/ChatMessage';
import { useChatStream } from '../../hooks/useChatStream';
import { fetchJson } from '../../lib/api';
import { searchTimelines, fetchTimeline } from '../../api/timelineV2';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';
import type { Character } from '../characters/CharacterProfileCard';
import type { LocationProfile } from '../locations/LocationProfileCard';

export type EntityType = 'memory' | 'character' | 'location';

export interface EntityData {
  type: EntityType;
  id: string;
  name?: string;
  title?: string;
  content?: string;
  description?: string;
  date?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  // Character specific
  character?: Character;
  // Location specific
  location?: LocationProfile;
  // Memory specific
  memory?: ChronologyEntry;
}

interface EntityDetailModalProps {
  entity: EntityData;
  onClose: () => void;
  onUpdate?: (entity: EntityData) => void;
}

type TabKey = 'chat' | 'details' | 'connections' | 'timeline' | 'search';

const tabs: Array<{ key: TabKey; label: string; icon: typeof MessageSquare }> = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'details', label: 'Details', icon: FileText },
  { key: 'connections', label: 'Connections', icon: Network },
  { key: 'timeline', label: 'Timeline', icon: Calendar },
  { key: 'search', label: 'Search', icon: Search }
];

export const EntityDetailModal: React.FC<EntityDetailModalProps> = ({
  entity,
  onClose,
  onUpdate
}) => {
  const { openCharacter, openLocation, openMemory } = useEntityModal();
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [entityData, setEntityData] = useState<EntityData>(entity);
  const [connections, setConnections] = useState<Array<{ type: EntityType; id: string; name: string; relation: string }>>([]);
  const [entityRelationships, setEntityRelationships] = useState<Array<{
    fromEntityName: string;
    toEntityName: string;
    relationshipType: string;
    scope?: string;
    confidence: number;
  }>>([]);
  const [entityScopes, setEntityScopes] = useState<Array<{
    scope: string;
    scopeContext?: string;
    confidence: number;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; type: string; description?: string; start_date?: string; end_date?: string | null }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [associatedTimelines, setAssociatedTimelines] = useState<Timeline[]>([]);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const { streamChat } = useChatStream();
  const { timelines: allTimelines } = useTimelineV2();

  // Load entity details and connections
  useEffect(() => {
    const loadEntityData = async () => {
      setLoading(true);
      try {
        // Load full entity data based on type
        if (entity.type === 'character' && entity.id) {
          const character = await fetchJson<Character>(`/api/characters/${entity.id}`);
          setEntityData(prev => ({ ...prev, character }));
          
          // Load character relationships (old format)
          const relationships = await fetchJson<Array<{ character_id: string; character_name: string; relationship_type: string }>>(
            `/api/characters/${entity.id}/relationships`
          ).catch(() => []);
          
          setConnections(relationships.map(rel => ({
            type: 'character' as EntityType,
            id: rel.character_id,
            name: rel.character_name,
            relation: rel.relationship_type
          })));

          // Load entity relationships (new format with scopes)
          const entityRels = await fetchJson<{
            success: boolean;
            relationships: Array<{
              fromEntityName: string;
              toEntityName: string;
              relationshipType: string;
              scope?: string;
              confidence: number;
            }>;
          }>(`/api/conversation/entities/${entity.id}/relationships?entityType=character`).catch(() => ({ success: false, relationships: [] }));
          
          if (entityRels.success) {
            setEntityRelationships(entityRels.relationships);
          }

          // Load entity scopes
          const scopes = await fetchJson<{
            success: boolean;
            scopes: Array<{
              scope: string;
              scopeContext?: string;
              confidence: number;
            }>;
          }>(`/api/conversation/entities/${entity.id}/scopes?entityType=character`).catch(() => ({ success: false, scopes: [] }));
          
          if (scopes.success) {
            setEntityScopes(scopes.scopes);
          }
        } else if (entity.type === 'location' && entity.id) {
          const location = await fetchJson<LocationProfile>(`/api/locations/${entity.id}`);
          setEntityData(prev => ({ ...prev, location }));
        } else if (entity.type === 'memory' && entity.memory) {
          // Memory connections - find related characters and locations
          const memory = entity.memory;
          
          // Load full journal entry to get summary and other details
          try {
            const journalEntry = await fetchJson<{
              id: string;
              content: string;
              date: string;
              summary?: string | null;
              tags?: string[];
              mood?: string | null;
              metadata?: Record<string, unknown>;
            }>(`/api/entries/${memory.journal_entry_id}`);
            
            // Update entity data with full journal entry info
            setEntityData(prev => ({
              ...prev,
              memory: {
                ...memory,
                summary: journalEntry.summary,
                tags: journalEntry.tags,
                mood: journalEntry.mood,
                metadata: journalEntry.metadata
              } as any
            }));
          } catch (error) {
            console.error('Error loading journal entry:', error);
          }
          
          if (memory.timeline_memberships && memory.timeline_memberships.length > 0) {
          // Load timeline connections
          const timelineConnections = memory.timeline_memberships.map(timelineId => ({
            type: 'memory' as EntityType,
            id: timelineId,
            name: memory.timeline_names?.find((_, idx) => memory.timeline_memberships?.[idx] === timelineId) || 'Timeline',
            relation: 'part of'
          }));
          setConnections(timelineConnections);

          // Load full timeline data for associated timelines
          const timelinePromises = memory.timeline_memberships.map(async (timelineId) => {
            try {
              const timelineData = await fetchTimeline(timelineId);
              return timelineData.timeline;
            } catch (error) {
              // Fallback to finding in allTimelines if fetch fails
              return allTimelines.find(t => t.id === timelineId);
            }
          });
          const loadedTimelines = (await Promise.all(timelinePromises)).filter((t): t is Timeline => t !== undefined);
          setAssociatedTimelines(loadedTimelines);
        }
      }
    } catch (error) {
      console.error('Error loading entity data:', error);
    } finally {
      setLoading(false);
    }
  };

  loadEntityData();
}, [entity, allTimelines]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle chat with entity context
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
      const contextPrompt = buildContextPrompt(entityData);
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
        },
        {
          type: 'ENTITY',
          id: entityData.id
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      setIsLoading(false);
    }
  }, [entityData, isLoading, streamChat]);

  // Build context prompt for chat
  const buildContextPrompt = (entity: EntityData): string => {
    let prompt = `You are discussing ${getEntityName(entity)}.\n\n`;
    
    if (entity.type === 'character' && entity.character) {
      prompt += `Character: ${entity.character.name}\n`;
      if (entity.character.summary) prompt += `Summary: ${entity.character.summary}\n`;
      if (entity.character.role) prompt += `Role: ${entity.character.role}\n`;
      if (entity.character.archetype) prompt += `Archetype: ${entity.character.archetype}\n`;
    } else if (entity.type === 'location' && entity.location) {
      prompt += `Location: ${entity.location.name}\n`;
      if (entity.location.type) prompt += `Type: ${entity.location.type}\n`;
      if (entity.location.description) prompt += `Description: ${entity.location.description}\n`;
    } else if (entity.type === 'memory' && entity.memory) {
      prompt += `Memory from ${new Date(entity.memory.start_time).toLocaleDateString()}\n`;
      if ((entity.memory as any).summary) {
        prompt += `Summary: ${(entity.memory as any).summary}\n`;
      }
      prompt += `Content: ${entity.memory.content}\n`;
      if ((entity.memory as any).mood) {
        prompt += `Mood: ${(entity.memory as any).mood}\n`;
      }
      if ((entity.memory as any).tags && (entity.memory as any).tags.length > 0) {
        prompt += `Tags: ${(entity.memory as any).tags.join(', ')}\n`;
      }
    }
    
    prompt += `\nHelp the user understand, update, and explore this ${entity.type}. `;
    prompt += `When they mention other characters, locations, or events, suggest updating the lore book. `;
    prompt += `Be conversational and helpful.`;
    
    return prompt;
  };

  const getEntityName = (entity: EntityData): string => {
    if (entity.type === 'character') return entity.character?.name || entity.name || 'Character';
    if (entity.type === 'location') return entity.location?.name || entity.name || 'Location';
    if (entity.type === 'memory') return entity.memory?.content.substring(0, 50) || 'Memory';
    return 'Entity';
  };

  const handleUpdateEntity = async () => {
    setUpdating(true);
    try {
      // Auto-detect and update entities from chat messages
      const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
      const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop()?.content || '';
      
      // Call backend to extract and update entities
      const response = await fetchJson<{ updated: boolean; entities: any[] }>('/api/entities/auto-update', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: entityData.type,
          entity_id: entityData.id,
          conversation: {
            user_message: lastUserMessage,
            assistant_message: lastAssistantMessage
          }
        })
      });

      if (response.updated) {
        // Reload entity data
        setEntityData(prev => ({ ...prev, ...response }));
        onUpdate?.(entityData);
      }
    } catch (error) {
      console.error('Error updating entity:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleConnectionClick = useCallback((connection: { type: EntityType; id: string; name: string }) => {
    // Close current modal and open connection
    onClose();
    // Use entity modal context
    setTimeout(() => {
      if (connection.type === 'character') {
        openCharacter({ id: connection.id, name: connection.name } as any);
      } else if (connection.type === 'location') {
        openLocation({ id: connection.id, name: connection.name } as any);
      } else if (connection.type === 'memory') {
        openMemory({ id: connection.id } as any);
      }
    }, 100);
  }, [onClose, openCharacter, openLocation, openMemory]);

  // Extract entity names from text
  const extractEntityNames = (text: string): Array<{ name: string; type: 'character' | 'location' }> => {
    const entities: Array<{ name: string; type: 'character' | 'location' }> = [];
    
    // Character patterns
    const characterPattern = /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g;
    let match;
    while ((match = characterPattern.exec(text)) !== null) {
      entities.push({ name: match[1], type: 'character' });
    }
    
    // Location patterns
    const locationPattern = /\b(?:in|at|to|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    while ((match = locationPattern.exec(text)) !== null) {
      entities.push({ name: match[1], type: 'location' });
    }
    
    // Remove duplicates
    return entities.filter((entity, index, self) =>
      index === self.findIndex(e => e.name === entity.name)
    );
  };

  // Handle clicking on entity name in chat
  const handleEntityNameClick = async (name: string) => {
    try {
      // Try to find character first
      const characters = await fetchJson<Array<{ id: string; name: string }>>('/api/characters/list');
      const character = characters.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (character) {
        openCharacter(character);
        return;
      }
      
      // Try to find location
      const locations = await fetchJson<Array<{ id: string; name: string }>>('/api/locations');
      const location = locations.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (location) {
        openLocation(location);
        return;
      }
      
      // If not found, suggest creating it
      if (confirm(`"${name}" not found. Would you like to create it?`)) {
        // Could open a create modal here
        console.log('Create entity:', name);
      }
    } catch (error) {
      console.error('Error finding entity:', error);
    }
  };

  // Handle timeline search
  const handleTimelineSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await searchTimelines(query, 'natural');
      setSearchResults(
        results.results.map(result => ({
          id: result.timeline.id,
          title: result.timeline.title,
          type: result.timeline.timeline_type,
          description: result.timeline.description || undefined,
          start_date: result.timeline.start_date,
          end_date: result.timeline.end_date || null
        }))
      );
    } catch (error) {
      console.error('Timeline search error:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'search' && searchQuery.trim()) {
        handleTimelineSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, handleTimelineSearch]);

  // Handle timeline click from search results
  const handleTimelineClick = useCallback((timelineId: string) => {
    // Open timeline in a new view or navigate to it
    // For now, we'll just log it - could integrate with timeline view
    console.log('Open timeline:', timelineId);
    // Could also open a timeline detail modal or navigate
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-black/90 border border-border/60 rounded-2xl shadow-panel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {entityData.type === 'character' && <User className="w-6 h-6 text-primary flex-shrink-0" />}
            {entityData.type === 'location' && <MapPin className="w-6 h-6 text-primary flex-shrink-0" />}
            {entityData.type === 'memory' && <FileText className="w-6 h-6 text-primary flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-white truncate">
                {getEntityName(entityData)}
              </h2>
              <p className="text-sm text-white/60 capitalize">{entityData.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {updating && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUpdateEntity}
              title="Auto-update from conversation"
              disabled={updating}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
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
                    ? 'bg-primary/20 text-white border-b-2 border-primary'
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
                      Ask questions, update information, or explore connections about {getEntityName(entityData)}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => handleChatMessage(`Tell me more about ${getEntityName(entityData)}`)}
                        className="text-xs px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 transition-colors"
                      >
                        Tell me more
                      </button>
                      <button
                        onClick={() => handleChatMessage(`What are the key details about ${getEntityName(entityData)}?`)}
                        className="text-xs px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 transition-colors"
                      >
                        Key details
                      </button>
                      <button
                        onClick={() => handleChatMessage(`What connections does ${getEntityName(entityData)} have?`)}
                        className="text-xs px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 transition-colors"
                      >
                        Show connections
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id}>
                      <ChatMessage message={message} />
                      {/* Auto-detect and make entity names clickable in assistant messages */}
                      {message.role === 'assistant' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {/* Extract potential entity names and make them clickable */}
                          {extractEntityNames(message.content).map((entity, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                // Try to find and open entity
                                handleEntityNameClick(entity.name);
                              }}
                              className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 transition-colors"
                            >
                              {entity.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
            <div className="space-y-4">
              {entityData.type === 'character' && entityData.character && (
                <>
                  <Card className="bg-black/40 border-border/60">
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-white">Character Information</h3>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Name</label>
                        <p className="text-sm text-white">{entityData.character.name}</p>
                      </div>
                      {entityData.character.summary && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Summary</label>
                          <p className="text-sm text-white/80">{entityData.character.summary}</p>
                        </div>
                      )}
                      {entityData.character.role && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Role</label>
                          <p className="text-sm text-white/80">{entityData.character.role}</p>
                        </div>
                      )}
                      {entityData.character.tags && entityData.character.tags.length > 0 && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Tags</label>
                          <div className="flex flex-wrap gap-2">
                            {entityData.character.tags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}

              {entityData.type === 'location' && entityData.location && (
                <>
                  <Card className="bg-black/40 border-border/60">
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-white">Location Information</h3>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Name</label>
                        <p className="text-sm text-white">{entityData.location.name}</p>
                      </div>
                      {entityData.location.type && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Type</label>
                          <p className="text-sm text-white/80">{entityData.location.type}</p>
                        </div>
                      )}
                      {entityData.location.description && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Description</label>
                          <p className="text-sm text-white/80">{entityData.location.description}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}

              {entityData.type === 'memory' && entityData.memory && (
                <>
                  <Card className="bg-black/40 border-border/60">
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-white">Memory Details</h3>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Date</label>
                        <p className="text-sm text-white">
                          {new Date(entityData.memory.start_time).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      {(entityData.memory as any).summary && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Summary</label>
                          <p className="text-sm text-white/80 whitespace-pre-wrap">
                            {(entityData.memory as any).summary}
                          </p>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Content</label>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">
                          {entityData.memory.content}
                        </p>
                      </div>
                      {(entityData.memory as any).mood && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Mood</label>
                          <p className="text-sm text-white/80">
                            {(entityData.memory as any).mood}
                          </p>
                        </div>
                      )}
                      {(entityData.memory as any).tags && (entityData.memory as any).tags.length > 0 && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Tags</label>
                          <div className="flex flex-wrap gap-2">
                            {(entityData.memory as any).tags.map((tag: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {entityData.memory.timeline_names && entityData.memory.timeline_names.length > 0 && (
                        <div>
                          <label className="text-xs text-white/60 mb-1 block">Timelines</label>
                          <div className="flex flex-wrap gap-2">
                            {entityData.memory.timeline_names.map((name, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-white/60 mb-1 block">Time Precision</label>
                        <p className="text-sm text-white/80 capitalize">
                          {entityData.memory.time_precision} ({(entityData.memory.time_confidence * 100).toFixed(0)}% confidence)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          ) : activeTab === 'connections' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary" />
                  Connections
                </h3>
              </div>

              {/* Entity Scopes */}
              {entityScopes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white/80">Scopes</h4>
                  <div className="flex flex-wrap gap-2">
                    {entityScopes.map((scope, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="bg-purple-500/20 text-purple-400 border-purple-500/30"
                        title={`Confidence: ${Math.round(scope.confidence * 100)}%`}
                      >
                        {scope.scope}
                        {scope.scopeContext && (
                          <span className="ml-1 text-xs opacity-75">({scope.scopeContext})</span>
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Entity Relationships */}
              {entityRelationships.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white/80">Relationships</h4>
                  <div className="space-y-2">
                    {entityRelationships.map((rel, idx) => (
                      <Card
                        key={idx}
                        className="bg-black/40 border-border/60"
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm text-white">
                                <span className="font-medium">{rel.fromEntityName}</span>
                                <span className="text-white/60 mx-2">
                                  {rel.relationshipType === 'works_for' && 'works for'}
                                  {rel.relationshipType === 'recruits_for' && 'recruits for'}
                                  {rel.relationshipType === 'vendor_for' && 'is vendor for'}
                                  {rel.relationshipType === 'contractor_for' && 'contracts for'}
                                  {rel.relationshipType === 'hires_for' && 'hires for'}
                                  {rel.relationshipType === 'part_of' && 'is part of'}
                                  {rel.relationshipType === 'owns' && 'owns'}
                                  {rel.relationshipType === 'manages' && 'manages'}
                                  {rel.relationshipType === 'represents' && 'represents'}
                                  {rel.relationshipType === 'associated_with' && 'associated with'}
                                  {!['works_for', 'recruits_for', 'vendor_for', 'contractor_for', 'hires_for', 'part_of', 'owns', 'manages', 'represents', 'associated_with'].includes(rel.relationshipType) && rel.relationshipType}
                                </span>
                                <span className="font-medium">{rel.toEntityName}</span>
                              </p>
                              {rel.scope && (
                                <p className="text-xs text-white/50 mt-1">
                                  Scope: <span className="text-purple-400">{rel.scope}</span>
                                </p>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30"
                              title={`Confidence: ${Math.round(rel.confidence * 100)}%`}
                            >
                              {Math.round(rel.confidence * 100)}%
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Legacy Connections (character relationships) */}
              {connections.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-white/80">Character Connections</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {connections.map((connection, idx) => (
                      <Card
                        key={idx}
                        className="bg-black/40 border-border/60 cursor-pointer hover:border-primary/40 transition-colors"
                        onClick={() => handleConnectionClick(connection)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            {connection.type === 'character' && <User className="w-4 h-4 text-primary" />}
                            {connection.type === 'location' && <MapPin className="w-4 h-4 text-primary" />}
                            {connection.type === 'memory' && <FileText className="w-4 h-4 text-primary" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{connection.name}</p>
                              <p className="text-xs text-white/60 capitalize">{connection.relation}</p>
                            </div>
                            <Link2 className="w-4 h-4 text-white/40" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {connections.length === 0 && entityRelationships.length === 0 && entityScopes.length === 0 && (
                <div className="text-center py-12">
                  <Network className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <p className="text-sm text-white/60">No connections found</p>
                </div>
              )}
            </div>
          ) : activeTab === 'timeline' ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Timeline
              </h3>
              {entityData.type === 'memory' && entityData.memory && (
                <Card className="bg-black/40 border-border/60">
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        <Calendar className="w-4 h-4" />
                        {new Date(entityData.memory.start_time).toLocaleDateString()}
                        {entityData.memory.end_time && (
                          <> - {new Date(entityData.memory.end_time).toLocaleDateString()}</>
                        )}
                      </div>
                      <div className="text-xs text-white/60">
                        Precision: {entityData.memory.time_precision} • Confidence: {(entityData.memory.time_confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {associatedTimelines.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-white/80">Associated Timelines</h4>
                  <div className="space-y-3">
                    {associatedTimelines.map((timeline) => {
                      const startDate = new Date(timeline.start_date);
                      const endDate = timeline.end_date ? new Date(timeline.end_date) : new Date();
                      const now = new Date();
                      const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
                      const currentDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
                      const progressPercent = totalDays > 0 ? Math.min(100, Math.max(0, (currentDays / totalDays) * 100)) : 50;
                      
                      return (
                        <div
                          key={timeline.id}
                          className="bg-black/40 border border-border/60 rounded-lg p-3 hover:border-primary/40 transition-all cursor-pointer group"
                          onClick={() => handleTimelineClick(timeline.id)}
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-white group-hover:text-primary transition-colors">
                                {timeline.title}
                              </span>
                              <Link2 className="w-3 h-3 text-white/40 group-hover:text-primary transition-colors" />
                            </div>
                            
                            {/* Progress Bar Style */}
                            <div className="relative h-6 bg-black/60 rounded-full overflow-hidden border border-border/40">
                              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20" />
                              <div
                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary/90 to-primary/70 rounded-full transition-all duration-500"
                                style={{
                                  width: `${progressPercent}%`,
                                  boxShadow: '0 0 8px rgba(154, 77, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                  {Math.round(progressPercent)}%
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between text-[10px] text-white/50">
                              <span>{startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="text-primary/70 font-medium capitalize">{timeline.timeline_type.replace('_', ' ')}</span>
                              <span>{endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'search' ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  Search Timelines
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search timelines (e.g., 'College timeline', 'Work projects')..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/40 border border-border/60 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchQuery.trim() && (
                <div className="space-y-3">
                  {searchResults.length === 0 && !searchLoading ? (
                    <div className="text-center py-8 text-white/60">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No timelines found</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {searchResults.map((timeline) => {
                        // Calculate timeline duration for visual representation
                        const startDate = timeline.start_date ? new Date(timeline.start_date) : new Date('2020-01-01');
                        const endDate = timeline.end_date ? new Date(timeline.end_date) : new Date();
                        const now = new Date();
                        const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
                        const currentDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
                        const progressPercent = totalDays > 0 ? Math.min(100, Math.max(0, (currentDays / totalDays) * 100)) : 50;
                        
                        return (
                          <div
                            key={timeline.id}
                            className="cursor-pointer group"
                            onClick={() => handleTimelineClick(timeline.id)}
                          >
                            <div className="bg-black/40 border border-border/60 rounded-lg p-4 hover:border-primary/40 transition-all hover:bg-black/50">
                              {/* Timeline Header */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">
                                    {timeline.title}
                                  </h4>
                                  <p className="text-xs text-white/60 capitalize mt-0.5">
                                    {timeline.type.replace('_', ' ')}
                                  </p>
                                </div>
                                <Link2 className="w-4 h-4 text-white/40 flex-shrink-0 ml-2 group-hover:text-primary transition-colors" />
                              </div>

                              {/* Progress Bar Style Timeline */}
                              <div className="space-y-2">
                                <div className="relative h-8 bg-black/60 rounded-full overflow-hidden border border-border/40">
                                  {/* Background gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/30 to-primary/20" />
                                  
                                  {/* Progress fill - looks like progress bar */}
                                  <div
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary/90 to-primary/70 rounded-full transition-all duration-500 ease-out"
                                    style={{
                                      width: `${progressPercent}%`,
                                      boxShadow: '0 0 10px rgba(154, 77, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                                    }}
                                  />
                                  
                                  {/* Animated shimmer effect */}
                                  <div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                                    style={{
                                      width: '200%',
                                      animation: 'shimmer 3s infinite'
                                    }}
                                  />
                                  
                                  {/* Timeline label overlay */}
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                                      {timeline.title}
                                    </span>
                                  </div>
                                </div>

                                {/* Timeline info */}
                                <div className="flex items-center justify-between text-xs text-white/50">
                                  <span>{startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                                  <span className="text-primary/70 font-medium">{Math.round(progressPercent)}%</span>
                                  <span>{endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                                </div>
                              </div>

                              {/* Description */}
                              {timeline.description && (
                                <p className="text-xs text-white/50 mt-3 line-clamp-2">{timeline.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!searchQuery.trim() && (
                <div className="text-center py-12 text-white/60">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">Enter a search query to find timelines</p>
                  <p className="text-xs mt-2 text-white/40">Search by name, type, or description</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
