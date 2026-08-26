// =====================================================
// SKILL DETAIL MODAL
// Purpose: Comprehensive skill profile with chatbot editing
// Features: Info, Chat, Progress, Timeline
// =====================================================

import { useState, useEffect, useRef } from 'react';
import { X, Clock, FileText, Users, Building2, MapPin, Image as ImageIcon, ChevronRight, Trophy } from 'lucide-react';
import { readSkillProfile } from '../../lib/skillProfile';
import { cn } from '../../lib/cn';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent } from '../ui/tabs';
import { skillsApi } from '../../api/skills';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import {
  enrichSkillForDemo,
  getMockSkillConnections,
  getMockSkillMilestones,
  getMockSkillPhotos,
  getMockSkillTimeline,
} from '../../mocks/modalDemoData';
import { achievementsApi } from '../../api/achievements';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { organizationStub, projectStub } from '../../lib/skillEntityNavigation';
import { OrganizationDetailModal } from '../organizations/OrganizationDetailModal';
import { ProjectDetailModal } from '../projects/ProjectDetailModal';
import type { Organization } from '../organizations/OrganizationProfileCard';
import type { ProjectCardData } from '../projects/ProjectProfileCard';
import { fetchJson } from '../../lib/api';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import { LazyImage } from '../ui/LazyImage';
import { EntityModalBottomNav } from '../common/EntityModalBottomNav';
import { SkillDetailModalOverview } from './SkillDetailModalOverview';
import {
  SKILL_DETAIL_TABS,
  SkillChatTab,
  SkillConnectionsTab,
  SkillEvidenceTab,
  SkillMetaTab,
  SkillStoryTab,
  SkillTimelineTab,
  type SkillDetailTabKey,
} from './SkillDetailTabPanels';
import { skillCategoryTheme } from '../../lib/skillCategoryTheme';
import {
  capabilityEntityTypeLabel,
  isPrimarySkillBookRecord,
  readSkillOntologyMeta,
} from '../../lib/skillOntology';
import { formatSkillCertaintyDetail, levelLabel, skillCertaintyFieldLabel } from '../../lib/skillStory';
import type { Skill, SkillProgress, SkillMetadata } from '../../types/skill';
import type { Achievement } from '../../types/achievement';
import { skillBookDemoSkills } from '../../mocks/skillBookDemo';
import { EntityLorebookCompileControl } from '../lorebook/EntityLorebookCompileControl';

function demoSkillPeers(): Skill[] {
  const registered = mockDataService.get.skills();
  return registered.length > 0 ? registered : skillBookDemoSkills;
}

type SkillDetailModalProps = {
  skill: Skill;
  onClose: () => void;
  onUpdate?: () => void;
  onNavigateToSkill?: (skillNameOrId: string) => void;
  peerSkills?: Skill[];
};

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

type RelatedPhoto = {
  id: string;
  photoUrl: string;
  thumbnailUrl?: string;
  date: string;
  summary?: string;
  locationName?: string;
  people?: string[];
};

export const SkillDetailModal = ({ skill: initialSkill, onClose, onUpdate, onNavigateToSkill, peerSkills }: SkillDetailModalProps) => {
  const [skill, setSkill] = useState<Skill>(() =>
    shouldUseMockData() ? enrichSkillForDemo(initialSkill, demoSkillPeers()) : initialSkill,
  );
  const [activeTab, setActiveTab] = useState<SkillDetailTabKey>('overview');
  const [showMetaTab, setShowMetaTab] = useState(false);
  const [skillDetails, setSkillDetails] = useState<SkillMetadata | null>(
    () =>
      (shouldUseMockData()
        ? enrichSkillForDemo(initialSkill, demoSkillPeers())
        : initialSkill
      ).metadata?.skill_details || null,
  );
  const [, setLoadingDetails] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { streamChat, isStreaming } = useChatStream();

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
  const [peers, setPeers] = useState<Skill[]>(() => peerSkills ?? (shouldUseMockData() ? demoSkillPeers() : []));
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  
  const { openCharacter, openLocation, openMemory } = useEntityModal();
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectCardData | null>(null);

  const entityNav = {
    onOpenCharacter: (c: { id: string; name: string }) => openCharacter(c),
    onOpenLocation: (l: { id: string; name: string }) => openLocation(l),
    onOpenOrganization: (o: { id: string; name: string }) =>
      setSelectedOrganization(organizationStub(o.id, o.name)),
    onOpenProject: (p: { id: string; name: string }) =>
      setSelectedProject(projectStub(p.id, p.name)),
    onOpenRelatedSkill: (name: string) => {
      if (onNavigateToSkill) {
        onNavigateToSkill(name);
        return;
      }
      openSkillByNameFallback(name);
    },
    onOpenMemory: (mem: { id: string; summary: string; date: string }) =>
      openMemory({ id: mem.id, content: mem.summary, date: mem.date, title: mem.summary }),
  };

  function openSkillByNameFallback(name: string) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem('highlightItem', name);
    window.dispatchEvent(
      new CustomEvent('navigate-surface', { detail: { surface: 'skills' as const } }),
    );
  }

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    void loadSkillDetails();
  }, [skill.id]);

  useEffect(() => {
    if (activeTab === 'connections') {
      void loadConnections();
    }
  }, [activeTab, skill.id, skillDetails]);

  useEffect(() => {
    if (activeTab === 'timeline') {
      void loadTimelineEvents();
    }
    void loadProgressHistory();
  }, [activeTab, skill.id]);

  useEffect(() => {
    if (peerSkills && peerSkills.length > 0) {
      setPeers(peerSkills);
      return;
    }
    if (shouldUseMockData()) {
      setPeers(demoSkillPeers());
      return;
    }
    void skillsApi.getSkills({ active_only: true }).then(setPeers).catch(() => setPeers([]));
  }, [peerSkills, skill.id]);

  const handleMergeSkills = async (sourceId: string, targetId: string) => {
    setMergeBusy(true);
    setMergeError(null);
    try {
      if (shouldUseMockData()) {
        mockDataService.mutate.skills.mergeInto(sourceId, targetId);
        const next = demoSkillPeers().find((row) => row.id === targetId);
        onUpdate?.();
        if (next) {
          setSkill(enrichSkillForDemo(next, demoSkillPeers()));
          setPeers(demoSkillPeers());
        } else {
          onClose();
        }
        return;
      }
      const result = await skillsApi.mergeSkills(sourceId, targetId, 'Merged from skill modal');
      onUpdate?.();
      if (result.skill) {
        setSkill(result.skill);
        const nextPeers = await skillsApi.getSkills({ active_only: true }).catch(() => peers);
        setPeers(nextPeers);
      }
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Failed to merge skills');
    } finally {
      setMergeBusy(false);
    }
  };

  const loadSkillDetails = async () => {
    setLoadingDetails(true);
    try {
      if (shouldUseMockData()) {
        const enriched = enrichSkillForDemo(skill, demoSkillPeers());
        setSkill(enriched);
        setSkillDetails(enriched.metadata?.skill_details || null);
        return;
      }
      const enrichedSkill = await skillsApi.getSkillDetails(skill.id);
      setSkill(enrichedSkill);
      setSkillDetails(enrichedSkill.metadata?.skill_details || null);
    } catch (error) {
      console.error('Failed to load skill details:', error);
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
      if (shouldUseMockData()) {
        const mockProgress: SkillProgress[] = [];
        const now = new Date();
        for (let i = 0; i < 15; i++) {
          const daysAgo = i * 3 + Math.floor(Math.random() * 5);
          const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          const xpGained = Math.floor(Math.random() * 500) + 50;
          const levelBefore = Math.max(1, skill.current_level - Math.floor(i / 3));
          const levelAfter = levelBefore + (i % 3 === 0 && i > 0 ? 1 : 0);

          const sources = ['memory', 'achievement', 'manual', 'practice'];
          const sourceType = sources[Math.floor(Math.random() * sources.length)] as
            | 'memory'
            | 'achievement'
            | 'manual'
            | 'practice';

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
            'Personal project milestone',
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
            created_at: date.toISOString(),
          });
        }
        setProgressHistory(
          mockProgress.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
        );
        return;
      }

      const progress = await skillsApi.getSkillProgress(skill.id, 50);
      setProgressHistory(progress);
    } catch (error) {
      console.error('Failed to load progress history:', error);
      setProgressHistory([]);
    } finally {
      setLoadingProgress(false);
    }
  };

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      if (shouldUseMockData()) {
        const enriched = enrichSkillForDemo(skill, demoSkillPeers());
        const { relatedCharacters, relatedOrganizations } = getMockSkillConnections(enriched);
        setRelatedCharacters(relatedCharacters);
        setRelatedOrganizations(relatedOrganizations);
        return;
      }
      const details = skillDetails ?? skill.metadata?.skill_details ?? null;
      const learnedFrom = (details?.learned_from || []).map((teacher) => ({
        id: teacher.character_id,
        name: teacher.character_name,
        role: teacher.relationship_type,
        relationship: 'Teacher/Mentor',
      }));
      const practicedWith = (details?.practiced_with || []).map((partner) => ({
        id: partner.character_id,
        name: partner.character_name,
        role: 'Practice Partner',
        relationship: `${partner.practice_count} sessions`,
      }));
      setRelatedCharacters([...learnedFrom, ...practicedWith]);

      const jobs = readSkillProfile(skill.metadata)?.related_jobs ?? [];
      setRelatedOrganizations(
        jobs.map((job) => ({
          id: `job-${job.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: job,
          type: 'work',
        })),
      );
    } catch (error) {
      console.error('Failed to load connections:', error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const loadMilestones = async () => {
    setLoadingMilestones(true);
    try {
      if (shouldUseMockData()) {
        setMilestones(getMockSkillMilestones(skill));
        return;
      }
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
      if (shouldUseMockData()) {
        setSkillPhotos(getMockSkillPhotos(skill));
        return;
      }
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
      if (shouldUseMockData()) {
        setTimelineEvents(getMockSkillTimeline(skill));
        return;
      }
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

  const openSkillMainChat = (prompt?: string) => {
    onClose();
    openChatWithFocus({
      entityId: skill.id,
      entityName: skill.skill_name,
      entityType: 'skill',
      sourceSurface: 'skills',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.skills,
      knowledgeScope: 'skill practice, progress, and milestones',
      initialPrompt:
        prompt ??
        `Tell me about my ${skill.skill_name} skill — where I'm at and what to focus on next.`,
    });
  };

  const handleSendMessage = async (messageText: string) => {
    if (!messageText.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
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
${skillCertaintyFieldLabel()}: ${formatSkillCertaintyDetail(skill.confidence_score)}
Active: ${skill.is_active ? 'Yes' : 'No'}
${detailsContext ? `\n\nAdditional Details:\n${detailsContext}` : ''}
      `.trim();

      const systemPrompt = `You are helping the user manage their skill "${skill.skill_name}". You can help them:
- Update skill information
- Track progress and XP
- Answer questions about the skill details (who they learned from, where they practiced, timeline context, etc.)
- Update skill details (e.g., "I learned this from [name]", "I started learning because [reason]")
- Suggest ways to improve
- Review practice history

Current skill details:
${skillContext}

When the user provides information about who they learned from, where they practiced, why they started, or other details, acknowledge it and note that the information will be saved. Be helpful and encouraging.`;

      await streamChat(
        `Context:\n${skillContext}\n\nUser question: ${userMessage.content}`,
        [
          { role: 'user' as const, content: systemPrompt },
          ...chatMessages.map(m => ({ role: m.role, content: m.content }))
        ],
        (chunk: string) => {
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
        () => {},
        async () => {
          setStreamingMessageId(null);
          setChatLoading(false);
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
        (error: string) => {
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
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setChatLoading(false);
      setStreamingMessageId(null);
    }
  };

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

  const profile = readSkillProfile(skill.metadata);
  const theme = skillCategoryTheme(skill.skill_category);
  const visibleTabs = SKILL_DETAIL_TABS.filter((t) => !t.hidden || (t.key === 'meta' && showMetaTab));
  const lastPracticedLabel = skill.last_practiced_at
    ? format(parseISO(skill.last_practiced_at), 'MMM d, yyyy')
    : 'Not yet';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${skill.skill_name} skill details`}
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] border-0 sm:border border-white/10 rounded-none sm:rounded-2xl w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl overflow-hidden flex flex-col shadow-2xl min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — compact on mobile */}
        <div className={cn('relative shrink-0 border-b border-white/8 bg-gradient-to-r', theme.headerGrad)}>
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 flex items-center gap-1.5">
            <EntityLorebookCompileControl
              subjectLabel={skill.skill_name}
              focus={{ skillId: skill.id, themes: skill.skill_name }}
              testId="skill-modal-lorebook-compile"
              className="hidden sm:inline-flex"
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="sm:hidden px-3 py-1.5 pr-11 min-w-0"
            style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn('rounded-lg border p-1 shrink-0', theme.statBg, theme.statBorder)}>
                <Trophy className={cn('h-3.5 w-3.5', theme.icon)} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white truncate leading-tight">{skill.skill_name}</h2>
                <p className="text-[10px] text-white/45 truncate mt-0.5">
                  {levelLabel(skill.current_level)} · {Math.round(levelProgress)}% · {skill.practice_count} conversations
                  {!isPrimarySkillBookRecord(skill) && (
                    <span className="text-amber-200/80">
                      {' '}
                      · {capabilityEntityTypeLabel(readSkillOntologyMeta(skill.metadata).capabilityEntityType)}
                    </span>
                  )}
                </p>
                <div className="mt-1.5 sm:hidden">
                  <EntityLorebookCompileControl
                    subjectLabel={skill.skill_name}
                    focus={{ skillId: skill.id, themes: skill.skill_name }}
                    testId="skill-modal-lorebook-compile-mobile"
                  />
                </div>
              </div>
            </div>
            <div className={cn('mt-1.5 h-1 rounded-full overflow-hidden', theme.progressTrack)}>
              <div className={cn('h-full bg-gradient-to-r rounded-full transition-all', theme.progress)} style={{ width: `${levelProgress}%` }} />
            </div>
          </div>

          <div className="hidden sm:block px-5 py-4 pr-14">
            <div className="flex items-start gap-3">
              <div className={cn('rounded-xl border p-2 shrink-0', theme.statBg, theme.statBorder)}>
                <Trophy className={cn('h-5 w-5', theme.icon)} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-white">{skill.skill_name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge className={cn('text-xs capitalize border', theme.badge)}>{skill.skill_category}</Badge>
                  <Badge variant="outline" className={cn('text-xs border', theme.chip)}>Level {skill.current_level}</Badge>
                  {!isPrimarySkillBookRecord(skill) && (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-500/40 bg-amber-500/10 text-amber-100"
                      title={readSkillOntologyMeta(skill.metadata).migrationReason}
                    >
                      {capabilityEntityTypeLabel(readSkillOntologyMeta(skill.metadata).capabilityEntityType)}
                    </Badge>
                  )}
                  <span className="text-xs text-white/40">{skill.practice_count} sessions · Last {lastPracticedLabel}</span>
                  {skill.auto_detected && (
                    <Badge variant="outline" className="text-xs bg-purple-500/20 border-purple-500/50 text-purple-300">Auto-detected</Badge>
                  )}
                </div>
                <div className="mt-3 max-w-md">
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>Progress to level {skill.current_level + 1}</span>
                    <span className={cn('font-medium', theme.accentText)}>{Math.round(levelProgress)}%</span>
                  </div>
                  <div className={cn('h-2 rounded-full overflow-hidden', theme.progressTrack)}>
                    <div className={cn('h-full bg-gradient-to-r rounded-full', theme.progress)} style={{ width: `${levelProgress}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab nav — desktop only; mobile uses the bottom nav */}
        <nav className="hidden sm:block shrink-0 border-b border-white/8 px-1 sm:px-3 pt-1 pb-1 sm:pt-2" aria-label="Skill sections">
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5 snap-x snap-mandatory">
            {visibleTabs.map(({ key, label, shortLabel, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex shrink-0 snap-start flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[3.25rem] text-[9px] sm:text-[10px] font-medium rounded-lg border transition-colors touch-manipulation',
                  activeTab === key
                    ? cn(theme.statBg, theme.accentText, theme.border)
                    : 'text-white/40 border-transparent hover:text-white/65 hover:bg-white/[0.04]',
                )}
                aria-current={activeTab === key ? 'page' : undefined}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[4rem] leading-tight">
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            ))}
          </div>
          {!showMetaTab && (
            <button
              type="button"
              onClick={() => {
                setShowMetaTab(true);
                setActiveTab('meta');
              }}
              className="text-[9px] text-white/25 hover:text-white/45 px-2 py-0.5"
            >
              Show debug
            </button>
          )}
        </nav>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SkillDetailTabKey)} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          <div
            ref={contentRef}
            className="flex-1 min-h-0 min-w-0 touch-pan-y [-webkit-overflow-scrolling:touch] overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 py-3 sm:py-4 pb-4"
          >
            <TabsContent value="overview" className="mt-0 space-y-3 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillDetailModalOverview
                skill={skill}
                skillDetails={skillDetails}
                levelProgress={levelProgress}
                xpInCurrentLevel={xpInCurrentLevel}
                xpNeededForLevel={xpNeededForLevel}
                progressHistory={progressHistory}
                loadingProgress={loadingProgress}
                profile={profile}
                nav={entityNav}
                onOpenChatTab={() => setActiveTab('chat')}
                peerSkills={peers}
                mergeBusy={mergeBusy}
                mergeError={mergeError}
                onMergeSkills={(sourceId, targetId) => void handleMergeSkills(sourceId, targetId)}
              />
            </TabsContent>

            <TabsContent value="chat" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillChatTab skill={skill} onOpenMainChat={openSkillMainChat} />
            </TabsContent>

            <TabsContent value="story" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillStoryTab skill={skill} profile={profile} details={skillDetails} theme={theme} nav={entityNav} />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillTimelineTab
                skill={skill}
                profile={profile}
                details={skillDetails}
                theme={theme}
                nav={entityNav}
                loading={loadingTimeline}
                practiceEvents={timelineEvents}
                onEventSelect={(ev) => {
                  if (ev.laneKey === 'practice') {
                    entityNav.onOpenMemory?.({
                      id: ev.id,
                      summary: ev.summary ?? ev.title,
                      date: ev.date,
                    });
                  }
                }}
              />
            </TabsContent>

            <TabsContent value="evidence" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillEvidenceTab skill={skill} profile={profile} details={skillDetails} theme={theme} nav={entityNav} />
            </TabsContent>

            <TabsContent value="connections" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              {loadingConnections ? (
                <p className="text-center py-8 text-white/60 text-sm">Loading connections…</p>
              ) : (
                <SkillConnectionsTab
                  skill={skill}
                  profile={profile}
                  details={skillDetails}
                  theme={theme}
                  relatedCharacters={relatedCharacters}
                  relatedOrganizations={relatedOrganizations}
                  nav={entityNav}
                />
              )}
            </TabsContent>

            <TabsContent value="meta" className="mt-0 min-w-0 w-full max-w-full data-[state=inactive]:hidden">
              <SkillMetaTab skill={skill} />
            </TabsContent>
          </div>
        </Tabs>

        <EntityModalBottomNav
          tabs={visibleTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Skill sections"
        />
      </div>

      {selectedOrganization && (
        <OrganizationDetailModal
          organization={selectedOrganization}
          onClose={() => setSelectedOrganization(null)}
        />
      )}

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onPatch={async () => {}}
        />
      )}
    </div>
  );
};
