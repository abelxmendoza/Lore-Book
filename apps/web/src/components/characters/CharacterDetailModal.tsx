import { useState, useEffect, useRef } from 'react';
import { PerceptionsView } from '../perceptions/PerceptionsView';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, TrendingUp, TrendingDown, Minus, Heart, Star, Zap, BarChart3, Lightbulb, Award, User, Hash, Info, Link2, Eye } from 'lucide-react';
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
import { useMockData } from '../../contexts/MockDataContext';

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
  first_name?: string | null;
  last_name?: string | null;
  importance_level?: 'protagonist' | 'major' | 'supporting' | 'minor' | 'background' | null;
  importance_score?: number | null;
  is_nickname?: boolean | null;
  proximity_level?: 'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party' | null;
  has_met?: boolean | null;
  relationship_depth?: 'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only' | null;
  associated_with_character_ids?: string[] | null;
  mentioned_by_character_ids?: string[] | null;
  context_of_mention?: string | null;
  likelihood_to_meet?: 'likely' | 'possible' | 'unlikely' | 'never' | null;
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

type TabKey = 'info' | 'social' | 'relationships' | 'perceptions' | 'history' | 'context' | 'timeline' | 'chat' | 'insights' | 'metadata';

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'social', label: 'Social Media', icon: Globe },
  { key: 'relationships', label: 'Connections', icon: Network },
  { key: 'perceptions', label: 'Perceptions', icon: Eye },
  { key: 'history', label: 'History', icon: Calendar },
  { key: 'context', label: 'Context', icon: Layers },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'insights', label: 'Insights', icon: Brain },
  { key: 'metadata', label: 'Metadata', icon: Database }
];

export const CharacterDetailModal = ({ character, onClose, onUpdate }: CharacterDetailModalProps) => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);

  const getImportanceColor = (level?: string | null) => {
    const colors: Record<string, string> = {
      'protagonist': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      'major': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
      'supporting': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      'minor': 'bg-gray-500/20 text-gray-400 border-gray-500/40',
      'background': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };
    return colors[level || ''] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';
  };

  const getImportanceIcon = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return <Star className="h-4 w-4" />;
      case 'major':
        return <Award className="h-4 w-4" />;
      case 'supporting':
        return <User className="h-4 w-4" />;
      case 'minor':
        return <Hash className="h-4 w-4" />;
      default:
        return <Hash className="h-4 w-4" />;
    }
  };

  const getImportanceLabel = (level?: string | null) => {
    switch (level) {
      case 'protagonist':
        return 'Protagonist';
      case 'major':
        return 'Major';
      case 'supporting':
        return 'Supporting';
      case 'minor':
        return 'Minor';
      case 'background':
        return 'Background';
      default:
        return 'Unknown';
    }
  };
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
          // If no shared memories, show mock memories only if toggle is enabled
          if (isMockDataEnabled) {
            const mockMemories = createMockMemories(character.name);
            setSharedMemoryCards(mockMemories);
          } else {
            setSharedMemoryCards([]);
          }
        }
      } catch (error) {
        console.error('Failed to load character details:', error);
        // On error, show mock memories only if toggle is enabled
        if (isMockDataEnabled) {
          const mockMemories = createMockMemories(character.name);
          setSharedMemoryCards(mockMemories);
        } else {
          setSharedMemoryCards([]);
        }
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
      // Build comprehensive character context with analytics
      const analyticsContext = editedCharacter.analytics ? `
RELATIONSHIP ANALYTICS (calculated from conversations, journal entries, and shared memories):
- Closeness Score: ${editedCharacter.analytics.closeness_score}/100 (how close the relationship is)
- Relationship Depth: ${editedCharacter.analytics.relationship_depth}/100 (depth of emotional connection)
- Interaction Frequency: ${editedCharacter.analytics.interaction_frequency}/100 (how often you interact)
- Recency Score: ${editedCharacter.analytics.recency_score}/100 (how recently you interacted)
- Importance Score: ${editedCharacter.analytics.importance_score}/100 (overall importance to you)
- Priority Score: ${editedCharacter.analytics.priority_score}/100 (urgency/priority level)
- Relevance Score: ${editedCharacter.analytics.relevance_score}/100 (current relevance in your life)
- Value Score: ${editedCharacter.analytics.value_score}/100 (value they provide to you)
- Their Influence on You: ${editedCharacter.analytics.character_influence_on_user}/100
- Your Influence Over Them: ${editedCharacter.analytics.user_influence_over_character}/100
- Sentiment Score: ${editedCharacter.analytics.sentiment_score} (positive to negative, -100 to +100)
- Trust Score: ${editedCharacter.analytics.trust_score}/100
- Support Score: ${editedCharacter.analytics.support_score}/100
- Conflict Score: ${editedCharacter.analytics.conflict_score}/100
- Engagement Score: ${editedCharacter.analytics.engagement_score}/100
- Activity Level: ${editedCharacter.analytics.activity_level}/100
- Shared Experiences: ${editedCharacter.analytics.shared_experiences} memories/events
- Relationship Duration: ${editedCharacter.analytics.relationship_duration_days} days
- Relationship Trend: ${editedCharacter.analytics.trend} (deepening/stable/weakening)
${editedCharacter.analytics.strengths && editedCharacter.analytics.strengths.length > 0 ? `- Strengths: ${editedCharacter.analytics.strengths.join(', ')}` : ''}
${editedCharacter.analytics.weaknesses && editedCharacter.analytics.weaknesses.length > 0 ? `- Weaknesses: ${editedCharacter.analytics.weaknesses.join(', ')}` : ''}
${editedCharacter.analytics.opportunities && editedCharacter.analytics.opportunities.length > 0 ? `- Opportunities: ${editedCharacter.analytics.opportunities.join(', ')}` : ''}
${editedCharacter.analytics.risks && editedCharacter.analytics.risks.length > 0 ? `- Risks: ${editedCharacter.analytics.risks.join(', ')}` : ''}

You can explain these analytics to the user when asked. For example:
- "Your closeness score of ${editedCharacter.analytics.closeness_score}% indicates ${editedCharacter.analytics.closeness_score >= 70 ? 'a very close relationship' : editedCharacter.analytics.closeness_score >= 40 ? 'a moderate closeness' : 'a developing relationship'}"
- "The relationship trend is ${editedCharacter.analytics.trend}, meaning ${editedCharacter.analytics.trend === 'deepening' ? 'your connection is growing stronger over time' : editedCharacter.analytics.trend === 'weakening' ? 'your connection may be fading' : 'your relationship is stable'}"
- "With ${editedCharacter.analytics.shared_experiences} shared experiences, this relationship has ${editedCharacter.analytics.shared_experiences >= 10 ? 'significant depth' : editedCharacter.analytics.shared_experiences >= 5 ? 'moderate depth' : 'developing depth'}"
` : '';

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
${analyticsContext}
INSTRUCTIONS:
1. Answer questions about this character based on the context above
2. If the user asks about analytics, explain what the scores mean and why they might be at that level
3. If the user shares new information or stories about the character, acknowledge it and offer to update the character profile
4. If the user asks to update something (role, summary, tags, etc.), extract the update and respond naturally
5. Be conversational and helpful
6. When updates are needed, format them as JSON in your response like: {"updates": {"summary": "new summary", "tags": ["tag1", "tag2"]}}
7. Use analytics to provide insights based on the scores provided above

User's message: ${message}`;

      const conversationHistory = [
        ...chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const response = await fetchJson<{ answer: string; metadata?: any }>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          conversationHistory,
          entityContext: {
            type: 'CHARACTER',
            id: character.id
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
          firstName: editedCharacter.first_name,
          lastName: editedCharacter.last_name,
          alias: editedCharacter.alias,
          pronouns: editedCharacter.pronouns,
          archetype: editedCharacter.archetype,
          role: editedCharacter.role,
          status: editedCharacter.status,
          summary: editedCharacter.summary,
          tags: editedCharacter.tags,
          isNickname: editedCharacter.is_nickname,
          proximity: editedCharacter.proximity_level,
          hasMet: editedCharacter.has_met,
          relationshipDepth: editedCharacter.relationship_depth,
          likelihoodToMeet: editedCharacter.likelihood_to_meet,
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
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-3xl font-bold text-white tracking-tight">
                    {editedCharacter.first_name && editedCharacter.last_name
                      ? `${editedCharacter.first_name} ${editedCharacter.last_name}`
                      : editedCharacter.name}
                  </h2>
                  {editedCharacter.is_nickname && (
                    <Badge 
                      variant="outline" 
                      className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs px-2 py-0.5"
                      title="Generated nickname"
                    >
                      Nickname
                    </Badge>
                  )}
                </div>
                {editedCharacter.first_name && editedCharacter.last_name && editedCharacter.name !== `${editedCharacter.first_name} ${editedCharacter.last_name}` && (
                  <p className="text-sm text-white/60 mb-1">
                    Display name: {editedCharacter.name}
                  </p>
                )}
                {editedCharacter.alias && editedCharacter.alias.length > 0 && (
                  <p className="text-base text-white/70 mb-2">
                    <span className="text-white/50">Also known as:</span> {editedCharacter.alias.join(', ')}
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {editedCharacter.importance_level && (
                    <Badge 
                      variant="outline" 
                      className={`${getImportanceColor(editedCharacter.importance_level)} text-sm px-3 py-1 flex items-center gap-1.5`}
                    >
                      {getImportanceIcon(editedCharacter.importance_level)}
                      <span>{getImportanceLabel(editedCharacter.importance_level)}</span>
                      {editedCharacter.importance_score !== null && editedCharacter.importance_score !== undefined && (
                        <span className="text-xs opacity-70">({Math.round(editedCharacter.importance_score)})</span>
                      )}
                    </Badge>
                  )}
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

                {/* Name Section */}
                <div className="space-y-4 p-4 bg-black/40 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold text-white">Name Information</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">First Name</label>
                      <Input
                        value={editedCharacter.first_name || ''}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, first_name: e.target.value || null }))}
                        placeholder="First name"
                        className="bg-black/60 border-border/50 text-white text-sm h-10"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Last Name</label>
                      <Input
                        value={editedCharacter.last_name || ''}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, last_name: e.target.value || null }))}
                        placeholder="Last name"
                        className="bg-black/60 border-border/50 text-white text-sm h-10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white/90 mb-2 block flex items-center gap-2">
                      Display Name
                      {editedCharacter.is_nickname && (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs px-1.5 py-0">
                          Nickname
                        </Badge>
                      )}
                    </label>
                    <Input
                      value={editedCharacter.name}
                      onChange={(e) => setEditedCharacter((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Full display name"
                      className="bg-black/60 border-border/50 text-white text-sm h-10"
                    />
                    <p className="text-xs text-white/50 mt-1">
                      {editedCharacter.first_name && editedCharacter.last_name
                        ? `Will display as: ${editedCharacter.first_name} ${editedCharacter.last_name}`
                        : 'This is the name shown throughout the app'}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-white/90 mb-2 block">Aliases / Nicknames</label>
                    <Input
                      value={editedCharacter.alias?.join(', ') || ''}
                      onChange={(e) =>
                        setEditedCharacter((prev) => ({
                          ...prev,
                          alias: e.target.value.split(',').map((a) => a.trim()).filter(Boolean)
                        }))
                      }
                      placeholder="Alias1, Alias2, ..."
                      className="bg-black/60 border-border/50 text-white text-sm h-10"
                    />
                    <p className="text-xs text-white/50 mt-1">Alternative names or nicknames (comma-separated)</p>
                  </div>
                </div>

                {/* Importance Section */}
                {(editedCharacter.importance_level || editedCharacter.importance_score !== null) && (
                  <div className="space-y-4 p-4 bg-black/40 rounded-lg border border-border/30">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <h3 className="text-base font-semibold text-white">Importance Level</h3>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {editedCharacter.importance_level && (
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={`${getImportanceColor(editedCharacter.importance_level)} text-sm px-3 py-1.5 flex items-center gap-1.5`}
                          >
                            {getImportanceIcon(editedCharacter.importance_level)}
                            <span>{getImportanceLabel(editedCharacter.importance_level)}</span>
                          </Badge>
                        </div>
                      )}
                      {editedCharacter.importance_score !== null && editedCharacter.importance_score !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/70">Score:</span>
                          <span className="text-sm font-semibold text-primary">{Math.round(editedCharacter.importance_score)}/100</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-white/50 flex items-start gap-1.5">
                      <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>Importance is automatically calculated based on mentions, relationships, role significance, and interaction frequency. This helps identify major vs. minor characters in your story.</span>
                    </p>
                  </div>
                )}

                {/* Relationship Proximity Section */}
                <div className="space-y-4 p-4 bg-black/40 rounded-lg border border-border/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Network className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold text-white">Relationship & Proximity</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Proximity Level</label>
                      <select
                        value={editedCharacter.proximity_level || 'direct'}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, proximity_level: e.target.value as any }))}
                        className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
                      >
                        <option value="direct">Direct (Know them directly)</option>
                        <option value="indirect">Indirect (Through someone else)</option>
                        <option value="distant">Distant (Barely know them)</option>
                        <option value="unmet">Unmet (Never met)</option>
                        <option value="third_party">Third Party (Mentioned by others)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Relationship Depth</label>
                      <select
                        value={editedCharacter.relationship_depth || 'moderate'}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, relationship_depth: e.target.value as any }))}
                        className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
                      >
                        <option value="close">Close</option>
                        <option value="moderate">Moderate</option>
                        <option value="casual">Casual</option>
                        <option value="acquaintance">Acquaintance</option>
                        <option value="mentioned_only">Mentioned Only</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="hasMet"
                        checked={editedCharacter.has_met ?? true}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, has_met: e.target.checked }))}
                        className="w-4 h-4 rounded border-border/50 bg-black/60 text-primary focus:ring-primary"
                      />
                      <label htmlFor="hasMet" className="text-sm text-white/90 cursor-pointer">
                        Have met in person
                      </label>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Likelihood to Meet</label>
                      <select
                        value={editedCharacter.likelihood_to_meet || 'likely'}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, likelihood_to_meet: e.target.value as any }))}
                        className="w-full bg-black/60 border-border/50 text-white text-sm h-10 rounded px-3"
                      >
                        <option value="likely">Likely</option>
                        <option value="possible">Possible</option>
                        <option value="unlikely">Unlikely</option>
                        <option value="never">Never</option>
                      </select>
                    </div>
                  </div>

                  {editedCharacter.context_of_mention && (
                    <div>
                      <label className="text-sm font-semibold text-white/90 mb-2 block">Context of Mention</label>
                      <Textarea
                        value={editedCharacter.context_of_mention || ''}
                        onChange={(e) => setEditedCharacter((prev) => ({ ...prev, context_of_mention: e.target.value }))}
                        placeholder="How/why this person was mentioned..."
                        rows={2}
                        className="bg-black/60 border-border/50 text-white text-sm"
                      />
                    </div>
                  )}

                  <p className="text-xs text-white/50 flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>Proximity tracks how directly you know this person. Use "Third Party" for people mentioned by others that you don't know personally.</span>
                  </p>
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

                {/* Associated Characters (for indirect/third-party characters) */}
                {(editedCharacter.proximity_level === 'indirect' || editedCharacter.proximity_level === 'third_party' || editedCharacter.associated_with_character_ids) && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-primary" />
                      Associated With
                    </h3>
                    <Card className="bg-black/40 border-border/50">
                      <CardContent className="p-4">
                        {editedCharacter.associated_with_character_ids && editedCharacter.associated_with_character_ids.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm text-white/70 mb-3">
                              This person is connected to or mentioned by:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {editedCharacter.associated_with_character_ids.map((charId) => {
                                // Try to find character name from relationships or metadata
                                const associatedChar = editedCharacter.relationships?.find(r => r.character_id === charId);
                                return (
                                  <Badge
                                    key={charId}
                                    variant="outline"
                                    className="bg-blue-500/10 text-blue-400 border-blue-500/30 px-3 py-1.5"
                                  >
                                    {associatedChar?.character_name || `Character ${charId.slice(0, 8)}...`}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-white/40">
                            <Link2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No associated characters</p>
                            <p className="text-xs mt-1">This person is not linked to any other characters</p>
                          </div>
                        )}
                        {editedCharacter.context_of_mention && (
                          <div className="mt-4 pt-4 border-t border-border/30">
                            <p className="text-xs text-white/50 mb-1">Context:</p>
                            <p className="text-sm text-white/70">{editedCharacter.context_of_mention}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {!loadingDetails && activeTab === 'perceptions' && (
              <div className="space-y-6">
                <PerceptionsView
                  personId={editedCharacter.id}
                  personName={editedCharacter.name}
                  showCreateButton={true}
                />
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

            {/* Insights Tab - Analytics Dashboard */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-8">
                {editedCharacter.analytics ? (
                  <>
                    {/* Analytics Dashboard Header */}
                    <Card className="bg-gradient-to-br from-purple-500/10 via-purple-600/10 to-purple-500/10 border-purple-500/30">
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-purple-400" />
                          Relationship Analytics & Insights
                        </h3>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Closeness</div>
                            <div className="text-2xl font-bold text-pink-400">{editedCharacter.analytics.closeness_score}%</div>
                            <div className="text-xs text-white/50 mt-1">relationship depth</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Importance</div>
                            <div className="text-2xl font-bold text-amber-400">{editedCharacter.analytics.importance_score}%</div>
                            <div className="text-xs text-white/50 mt-1">to you</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Priority</div>
                            <div className="text-2xl font-bold text-green-400">{editedCharacter.analytics.priority_score}%</div>
                            <div className="text-xs text-white/50 mt-1">urgency level</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Engagement</div>
                            <div className="text-2xl font-bold text-blue-400">{editedCharacter.analytics.engagement_score}%</div>
                            <div className="text-xs text-white/50 mt-1">interaction level</div>
                          </div>
                        </div>

                        {/* Relationship Depth & Frequency */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Relationship Depth</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
                                  style={{ width: `${editedCharacter.analytics.relationship_depth}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{editedCharacter.analytics.relationship_depth}%</span>
                            </div>
                            <div className="text-xs text-white/50 mt-2">{editedCharacter.analytics.shared_experiences} shared experiences</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Interaction Frequency</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                                  style={{ width: `${editedCharacter.analytics.interaction_frequency}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{editedCharacter.analytics.interaction_frequency}%</span>
                            </div>
                            <div className="text-xs text-white/50 mt-2">Based on last 90 days</div>
                          </div>
                        </div>

                        {/* Influence Metrics */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Their Influence on You</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
                                  style={{ width: `${editedCharacter.analytics.character_influence_on_user}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{editedCharacter.analytics.character_influence_on_user}%</span>
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                            <div className="text-sm text-white/70 mb-2">Your Influence Over Them</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                                  style={{ width: `${editedCharacter.analytics.user_influence_over_character}%` }}
                                />
                              </div>
                              <span className="text-sm font-semibold text-white">{editedCharacter.analytics.user_influence_over_character}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Social Metrics */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Sentiment</div>
                            <div className={`text-lg font-semibold ${editedCharacter.analytics.sentiment_score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {editedCharacter.analytics.sentiment_score > 0 ? '+' : ''}{editedCharacter.analytics.sentiment_score}
                            </div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Trust</div>
                            <div className="text-lg font-semibold text-blue-400">{editedCharacter.analytics.trust_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Support</div>
                            <div className="text-lg font-semibold text-green-400">{editedCharacter.analytics.support_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Conflict</div>
                            <div className="text-lg font-semibold text-red-400">{editedCharacter.analytics.conflict_score}%</div>
                          </div>
                        </div>

                        {/* Additional Metrics */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Value</div>
                            <div className="text-lg font-semibold text-yellow-400">{editedCharacter.analytics.value_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Relevance</div>
                            <div className="text-lg font-semibold text-cyan-400">{editedCharacter.analytics.relevance_score}%</div>
                          </div>
                          <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                            <div className="text-xs text-white/60 mb-1">Activity</div>
                            <div className="text-lg font-semibold text-purple-400">{editedCharacter.analytics.activity_level}%</div>
                          </div>
                        </div>

                        {/* Trend */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-white/70">Relationship Trend:</span>
                          {editedCharacter.analytics.trend === 'deepening' && (
                            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              Deepening
                            </Badge>
                          )}
                          {editedCharacter.analytics.trend === 'weakening' && (
                            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                              <TrendingDown className="h-3 w-3 mr-1" />
                              Weakening
                            </Badge>
                          )}
                          {editedCharacter.analytics.trend === 'stable' && (
                            <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                              <Minus className="h-3 w-3 mr-1" />
                              Stable
                            </Badge>
                          )}
                          <span className="text-white/50 text-xs ml-2">
                            Known for {editedCharacter.analytics.relationship_duration_days} days
                          </span>
                        </div>

                        {/* SWOT Analysis */}
                        {(editedCharacter.analytics.strengths?.length > 0 || 
                          editedCharacter.analytics.weaknesses?.length > 0 || 
                          editedCharacter.analytics.opportunities?.length > 0 || 
                          editedCharacter.analytics.risks?.length > 0) && (
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            {editedCharacter.analytics.strengths && editedCharacter.analytics.strengths.length > 0 && (
                              <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
                                <div className="text-sm font-semibold text-green-400 mb-2">Strengths</div>
                                <ul className="space-y-1">
                                  {editedCharacter.analytics.strengths.map((strength, i) => (
                                    <li key={i} className="text-xs text-white/70">• {strength}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {editedCharacter.analytics.weaknesses && editedCharacter.analytics.weaknesses.length > 0 && (
                              <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                                <div className="text-sm font-semibold text-red-400 mb-2">Weaknesses</div>
                                <ul className="space-y-1">
                                  {editedCharacter.analytics.weaknesses.map((weakness, i) => (
                                    <li key={i} className="text-xs text-white/70">• {weakness}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {editedCharacter.analytics.opportunities && editedCharacter.analytics.opportunities.length > 0 && (
                              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                                <div className="text-sm font-semibold text-blue-400 mb-2">Opportunities</div>
                                <ul className="space-y-1">
                                  {editedCharacter.analytics.opportunities.map((opp, i) => (
                                    <li key={i} className="text-xs text-white/70">• {opp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {editedCharacter.analytics.risks && editedCharacter.analytics.risks.length > 0 && (
                              <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
                                <div className="text-sm font-semibold text-orange-400 mb-2">Risks</div>
                                <ul className="space-y-1">
                                  {editedCharacter.analytics.risks.map((risk, i) => (
                                    <li key={i} className="text-xs text-white/70">• {risk}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="text-center py-16 text-white/60">
                    <Brain className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">Analytics not available</p>
                    <p className="text-sm mt-2">Analytics will appear here once calculated</p>
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

