import { useState, useEffect, useRef } from 'react';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { ChatComposer } from '../chat/ChatComposer';
import { fetchJson } from '../../lib/api';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { Character } from './CharacterProfileCard';

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
  { key: 'social', label: 'Social Media', icon: Globe },
  { key: 'relationships', label: 'Connections', icon: Network },
  { key: 'history', label: 'History', icon: Calendar },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
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
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
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
        }
      } catch (error) {
        console.error('Failed to load character details:', error);
      } finally {
        setLoadingDetails(false);
      }
    };
    void loadFullDetails();
  }, [character.id]);

  // Load insights when Insights tab is active
  useEffect(() => {
    if (activeTab === 'insights' && !insights && !loadingInsights) {
      setLoadingInsights(true);
      setTimeout(() => {
        setInsights({
          totalMemories: editedCharacter.shared_memories?.length || 0,
          relationships: editedCharacter.relationships?.length || 0,
          tags: editedCharacter.tags?.length || 0,
          firstAppearance: editedCharacter.first_appearance,
          status: editedCharacter.status
        });
        setLoadingInsights(false);
      }, 500);
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

  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const characterContext = `You are helping the user with a specific character. Here's the context:

Character: ${editedCharacter.name}
Aliases: ${editedCharacter.alias?.join(', ') || 'None'}
Pronouns: ${editedCharacter.pronouns || 'Not specified'}
Role: ${editedCharacter.role || 'Not specified'}
Archetype: ${editedCharacter.archetype || 'Not specified'}
Summary: ${editedCharacter.summary || 'No summary'}
Tags: ${editedCharacter.tags?.join(', ') || 'None'}
Status: ${editedCharacter.status || 'Unknown'}
Shared Memories: ${editedCharacter.shared_memories?.length || 0}
Relationships: ${editedCharacter.relationships?.length || 0}`;

      const conversationHistory = [
        { role: 'assistant' as const, content: characterContext },
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `[Character Context: ${editedCharacter.name}] ${message}`,
          conversationHistory
        })
      });

      let assistantContent = response.answer || 'I understand. How can I help you with this character?';
      
      // Try to parse updates from response
      let updates = null;
      try {
        const jsonMatch = assistantContent.match(/\{[\s\S]*"updates"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          updates = parsed.updates;
          assistantContent = assistantContent.replace(jsonMatch[0], '').trim();
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
          await fetchJson(`/api/characters/${character.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
          });
          const successMessage = { 
            role: 'assistant' as const, 
            content: '✓ Character updated successfully!', 
            timestamp: new Date() 
          };
          setChatMessages(prev => [...prev, successMessage]);
          setTimeout(() => window.location.reload(), 1000);
        } catch (updateError) {
          console.error('Update error:', updateError);
          const errorMsg = { 
            role: 'assistant' as const, 
            content: 'Failed to update character. Please try again.', 
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-black border border-border/60 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div>
            <h2 className="text-2xl font-semibold">{editedCharacter.name}</h2>
            {editedCharacter.alias && editedCharacter.alias.length > 0 && (
              <p className="text-sm text-white/60 mt-1">
                Also known as: {editedCharacter.alias.join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Tab Navigation */}
          <div className="flex border-b border-border/60 overflow-x-auto">
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

          <div ref={contentRef} className="p-6 space-y-6">
            {loadingDetails && (
              <div className="text-center py-8 text-white/60">Loading character details...</div>
            )}
            {!loadingDetails && activeTab === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Name</label>
                  <Input
                    value={editedCharacter.name}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, name: e.target.value }))}
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Aliases (comma-separated)</label>
                  <Input
                    value={editedCharacter.alias?.join(', ') || ''}
                    onChange={(e) =>
                      setEditedCharacter((prev) => ({
                        ...prev,
                        alias: e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
                      }))
                    }
                    placeholder="Alias1, Alias2, ..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Pronouns</label>
                    <Input
                      value={editedCharacter.pronouns || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, pronouns: e.target.value }))}
                      placeholder="they/them"
                      className="bg-black/40 border-border/50 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Archetype</label>
                    <Input
                      value={editedCharacter.archetype || ''}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, archetype: e.target.value }))}
                      placeholder="mentor, friend, etc."
                      className="bg-black/40 border-border/50 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Role</label>
                  <Input
                    value={editedCharacter.role || ''}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, role: e.target.value }))}
                    placeholder="colleague, family, etc."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Summary</label>
                  <Textarea
                    value={editedCharacter.summary || ''}
                    onChange={(e) => setEditedCharacter((prev) => ({ ...prev, summary: e.target.value }))}
                    rows={4}
                    placeholder="Character description and background..."
                    className="bg-black/40 border-border/50 text-white"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editedCharacter.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded text-xs bg-primary/10 text-primary border border-primary/20 flex items-center gap-1"
                      >
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-primary/60">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
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
                    className="bg-black/40 border-border/50 text-white"
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
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Chat about this Character</h3>
                  <p className="text-sm text-white/60 mb-4">
                    Ask questions or add information about {editedCharacter.name} through conversation.
                  </p>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Start a conversation about this character</p>
                      <p className="text-xs mt-2">Try: "Tell me more about {editedCharacter.name}" or "Update their role to..."</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-primary/20 text-white'
                              : 'bg-black/40 border border-border/50 text-white'
                          }`}
                        >
                          <p className="text-sm">{msg.content}</p>
                          <p className="text-xs text-white/40 mt-1">
                            {msg.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border/60 pt-4">
                  <ChatComposer
                    input={chatInput}
                    onInputChange={setChatInput}
                    onSubmit={handleChatSubmit}
                    loading={chatLoading}
                  />
                </div>
              </div>
            )}

            {/* Insights Tab */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-6">
                {loadingInsights ? (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 animate-pulse opacity-50" />
                    <p>Analyzing character...</p>
                  </div>
                ) : insights ? (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Character Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Total Memories</div>
                            <div className="text-2xl font-bold text-white">{insights.totalMemories}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Relationships</div>
                            <div className="text-2xl font-bold text-white">{insights.relationships}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Tags</div>
                            <div className="text-2xl font-bold text-white">{insights.tags}</div>
                          </CardContent>
                        </Card>
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <div className="text-sm text-white/60 mb-1">Status</div>
                            <div className="text-xl font-bold text-white capitalize">{insights.status || 'Unknown'}</div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                    {insights.firstAppearance && (
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-primary" />
                          First Appearance
                        </h3>
                        <Card className="bg-black/40 border-border/50">
                          <CardContent className="p-4">
                            <p className="text-white">
                              {new Date(insights.firstAppearance).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-white/60">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No insights available</p>
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

        <div className="flex items-center justify-end gap-2 p-6 border-t border-border/60">
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

