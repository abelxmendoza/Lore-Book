// =====================================================
// SKILL DETAIL MODAL
// Purpose: Comprehensive skill profile with chatbot editing
// Features: Info, Chat, Progress, Timeline
// =====================================================

import { useState, useEffect, useRef } from 'react';
import { X, Save, Zap, TrendingUp, Calendar, MessageSquare, Clock, FileText, Award, Star, Sparkles, TrendingDown, Plus, Edit2, Trash2, Users, Building2, MapPin, Image as ImageIcon, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Modal } from '../ui/modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { skillsApi } from '../../api/skills';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { fetchJson } from '../../lib/api';
import { LazyImage } from '../ui/LazyImage';
import { useNavigate } from 'react-router-dom';
import type { Skill, SkillProgress, SkillCategory } from '../../types/skill';

type SkillDetailModalProps = {
  skill: Skill;
  onClose: () => void;
  onUpdate?: () => void;
};

type TabKey = 'info' | 'chat' | 'progress' | 'photos' | 'connections' | 'timeline';

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
  { key: 'progress', label: 'Progress', icon: TrendingUp },
  { key: 'photos', label: 'Photos', icon: ImageIcon },
  { key: 'connections', label: 'Connections', icon: Users },
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
  const [relatedLocations, setRelatedLocations] = useState<RelatedLocation[]>([]);
  const [relatedPhotos, setRelatedPhotos] = useState<RelatedPhoto[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  
  // Photos state (separate from connections)
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
    if (activeTab === 'progress') {
      void loadProgressHistory();
    } else if (activeTab === 'connections') {
      void loadConnections();
    } else if (activeTab === 'photos') {
      void loadPhotos();
    }
  }, [activeTab, skill.id]);

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
      // Fetch related entities - in a real implementation, this would be a dedicated API endpoint
      // For now, we'll search for entities that mention this skill
      const skillName = skill.skill_name.toLowerCase();
      
      // Fetch characters (mock for now - in real app, would query skill_character_links table)
      try {
        const characters = await fetchJson<{ characters: Array<{ id: string; name: string; avatar_url?: string; role?: string }> }>(
          '/api/characters'
        ).catch(() => ({ characters: [] }));
        
        // Filter characters that might be related (in real app, use proper linking)
        const related = (characters.characters || []).slice(0, 5).map(char => ({
          id: char.id,
          name: char.name,
          avatar_url: char.avatar_url,
          role: char.role,
          relationship: 'Practices this skill'
        }));
        
        // If no characters found, use mock data
        if (related.length === 0) {
          const mockCharacters: RelatedCharacter[] = [
            { id: 'mock-char-1', name: 'Alex Chen', role: 'Mentor', relationship: 'Teaches this skill' },
            { id: 'mock-char-2', name: 'Sarah Johnson', role: 'Colleague', relationship: 'Practices together' },
            { id: 'mock-char-3', name: 'Mike Rodriguez', role: 'Friend', relationship: 'Learning partner' },
            { id: 'mock-char-4', name: 'Emma Wilson', role: 'Instructor', relationship: 'Provides guidance' },
            { id: 'mock-char-5', name: 'David Kim', role: 'Peer', relationship: 'Collaborates on projects' }
          ];
          setRelatedCharacters(mockCharacters);
        } else {
          setRelatedCharacters(related);
        }
      } catch (error) {
        console.error('Failed to load related characters:', error);
        // Use mock data on error
        const mockCharacters: RelatedCharacter[] = [
          { id: 'mock-char-1', name: 'Alex Chen', role: 'Mentor', relationship: 'Teaches this skill' },
          { id: 'mock-char-2', name: 'Sarah Johnson', role: 'Colleague', relationship: 'Practices together' },
          { id: 'mock-char-3', name: 'Mike Rodriguez', role: 'Friend', relationship: 'Learning partner' }
        ];
        setRelatedCharacters(mockCharacters);
      }

      // Fetch organizations (mock for now)
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
        
        // If no organizations found, use mock data
        if (relatedOrgs.length === 0) {
          const mockOrgs: RelatedOrganization[] = [
            { id: 'mock-org-1', name: 'Tech Innovation Hub', type: 'workspace', member_count: 45 },
            { id: 'mock-org-2', name: 'Code Academy', type: 'learning', member_count: 120 },
            { id: 'mock-org-3', name: 'Developer Community', type: 'community', member_count: 350 }
          ];
          setRelatedOrganizations(mockOrgs);
        } else {
          setRelatedOrganizations(relatedOrgs);
        }
      } catch (error) {
        console.error('Failed to load related organizations:', error);
        // Use mock data on error
        const mockOrgs: RelatedOrganization[] = [
          { id: 'mock-org-1', name: 'Tech Innovation Hub', type: 'workspace', member_count: 45 },
          { id: 'mock-org-2', name: 'Code Academy', type: 'learning', member_count: 120 }
        ];
        setRelatedOrganizations(mockOrgs);
      }

      // Fetch locations (mock for now)
      try {
        const locations = await fetchJson<{ locations: Array<{ id: string; name: string; visit_count?: number; last_visited?: string }> }>(
          '/api/locations'
        ).catch(() => ({ locations: [] }));
        
        const relatedLocs = (locations.locations || []).slice(0, 5).map(loc => ({
          id: loc.id,
          name: loc.name,
          visit_count: loc.visit_count,
          last_visited: loc.last_visited
        }));
        
        // If no locations found, use mock data
        if (relatedLocs.length === 0) {
          const now = new Date();
          const mockLocs: RelatedLocation[] = [
            { 
              id: 'mock-loc-1', 
              name: 'Home Office', 
              visit_count: 85,
              last_visited: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            { 
              id: 'mock-loc-2', 
              name: 'Coffee Shop Downtown', 
              visit_count: 32,
              last_visited: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            { 
              id: 'mock-loc-3', 
              name: 'Coding Bootcamp', 
              visit_count: 18,
              last_visited: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
            }
          ];
          setRelatedLocations(mockLocs);
        } else {
          setRelatedLocations(relatedLocs);
        }
      } catch (error) {
        console.error('Failed to load related locations:', error);
        // Use mock data on error
        const now = new Date();
        const mockLocs: RelatedLocation[] = [
          { 
            id: 'mock-loc-1', 
            name: 'Home Office', 
            visit_count: 85,
            last_visited: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
          },
          { 
            id: 'mock-loc-2', 
            name: 'Coffee Shop Downtown', 
            visit_count: 32,
            last_visited: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
          }
        ];
        setRelatedLocations(mockLocs);
      }

      // Fetch photos (mock for now)
      try {
        const photos = await fetchJson<{ entries: Array<{ id: string; date: string; summary?: string; metadata?: { photoUrl?: string; locationName?: string; people?: string[] } }> }>(
          '/api/photos'
        ).catch(() => ({ entries: [] }));
        
        const relatedPics = (photos.entries || [])
          .filter(entry => entry.metadata?.photoUrl)
          .slice(0, 12)
          .map(entry => ({
            id: entry.id,
            photoUrl: entry.metadata?.photoUrl || '',
            thumbnailUrl: entry.metadata?.photoUrl,
            date: entry.date,
            summary: entry.summary,
            locationName: entry.metadata?.locationName,
            people: entry.metadata?.people
          }));
        
        // If no photos found, use mock data
        if (relatedPics.length === 0) {
          const now = new Date();
          const mockPhotos: RelatedPhoto[] = [];
          const photoSummaries = [
            'Working on a new project',
            'Code review session',
            'Pair programming',
            'Workshop presentation',
            'Team collaboration',
            'Project milestone',
            'Learning session',
            'Hackathon event',
            'Code documentation',
            'Testing phase',
            'Deployment day',
            'Project showcase'
          ];
          const locations = ['Home Office', 'Coffee Shop', 'Workspace', 'Conference Room', 'Library'];
          const people = ['Alex', 'Sarah', 'Mike', 'Emma', 'David'];
          
          for (let i = 0; i < 12; i++) {
            const daysAgo = i * 7 + Math.floor(Math.random() * 5);
            const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
            const photoPeople = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => 
              people[Math.floor(Math.random() * people.length)]
            );
            
            mockPhotos.push({
              id: `mock-photo-${i}`,
              photoUrl: `https://picsum.photos/400/400?random=${i}`,
              thumbnailUrl: `https://picsum.photos/200/200?random=${i}`,
              date: date.toISOString(),
              summary: photoSummaries[i % photoSummaries.length],
              locationName: locations[Math.floor(Math.random() * locations.length)],
              people: photoPeople
            });
          }
          setRelatedPhotos(mockPhotos);
        } else {
          setRelatedPhotos(relatedPics);
        }
      } catch (error) {
        console.error('Failed to load related photos:', error);
        // Use mock data on error
        const now = new Date();
        const mockPhotos: RelatedPhoto[] = [];
        const photoSummaries = [
          'Working on a new project',
          'Code review session',
          'Pair programming',
          'Workshop presentation'
        ];
        
        for (let i = 0; i < 8; i++) {
          const daysAgo = i * 7 + Math.floor(Math.random() * 5);
          const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          
          mockPhotos.push({
            id: `mock-photo-${i}`,
            photoUrl: `https://picsum.photos/400/400?random=${i}`,
            thumbnailUrl: `https://picsum.photos/200/200?random=${i}`,
            date: date.toISOString(),
            summary: photoSummaries[i % photoSummaries.length],
            locationName: 'Home Office',
            people: ['Alex', 'Sarah']
          });
        }
        setRelatedPhotos(mockPhotos);
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const loadPhotos = async () => {
    setLoadingPhotos(true);
    try {
      // Fetch photos specifically linked to this skill
      const response = await fetchJson<{ photos: Array<{ id: string; date: string; summary?: string; metadata?: { photoUrl?: string; locationName?: string; people?: string[]; skill_ids?: string[] } }> }>(
        `/api/photos?skill_id=${skill.id}`
      ).catch(() => ({ photos: [] }));
      
      const photos = (response.photos || [])
        .filter(entry => entry.metadata?.photoUrl)
        .map(entry => ({
          id: entry.id,
          photoUrl: entry.metadata?.photoUrl || '',
          thumbnailUrl: entry.metadata?.photoUrl,
          date: entry.date,
          summary: entry.summary,
          locationName: entry.metadata?.locationName,
          people: entry.metadata?.people
        }));
      
      // If no photos found, generate mock data
      if (photos.length === 0) {
        // Generate mock photos if no data at all
        const now = new Date();
        const mockPhotos: RelatedPhoto[] = [];
        const photoSummaries = [
          'Working on a new project',
          'Code review session',
          'Pair programming',
          'Workshop presentation',
          'Team collaboration',
          'Project milestone',
          'Learning session',
          'Hackathon event',
          'Code documentation',
          'Testing phase',
          'Deployment day',
          'Project showcase'
        ];
        const locations = ['Home Office', 'Coffee Shop', 'Workspace', 'Conference Room', 'Library'];
        const people = ['Alex', 'Sarah', 'Mike', 'Emma', 'David'];
        
        for (let i = 0; i < 12; i++) {
          const daysAgo = i * 7 + Math.floor(Math.random() * 5);
          const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          const photoPeople = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => 
            people[Math.floor(Math.random() * people.length)]
          );
          
          mockPhotos.push({
            id: `mock-photo-${i}`,
            photoUrl: `https://picsum.photos/400/400?random=${i}`,
            thumbnailUrl: `https://picsum.photos/200/200?random=${i}`,
            date: date.toISOString(),
            summary: photoSummaries[i % photoSummaries.length],
            locationName: locations[Math.floor(Math.random() * locations.length)],
            people: photoPeople
          });
        }
        setSkillPhotos(mockPhotos);
      } else {
        setSkillPhotos(photos);
      }
    } catch (error) {
      console.error('Failed to load photos:', error);
      // Use mock data on error
      const now = new Date();
      const mockPhotos: RelatedPhoto[] = [];
      const photoSummaries = [
        'Working on a new project',
        'Code review session',
        'Pair programming',
        'Workshop presentation'
      ];
      
      for (let i = 0; i < 8; i++) {
        const daysAgo = i * 7 + Math.floor(Math.random() * 5);
        const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        
        mockPhotos.push({
          id: `mock-photo-${i}`,
          photoUrl: `https://picsum.photos/400/400?random=${i}`,
          thumbnailUrl: `https://picsum.photos/200/200?random=${i}`,
          date: date.toISOString(),
          summary: photoSummaries[i % photoSummaries.length],
          locationName: 'Home Office',
          people: ['Alex', 'Sarah']
        });
      }
      setSkillPhotos(mockPhotos);
    } finally {
      setLoadingPhotos(false);
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
      `.trim();

      await streamChat({
        messages: [
          {
            role: 'system',
            content: `You are helping the user manage their skill "${skill.skill_name}". You can help them update information, track progress, answer questions, and provide guidance. Be helpful and encouraging.`
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
        onComplete: () => {
          setStreamingMessageId(null);
          setChatLoading(false);
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

  // Calculate level progress
  const currentLevelXP = 100 * Math.pow(1.5, skill.current_level - 1);
  const nextLevelXP = 100 * Math.pow(1.5, skill.current_level);
  const xpInCurrentLevel = skill.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));

  return (
    <Modal isOpen={true} onClose={onClose} title={skill.skill_name} maxWidth="xl">
      <div className="flex flex-col h-full max-h-[90vh]">
        {/* Skill Info Header */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/10 px-6 pt-4">
          <Badge className={`text-xs ${categoryColor} capitalize`}>
            {skill.skill_category}
          </Badge>
          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
            Level {skill.current_level}
          </Badge>
          {skill.auto_detected && (
            <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">
              Auto-detected
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4">
            {tabs.map(tab => (
              <TabsTrigger key={tab.key} value={tab.key}>
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Content - with bottom padding for sticky chat */}
          <div className="flex-1 overflow-y-auto p-6 pb-32">
            <TabsContent value="info" className="mt-0 space-y-6">
              {/* Basic Information - Enhanced Read-Only Display */}
              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-primary/30 shadow-2xl shadow-primary/10">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-bold text-white mb-1">Basic Information</CardTitle>
                      <CardDescription className="text-white/50">Skill details are managed through the chatbot</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Skill Name - Prominent */}
                  <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
                    <label className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-2 block">Skill Name</label>
                    <div className="text-2xl font-bold text-white flex items-center gap-2">
                      <Zap className="h-6 w-6 text-primary" />
                      {skill.skill_name}
                    </div>
                  </div>

                  {/* Category - Enhanced */}
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 block">Category</label>
                    <div className="flex items-center gap-3">
                      <Badge className={`text-sm font-semibold px-3 py-1.5 ${categoryColor} capitalize`}>
                        {skill.skill_category}
                      </Badge>
                      {skill.auto_detected && (
                        <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">
                          Auto-detected
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description - Enhanced */}
                  {skill.description && (
                    <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 block">Description</label>
                      <p className="text-white/90 leading-relaxed text-base">{skill.description}</p>
                    </div>
                  )}

                  {/* Status - Enhanced */}
                  <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 block">Status</label>
                    <div className="flex items-center gap-3">
                      {skill.is_active ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/40 px-3 py-1.5">
                          <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse" />
                          Active Skill
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/40 px-3 py-1.5">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Statistics - Enhanced */}
              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-primary/20 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <TrendingUp className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl font-bold text-white">Statistics</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                      <div className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1">Total XP</div>
                      <div className="text-2xl font-bold text-white flex items-center gap-2">
                        <Star className="h-5 w-5 text-yellow-400" />
                        {skill.total_xp.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                      <div className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1">XP to Next Level</div>
                      <div className="text-2xl font-bold text-white">{skill.xp_to_next_level.toLocaleString()}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                      <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Practice Count</div>
                      <div className="text-xl font-bold text-white">{skill.practice_count}</div>
                    </div>
                    <div className="p-4 rounded-lg bg-black/40 border border-white/10">
                      <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Confidence Score</div>
                      <div className="text-xl font-bold text-white">{Math.round(skill.confidence_score * 100)}%</div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-black/40">
                      <span className="text-sm text-white/70 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-white/50" />
                        First Mentioned
                      </span>
                      <span className="text-white font-semibold">{format(parseISO(skill.first_mentioned_at), 'MMM d, yyyy')}</span>
                    </div>
                    {skill.last_practiced_at && (
                      <div className="flex justify-between items-center p-3 rounded-lg bg-black/40">
                        <span className="text-sm text-white/70 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-white/50" />
                          Last Practiced
                        </span>
                        <span className="text-white font-semibold">{format(parseISO(skill.last_practiced_at), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Mastery Indicators - Mock Data */}
              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-yellow-500/20 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/20">
                      <Award className="h-5 w-5 text-yellow-400" />
                    </div>
                    <CardTitle className="text-xl font-bold text-white">Mastery Indicators</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20">
                      <div className="text-xs font-semibold text-yellow-400/70 uppercase tracking-wider mb-2">Proficiency Level</div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full"
                            style={{ width: `${Math.min(100, (skill.current_level / 20) * 100)}%` }}
                          />
                        </div>
                        <span className="text-white font-bold text-lg">{skill.current_level}/20</span>
                      </div>
                      <div className="text-sm text-white/70">
                        {skill.current_level >= 15 ? 'Expert' : skill.current_level >= 10 ? 'Advanced' : skill.current_level >= 5 ? 'Intermediate' : 'Beginner'}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20">
                      <div className="text-xs font-semibold text-blue-400/70 uppercase tracking-wider mb-2">Consistency Score</div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, (skill.practice_count / 50) * 100)}%` }}
                          />
                        </div>
                        <span className="text-white font-bold text-lg">{Math.min(100, Math.round((skill.practice_count / 50) * 100))}%</span>
                      </div>
                      <div className="text-sm text-white/70">
                        {skill.practice_count >= 40 ? 'Highly Consistent' : skill.practice_count >= 20 ? 'Consistent' : 'Developing'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Related Skills - Mock Data */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <CardTitle>Related Skills</CardTitle>
                    <Badge variant="outline" className="ml-auto">3</Badge>
                  </div>
                  <CardDescription>Skills often practiced together</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {['JavaScript', 'TypeScript', 'React'].map((relatedSkill, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-black/60 border border-white/10 hover:border-primary/50 transition-all">
                        <div className="flex items-center gap-3">
                          <Zap className="h-4 w-4 text-primary" />
                          <span className="text-white font-medium">{relatedSkill}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          Level {Math.floor(Math.random() * 10) + 1}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Achievements - Mock Data */}
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-400" />
                    <CardTitle>Recent Achievements</CardTitle>
                    <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/40">2</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-4 rounded-lg bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20">
                      <div className="flex items-start gap-3">
                        <Award className="h-5 w-5 text-yellow-400 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-semibold text-white mb-1">Level Up!</div>
                          <div className="text-sm text-white/70">Reached Level {skill.current_level}</div>
                          <div className="text-xs text-white/50 mt-1">
                            {format(new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-gradient-to-r from-primary/10 to-transparent border border-primary/20">
                      <div className="flex items-start gap-3">
                        <Star className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1">
                          <div className="font-semibold text-white mb-1">Milestone Reached</div>
                          <div className="text-sm text-white/70">Completed {skill.practice_count} practice sessions</div>
                          <div className="text-xs text-white/50 mt-1">
                            {format(new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="mt-0">
              {/* Chat messages only - input moved to sticky area */}
              <div className="space-y-4">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === 'user'
                          ? 'bg-primary/20 text-white'
                          : 'bg-black/40 text-white/90 border border-white/10'
                      }`}
                    >
                      <MarkdownRenderer content={message.content} />
                      <div className="text-xs text-white/40 mt-2">
                        {format(message.timestamp, 'HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-black/40 text-white/90 border border-white/10 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="text-white/60">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
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

            <TabsContent value="photos" className="mt-0">
              <Card className="bg-gradient-to-br from-black/60 via-black/50 to-black/60 border-2 border-primary/20 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <ImageIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold text-white">Photos</CardTitle>
                      <CardDescription className="text-white/50">
                        Photos related to this skill
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="ml-auto bg-primary/20 text-primary border-primary/40">
                      {skillPhotos.length + relatedPhotos.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingPhotos ? (
                    <div className="text-center py-8 text-white/60">Loading photos...</div>
                  ) : (skillPhotos.length === 0 && relatedPhotos.length === 0) ? (
                    <div className="text-center py-8 text-white/60">
                      <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p>No photos tagged with this skill yet</p>
                      <p className="text-xs text-white/40 mt-2">
                        Upload photos and they'll be automatically sorted here if they match this skill
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {/* Combine skillPhotos and relatedPhotos, removing duplicates */}
                      {[...skillPhotos, ...relatedPhotos.filter(p => !skillPhotos.find(sp => sp.id === p.id))].map((photo) => (
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
                            <div className="absolute top-2 right-2 bg-black/80 rounded px-2 py-1">
                              <span className="text-xs text-white">
                                {format(parseISO(photo.date), 'MMM d')}
                              </span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Photo Detail Modal */}
              {selectedPhoto && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                  onClick={() => setSelectedPhoto(null)}
                >
                  <div
                    className="relative max-w-4xl max-h-[90vh] bg-black/90 border border-border/60 rounded-2xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedPhoto(null)}
                      className="absolute top-4 right-4 z-10 p-2 bg-black/60 rounded-lg hover:bg-black/80 transition-colors"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                    <div className="flex flex-col md:flex-row">
                      <div className="flex-1 p-6">
                        <img
                          src={selectedPhoto.photoUrl}
                          alt={selectedPhoto.summary || ''}
                          className="w-full h-auto rounded-lg"
                        />
                      </div>
                      <div className="w-full md:w-80 p-6 border-t md:border-t-0 md:border-l border-white/10 space-y-4">
                        {selectedPhoto.summary && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Description</h3>
                            <p className="text-white/70 text-sm">{selectedPhoto.summary}</p>
                          </div>
                        )}
                        {selectedPhoto.locationName && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Location</h3>
                            <p className="text-white/70 text-sm">{selectedPhoto.locationName}</p>
                          </div>
                        )}
                        {selectedPhoto.date && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Date</h3>
                            <p className="text-white/70 text-sm">
                              {format(parseISO(selectedPhoto.date), 'MMMM d, yyyy')}
                            </p>
                          </div>
                        )}
                        {selectedPhoto.people && selectedPhoto.people.length > 0 && (
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">People</h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedPhoto.people.map((person, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
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

            <TabsContent value="connections" className="mt-0 space-y-6">
              {loadingConnections ? (
                <div className="text-center py-8 text-white/60">Loading connections...</div>
              ) : (
                <>
                  {/* Characters */}
                  <Card className="bg-black/40 border-white/10">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <CardTitle>People</CardTitle>
                        <Badge variant="outline" className="ml-auto">
                          {relatedCharacters.length}
                        </Badge>
                      </div>
                      <CardDescription>Characters who practice or are related to this skill</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {relatedCharacters.length === 0 ? (
                        <div className="text-center py-8 text-white/60">
                          <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>No related characters found</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {relatedCharacters.map((character) => (
                            <button
                              key={character.id}
                              onClick={() => openCharacter({ id: character.id, name: character.name })}
                              className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-left"
                            >
                              {character.avatar_url ? (
                                <img
                                  src={character.avatar_url}
                                  alt={character.name}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                                  <Users className="h-5 w-5 text-primary" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-white truncate">{character.name}</div>
                                {character.role && (
                                  <div className="text-xs text-white/60 truncate">{character.role}</div>
                                )}
                                {character.relationship && (
                                  <div className="text-xs text-primary/70">{character.relationship}</div>
                                )}
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Organizations */}
                  <Card className="bg-black/40 border-white/10">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        <CardTitle>Groups & Organizations</CardTitle>
                        <Badge variant="outline" className="ml-auto">
                          {relatedOrganizations.length}
                        </Badge>
                      </div>
                      <CardDescription>Organizations related to this skill</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {relatedOrganizations.length === 0 ? (
                        <div className="text-center py-8 text-white/60">
                          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>No related organizations found</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {relatedOrganizations.map((org) => (
                            <button
                              key={org.id}
                              onClick={() => {
                                navigate('/organizations');
                                onClose();
                              }}
                              className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-left"
                            >
                              <div className="flex items-center gap-3">
                                <Building2 className="h-5 w-5 text-primary" />
                                <div>
                                  <div className="font-semibold text-white">{org.name}</div>
                                  {org.type && (
                                    <div className="text-xs text-white/60 capitalize">{org.type}</div>
                                  )}
                                  {org.member_count !== undefined && (
                                    <div className="text-xs text-white/60">{org.member_count} members</div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40" />
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Locations */}
                  <Card className="bg-black/40 border-white/10">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        <CardTitle>Locations</CardTitle>
                        <Badge variant="outline" className="ml-auto">
                          {relatedLocations.length}
                        </Badge>
                      </div>
                      <CardDescription>Places where this skill is practiced or used</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {relatedLocations.length === 0 ? (
                        <div className="text-center py-8 text-white/60">
                          <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>No related locations found</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {relatedLocations.map((location) => (
                            <button
                              key={location.id}
                              onClick={() => openLocation({ id: location.id, name: location.name })}
                              className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-left"
                            >
                              <div className="flex items-center gap-3">
                                <MapPin className="h-5 w-5 text-primary" />
                                <div>
                                  <div className="font-semibold text-white">{location.name}</div>
                                  {location.visit_count !== undefined && (
                                    <div className="text-xs text-white/60">{location.visit_count} visits</div>
                                  )}
                                  {location.last_visited && (
                                    <div className="text-xs text-white/60">
                                      Last: {format(parseISO(location.last_visited), 'MMM d, yyyy')}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40" />
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                </>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <CardTitle>Skill Timeline</CardTitle>
                  <CardDescription>Coming soon: Timeline of skill mentions and practice sessions</CardDescription>
                </CardHeader>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Sticky Chatbox - Always visible at bottom */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-black/90 border-t border-primary/30 p-4 z-10 backdrop-blur-sm shadow-lg shadow-black/50">
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
              className="flex-1 bg-black/60 border-white/20 text-white resize-none min-h-[60px] max-h-[120px]"
              rows={2}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || chatLoading || isStreaming}
              className="h-[60px] px-6"
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

