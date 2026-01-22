// =====================================================
// SKILL DETAIL MODAL
// Purpose: Comprehensive skill profile with chatbot editing
// Features: Info, Chat, Progress, Timeline
// =====================================================

import { useState, useEffect, useRef } from 'react';
import { X, Save, Zap, TrendingUp, Calendar, MessageSquare, Clock, FileText, Award, Star, Sparkles, TrendingDown, Plus, Edit2, Trash2, Users, Building2, MapPin, Image as ImageIcon, ChevronRight, Loader2, UserCircle, Target, MapPin as MapPinIcon, Trophy, GitBranch, BookOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Modal } from '../ui/modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { skillsApi } from '../../api/skills';
import { achievementsApi } from '../../api/achievements';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { fetchJson } from '../../lib/api';
import { LazyImage } from '../ui/LazyImage';
import { useNavigate } from 'react-router-dom';
import type { Skill, SkillProgress, SkillCategory, SkillMetadata } from '../../types/skill';
import type { Achievement } from '../../types/achievement';

type SkillDetailModalProps = {
  skill: Skill;
  onClose: () => void;
  onUpdate?: () => void;
};

type TabKey = 'info' | 'chat' | 'connections' | 'milestones' | 'locations' | 'photos' | 'timeline';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type RelatedCharacter = {
  id: string;
  name: string;
  avatar_url?: string;
  role?: string;
  relationship?: string;
};

type RelatedOrganization = {
  id: string;
  name: string;
  type?: string;
  member_count?: number;
};

type RelatedLocation = {
  id: string;
  name: string;
  visit_count?: number;
  last_visited?: string;
};

type RelatedPhoto = {
  id: string;
  photoUrl: string;
  thumbnailUrl?: string;
  date: string;
  summary?: string;
  locationName?: string;
  people?: string[];
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'connections', label: 'Connections', icon: Users },
  { key: 'milestones', label: 'Milestones', icon: Trophy },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'photos', label: 'Photos', icon: ImageIcon },
  { key: 'timeline', label: 'Timeline', icon: Clock },
];

const CATEGORY_COLORS: Record<string, string> = {
  professional: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  creative: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  physical: 'bg-green-500/20 text-green-400 border-green-500/40',
  social: 'bg-pink-500/20 text-pink-400 border-pink-500/40',
  intellectual: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  emotional: 'bg-red-500/20 text-red-400 border-red-500/40',
  practical: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  artistic: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
  technical: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  other: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

export const SkillDetailModal = ({ skill: initialSkill, onClose, onUpdate }: SkillDetailModalProps) => {
  const [skill, setSkill] = useState<Skill>(initialSkill);
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skillDetails, setSkillDetails] = useState<SkillMetadata | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { streamChat, isStreaming, cancel } = useChatStream();

  // Progress state
  const [progressHistory, setProgressHistory] = useState<SkillProgress[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);

  // Connections state
  const [relatedCharacters, setRelatedCharacters] = useState<RelatedCharacter[]>([]);
  const [relatedOrganizations, setRelatedOrganizations] = useState<RelatedOrganization[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  
  // Milestones state (achievements)
  const [milestones, setMilestones] = useState<Achievement[]>([]);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  
  // Timeline events state
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  
  // Photos state
  const [skillPhotos, setSkillPhotos] = useState<RelatedPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<RelatedPhoto | null>(null);
  
  const { openCharacter, openLocation } = useEntityModal();
  const navigate = useNavigate();

  useEffect(() => {
    if (activeTab === 'chat' && chatMessages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm here to help you manage **${skill.skill_name}**. I can help you:\n\n- Update skill information\n- Track your progress and XP\n- Answer questions about the skill\n- Suggest ways to improve\n- Review your practice history\n\nWhat would you like to do?`,
        timestamp: new Date()
      };
      setChatMessages([welcomeMessage]);
    }
  }, [activeTab, skill.skill_name]);

  useEffect(() => {
    // Load skill details when modal opens
    void loadSkillDetails();
  }, [skill.id]);

  useEffect(() => {
    if (activeTab === 'connections') {
      void loadConnections();
    } else if (activeTab === 'milestones') {
      void loadMilestones();
    } else if (activeTab === 'locations') {
      // Locations are already in skillDetails
    } else if (activeTab === 'photos') {
      void loadPhotos();
    } else if (activeTab === 'timeline') {
      void loadTimelineEvents();
    }
  }, [activeTab, skill.id]);

  const loadSkillDetails = async () => {
    setLoadingDetails(true);
    try {
      const enrichedSkill = await skillsApi.getSkillDetails(skill.id);
      setSkill(enrichedSkill);
      setSkillDetails(enrichedSkill.metadata?.skill_details || null);
    } catch (error) {
      console.error('Failed to load skill details:', error);
      // Fallback to basic skill if details fail
      setSkillDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingMessageId]);

  const loadProgressHistory = async () => {
    setLoadingProgress(true);
    try {
      const progress = await skillsApi.getSkillProgress(skill.id, 50);
      setProgressHistory(progress);
    } catch (error) {
      console.error('Failed to load progress history:', error);
      // Generate mock progress history
      const mockProgress: SkillProgress[] = [];
      const now = new Date();
      for (let i = 0; i < 15; i++) {
        const daysAgo = i * 3 + Math.floor(Math.random() * 5);
        const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        const xpGained = Math.floor(Math.random() * 500) + 50;
        const levelBefore = Math.max(1, skill.current_level - Math.floor(i / 3));
        const levelAfter = levelBefore + (i % 3 === 0 && i > 0 ? 1 : 0);
        
        const sources = ['memory', 'achievement', 'manual', 'practice'];
        const sourceType = sources[Math.floor(Math.random() * sources.length)] as 'memory' | 'achievement' | 'manual' | 'practice';
        
        const notes = [
          'Completed coding challenge',
          'Built a new project',
          'Attended workshop',
          'Practiced daily exercises',
          'Solved complex problem',
          'Reviewed documentation',
          'Pair programming session',
          'Code review feedback',
          'Online course completion',
          'Personal project milestone'
        ];
        
        mockProgress.push({
          id: `mock-progress-${i}`,
          skill_id: skill.id,
          user_id: '',
          xp_gained: xpGained,
          level_before: levelBefore,
          level_after: levelAfter,
          source_type: sourceType,
          source_id: `source-${i}`,
          notes: notes[Math.floor(Math.random() * notes.length)],
          timestamp: date.toISOString(),
          created_at: date.toISOString()
        });
      }
      setProgressHistory(mockProgress.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } finally {
      setLoadingProgress(false);
    }
  };

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      // Use skillDetails for connections
      if (skillDetails) {
        // Learned from characters
        const learnedFrom = (skillDetails.learned_from || []).map(teacher => ({
          id: teacher.character_id,
          name: teacher.character_name,
          role: teacher.relationship_type,
          relationship: 'Teacher/Mentor'
        }));
        
        // Practiced with characters
        const practicedWith = (skillDetails.practiced_with || []).map(partner => ({
          id: partner.character_id,
          name: partner.character_name,
          role: 'Practice Partner',
          relationship: `${partner.practice_count} sessions`
        }));
        
        setRelatedCharacters([...learnedFrom, ...practicedWith]);
      } else {
        // Fallback: try to fetch from API
        try {
          const characters = await fetchJson<{ characters: Array<{ id: string; name: string; avatar_url?: string; role?: string }> }>(
            '/api/characters'
          ).catch(() => ({ characters: [] }));
          
          const related = (characters.characters || []).slice(0, 5).map(char => ({
            id: char.id,
            name: char.name,
            avatar_url: char.avatar_url,
            role: char.role,
            relationship: 'Related'
          }));
          setRelatedCharacters(related);
        } catch (error) {
          console.error('Failed to load connections:', error);
          setRelatedCharacters([]);
        }
      }

      // Fetch organizations
      try {
        const orgs = await fetchJson<{ entities: Array<{ entity_id: string; primary_name: string; entity_type: string }> }>(
          '/api/entity-resolution/entities?include_secondary=false'
        ).catch(() => ({ entities: [] }));
        
        const relatedOrgs = (orgs.entities || [])
          .filter(e => e.entity_type === 'ORG')
          .slice(0, 5)
          .map(org => ({
            id: org.entity_id,
            name: org.primary_name,
            type: 'organization',
            member_count: undefined
          }));
        setRelatedOrganizations(relatedOrgs);
      } catch (error) {
        console.error('Failed to load organizations:', error);
        setRelatedOrganizations([]);
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const loadMilestones = async () => {
    setLoadingMilestones(true);
    try {
      // Fetch achievements that relate to this skill
      const allAchievements = await achievementsApi.getAchievements();
      
      // Filter achievements that mention this skill or have skill_xp_rewards for this skill
      const skillMilestones = allAchievements.filter(achievement => {
        // Check if achievement has XP rewards for this skill
        if (achievement.skill_xp_rewards && achievement.skill_xp_rewards[skill.id]) {
          return true;
        }
        // Check if achievement name or description mentions the skill
        const skillNameLower = skill.skill_name.toLowerCase();
        const achievementNameLower = achievement.achievement_name.toLowerCase();
        const descriptionLower = (achievement.description || '').toLowerCase();
        return achievementNameLower.includes(skillNameLower) || descriptionLower.includes(skillNameLower);
      });
      
      setMilestones(skillMilestones.sort((a, b) => 
        new Date(b.unlocked_at).getTime() - new Date(a.unlocked_at).getTime()
      ));
    } catch (error) {
      console.error('Failed to load milestones:', error);
      setMilestones([]);
    } finally {
      setLoadingMilestones(false);
    }
  };

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      // Fetch photos related to this skill
      const skillName = skill.skill_name.toLowerCase();
      
      // Try to fetch photos from API
      try {
        const photos = await fetchJson<{ photos: Array<{
          id: string;
          photo_url: string;
          thumbnail_url?: string;
          created_at: string;
          summary?: string;
          location_name?: string;
          people?: string[];
        }> }>(`/api/photos?skill=${encodeURIComponent(skill.id)}`)
          .catch(() => ({ photos: [] }));
        
        const relatedPics = (photos.photos || []).map(photo => ({
          id: photo.id,
          photoUrl: photo.photo_url,
          thumbnailUrl: photo.thumbnail_url || photo.photo_url,
          date: photo.created_at,
          summary: photo.summary,
          locationName: photo.location_name,
          people: photo.people
        }));
        
        setSkillPhotos(relatedPics);
      } catch (error) {
        console.error('Failed to load photos:', error);
        // Fallback: try to get photos from journal entries
        try {
          const entries = await fetchJson<{ entries: Array<{
            id: string;
            created_at: string;
            content?: string;
            metadata?: { photo_url?: string; location_name?: string; people?: string[] };
          }> }>(`/api/journal-entries?search=${encodeURIComponent(skillName)}&limit=50`)
            .catch(() => ({ entries: [] }));
          
          const photosFromEntries = (entries.entries || [])
            .filter(entry => entry.metadata?.photo_url)
            .map(entry => ({
              id: entry.id,
              photoUrl: entry.metadata?.photo_url || '',
              thumbnailUrl: entry.metadata?.photo_url,
              date: entry.created_at,
              summary: entry.content?.substring(0, 100),
              locationName: entry.metadata?.location_name,
              people: entry.metadata?.people
            }));
          
          setSkillPhotos(photosFromEntries);
        } catch (err) {
          console.error('Failed to load photos from entries:', err);
          setSkillPhotos([]);
        }
      }
    } catch (error) {
      console.error('Failed to load photos:', error);
      setSkillPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const loadTimelineEvents = async () => {
    setLoadingTimeline(true);
    try {
      // Fetch journal entries that mention this skill
      const skillName = skill.skill_name.toLowerCase();
      const entries = await fetchJson<{ entries: Array<{
        id: string;
        content: string;
        created_at: string;
        memory_type?: string;
      }> }>(`/api/journal-entries?search=${encodeURIComponent(skillName)}&limit=50`)
        .catch(() => ({ entries: [] }));
      
      // Also include skill milestones/achievements
      const skillMilestones = await achievementsApi.getAchievements();
      const relatedMilestones = skillMilestones
        .filter(a => {
          if (a.skill_xp_rewards && a.skill_xp_rewards[skill.id]) return true;
          const name = a.achievement_name.toLowerCase();
          return name.includes(skillName);
        })
        .map(a => ({
          id: a.id,
          type: 'achievement',
          title: a.achievement_name,
          description: a.description || '',
          date: a.unlocked_at,
          metadata: a
        }));
      
      // Combine entries and milestones
      const events = [
        ...(entries.entries || []).map(e => ({
          id: e.id,
          type: 'journal_entry',
          title: e.content.substring(0, 100) + (e.content.length > 100 ? '...' : ''),
          description: e.content,
          date: e.created_at,
          metadata: e
        })),
        ...relatedMilestones
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setTimelineEvents(events);
    } catch (error) {
      console.error('Failed to load timeline events:', error);
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    setStreamingMessageId(assistantMessageId);

    try {
      // Create context about the skill for the chat
      const detailsContext = skillDetails ? `
Years Practiced: ${skillDetails.years_practiced || 'N/A'}
${skillDetails.learned_when ? `Learned When: ${format(parseISO(skillDetails.learned_when.date), 'MMMM d, yyyy')}` : ''}
${skillDetails.why_started ? `Why Started: ${skillDetails.why_started.reason}` : ''}
${skillDetails.learned_from && skillDetails.learned_from.length > 0 ? `Learned From: ${skillDetails.learned_from.map(t => `${t.character_name} (${t.relationship_type})`).join(', ')}` : ''}
${skillDetails.practiced_with && skillDetails.practiced_with.length > 0 ? `Practiced With: ${skillDetails.practiced_with.map(p => `${p.character_name} (${p.practice_count} sessions)`).join(', ')}` : ''}
${skillDetails.learned_at && skillDetails.learned_at.length > 0 ? `Learned At: ${skillDetails.learned_at.map(l => l.location_name).join(', ')}` : ''}
${skillDetails.practiced_at && skillDetails.practiced_at.length > 0 ? `Practiced At: ${skillDetails.practiced_at.map(l => `${l.location_name} (${l.practice_count} sessions)`).join(', ')}` : ''}
${skillDetails.arcs && skillDetails.arcs.length > 0 ? `Related Arcs: ${skillDetails.arcs.map(a => a.arc_title).join(', ')}` : ''}
${skillDetails.sagas && skillDetails.sagas.length > 0 ? `Related Sagas: ${skillDetails.sagas.map(s => s.saga_title).join(', ')}` : ''}
${skillDetails.eras && skillDetails.eras.length > 0 ? `Related Eras: ${skillDetails.eras.map(e => e.era_title).join(', ')}` : ''}
      `.trim() : '';

      const skillContext = `
Skill: ${skill.skill_name}
Category: ${skill.skill_category}
Level: ${skill.current_level}
Total XP: ${skill.total_xp}
XP to Next Level: ${skill.xp_to_next_level}
Practice Count: ${skill.practice_count}
Description: ${skill.description || 'No description'}
First Mentioned: ${format(parseISO(skill.first_mentioned_at), 'MMMM d, yyyy')}
Last Practiced: ${skill.last_practiced_at ? format(parseISO(skill.last_practiced_at), 'MMMM d, yyyy') : 'Never'}
Auto-detected: ${skill.auto_detected ? 'Yes' : 'No'}
Confidence: ${Math.round(skill.confidence_score * 100)}%
Active: ${skill.is_active ? 'Yes' : 'No'}
${detailsContext ? `\n\nAdditional Details:\n${detailsContext}` : ''}
      `.trim();

      await streamChat({
        messages: [
          {
            role: 'system',
            content: `You are helping the user manage their skill "${skill.skill_name}". You can help them:
- Update skill information
- Track progress and XP
- Answer questions about the skill details (who they learned from, where they practiced, timeline context, etc.)
- Update skill details (e.g., "I learned this from [name]", "I started learning because [reason]")
- Suggest ways to improve
- Review practice history

Current skill details:
${skillContext}

When the user provides information about who they learned from, where they practiced, why they started, or other details, acknowledge it and note that the information will be saved. Be helpful and encouraging.`
          },
          ...chatMessages.map(m => ({
            role: m.role,
            content: m.content
          })),
          {
            role: 'user',
            content: `Context:\n${skillContext}\n\nUser question: ${userMessage.content}`
          }
        ],
        onChunk: (chunk) => {
          setChatMessages(prev => {
            const existing = prev.find(m => m.id === assistantMessageId);
            if (existing) {
              return prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + chunk }
                  : m
              );
            } else {
              return [...prev, {
                id: assistantMessageId,
                role: 'assistant' as const,
                content: chunk,
                timestamp: new Date()
              }];
            }
          });
        },
        onComplete: async () => {
          setStreamingMessageId(null);
          setChatLoading(false);
          
          // Try to extract updates from the last user message and assistant response
          try {
            const lastUserMessage = chatMessages[chatMessages.length - 1];
            const lastAssistantMessage = chatMessages.find(m => m.id === assistantMessageId);
            if (lastUserMessage && lastAssistantMessage) {
              const conversation = `${lastUserMessage.content} ${lastAssistantMessage.content}`;
              await extractAndUpdateDetails(conversation);
            }
          } catch (error) {
            console.error('Failed to extract updates:', error);
          }
        },
        onError: (error) => {
          console.error('Chat error:', error);
          setChatMessages(prev => [...prev, {
            id: assistantMessageId,
            role: 'assistant',
            content: 'Sorry, I encountered an error. Please try again.',
            timestamp: new Date()
          }]);
          setStreamingMessageId(null);
          setChatLoading(false);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setChatLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await skillsApi.updateSkill(skill.id, {
        skill_name: skill.skill_name,
        skill_category: skill.skill_category,
        description: skill.description || undefined,
        is_active: skill.is_active
      });
      setSkill(updated);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save skill:', error);
    } finally {
      setSaving(false);
    }
  };

  const categoryColor = CATEGORY_COLORS[skill.skill_category] || CATEGORY_COLORS.other;

  // Extract and update skill details from chat
  const extractAndUpdateDetails = async (conversation: string) => {
    // Simple pattern matching for common updates
    // In a production system, you'd use NLP/AI to extract this more intelligently
    const updates: Partial<SkillMetadata> = {};
    let hasUpdates = false;

    // Check for "why started" updates
    const whyStartedMatch = conversation.match(/I started learning (?:because|since|to|for) (.+?)(?:\.|$)/i);
    if (whyStartedMatch && skillDetails) {
      updates.why_started = {
        reason: whyStartedMatch[1],
        entry_id: skillDetails.why_started?.entry_id || '',
        extracted_at: new Date().toISOString()
      };
      hasUpdates = true;
    }

    // Check for "learned from" updates
    const learnedFromMatch = conversation.match(/I learned (?:this|it) from (.+?)(?:\.|$)/i);
    if (learnedFromMatch) {
      // This would need character lookup - for now, just note it
      // In production, you'd search for the character and add to learned_from array
      console.log('User mentioned learning from:', learnedFromMatch[1]);
    }

    if (hasUpdates) {
      try {
        const updatedSkill = await skillsApi.updateSkillDetails(skill.id, updates);
        setSkill(updatedSkill);
        setSkillDetails(updatedSkill.metadata?.skill_details || null);
        onUpdate?.();
      } catch (error) {
        console.error('Failed to update skill details:', error);
      }
    }
  };

  // Calculate level progress
  const currentLevelXP = 100 * Math.pow(1.5, skill.current_level - 1);
  const nextLevelXP = 100 * Math.pow(1.5, skill.current_level);
  const xpInCurrentLevel = skill.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  return (
    <Modal isOpen={true} onClose={onClose} title={skill.skill_name} maxWidth="2xl">
      <div className="flex flex-col h-full max-h-[90vh] sm:max-h-[90vh]">
        {/* Skill Info Header */}
        <div className="flex items-center gap-2 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-white/10 px-3 sm:px-6 pt-2 sm:pt-4 flex-wrap">
          <Badge className={`text-[10px] sm:text-xs ${categoryColor} capitalize`}>
            {skill.skill_category}
          </Badge>
          <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/50 text-primary">
            Level {skill.current_level}
          </Badge>
          {skill.auto_detected && (
            <Badge variant="outline" className="text-[10px] sm:text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">
              Auto-detected
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto overflow-y-hidden -mx-3 sm:mx-6 px-3 sm:px-0 mt-2 sm:mt-4 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="inline-flex min-w-max sm:flex w-max sm:w-auto flex-nowrap">
            {tabs.map(tab => (
                <TabsTrigger key={tab.key} value={tab.key} className="flex-shrink-0 text-[10px] sm:text-sm whitespace-nowrap px-2 sm:px-3 py-1.5 sm:py-1.5">
                  <tab.icon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 flex-shrink-0" />
                  <span className="hidden min-[375px]:inline">{tab.label}</span>
                  <span className="min-[375px]:hidden">{tab.label.substring(0, 3)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          </div>

          {/* Tab Content - with bottom padding for sticky chat */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 sm:pb-24 overflow-x-hidden">
            <TabsContent value="info" className="mt-0 space-y-3 sm:space-y-4">
              {/* Who, What, When, Where, Why - Creative 5W Layout */}
              {skillDetails && (
                <Card className="bg-gradient-to-br from-primary/20 via-primary/10 to-black/60 border-2 border-primary/40 shadow-2xl">
                  <CardHeader className="pb-3 sm:pb-4">
                    <CardTitle className="text-lg sm:text-2xl font-bold text-white text-center">The Story of {skill.skill_name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {/* WHO */}
                      <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <UserCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                          <h3 className="text-xs sm:text-sm font-bold text-blue-400 uppercase tracking-wider">WHO</h3>
                        </div>
                        <div className="space-y-2">
                          {skillDetails.learned_from && skillDetails.learned_from.length > 0 ? (
                            <div>
                              <div className="text-[10px] sm:text-xs text-white/60 mb-1">Learned From:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {skillDetails.learned_from.slice(0, 3).map((teacher, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => openCharacter({ id: teacher.character_id, name: teacher.character_name })}
                                    className="text-xs sm:text-sm text-blue-300 hover:text-blue-200 underline"
                                  >
                                    {teacher.character_name}
                                  </button>
                                ))}
                                {skillDetails.learned_from.length > 3 && (
                                  <span className="text-xs text-white/50">+{skillDetails.learned_from.length - 3} more</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs sm:text-sm text-white/50">Self-taught</div>
                          )}
                          {skillDetails.practiced_with && skillDetails.practiced_with.length > 0 && (
                            <div>
                              <div className="text-[10px] sm:text-xs text-white/60 mb-1">Practiced With:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {skillDetails.practiced_with.slice(0, 2).map((partner, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => openCharacter({ id: partner.character_id, name: partner.character_name })}
                                    className="text-xs sm:text-sm text-blue-300 hover:text-blue-200 underline"
                                  >
                                    {partner.character_name}
                                  </button>
                                ))}
                                {skillDetails.practiced_with.length > 2 && (
                                  <span className="text-xs text-white/50">+{skillDetails.practiced_with.length - 2} more</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* WHAT */}
                      <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400" />
                          <h3 className="text-xs sm:text-sm font-bold text-purple-400 uppercase tracking-wider">WHAT</h3>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-[10px] sm:text-xs text-white/60 mb-1">Skill:</div>
                            <div className="text-sm sm:text-base font-semibold text-white">{skill.skill_name}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] sm:text-xs ${categoryColor} capitalize`}>
                              {skill.skill_category}
                            </Badge>
                            {skillDetails.years_practiced !== undefined && (
                              <Badge className="text-[10px] sm:text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/40">
                                {skillDetails.years_practiced} years
                              </Badge>
                            )}
                            <Badge className="text-[10px] sm:text-xs bg-primary/20 text-primary border-primary/40">
                              Level {skill.current_level}
                            </Badge>
                          </div>
                          {skill.description && (
                            <p className="text-xs sm:text-sm text-white/70 line-clamp-2">{skill.description}</p>
                          )}
                        </div>
                      </div>

                      {/* WHEN */}
                      <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
                          <h3 className="text-xs sm:text-sm font-bold text-orange-400 uppercase tracking-wider">WHEN</h3>
                        </div>
                        <div className="space-y-2">
                          {skillDetails.learned_when ? (
                            <>
                              <div>
                                <div className="text-[10px] sm:text-xs text-white/60 mb-1">Started:</div>
                                <div className="text-sm sm:text-base font-semibold text-white">
                                  {format(parseISO(skillDetails.learned_when.date), 'MMMM yyyy')}
                                </div>
                              </div>
                              {skillDetails.years_practiced !== undefined && (
                                <div className="text-xs text-white/60">
                                  Practicing for {skillDetails.years_practiced} {skillDetails.years_practiced === 1 ? 'year' : 'years'}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-xs sm:text-sm text-white/50">
                              {format(parseISO(skill.first_mentioned_at), 'MMMM yyyy')}
                            </div>
                          )}
                          {skill.last_practiced_at && (
                            <div>
                              <div className="text-[10px] sm:text-xs text-white/60">Last Practiced:</div>
                              <div className="text-xs sm:text-sm text-white/80">
                                {format(parseISO(skill.last_practiced_at), 'MMM d, yyyy')}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* WHERE */}
                      <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-green-500/20 to-green-500/5 border border-green-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPinIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-400" />
                          <h3 className="text-xs sm:text-sm font-bold text-green-400 uppercase tracking-wider">WHERE</h3>
                        </div>
                        <div className="space-y-2">
                          {skillDetails.learned_at && skillDetails.learned_at.length > 0 ? (
                            <div>
                              <div className="text-[10px] sm:text-xs text-white/60 mb-1">Learned At:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {skillDetails.learned_at.slice(0, 2).map((loc, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => openLocation({ id: loc.location_id, name: loc.location_name })}
                                    className="text-xs sm:text-sm text-green-300 hover:text-green-200 underline"
                                  >
                                    {loc.location_name}
                                  </button>
                                ))}
                                {skillDetails.learned_at.length > 2 && (
                                  <span className="text-xs text-white/50">+{skillDetails.learned_at.length - 2}</span>
                                )}
                              </div>
                            </div>
                          ) : null}
                          {skillDetails.practiced_at && skillDetails.practiced_at.length > 0 ? (
                            <div>
                              <div className="text-[10px] sm:text-xs text-white/60 mb-1">Practiced At:</div>
                              <div className="flex flex-wrap gap-1.5">
                                {skillDetails.practiced_at
                                  .sort((a, b) => b.practice_count - a.practice_count)
                                  .slice(0, 2)
                                  .map((loc, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => openLocation({ id: loc.location_id, name: loc.location_name })}
                                      className="text-xs sm:text-sm text-green-300 hover:text-green-200 underline"
                                    >
                                      {loc.location_name}
                                    </button>
                                  ))}
                                {skillDetails.practiced_at.length > 2 && (
                                  <span className="text-xs text-white/50">+{skillDetails.practiced_at.length - 2}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs sm:text-sm text-white/50">No locations recorded</div>
                          )}
                        </div>
                      </div>

                      {/* WHY - Full Width */}
                      {skillDetails.why_started && (
                        <div className="sm:col-span-2 p-3 sm:p-4 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-500/5 border border-pink-500/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-pink-400" />
                            <h3 className="text-xs sm:text-sm font-bold text-pink-400 uppercase tracking-wider">WHY</h3>
                          </div>
                          <p className="text-sm sm:text-base text-white/90 leading-relaxed">{skillDetails.why_started.reason}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* When Started - Real Info */}
              {skillDetails?.learned_when && (
                <Card className="bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-orange-400" />
                      <CardTitle className="text-sm font-bold text-white">When You Started</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-base sm:text-lg font-semibold text-white mb-1">
                      {format(parseISO(skillDetails.learned_when.date), 'MMMM d, yyyy')}
                    </div>
                    {skillDetails.learned_when.context && (
                      <p className="text-xs sm:text-sm text-white/70">{skillDetails.learned_when.context}</p>
                    )}
                    {skillDetails.years_practiced !== undefined && (
                      <div className="text-xs sm:text-sm text-orange-400/80 mt-2">
                        Practicing for {skillDetails.years_practiced} {skillDetails.years_practiced === 1 ? 'year' : 'years'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Why You Do This Skill */}
              {skillDetails?.why_started && (
                <Card className="bg-gradient-to-br from-pink-500/20 to-pink-500/5 border border-pink-500/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-pink-400" />
                      <CardTitle className="text-sm font-bold text-white">Why You Started</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm sm:text-base text-white/90 leading-relaxed">{skillDetails.why_started.reason}</p>
                  </CardContent>
                </Card>
              )}

              {/* Sagas, Arcs, Eras */}
              {skillDetails && ((skillDetails.arcs && skillDetails.arcs.length > 0) || (skillDetails.sagas && skillDetails.sagas.length > 0) || (skillDetails.eras && skillDetails.eras.length > 0)) && (
                <Card className="bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-indigo-400" />
                      <CardTitle className="text-sm font-bold text-white">Timeline Context</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {skillDetails.eras && skillDetails.eras.length > 0 && (
                      <div>
                        <div className="text-[10px] sm:text-xs text-indigo-400/70 mb-2 uppercase tracking-wider">Eras</div>
                        <div className="flex flex-wrap gap-2">
                          {skillDetails.eras.map((era, idx) => (
                            <button
                              key={idx}
                              onClick={() => navigate(`/timeline?era=${era.era_id}`)}
                              className="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 text-xs hover:bg-indigo-500/30 transition-colors"
                            >
                              {era.era_title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {skillDetails.sagas && skillDetails.sagas.length > 0 && (
                      <div>
                        <div className="text-[10px] sm:text-xs text-indigo-400/70 mb-2 uppercase tracking-wider">Sagas</div>
                        <div className="flex flex-wrap gap-2">
                          {skillDetails.sagas.map((saga, idx) => (
                            <button
                              key={idx}
                              onClick={() => navigate(`/timeline?saga=${saga.saga_id}`)}
                              className="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 text-xs hover:bg-indigo-500/30 transition-colors"
                            >
                              {saga.saga_title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {skillDetails.arcs && skillDetails.arcs.length > 0 && (
                      <div>
                        <div className="text-[10px] sm:text-xs text-indigo-400/70 mb-2 uppercase tracking-wider">Arcs</div>
                        <div className="flex flex-wrap gap-2">
                          {skillDetails.arcs.map((arc, idx) => (
                            <button
                              key={idx}
                              onClick={() => navigate(`/timeline?arc=${arc.arc_id}`)}
                              className="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 text-xs hover:bg-indigo-500/30 transition-colors"
                            >
                              {arc.arc_title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Basic Info - Compact */}
              <Card className="bg-black/40 border border-white/10">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${categoryColor} capitalize`}>
                      {skill.skill_category}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      Level {skill.current_level}
                    </Badge>
                    {skill.is_active ? (
                      <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/40">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-gray-500/20 text-gray-400 border-gray-500/40">
                        Inactive
                      </Badge>
                    )}
                    {skill.auto_detected && (
                      <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">
                        Auto-detected
                      </Badge>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs sm:text-sm text-white/70 mt-2">{skill.description}</p>
                  )}
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="chat" className="mt-0">
              {/* Chat messages only - input moved to sticky area */}
              <div className="space-y-3 sm:space-y-4">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-lg p-3 sm:p-4 ${
                        message.role === 'user'
                          ? 'bg-primary/20 text-white'
                          : 'bg-black/40 text-white/90 border border-white/10'
                      }`}
                    >
                      <div className="text-sm sm:text-base break-words">
                      <MarkdownRenderer content={message.content} />
                      </div>
                      <div className="text-[10px] sm:text-xs text-white/40 mt-1 sm:mt-2">
                        {format(message.timestamp, 'HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-black/40 text-white/90 border border-white/10 rounded-lg p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="text-white/60 text-sm sm:text-base">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </TabsContent>

            <TabsContent value="connections" className="mt-0 space-y-3 sm:space-y-4">
              {loadingConnections ? (
                <div className="text-center py-8 text-white/60">Loading connections...</div>
              ) : (
                <>
                  {/* Characters */}
                  {relatedCharacters.length > 0 && (
                    <Card className="bg-black/40 border border-blue-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-400" />
                          <CardTitle className="text-sm font-bold text-white">People</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {relatedCharacters.map((character) => (
                            <button
                              key={character.id}
                              onClick={() => openCharacter({ id: character.id, name: character.name })}
                              className="w-full p-3 rounded-lg bg-black/40 border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all text-left flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {character.avatar_url ? (
                                  <img
                                    src={character.avatar_url}
                                    alt={character.name}
                                    className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                    <Users className="h-5 w-5 text-blue-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-white truncate">{character.name}</div>
                                  {character.role && (
                                    <div className="text-xs text-white/60 capitalize">{character.role}</div>
                                  )}
                                  {character.relationship && (
                                    <div className="text-[10px] text-white/50">{character.relationship}</div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organizations */}
                  {relatedOrganizations.length > 0 && (
                    <Card className="bg-black/40 border border-purple-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-purple-400" />
                          <CardTitle className="text-sm font-bold text-white">Organizations</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {relatedOrganizations.map((org) => (
                            <div
                              key={org.id}
                              className="p-3 rounded-lg bg-black/40 border border-white/10"
                            >
                              <div className="text-sm font-semibold text-white">{org.name}</div>
                              {org.type && (
                                <div className="text-xs text-white/60 capitalize mt-1">{org.type}</div>
                              )}
                              {org.member_count !== undefined && (
                                <div className="text-[10px] text-white/50 mt-1">{org.member_count} members</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {relatedCharacters.length === 0 && relatedOrganizations.length === 0 && (
                    <Card className="bg-black/40 border border-white/10">
                      <CardContent className="p-8 text-center">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-30 text-white/50" />
                        <p className="text-white/60">No connections found for this skill</p>
                        <p className="text-xs text-white/40 mt-2">Connections will appear here as you interact with people and organizations related to this skill</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="milestones" className="mt-0 space-y-3 sm:space-y-4">
              {loadingMilestones ? (
                <div className="text-center py-8 text-white/60">Loading milestones...</div>
              ) : milestones.length > 0 ? (
                <div className="space-y-3 sm:space-y-4">
                  {milestones.map((achievement) => (
                    <Card
                      key={achievement.id}
                      className="bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 border border-yellow-500/30"
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-yellow-500/20 flex-shrink-0">
                            <Trophy className="h-5 w-5 text-yellow-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-sm sm:text-base font-bold text-white">{achievement.achievement_name}</h3>
                              <Badge
                                className={`text-[10px] sm:text-xs ${
                                  achievement.rarity === 'legendary' ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' :
                                  achievement.rarity === 'epic' ? 'bg-pink-500/20 text-pink-400 border-pink-500/40' :
                                  achievement.rarity === 'rare' ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' :
                                  achievement.rarity === 'uncommon' ? 'bg-green-500/20 text-green-400 border-green-500/40' :
                                  'bg-gray-500/20 text-gray-400 border-gray-500/40'
                                }`}
                              >
                                {achievement.rarity}
                              </Badge>
                            </div>
                            {achievement.description && (
                              <p className="text-xs sm:text-sm text-white/70 mb-2">{achievement.description}</p>
                            )}
                            <div className="text-[10px] sm:text-xs text-white/50">
                              {format(parseISO(achievement.unlocked_at), 'MMMM d, yyyy')}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-black/40 border border-white/10">
                  <CardContent className="p-8 text-center">
                    <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30 text-white/50" />
                    <p className="text-white/60">No milestones yet</p>
                    <p className="text-xs text-white/40 mt-2">Achievements related to this skill will appear here</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="locations" className="mt-0 space-y-3 sm:space-y-4">
              {skillDetails && ((skillDetails.learned_at && skillDetails.learned_at.length > 0) || (skillDetails.practiced_at && skillDetails.practiced_at.length > 0)) ? (
                <>
                  {skillDetails.learned_at && skillDetails.learned_at.length > 0 && (
                    <Card className="bg-black/40 border border-green-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-green-400" />
                          <CardTitle className="text-sm font-bold text-white">Learned At</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {skillDetails.learned_at.map((location, idx) => (
                            <button
                              key={idx}
                              onClick={() => openLocation({ id: location.location_id, name: location.location_name })}
                              className="w-full p-3 rounded-lg bg-black/40 border border-white/10 hover:border-green-500/50 hover:bg-green-500/10 transition-all text-left flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <MapPin className="h-5 w-5 text-green-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-white truncate">{location.location_name}</div>
                                  {location.first_mentioned && (
                                    <div className="text-xs text-white/60 mt-1">
                                      {format(parseISO(location.first_mentioned), 'MMMM yyyy')}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {skillDetails.practiced_at && skillDetails.practiced_at.length > 0 && (
                    <Card className="bg-black/40 border border-green-500/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-green-400" />
                          <CardTitle className="text-sm font-bold text-white">Practiced At</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {skillDetails.practiced_at
                            .sort((a, b) => b.practice_count - a.practice_count)
                            .map((location, idx) => (
                              <button
                                key={idx}
                                onClick={() => openLocation({ id: location.location_id, name: location.location_name })}
                                className="w-full p-3 rounded-lg bg-black/40 border border-white/10 hover:border-green-500/50 hover:bg-green-500/10 transition-all text-left flex items-center justify-between"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <MapPin className="h-5 w-5 text-green-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{location.location_name}</div>
                                    <div className="text-xs text-white/60 mt-1">{location.practice_count} practice sessions</div>
                                    {location.last_practiced && (
                                      <div className="text-[10px] text-white/50 mt-1">
                                        Last: {format(parseISO(location.last_practiced), 'MMM yyyy')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                              </button>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="bg-black/40 border border-white/10">
                  <CardContent className="p-8 text-center">
                    <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30 text-white/50" />
                    <p className="text-white/60">No locations recorded</p>
                    <p className="text-xs text-white/40 mt-2">Locations where you learned or practiced this skill will appear here</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="photos" className="mt-0 space-y-3 sm:space-y-4">
              {loadingPhotos ? (
                <div className="text-center py-8 text-white/60">Loading photos...</div>
              ) : skillPhotos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                  {skillPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => setSelectedPhoto(photo)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-all group"
                    >
                      <LazyImage
                        src={photo.thumbnailUrl || photo.photoUrl}
                        alt={photo.summary || 'Photo'}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="text-center p-2">
                          {photo.summary && (
                            <p className="text-xs text-white line-clamp-2">{photo.summary}</p>
                          )}
                          {photo.locationName && (
                            <p className="text-xs text-white/70 mt-1">📍 {photo.locationName}</p>
                          )}
                          {photo.people && photo.people.length > 0 && (
                            <p className="text-xs text-white/70 mt-1">👥 {photo.people.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      {photo.date && (
                        <div className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-black/80 rounded px-1.5 py-0.5 sm:px-2 sm:py-1">
                          <span className="text-[10px] sm:text-xs text-white">
                            {format(parseISO(photo.date), 'MMM d')}
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <Card className="bg-black/40 border border-white/10">
                  <CardContent className="p-8 text-center">
                    <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-30 text-white/50" />
                    <p className="text-white/60">No photos found</p>
                    <p className="text-xs text-white/40 mt-2">Photos related to this skill will appear here</p>
                  </CardContent>
                </Card>
              )}

              {/* Photo Detail Modal */}
              {selectedPhoto && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <div
                    className="relative max-w-4xl max-h-[90vh] w-full bg-black/90 border border-white/20 rounded-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedPhoto(null)}
                      className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </button>
                    <div className="flex flex-col md:flex-row">
                      <div className="flex-1 p-3 sm:p-6">
                        <img
                          src={selectedPhoto.photoUrl}
                          alt={selectedPhoto.summary || ''}
                          className="w-full h-auto rounded-lg"
                        />
                      </div>
                      <div className="w-full md:w-80 p-3 sm:p-6 border-t md:border-t-0 md:border-l border-white/10 space-y-3 sm:space-y-4">
                        {selectedPhoto.summary && (
                          <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-white mb-2">Description</h3>
                            <p className="text-xs sm:text-sm text-white/70">{selectedPhoto.summary}</p>
                          </div>
                        )}
                        {selectedPhoto.locationName && (
                          <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-white mb-2">Location</h3>
                            <p className="text-xs sm:text-sm text-white/70">{selectedPhoto.locationName}</p>
                          </div>
                        )}
                        {selectedPhoto.date && (
                          <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-white mb-2">Date</h3>
                            <p className="text-xs sm:text-sm text-white/70">
                              {format(parseISO(selectedPhoto.date), 'MMMM d, yyyy')}
                            </p>
                          </div>
                        )}
                        {selectedPhoto.people && selectedPhoto.people.length > 0 && (
                          <div>
                            <h3 className="text-sm sm:text-lg font-semibold text-white mb-2">People</h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedPhoto.people.map((person, idx) => (
                                <Badge key={idx} variant="outline" className="text-[10px] sm:text-xs">
                                  {person}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="progress" className="mt-0 space-y-4">
              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-primary/30 shadow-2xl shadow-primary/10">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold text-white">Level Progress</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/80">Progress to Level {skill.current_level + 1}</span>
                      <span className="text-lg font-bold text-primary">{Math.round(levelProgress)}%</span>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-6 overflow-hidden border border-primary/20">
                      <div
                        className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.min(100, levelProgress)}%` }}
                      >
                        {levelProgress > 10 && (
                          <span className="text-xs font-bold text-white">{Math.round(levelProgress)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">
                        <span className="font-semibold text-white">{xpInCurrentLevel.toLocaleString()}</span>
                        <span className="text-white/50"> / {xpNeededForLevel.toLocaleString()} XP</span>
                      </span>
                      <span className="text-primary font-semibold">{skill.xp_to_next_level.toLocaleString()} XP to next level</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-primary/20 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold text-white">Progress History</CardTitle>
                    <Badge variant="outline" className="ml-auto bg-primary/20 text-primary border-primary/40">
                      {progressHistory.length} entries
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingProgress ? (
                    <div className="text-center py-8 text-white/60">Loading progress...</div>
                  ) : progressHistory.length === 0 ? (
                    <div className="text-center py-8 text-white/60">
                      <Clock className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>No progress history yet.</p>
                      <p className="text-xs text-white/40 mt-2">Start practicing to see your progress here!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {progressHistory.map((progress, idx) => {
                        const isLevelUp = progress.level_after > progress.level_before;
                        const sourceColors: Record<string, string> = {
                          memory: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
                          achievement: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
                          practice: 'bg-green-500/20 text-green-400 border-green-500/40',
                          manual: 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                        };
                        const sourceColor = sourceColors[progress.source_type] || 'bg-gray-500/20 text-gray-400 border-gray-500/40';
                        
                        return (
                          <div 
                            key={progress.id} 
                            className={`flex items-center justify-between p-4 rounded-lg border transition-all hover:border-primary/50 ${
                              isLevelUp 
                                ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border-yellow-500/30' 
                                : 'bg-black/60 border-white/10'
                            }`}
                          >
                            <div className="flex items-start gap-3 flex-1">
                              {isLevelUp && (
                                <div className="p-1.5 rounded-lg bg-yellow-500/20">
                                  <Sparkles className="h-4 w-4 text-yellow-400" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-white font-bold text-lg">+{progress.xp_gained} XP</span>
                                  {isLevelUp && (
                                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs">
                                      Level Up!
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className={`text-xs ${sourceColor}`}>
                                    {progress.source_type === 'memory' ? '📝 Memory' : 
                                     progress.source_type === 'achievement' ? '🏆 Achievement' : 
                                     progress.source_type === 'practice' ? '💪 Practice' : 
                                     '✏️ Manual'}
                                  </Badge>
                                  {progress.notes && (
                                    <span className="text-xs text-white/60 truncate max-w-xs">{progress.notes}</span>
                                  )}
                                </div>
                                <div className="text-xs text-white/40">
                                  {format(parseISO(progress.timestamp), 'MMM d, yyyy • h:mm a')}
                                </div>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              {isLevelUp ? (
                                <div className="flex flex-col items-end">
                                  <div className="text-sm font-bold text-yellow-400 mb-1">
                                    Level {progress.level_before} → {progress.level_after}
                                  </div>
                                  <TrendingUp className="h-4 w-4 text-yellow-400" />
                                </div>
                              ) : (
                                <div className="text-sm text-white/60">
                                  Level {progress.level_before}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Progress Summary - Mock Data */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-400" />
                    <CardTitle>Progress Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                      <div className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1">This Week</div>
                      <div className="text-2xl font-bold text-white">+{Math.floor(Math.random() * 2000) + 500} XP</div>
                      <div className="text-xs text-white/50 mt-1">7 activities</div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-green-500/10 to-transparent border border-green-500/20">
                      <div className="text-xs font-semibold text-green-400/70 uppercase tracking-wider mb-1">This Month</div>
                      <div className="text-2xl font-bold text-white">+{Math.floor(Math.random() * 8000) + 2000} XP</div>
                      <div className="text-xs text-white/50 mt-1">28 activities</div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider mb-1">Streak</div>
                      <div className="text-2xl font-bold text-white">{Math.floor(Math.random() * 15) + 5} days</div>
                      <div className="text-xs text-white/50 mt-1">Keep it up!</div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20">
                      <div className="text-xs font-semibold text-purple-400/70 uppercase tracking-wider mb-1">Avg. Daily</div>
                      <div className="text-2xl font-bold text-white">{Math.floor(Math.random() * 300) + 100} XP</div>
                      <div className="text-xs text-white/50 mt-1">Last 30 days</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </Tabs>

        {/* Sticky Chatbox - Always visible at bottom */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-black/90 border-t border-primary/30 p-3 sm:p-4 z-10 backdrop-blur-sm shadow-lg shadow-black/50">
          <div className="flex gap-2 items-end">
            <Textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder={`Ask about ${skill.skill_name}...`}
              className="flex-1 bg-black/60 border-white/20 text-white resize-none min-h-[50px] sm:min-h-[60px] max-h-[100px] sm:max-h-[120px] text-sm sm:text-base"
              rows={2}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || chatLoading || isStreaming}
              className="h-[50px] sm:h-[60px] px-4 sm:px-6 flex-shrink-0"
            >
              {chatLoading || isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

