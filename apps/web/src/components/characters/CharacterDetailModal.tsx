import { useState, useEffect, useRef } from 'react';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, TrendingUp, Heart, Star, Zap, BarChart3, Lightbulb } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatComposer } from '../../features/chat/composer/ChatComposer';
import { ChatMessage, type Message } from '../../features/chat/message/ChatMessage';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { Character } from './CharacterProfileCard';
import { CharacterAvatar } from './CharacterAvatar';

type SocialMedia = {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
  phone?: string;
};

type Relationship = {
  id?: string;
  character_id: string;
  character_name?: string;
  relationship_type: string;
  closeness_score?: number;
  summary?: string;
  status?: string;
};

type CharacterDetail = Character & {
  social_media?: SocialMedia;
  relationships?: Relationship[];
  shared_memories?: Array<{
    id: string;
    entry_id: string;
    date: string;
    summary?: string;
  }>;
};

type CharacterDetailModalProps = {
  character: Character;
  onClose: () => void;
  onUpdate: () => void;
};

type TabKey = 'info' | 'social' | 'relationships' | 'history' | 'context' | 'timeline' | 'chat' | 'insights' | 'metadata';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'social', label: 'Social Media', icon: Globe },
  { key: 'relationships', label: 'Connections', icon: Network },
  { key: 'history', label: 'History', icon: Calendar },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'metadata', label: 'Metadata', icon: Database }
];

export const CharacterDetailModal = ({ character, onClose, onUpdate }: CharacterDetailModalProps) => {
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [sharedMemoryCards, setSharedMemoryCards] = useState<MemoryCard[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  // Create mock shared memories for display
  const createMockMemories = (characterName: string): MemoryCard[] => {
    const now = new Date();
    return [
      {
        id: `mock-memory-1-${characterName}`,
        title: `Coffee catch-up with ${characterName}`,
        content: `Had a great coffee catch-up with ${characterName} today. We talked about our recent projects and shared some laughs. It's always refreshing to spend time with them.`,
        date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['friendship', 'coffee', 'conversation'],
        mood: 'happy',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-2-${characterName}`,
        title: `${characterName} helped me with my project`,
        content: `${characterName} gave me some really valuable feedback on my project. Their perspective is always insightful and they have a way of asking the right questions that help me think deeper.`,
        date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['collaboration', 'support', 'feedback'],
        mood: 'grateful',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-3-${characterName}`,
        title: `Birthday celebration for ${characterName}`,
        content: `Celebrated ${characterName}'s birthday today! We went to their favorite restaurant and had an amazing time. They seemed really happy and it was wonderful to be part of their special day.`,
        date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['celebration', 'birthday', 'friendship'],
        mood: 'joyful',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      },
      {
        id: `mock-memory-4-${characterName}`,
        title: `Deep conversation with ${characterName}`,
        content: `Had one of those deep, meaningful conversations with ${characterName} that I always treasure. We talked about life, dreams, and what we're working towards. Their wisdom always inspires me.`,
        date: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        tags: ['deep-talk', 'philosophy', 'friendship'],
        mood: 'reflective',
        source: 'journal',
        sourceIcon: '📖',
        characters: [characterName]
      }
    ];
  };
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    const loadFullDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await fetchJson<CharacterDetail>(`/api/characters/${character.id}`);
        setEditedCharacter(response);
        
        // Load full entry details for shared memories
        if (response.shared_memories && response.shared_memories.length > 0) {
          await loadSharedMemories(response.shared_memories);
        } else {
          // If no shared memories, show mock memories for demonstration
          const mockMemories = createMockMemories(character.name);
          setSharedMemoryCards(mockMemories);
        }
      } catch (error) {
        console.error('Failed to load character details:', error);
        // On error, still show mock memories
        const mockMemories = createMockMemories(character.name);
        setSharedMemoryCards(mockMemories);
      } finally {
        setLoadingDetails(false);
      }
    };
    void loadFullDetails();
  }, [character.id, character.name]);

  // Load insights when Insights tab is active
  useEffect(() => {
    if (activeTab === 'insights' && !insights && !loadingInsights) {
      setLoadingInsights(true);
      // Generate AI insights based on character data
      setTimeout(() => {
        const closenessScore = editedCharacter.metadata?.closeness_score || 0;
        const memoryCount = editedCharacter.shared_memories?.length || 0;
        const relationshipCount = editedCharacter.relationships?.length || 0;
        
        // Generate insights
        const generatedInsights = {
          totalMemories: memoryCount,
          relationships: relationshipCount,
          tags: editedCharacter.tags?.length || 0,
          firstAppearance: editedCharacter.first_appearance,
          status: editedCharacter.status,
          closenessScore: closenessScore,
          // AI-generated insights
          relationshipStrength: closenessScore >= 80 ? 'Very Strong' : closenessScore >= 60 ? 'Strong' : closenessScore >= 40 ? 'Moderate' : 'Developing',
          interactionFrequency: memoryCount >= 20 ? 'Very Frequent' : memoryCount >= 10 ? 'Frequent' : memoryCount >= 5 ? 'Occasional' : 'Rare',
          networkSize: relationshipCount >= 10 ? 'Large Network' : relationshipCount >= 5 ? 'Medium Network' : relationshipCount >= 1 ? 'Small Network' : 'Isolated',
          keyThemes: editedCharacter.tags?.slice(0, 5) || [],
          relationshipType: editedCharacter.metadata?.relationship_type || editedCharacter.archetype || 'Unknown',
          lastInteraction: editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 
            ? editedCharacter.shared_memories[editedCharacter.shared_memories.length - 1].date 
            : null,
          insights: [
            closenessScore >= 80 && `You have a ${closenessScore >= 90 ? 'very close' : 'close'} relationship with ${editedCharacter.name} (${closenessScore}/100)`,
            memoryCount > 0 && `You've shared ${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'} together`,
            relationshipCount > 0 && `${editedCharacter.name} is connected to ${relationshipCount} other ${relationshipCount === 1 ? 'person' : 'people'} in your network`,
            editedCharacter.archetype && `Archetype: ${editedCharacter.archetype} - This suggests ${editedCharacter.archetype === 'mentor' ? 'a guidance and learning relationship' : editedCharacter.archetype === 'friend' ? 'a supportive and social connection' : editedCharacter.archetype === 'family' ? 'a deep familial bond' : 'a meaningful connection'}`,
            editedCharacter.status === 'unmet' && 'This character is mentioned but you haven\'t met them yet',
            editedCharacter.tags && editedCharacter.tags.length > 0 && `Key themes: ${editedCharacter.tags.slice(0, 3).join(', ')}`
          ].filter(Boolean)
        };
        
        setInsights(generatedInsights);
        setLoadingInsights(false);
      }, 800);
    }
  }, [activeTab, insights, loadingInsights, editedCharacter]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        if (tabs[tabIndex]) {
          setActiveTab(tabs[tabIndex].key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);

    try {
      // Build comprehensive character context
      const characterContext = `You are helping the user discuss and update information about a specific character in their personal journal system.

CHARACTER CONTEXT:
- Name: ${editedCharacter.name}
- Aliases: ${editedCharacter.alias?.join(', ') || 'None'}
- Pronouns: ${editedCharacter.pronouns || 'Not specified'}
- Role: ${editedCharacter.role || 'Not specified'}
- Archetype: ${editedCharacter.archetype || 'Not specified'}
- Status: ${editedCharacter.status || 'active'}
- Summary: ${editedCharacter.summary || 'No summary available'}
- Tags: ${editedCharacter.tags?.join(', ') || 'None'}
- Shared Memories: ${editedCharacter.shared_memories?.length || 0}
- Relationships: ${editedCharacter.relationships?.length || 0}
- Closeness Score: ${editedCharacter.metadata?.closeness_score || 0}/100

INSTRUCTIONS:
1. Answer questions about this character based on the context above
2. If the user shares new information or stories about the character, acknowledge it and offer to update the character profile
3. If the user asks to update something (role, summary, tags, etc.), extract the update and respond naturally
4. Be conversational and helpful
5. When updates are needed, format them as JSON in your response like: {"updates": {"summary": "new summary", "tags": ["tag1", "tag2"]}}

User's message: ${message}`;

      const conversationHistory = [
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string; metadata?: any }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          conversationHistory,
          context: {
            character: {
              id: character.id,
              name: editedCharacter.name,
              summary: editedCharacter.summary,
              role: editedCharacter.role,
              archetype: editedCharacter.archetype,
              tags: editedCharacter.tags,
              metadata: editedCharacter.metadata
            }
          }
        })
      });

      let assistantContent = response.answer || response.metadata?.answer || 'I understand. How can I help you with this character?';
      
      // Try to parse updates from response
      let updates = null;
      try {
        // Look for JSON updates in the response
        const jsonMatch = assistantContent.match(/\{[\s\S]*"updates"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          updates = parsed.updates;
          assistantContent = assistantContent.replace(jsonMatch[0], '').trim();
        }
        
        // Also check metadata for updates
        if (response.metadata?.characterUpdates) {
          updates = response.metadata.characterUpdates;
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: assistantContent, 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      // If updates are provided, apply them
      if (updates) {
        try {
          // Update local state immediately for better UX
          setEditedCharacter(prev => ({
            ...prev,
            ...updates,
            tags: updates.tags || prev.tags,
            alias: updates.alias || prev.alias,
            social_media: updates.social_media || prev.social_media
          }));

          // Save to backend
          await fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
          });
          
          const successMessage = { 
            role: 'assistant' as const, 
            content: '✓ Character information updated successfully!', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, successMessage]);
          
          // Refresh character data
          onUpdate();
        } catch (updateError) {
          console.error('Update error:', updateError);
          const errorMsg = { 
            role: 'assistant' as const, 
            content: 'I understood the update, but there was an error saving. Please try again or use the Save button.', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, errorMsg]);
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = { 
        role: 'assistant' as const, 
        content: 'Sorry, I encountered an error. Please try again.', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadSharedMemories = async (sharedMemories: Array<{ id: string; entry_id: string; date: string; summary?: string }>) => {
    setLoadingMemories(true);
    try {
      // Fetch full entry details for each shared memory
      const entryPromises = sharedMemories.map(async (memory) => {
        try {
          const entry = await fetchJson<{
            id: string;
            date: string;
            content: string;
            summary?: string | null;
            tags: string[];
            mood?: string | null;
            chapter_id?: string | null;
            source: string;
            metadata?: Record<string, unknown>;
          }>(`/api/entries/${memory.entry_id}`);
          return memoryEntryToCard(entry);
        } catch (error) {
          console.error(`Failed to load entry ${memory.entry_id}:`, error);
          return null;
        }
      });

      const cards = (await Promise.all(entryPromises)).filter((card): card is MemoryCard => card !== null);
      setSharedMemoryCards(cards);
    } catch (error) {
      console.error('Failed to load shared memories:', error);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetchJson(`/api/characters/${character.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editedCharacter.name,
          alias: editedCharacter.alias,
          pronouns: editedCharacter.pronouns,
          archetype: editedCharacter.archetype,
          role: editedCharacter.role,
          status: editedCharacter.status,
          summary: editedCharacter.summary,
          tags: editedCharacter.tags,
          social_media: editedCharacter.social_media,
          metadata: editedCharacter.metadata
        })
      });
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Failed to update character:', error);
      alert('Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const updateSocialMedia = (field: keyof SocialMedia, value: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      social_media: {
        ...prev.social_media,
        [field]: value
      }
    }));
  };

  const addTag = (tag: string) => {
    if (tag.trim() && !editedCharacter.tags?.includes(tag.trim())) {
      setEditedCharacter((prev) => ({
        ...prev,
        tags: [...(prev.tags || []), tag.trim()]
      }));
    }
  };

  const removeTag = (tag: string) => {
    setEditedCharacter((prev) => ({
      ...prev,
      tags: prev.tags?.filter((t) => t !== tag) || []
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-black via-black/95 to-black border-2 border-primary/30 rounded-2xl w-full max-w-5xl h-[95vh] overflow-hidden flex flex-col shadow-2xl shadow-primary/20">
        {/* Enhanced Header */}
        <div className="relative bg-gradient-to-r from-primary/20 via-purple-900/20 to-primary/20 border-b-2 border-primary/30 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="relative">
                <CharacterAvatar 
                  url={editedCharacter.avatar_url} 
                  name={editedCharacter.name} 
                  size={64}
                />
                {editedCharacter.status && (
                  <div className="absolute -bottom-1 -right-1">
                    <Badge 
                      className={`${
                        editedCharacter.status === 'active' 
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : editedCharacter.status === 'unmet'
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 border-dashed'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                      } text-xs px-2 py-0.5`}
                    >
                      {editedCharacter.status === 'unmet' ? 'Unmet' : editedCharacter.status}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-3xl font-bold text-white mb-1 tracking-tight">{editedCharacter.name}</h2>
                {editedCharacter.alias && editedCharacter.alias.length > 0 && (
                  <p className="text-base text-white/70 mb-2">
                    <span className="text-white/50">Also known as:</span> {editedCharacter.alias.join(', ')}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {editedCharacter.role && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-sm px-3 py-1">
                      <Tag className="h-3 w-3 mr-1" />
                      {editedCharacter.role}
                    </Badge>
                  )}
                  {editedCharacter.archetype && (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-sm px-3 py-1">
                      <Sparkles className="h-3 w-3 mr-1" />
                      {editedCharacter.archetype}
                    </Badge>
                  )}
                  {editedCharacter.pronouns && (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-sm px-3 py-1">
                      <Users className="h-3 w-3 mr-1" />
                      {editedCharacter.pronouns}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0 hover:bg-white/10">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="flex border-b border-border/60 overflow-x-auto flex-shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-b-2 border-primary text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div ref={contentRef} className="flex-1 overflow-y-auto p-8 space-y-8 bg-black/40 min-h-0">
            {loadingDetails && (
              <div className="text-center py-12 text-white/60">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-lg">Loading character details...</p>
              </div>
            )}
            {!loadingDetails && activeTab === 'info' && (
              <div className="space-y-6">
                {/* Summary Section - Prominent */}
                <div>
                  <label className="text-lg font-semibold text-white mb-3 block flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Summary
                  </label>
                  <Textarea
                    value={editedCharacter.summary || ''}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, summary: e.target.value }))}
                    rows={4}
                    placeholder="Character description and background..."
                    className="bg-black/60 border-border/50 text-white text-base leading-relaxed placeholder:text-white/30 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-base font-semibold text-white/90 mb-2 block">Name</label>
                    <Input
                      value={editedCharacter.name}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, name: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white text-base h-11"
                    />
                  </div>

                  <div>
                    <label className="text-base font-semibold text-white/90 mb-2 block">Aliases</label>
                    <Input
                      value={editedCharacter.alias?.join(', ') || ''}
                      onChange={(e) =>
                        setEditedCharacter((prev) => ({
                          ...prev,
                          alias: e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
                        }))
                      }
                      placeholder="Alias1, Alias2, ..."
                      className="bg-black/60 border-border/50 text-white text-base h-11"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <label className="text-base font-semibold text-white/90 mb-2 block">Pronouns</label>
                    <Input
                      value={editedCharacter.pronouns || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, pronouns: e.target.value }))}
                      placeholder="they/them"
                      className="bg-black/60 border-border/50 text-white text-base h-11"
                    />
                  </div>
                  <div>
                    <label className="text-base font-semibold text-white/90 mb-2 block">Archetype</label>
                    <Input
                      value={editedCharacter.archetype || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, archetype: e.target.value }))}
                      placeholder="mentor, friend, etc."
                      className="bg-black/60 border-border/50 text-white text-base h-11"
                    />
                  </div>
                  <div>
                    <label className="text-base font-semibold text-white/90 mb-2 block">Role</label>
                    <Input
                      value={editedCharacter.role || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, role: e.target.value }))}
                      placeholder="colleague, family, etc."
                      className="bg-black/60 border-border/50 text-white text-base h-11"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-base font-semibold text-white/90 mb-3 block flex items-center gap-2">
                    <Tag className="h-5 w-5 text-primary" />
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {editedCharacter.tags?.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="px-3 py-1.5 text-sm bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 transition-colors flex items-center gap-2"
                      >
                        {tag}
                        <button 
                          onClick={() => removeTag(tag)} 
                          className="hover:text-primary/60 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Add a tag and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag(e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                    className="bg-black/60 border-border/50 text-white text-base h-11"
                  />
                </div>
              </div>
            )}

            {!loadingDetails && activeTab === 'social' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </label>
                  <Input
                    value={editedCharacter.social_media?.instagram || ''}
                    onChange={(e) => updateSocialMedia('instagram', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Twitter className="h-4 w-4" />
                    Twitter/X
                  </label>
                  <Input
                    value={editedCharacter.social_media?.twitter || ''}
                    onChange={(e) => updateSocialMedia('twitter', e.target.value)}
                    placeholder="@username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </label>
                  <Input
                    value={editedCharacter.social_media?.facebook || ''}
                    onChange={(e) => updateSocialMedia('facebook', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </label>
                  <Input
                    value={editedCharacter.social_media?.linkedin || ''}
                    onChange={(e) => updateSocialMedia('linkedin', e.target.value)}
                    placeholder="username or profile URL"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </label>
                  <Input
                    value={editedCharacter.social_media?.github || ''}
                    onChange={(e) => updateSocialMedia('github', e.target.value)}
                    placeholder="username"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Website
                  </label>
                  <Input
                    value={editedCharacter.social_media?.website || ''}
                    onChange={(e) => updateSocialMedia('website', e.target.value)}
                    placeholder="https://..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                  <Input
                    type="email"
                    value={editedCharacter.social_media?.email || ''}
                    onChange={(e) => updateSocialMedia('email', e.target.value)}
                    placeholder="email@example.com"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Phone
                  </label>
                  <Input
                    type="tel"
                    value={editedCharacter.social_media?.phone || ''}
                    onChange={(e) => updateSocialMedia('phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>
              </div>
            )}

            {!loadingDetails && activeTab === 'relationships' && (
              <div className="space-y-6">
                {/* Relationship to You */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Relationship to You
                  </h3>
                  <Card className="bg-gradient-to-br from-primary/10 to-purple-900/20 border-primary/30">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        {editedCharacter.role && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Role</span>
                            <p className="text-white font-medium">{editedCharacter.role}</p>
                          </div>
                        )}
                        {editedCharacter.archetype && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Archetype</span>
                            <p className="text-white font-medium">{editedCharacter.archetype}</p>
                          </div>
                        )}
                        {editedCharacter.summary && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Summary</span>
                            <p className="text-white/80 text-sm mt-1">{editedCharacter.summary}</p>
                          </div>
                        )}
                        {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                          <div>
                            <span className="text-xs text-white/50 uppercase">Closeness</span>
                            {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name) && (
                              <div className="mt-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-black/40 rounded-full h-2">
                                    <div 
                                      className="bg-primary h-2 rounded-full"
                                      style={{ 
                                        width: `${((editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0) / 10) * 100}%` 
                                      }}
                                    />
                                  </div>
                                  <span className="text-sm text-white/70">
                                    {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 0}/10
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Mutual Connections */}
                {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Mutual Connections
                    </h3>
                    <div className="space-y-2">
                      {editedCharacter.relationships
                        .filter(rel => rel.character_name && rel.character_name !== 'You')
                        .map((rel) => (
                          <Card key={rel.id} className="bg-black/40 border-border/50">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-white">{rel.character_name}</p>
                                    <span className="text-xs text-primary/70 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                                      {rel.relationship_type}
                                    </span>
                                  </div>
                                  {rel.summary && <p className="text-sm text-white/60 mt-1">{rel.summary}</p>}
                                </div>
                                {rel.closeness_score !== undefined && (
                                  <div className="text-right ml-4">
                                    <span className="text-xs text-white/50 block">Closeness</span>
                                    <span className="text-sm font-medium text-primary">{rel.closeness_score}/10</span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      {editedCharacter.relationships.filter(rel => rel.character_name && rel.character_name !== 'You').length === 0 && (
                        <div className="text-center py-8 text-white/40">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No mutual connections tracked yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!loadingDetails && activeTab === 'history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Shared Memories
                    </h3>
                    <p className="text-sm text-white/60 mt-1">
                      Stories and moments you've shared with {editedCharacter.name}
                    </p>
                  </div>
                  {editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 && (
                    <span className="text-sm text-white/50">
                      {editedCharacter.shared_memories.length} {editedCharacter.shared_memories.length === 1 ? 'memory' : 'memories'}
                    </span>
                  )}
                </div>

                {/* Memory Cards */}
                {loadingMemories ? (
                  <div className="text-center py-12 text-white/60">
                    <p>Loading shared memories...</p>
                  </div>
                ) : sharedMemoryCards.length > 0 ? (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {sharedMemoryCards.map((memory) => (
                        <div key={memory.id} data-memory-id={memory.id}>
                          <MemoryCardComponent
                            memory={memory}
                            showLinked={true}
                            expanded={expandedCardId === memory.id}
                            onToggleExpand={() => setExpandedCardId(expandedCardId === memory.id ? null : memory.id)}
                            onSelect={() => setSelectedMemory(memory)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : editedCharacter.shared_memories && editedCharacter.shared_memories.length > 0 ? (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">Loading memory details...</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/40">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium mb-1">No shared memories yet</p>
                    <p className="text-sm">Memories will appear here as you mention {editedCharacter.name} in your journal entries</p>
                  </div>
                )}
              </div>
            )}

            {/* Context Tab */}
            {!loadingDetails && activeTab === 'context' && (
              <div className="space-y-6">
                {/* Character Overview */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Character Overview
                  </h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {editedCharacter.role && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Role:</span>
                            <span className="text-white">{editedCharacter.role}</span>
                          </div>
                        )}
                        {editedCharacter.archetype && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Archetype:</span>
                            <span className="text-white">{editedCharacter.archetype}</span>
                          </div>
                        )}
                        {editedCharacter.status && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Status:</span>
                            <span className="text-white capitalize">{editedCharacter.status}</span>
                          </div>
                        )}
                        {editedCharacter.first_appearance && (
                          <div className="flex justify-between">
                            <span className="text-white/60">First Appearance:</span>
                            <span className="text-white">{new Date(editedCharacter.first_appearance).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Summary */}
                {editedCharacter.summary && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Summary
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <p className="text-white/90 whitespace-pre-wrap">{editedCharacter.summary}</p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Tags */}
                {editedCharacter.tags && editedCharacter.tags.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {editedCharacter.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="px-3 py-1 text-sm">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Timeline Tab */}
            {!loadingDetails && activeTab === 'timeline' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Timeline View</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Visual timeline of memories with {editedCharacter.name}
                  </p>
                </div>
                {sharedMemoryCards.length > 0 ? (
                  <div className="border border-border/50 rounded-lg p-4 bg-black/20">
                    <ColorCodedTimeline
                      entries={sharedMemoryCards.map(memory => ({
                        id: memory.id,
                        content: memory.content,
                        date: memory.date,
                        chapter_id: memory.chapterId || null
                      }))}
                      showLabel={true}
                      onItemClick={(item) => {
                        const clickedMemory = sharedMemoryCards.find(m => m.id === item.id);
                        if (clickedMemory) {
                          setSelectedMemory(clickedMemory);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No timeline data available</p>
                  </div>
                )}
              </div>
            )}

            {/* Chat Tab */}
            {!loadingDetails && activeTab === 'chat' && (
              <div className="flex flex-col h-full min-h-0">
                <div className="mb-4 flex-shrink-0">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <MessageSquare className="h-6 w-6 text-primary" />
                    Chat about {editedCharacter.name}
                  </h3>
                  <p className="text-base text-white/70">
                    Ask questions, share stories, or update information about {editedCharacter.name} through conversation.
                  </p>
                </div>
                
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0 pr-2">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 text-white/60">
                      <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50 text-primary" />
                      <p className="text-lg mb-2">Start a conversation about {editedCharacter.name}</p>
                      <div className="mt-4 space-y-2 text-sm text-white/50">
                        <p className="font-semibold text-white/70">Try asking:</p>
                        <p>"Tell me more about {editedCharacter.name}"</p>
                        <p>"What do I know about {editedCharacter.name}?"</p>
                        <p>"Update {editedCharacter.name}'s role to..."</p>
                        <p>"Add to {editedCharacter.name}'s story: ..."</p>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => {
                      const message: Message = {
                        id: `msg-${idx}`,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                      };
                      return (
                        <ChatMessage
                          key={idx}
                          message={message}
                          onCopy={() => navigator.clipboard.writeText(msg.content)}
                        />
                      );
                    })
                  )}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <Card className="bg-black/40 border-border/50 max-w-[80%]">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-white/60">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            <span>Thinking...</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                {/* Chat Composer */}
                <div className="border-t-2 border-primary/30 pt-4 flex-shrink-0">
                  <ChatComposer
                    onSubmit={handleChatSubmit}
                    loading={chatLoading}
                  />
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-8">
                {loadingInsights ? (
                  <div className="text-center py-16 text-white/60">
                    <Brain className="h-16 w-16 mx-auto mb-4 animate-pulse opacity-50 text-primary" />
                    <p className="text-lg">Analyzing character...</p>
                  </div>
                ) : insights ? (
                  <>
                    {/* Key Stats Grid */}
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <BarChart3 className="h-6 w-6 text-primary" />
                        Key Statistics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="bg-gradient-to-br from-primary/20 to-primary/10 border-primary/30 hover:border-primary/50 transition-colors">
                          <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-5 w-5 text-primary" />
                              <div className="text-sm text-white/60">Memories</div>
                            </div>
                            <div className="text-3xl font-bold text-white">{insights.totalMemories}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/10 border-purple-500/30 hover:border-purple-500/50 transition-colors">
                          <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <Network className="h-5 w-5 text-purple-400" />
                              <div className="text-sm text-white/60">Connections</div>
                            </div>
                            <div className="text-3xl font-bold text-white">{insights.relationships}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 border-cyan-500/30 hover:border-cyan-500/50 transition-colors">
                          <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <Tag className="h-5 w-5 text-cyan-400" />
                              <div className="text-sm text-white/60">Tags</div>
                            </div>
                            <div className="text-3xl font-bold text-white">{insights.tags}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-gradient-to-br from-green-500/20 to-green-500/10 border-green-500/30 hover:border-green-500/50 transition-colors">
                          <CardContent className="p-5">
                            <div className="flex items-center gap-2 mb-2">
                              <Heart className="h-5 w-5 text-green-400" />
                              <div className="text-sm text-white/60">Closeness</div>
                            </div>
                            <div className="text-3xl font-bold text-white">{insights.closenessScore || 0}</div>
                            <div className="text-xs text-white/50 mt-1">/ 100</div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    {/* AI-Generated Insights */}
                    {insights.insights && insights.insights.length > 0 && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Lightbulb className="h-6 w-6 text-yellow-400" />
                          AI Insights
                        </h3>
                        <div className="space-y-3">
                          {insights.insights.map((insight: string, idx: number) => (
                            <Card key={idx} className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <Sparkles className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                  <p className="text-white/90 text-base leading-relaxed">{insight}</p>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Relationship Analysis */}
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-primary" />
                        Relationship Analysis
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-black/60 border-border/50">
                          <CardContent className="p-5">
                            <div className="text-sm text-white/60 mb-2">Relationship Strength</div>
                            <div className="text-xl font-bold text-white mb-2">{insights.relationshipStrength}</div>
                            <div className="w-full bg-black/40 rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${insights.closenessScore || 0}%` }}
                              />
                            </div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/60 border-border/50">
                          <CardContent className="p-5">
                            <div className="text-sm text-white/60 mb-2">Interaction Frequency</div>
                            <div className="text-xl font-bold text-white">{insights.interactionFrequency}</div>
                            <div className="text-xs text-white/50 mt-2">{insights.totalMemories} memories recorded</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/60 border-border/50">
                          <CardContent className="p-5">
                            <div className="text-sm text-white/60 mb-2">Network Size</div>
                            <div className="text-xl font-bold text-white">{insights.networkSize}</div>
                            <div className="text-xs text-white/50 mt-2">{insights.relationships} connections</div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    {/* Timeline Info */}
                    {insights.firstAppearance && (
                      <div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <Calendar className="h-6 w-6 text-primary" />
                          Timeline
                        </h3>
                        <Card className="bg-black/60 border-border/50">
                          <CardContent className="p-5">
                            <div className="space-y-3">
                              <div>
                                <div className="text-sm text-white/60 mb-1">First Appearance</div>
                                <div className="text-lg font-semibold text-white">
                                  {new Date(insights.firstAppearance).toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                              </div>
                              {insights.lastInteraction && (
                                <div>
                                  <div className="text-sm text-white/60 mb-1">Last Interaction</div>
                                  <div className="text-lg font-semibold text-white">
                                    {new Date(insights.lastInteraction).toLocaleDateString('en-US', {
                                      month: 'long',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-16 text-white/60">
                    <Brain className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No insights available</p>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Tab */}
            {!loadingDetails && activeTab === 'metadata' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Character Details</h3>
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/60">Character ID:</span>
                          <span className="text-white font-mono text-xs">{editedCharacter.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Name:</span>
                          <span className="text-white">{editedCharacter.name}</span>
                        </div>
                        {editedCharacter.alias && editedCharacter.alias.length > 0 && (
                          <div className="flex justify-between">
                            <span className="text-white/60">Aliases:</span>
                            <span className="text-white">{editedCharacter.alias.join(', ')}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-white/60">Pronouns:</span>
                          <span className="text-white">{editedCharacter.pronouns || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Role:</span>
                          <span className="text-white">{editedCharacter.role || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Archetype:</span>
                          <span className="text-white">{editedCharacter.archetype || 'Not specified'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Status:</span>
                          <span className="text-white capitalize">{editedCharacter.status || 'Unknown'}</span>
                        </div>
                        {editedCharacter.first_appearance && (
                          <div className="flex justify-between">
                            <span className="text-white/60">First Appearance:</span>
                            <span className="text-white">{editedCharacter.first_appearance}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-white/60">Tags Count:</span>
                          <span className="text-white">{editedCharacter.tags?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Shared Memories:</span>
                          <span className="text-white">{editedCharacter.shared_memories?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Relationships:</span>
                          <span className="text-white">{editedCharacter.relationships?.length || 0}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {editedCharacter.metadata && Object.keys(editedCharacter.metadata).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Raw Metadata</h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        <pre className="text-xs text-white/80 overflow-x-auto">
                          {JSON.stringify(editedCharacter.metadata, null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-6 border-t border-border/60 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} leftIcon={<Save className="h-4 w-4" />}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = sharedMemoryCards.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={sharedMemoryCards}
        />
      )}
    </div>
  );
};

