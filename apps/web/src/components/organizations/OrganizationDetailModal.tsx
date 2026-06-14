// =====================================================
// ORGANIZATION DETAIL MODAL
// Purpose: Comprehensive organization profile with chatbot editing
// Features: Info, Chat, Members, Stories, Events, Locations, Timeline
// =====================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Users, BookOpen, Calendar, MapPin, MessageSquare, Clock, FileText, Building2, Plus, Edit2, Trash2, Sparkles, TrendingUp, TrendingDown, Minus, Award, Star, Info, Loader2, Link2, ArrowRight, ArrowLeft, Brain, TreePine } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Modal } from '../ui/modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { LocationDetailModal } from '../locations/LocationDetailModal';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { schedulePostChatRefresh, onStoryDataUpdated } from '../../lib/storyRefresh';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { EventTimelineSwimlanes, type SwimlaneEvent } from '../timeline/EventTimelineSwimlanes';
import { OrganizationProfilePanel } from './OrganizationProfilePanel';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { OrganizationGroupNetwork } from './OrganizationGroupNetwork';
import type { Organization, OrganizationMember, OrganizationStory, OrganizationEvent, OrganizationLocation, OrganizationRelationship, OrgRelationshipType } from './OrganizationProfileCard';
import type { Character } from '../characters/CharacterProfileCard';
import type { LocationProfile } from '../locations/LocationProfileCard';

type OrganizationDetailModalProps = {
  organization: Organization;
  onClose: () => void;
  onUpdate?: () => void;
};

type TabKey = 'info' | 'chat' | 'members' | 'stories' | 'events' | 'locations' | 'relationships' | 'timeline' | 'family';

// Events & locations inferred from the group's members across chat threads /
// journal entries (served by GET /api/organizations/:id/derived-context).
type DerivedEvent = {
  id: string;
  title: string;
  date: string | null;
  type: string;
  summary?: string;
  involved: string[];
  user_was_present?: boolean;
  audience?: 'with_user' | 'without_user' | 'group_wide';
  scope?: 'direct' | 'subgroup' | 'hierarchy';
  subgroup_names?: string[];
  source: 'conversation';
};

type DerivedHierarchyNode = {
  id: string;
  name: string;
  group_type?: string;
  relationship_type?: OrgRelationshipType;
  member_count?: number;
  inferred?: boolean;
};

type DerivedHierarchy = {
  parent?: DerivedHierarchyNode;
  subgroups: DerivedHierarchyNode[];
  related: DerivedHierarchyNode[];
};

type DerivedLocation = {
  id: string;
  name: string;
  type?: string;
  importance_score?: number;
  involved: string[];
  source: 'conversation';
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

const REL_TYPE_LABELS: Record<OrgRelationshipType, string> = {
  part_of: 'Part of',
  affiliated_with: 'Affiliated with',
  rival_of: 'Rival of',
  spawned_from: 'Spawned from',
  collaborated_with: 'Collaborated with',
  succeeded_by: 'Succeeded by',
  merged_with: 'Merged with',
};

const AUDIENCE_LABELS: Record<NonNullable<DerivedEvent['audience']>, string> = {
  with_user: 'With you',
  without_user: 'Without you',
  group_wide: 'Group-wide',
};

const AUDIENCE_BADGE: Record<NonNullable<DerivedEvent['audience']>, string> = {
  with_user: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  without_user: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  group_wide: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

const ORG_REL_TYPE_OPTIONS = Object.keys(REL_TYPE_LABELS) as OrgRelationshipType[];

const BASE_TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Info', icon: FileText },
  { key: 'chat', label: 'Knowledge Chat', icon: Brain },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'stories', label: 'Stories', icon: BookOpen },
  { key: 'events', label: 'Events', icon: Calendar },
  { key: 'locations', label: 'Locations', icon: MapPin },
  { key: 'relationships', label: 'Relationships', icon: Link2 },
  { key: 'timeline', label: 'Timeline', icon: Clock },
];

export const OrganizationDetailModal = ({ organization, onClose, onUpdate }: OrganizationDetailModalProps) => {
  const [editedOrg, setEditedOrg] = useState<Organization>(organization);
  const tabs = useMemo(() => {
    const list = [...BASE_TABS];
    if (editedOrg.group_type === 'family') {
      list.splice(4, 0, { key: 'family', label: 'Family Tree', icon: TreePine });
    }
    return list;
  }, [editedOrg.group_type]);
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

  // Members state
  const [members, setMembers] = useState<OrganizationMember[]>(organization.members || []);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ character_name: '', role: '', status: 'active' as const });

  // Stories state
  const [stories, setStories] = useState<OrganizationStory[]>(organization.stories || []);
  const [showAddStory, setShowAddStory] = useState(false);
  const [newStory, setNewStory] = useState({ title: '', summary: '', date: new Date().toISOString().split('T')[0] });
  const [storyLoading, setStoryLoading] = useState(false);

  // Events state
  const [events, setEvents] = useState<OrganizationEvent[]>(organization.events || []);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: new Date().toISOString().split('T')[0], type: 'other' as OrganizationEvent['type'] });
  const [eventLoading, setEventLoading] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<OrganizationLocation[]>(organization.locations || []);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ location_name: '' });
  const [locationLoading, setLocationLoading] = useState(false);

  // Conversation-derived events & locations (auto-extracted from chat threads)
  const [derivedEvents, setDerivedEvents] = useState<DerivedEvent[]>([]);
  const [derivedLocations, setDerivedLocations] = useState<DerivedLocation[]>([]);
  const [derivedHierarchy, setDerivedHierarchy] = useState<DerivedHierarchy>({ subgroups: [], related: [] });
  const [derivedLoading, setDerivedLoading] = useState(false);
  const [derivedLoaded, setDerivedLoaded] = useState(false);
  const [familyRefreshKey, setFamilyRefreshKey] = useState(0);
  const [memberAffiliations, setMemberAffiliations] = useState<
    Record<string, Array<{ id: string; name: string; group_type?: string }>>
  >({});
  const [affiliationsLoading, setAffiliationsLoading] = useState(false);

  // Relationships state
  const [relationships, setRelationships] = useState<OrganizationRelationship[]>([]);
  const [relationshipsLoaded, setRelationshipsLoaded] = useState(false);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [reconcilingRelationships, setReconcilingRelationships] = useState(false);
  const [relatedOrgs, setRelatedOrgs] = useState<Organization[]>([]);
  const [showAddRelationship, setShowAddRelationship] = useState(false);
  const [newRelationship, setNewRelationship] = useState<{ to_org_id: string; relationship_type: OrgRelationshipType; notes: string }>({
    to_org_id: '',
    relationship_type: 'affiliated_with',
    notes: '',
  });
  const [relationshipSaving, setRelationshipSaving] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Knowledge / entity facts state
  const [orgFacts, setOrgFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsLoaded, setFactsLoaded] = useState(false);

  // Modal states for nested entities
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedLinkedOrg, setSelectedLinkedOrg] = useState<Organization | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  
  useEffect(() => {
    if (activeTab === 'chat' && chatMessages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm here to help you discuss **${organization.name}** using what LoreBook already knows.\n\nYou can ask about known facts, correct details, add members, record stories/events, link locations, or explain how this group fits into your life.\n\nWhat should we focus on?`,
        timestamp: new Date()
      };
      setChatMessages([welcomeMessage]);
    }
  }, [activeTab, organization.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingMessageId]);

  useEffect(() => {
    if (activeTab === 'relationships' && !relationshipsLoaded) {
      void loadRelationships();
    }
  }, [activeTab, relationshipsLoaded]);

  useEffect(() => {
    if ((activeTab !== 'events' && activeTab !== 'locations' && activeTab !== 'timeline' && activeTab !== 'relationships') || derivedLoaded || !organization.id) return;
    setDerivedLoading(true);
    fetchJson<{ success: boolean; events: DerivedEvent[]; locations: DerivedLocation[]; hierarchy?: DerivedHierarchy }>(
      `/api/organizations/${organization.id}/derived-context`
    )
      .then(r => {
        if (r.success) {
          setDerivedEvents(r.events || []);
          setDerivedLocations(r.locations || []);
          setDerivedHierarchy(r.hierarchy ?? { subgroups: [], related: [] });
        }
      })
      .catch(() => {})
      .finally(() => { setDerivedLoading(false); setDerivedLoaded(true); });
  }, [activeTab, organization.id, derivedLoaded]);

  useEffect(() => {
    if (activeTab !== 'chat' || factsLoaded || !organization.id) return;
    setFactsLoading(true);
    fetchJson<{ success: boolean; facts: any[] }>(`/api/organizations/${organization.id}/facts`)
      .then(r => { if (r.success) setOrgFacts(r.facts); })
      .catch(() => {})
      .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
  }, [activeTab, organization.id, factsLoaded]);

  const loadMemberAffiliations = async () => {
    if (!organization.id || organization.id.startsWith('org-')) return;
    setAffiliationsLoading(true);
    try {
      const r = await fetchJson<{
        success: boolean;
        affiliations: Record<string, Array<{ id: string; name: string; group_type?: string }>>;
      }>(`/api/family-trees/organization/${organization.id}/member-affiliations`);
      if (r.success) setMemberAffiliations(r.affiliations ?? {});
    } catch {
      setMemberAffiliations({});
    } finally {
      setAffiliationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'members') void loadMemberAffiliations();
  }, [activeTab, organization.id, members.length]);

  useEffect(() => {
    return onStoryDataUpdated(() => {
      setDerivedLoaded(false);
      setFamilyRefreshKey(k => k + 1);
      setRelationshipsLoaded(false);
      void loadMemberAffiliations();
    });
  }, [organization.id]);

  const loadRelationships = async () => {
    setRelationshipsLoading(true);
    try {
      const [relResult, orgResult] = await Promise.all([
        fetchJson<{ success: boolean; relationships: OrganizationRelationship[] }>(
          `/api/organizations/${organization.id}/relationships`
        ),
        fetchJson<{ success: boolean; organizations: Organization[] }>('/api/organizations'),
      ]);
      setRelationships(relResult.relationships || []);
      setRelatedOrgs((orgResult.organizations || []).filter(o => o.id !== organization.id));
    } catch (error) {
      console.error('Failed to load relationships:', error);
    } finally {
      setRelationshipsLoaded(true);
      setRelationshipsLoading(false);
    }
  };

  const orgNameById = (id: string): string => {
    if (id === organization.id) return organization.name;
    return relatedOrgs.find(o => o.id === id)?.name || 'Unknown organization';
  };

  const openLinkedOrg = (orgId: string) => {
    void fetchJson<{ success: boolean; organization: Organization }>(`/api/organizations/${orgId}`)
      .then(r => { if (r.success && r.organization) setSelectedLinkedOrg(r.organization); })
      .catch(() => {});
  };

  const handleReconcileRelationships = async () => {
    setReconcilingRelationships(true);
    try {
      await fetchJson('/api/organizations/reconcile-relationships', { method: 'POST', body: JSON.stringify({}) });
      setRelationshipsLoaded(false);
      setDerivedLoaded(false);
      await loadRelationships();
    } catch (error) {
      console.error('Failed to reconcile relationships:', error);
    } finally {
      setReconcilingRelationships(false);
    }
  };

  const laneKeyForEvent = (e: DerivedEvent): string => {
    if (e.audience === 'with_user' || e.user_was_present) return 'with';
    if (e.audience === 'group_wide') return 'group_wide';
    return 'without';
  };

  const handleAddRelationship = async () => {
    if (!newRelationship.to_org_id) return;
    setRelationshipSaving(true);
    try {
      const result = await fetchJson<{ success: boolean; relationship: OrganizationRelationship }>(
        `/api/organizations/${organization.id}/relationships`,
        {
          method: 'POST',
          body: JSON.stringify({
            to_org_id: newRelationship.to_org_id,
            relationship_type: newRelationship.relationship_type,
            notes: newRelationship.notes || undefined,
          }),
        }
      );
      if (result.success) {
        setRelationships(prev => [result.relationship, ...prev]);
        setNewRelationship({ to_org_id: '', relationship_type: 'affiliated_with', notes: '' });
        setShowAddRelationship(false);
      }
    } catch (error) {
      console.error('Failed to add relationship:', error);
    } finally {
      setRelationshipSaving(false);
    }
  };

  const handleRemoveRelationship = async (relationshipId: string) => {
    setRelationships(prev => prev.filter(r => r.id !== relationshipId));
    try {
      await fetchJson(`/api/organizations/${organization.id}/relationships/${relationshipId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove relationship:', error);
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'friend_group': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      'company': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
      'sports_team': 'bg-green-500/20 text-green-400 border-green-500/40',
      'club': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      'nonprofit': 'bg-pink-500/20 text-pink-400 border-pink-500/40',
      'affiliation': 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      'other': 'bg-gray-500/20 text-gray-400 border-gray-500/40',
    };
    return colors[type] || colors['other'];
  };

  const getTypeLabel = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        name: editedOrg.name,
        aliases: editedOrg.aliases,
        type: editedOrg.type,
        description: editedOrg.description,
        location: editedOrg.location,
        founded_date: editedOrg.founded_date,
        status: editedOrg.status,
      };

      await fetchJson(`/api/organizations/${organization.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      onUpdate?.();
    } catch (error) {
      console.error('Failed to save organization:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatLoading || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');
    setChatLoading(true);

    try {
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      setStreamingMessageId(assistantMessageId);

      // Build organization context with analytics
      const analyticsContext = editedOrg.analytics ? `
GROUP ANALYTICS (calculated from conversations, journal entries, and events):
- Your Involvement: ${editedOrg.analytics.user_involvement_score}/100 (how involved you are)
- Your Ranking: #${editedOrg.analytics.user_ranking} (your position in the group)
- Your Role Importance: ${editedOrg.analytics.user_role_importance}/100 (importance of your role)
- Relevance Score: ${editedOrg.analytics.relevance_score}/100 (how relevant the group is to you)
- Priority Score: ${editedOrg.analytics.priority_score}/100 (priority level)
- Importance Score: ${editedOrg.analytics.importance_score}/100 (overall importance to you)
- Value Score: ${editedOrg.analytics.value_score}/100 (value the group provides)
- Group Influence on You: ${editedOrg.analytics.group_influence_on_user}/100
- Your Influence Over Group: ${editedOrg.analytics.user_influence_over_group}/100
- Cohesion Score: ${editedOrg.analytics.cohesion_score}/100 (how tight-knit the group is)
- Activity Level: ${editedOrg.analytics.activity_level}/100 (how active the group is)
- Engagement Score: ${editedOrg.analytics.engagement_score}/100
- Recency Score: ${editedOrg.analytics.recency_score}/100 (how recently active)
- Frequency Score: ${editedOrg.analytics.frequency_score}/100 (how frequently mentioned)
- Group Trend: ${editedOrg.analytics.trend} (increasing/stable/decreasing)
${editedOrg.analytics.strengths && editedOrg.analytics.strengths.length > 0 ? `- Strengths: ${editedOrg.analytics.strengths.join(', ')}` : ''}
${editedOrg.analytics.weaknesses && editedOrg.analytics.weaknesses.length > 0 ? `- Weaknesses: ${editedOrg.analytics.weaknesses.join(', ')}` : ''}
${editedOrg.analytics.opportunities && editedOrg.analytics.opportunities.length > 0 ? `- Opportunities: ${editedOrg.analytics.opportunities.join(', ')}` : ''}
${editedOrg.analytics.threats && editedOrg.analytics.threats.length > 0 ? `- Threats: ${editedOrg.analytics.threats.join(', ')}` : ''}

You can explain these analytics to the user when asked. For example:
- "Your involvement score of ${editedOrg.analytics.user_involvement_score}% indicates ${editedOrg.analytics.user_involvement_score >= 70 ? 'you are very actively involved' : editedOrg.analytics.user_involvement_score >= 40 ? 'you have moderate involvement' : 'your involvement is developing'}"
- "As ranking #${editedOrg.analytics.user_ranking}, you are ${editedOrg.analytics.user_ranking === 1 ? 'the most active member' : editedOrg.analytics.user_ranking <= 3 ? 'among the top active members' : 'a contributing member'}"
- "The group trend is ${editedOrg.analytics.trend}, meaning ${editedOrg.analytics.trend === 'increasing' ? 'the group is becoming more active' : editedOrg.analytics.trend === 'decreasing' ? 'the group activity may be declining' : 'the group activity is stable'}"
- "With a cohesion score of ${editedOrg.analytics.cohesion_score}%, this group ${editedOrg.analytics.cohesion_score >= 70 ? 'is very tight-knit' : editedOrg.analytics.cohesion_score >= 40 ? 'has moderate cohesion' : 'may have lower cohesion'}"
` : '';

      // Build organization context
      const knownFactsContext = orgFacts.length > 0
        ? `
KNOWN FACTS ABOUT THIS ORGANIZATION:
${orgFacts.slice(0, 30).map((fact: any) => {
  const confidence = Math.round((fact.confidence ?? 0.7) * 100);
  const category = fact.category ? `[${fact.category}] ` : '';
  return `- ${category}${fact.fact} (${confidence}% confidence${fact.status ? `, ${fact.status}` : ''})`;
}).join('\n')}
`
        : '\nKNOWN FACTS ABOUT THIS ORGANIZATION: No extracted facts yet. Use the conversation to clarify and build them.\n';

      const orgContext = `You are helping the user discuss and update information about an organization in their personal journal system.

ORGANIZATION CONTEXT:
- Name: ${editedOrg.name}
- Type: ${getTypeLabel(editedOrg.type)}
- Description: ${editedOrg.description || 'No description'}
- Status: ${editedOrg.status}
- Location: ${editedOrg.location || 'Not specified'}
- Founded: ${editedOrg.founded_date ? formatDate(editedOrg.founded_date) : 'Unknown'}
- Members: ${members.map(m => `${m.character_name}${m.role ? ` (${m.role})` : ''}`).join(', ') || 'None'}
${derivedHierarchy.parent ? `- Part of (parent group): ${derivedHierarchy.parent.name}` : ''}
${derivedHierarchy.subgroups.length > 0 ? `- Subgroups: ${derivedHierarchy.subgroups.map(s => s.name).join(', ')}` : ''}
${derivedHierarchy.related.length > 0 ? `- Related groups: ${derivedHierarchy.related.map(r => `${r.name} (${REL_TYPE_LABELS[r.relationship_type ?? 'affiliated_with']})`).join(', ')}` : ''}
- Stories: ${stories.length} recorded
- Events: ${events.length} recorded
- Locations: ${locations.map(l => l.location_name).join(', ') || 'None'}
${knownFactsContext}
${analyticsContext}
INSTRUCTIONS:
1. Answer questions about this organization naturally
2. Use the known facts as context, but call out uncertainty when confidence is low or a fact may be stale
3. If user mentions new members, offer to add them: "I can add [name] as a member. What role should they have?"
4. If user shares stories/events, acknowledge and offer to record them
5. If user wants to update info (description, location, etc.), extract the update and confirm
6. Be conversational and helpful
7. When updates are needed, format them as JSON in your response: {"updates": {"description": "...", "members": [...]}}
8. If the user asks about analytics, explain what the scores mean and why they might be at that level
9. Use analytics to provide insights about involvement, importance, and group dynamics

User's message: ${currentInput}`;

      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Prepend context to the message for the backend to use
      const contextualMessage = `${orgContext}\n\nUser's message: ${currentInput}`;
      
      let accumulatedContent = '';

      await streamChat(
        contextualMessage,
        conversationHistory,
        (chunk: string) => {
          accumulatedContent += chunk;
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: accumulatedContent }
                : msg
            )
          );
        },
        () => {},
        async () => {
          setStreamingMessageId(null);
          setChatLoading(false);
          
          // Extract JSON updates from the response and PERSIST them (not just
          // local state) so the chatbot can actually CRUD the organization.
          try {
            const jsonMatch = accumulatedContent.match(/\{[\s\S]*"updates"[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.updates) {
                const { members: newMembers, ...scalars } = parsed.updates as Record<string, any>;
                const persistable = Boolean(organization.id) && !organization.id.startsWith('org-');

                // Scalar fields → optimistic local update + PATCH.
                if (Object.keys(scalars).length > 0) {
                  setEditedOrg(prev => ({ ...prev, ...scalars }));
                  const allowed = ['name', 'description', 'location', 'founded_date', 'status', 'aliases', 'type', 'group_type'];
                  const patch: Record<string, any> = {};
                  for (const k of allowed) if (k in scalars) patch[k] = scalars[k];
                  if (persistable && Object.keys(patch).length > 0) {
                    try {
                      await fetchJson(`/api/organizations/${organization.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(patch),
                      });
                    } catch (err) {
                      console.error('Failed to persist org updates from chat:', err);
                    }
                  }
                }

                // New members → optimistic add + POST (skip existing by name).
                if (Array.isArray(newMembers)) {
                  for (const raw of newMembers) {
                    const name = typeof raw === 'string' ? raw : (raw?.character_name || raw?.name);
                    if (!name?.trim()) continue;
                    if (members.some(m => m.character_name.toLowerCase() === name.toLowerCase())) continue;
                    const member: OrganizationMember = {
                      id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      character_name: name,
                      role: typeof raw === 'object' ? raw?.role : undefined,
                      status: 'active',
                    };
                    setMembers(prev => [...prev, member]);
                    if (persistable) {
                      try {
                        await fetchJson(`/api/organizations/${organization.id}/members`, {
                          method: 'POST',
                          body: JSON.stringify(member),
                        });
                      } catch (err) {
                        console.error('Failed to persist member from chat:', err);
                      }
                    }
                  }
                }
              }
            }
          } catch {
            // No parseable updates in the response — nothing to persist.
          }
          schedulePostChatRefresh({
            scopes: ['all'],
            organizationIds: organization.id ? [organization.id] : undefined,
          });
        },
        (error: string) => {
          setStreamingMessageId(null);
          setChatLoading(false);
          setChatMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${error}` }
                : msg
            )
          );
        }
      );
    } catch (error) {
      console.error('Failed to send chat message:', error);
      setChatLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.character_name.trim()) return;

    const member: OrganizationMember = {
      id: `member-${Date.now()}`,
      character_name: newMember.character_name,
      role: newMember.role || undefined,
      status: newMember.status,
    };

    setMembers(prev => [...prev, member]);
    setNewMember({ character_name: '', role: '', status: 'active' });
    setShowAddMember(false);

    // TODO: Save to backend
    try {
      await fetchJson(`/api/organizations/${organization.id}/members`, {
        method: 'POST',
        body: JSON.stringify(member),
      });
    } catch (error) {
      console.error('Failed to add member:', error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    try {
      await fetchJson(`/api/organizations/${organization.id}/members/${memberId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const handleAddEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    setEventLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; event: OrganizationEvent }>(
        `/api/organizations/${organization.id}/events`,
        { method: 'POST', body: JSON.stringify(newEvent) }
      );
      if (result.success) {
        setEvents(prev => [result.event, ...prev]);
        setNewEvent({ title: '', date: new Date().toISOString().split('T')[0], type: 'other' });
        setShowAddEvent(false);
      }
    } catch (error) {
      console.error('Failed to add event:', error);
    } finally {
      setEventLoading(false);
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
    try {
      await fetchJson(`/api/organizations/${organization.id}/events/${eventId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove event:', error);
    }
  };

  const handleAddStory = async () => {
    if (!newStory.title.trim() || !newStory.summary.trim() || !newStory.date) return;
    setStoryLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; story: OrganizationStory }>(
        `/api/organizations/${organization.id}/stories`,
        { method: 'POST', body: JSON.stringify(newStory) }
      );
      if (result.success) {
        setStories(prev => [result.story, ...prev]);
        setNewStory({ title: '', summary: '', date: new Date().toISOString().split('T')[0] });
        setShowAddStory(false);
      }
    } catch (error) {
      console.error('Failed to add story:', error);
    } finally {
      setStoryLoading(false);
    }
  };

  const handleRemoveStory = async (storyId: string) => {
    setStories(prev => prev.filter(s => s.id !== storyId));
    try {
      await fetchJson(`/api/organizations/${organization.id}/stories/${storyId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove story:', error);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.location_name.trim()) return;
    setLocationLoading(true);
    try {
      const result = await fetchJson<{ success: boolean; location: OrganizationLocation }>(
        `/api/organizations/${organization.id}/locations`,
        { method: 'POST', body: JSON.stringify(newLocation) }
      );
      if (result.success) {
        setLocations(prev => [result.location, ...prev]);
        setNewLocation({ location_name: '' });
        setShowAddLocation(false);
      }
    } catch (error) {
      console.error('Failed to add location:', error);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleRemoveLocation = async (locationId: string) => {
    setLocations(prev => prev.filter(l => l.id !== locationId));
    try {
      await fetchJson(`/api/organizations/${organization.id}/locations/${locationId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to remove location:', error);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${organization.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/organizations/${organization.id}`, { method: 'DELETE' });
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete organization:', error);
      setDeleting(false);
    }
  };

  return (
    <>
    <Modal isOpen={true} onClose={onClose} size="xl">
      <div className="flex flex-col h-full max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <Building2 className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{editedOrg.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getTypeColor(editedOrg.type)}>
                  {getTypeLabel(editedOrg.type)}
                </Badge>
                <Badge variant="outline" className={editedOrg.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-gray-500/20 text-gray-400 border-gray-500/40'}>
                  {editedOrg.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-border/50">
            {/* Wrapping, auto-height tab bar so every tab stays fully visible
                (no horizontal scroll / clipped labels), with a clear active state. */}
            <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1.5 bg-black/40 p-1.5">
              {tabs.map(tab => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm text-white/55 hover:text-white/80 data-[state=active]:bg-purple-500/25 data-[state=active]:text-white data-[state=active]:border data-[state=active]:border-purple-400/40 data-[state=active]:shadow-sm rounded-md"
                >
                  <tab.icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* Info Tab */}
            <TabsContent value="info" className="space-y-6 mt-4">
              {/* Read-Only Notice */}
              <Card className="bg-gradient-to-r from-purple-500/20 via-purple-600/15 to-purple-500/20 border-2 border-purple-500/40 shadow-lg shadow-purple-500/10">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/40">
                      <Info className="h-6 w-6 text-purple-300 flex-shrink-0" />
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-bold text-purple-200 mb-2">Organization Information is Read-Only</p>
                      <p className="text-sm text-purple-100/90 leading-relaxed">
                        Organization information is automatically updated through conversations. To update this organization's information, use the Chat tab to tell the system about them.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Basic Information - Enhanced Read-Only Display */}
              <Card className="bg-gradient-to-br from-black/80 via-black/60 to-black/80 border-2 border-primary/30 shadow-xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20 border border-primary/40">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Basic Information</h3>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Name Section */}
                  <div>
                    <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Organization Name</label>
                    <div className="bg-gradient-to-r from-primary/20 to-primary/10 border-2 border-primary/40 rounded-lg px-4 py-3 text-white text-lg min-h-[52px] flex items-center font-bold shadow-lg">
                      {editedOrg.name}
                    </div>
                  </div>

                  {/* Type and Status */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Type</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 min-h-[52px] flex items-center shadow-inner">
                        <Badge variant="outline" className={getTypeColor(editedOrg.type)}>
                          {getTypeLabel(editedOrg.type)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Status</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 min-h-[52px] flex items-center shadow-inner">
                        <Badge 
                          variant="outline" 
                          className={editedOrg.status === 'active' 
                            ? 'bg-green-500/20 text-green-300 border-green-500/40 text-sm px-4 py-2 font-semibold shadow-md' 
                            : editedOrg.status === 'inactive'
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 text-sm px-4 py-2 font-semibold shadow-md'
                            : 'bg-gray-500/20 text-gray-300 border-gray-500/40 text-sm px-4 py-2 font-semibold shadow-md'
                          }
                        >
                          {editedOrg.status === 'active' ? 'Active' : editedOrg.status === 'inactive' ? 'Inactive' : 'Dissolved'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Description Section */}
                  <div>
                    <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Description</label>
                    <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-4 text-white text-base min-h-[120px] flex items-start font-medium shadow-inner">
                      {editedOrg.description ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{editedOrg.description}</p>
                      ) : (
                        <span className="text-white/40 italic">No description available yet. Information will appear here as you talk about this organization.</span>
                      )}
                    </div>
                  </div>

                  {/* Location and Founded Date */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Location</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-base min-h-[48px] flex items-center font-medium shadow-inner">
                        {editedOrg.location || <span className="text-white/40 italic">Not specified</span>}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Founded Date</label>
                      <div className="bg-black/80 border-2 border-border/60 rounded-lg px-4 py-3 text-white text-base min-h-[48px] flex items-center font-medium shadow-inner">
                        {editedOrg.founded_date 
                          ? new Date(editedOrg.founded_date).toLocaleDateString('en-US', {
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : <span className="text-white/40 italic">Not specified</span>
                        }
                      </div>
                    </div>
                  </div>

                  {/* Aliases */}
                  {editedOrg.aliases && editedOrg.aliases.length > 0 && (
                    <div>
                      <label className="text-sm font-bold text-white/80 mb-3 block uppercase tracking-wide">Aliases</label>
                      <div className="flex flex-wrap gap-3">
                        {editedOrg.aliases.map((alias) => (
                          <Badge key={alias} variant="outline" className="bg-primary/20 text-primary border-primary/40 text-sm px-4 py-2 font-semibold shadow-md">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* G1 Intelligence Panel */}
              <Card className="bg-black/40 border border-purple-500/30">
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    Group Intelligence
                  </h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Your Relationship */}
                    <div>
                      <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Your Relationship</p>
                      <Badge variant="outline" className={(() => {
                        const r = editedOrg.user_relationship;
                        if (['founder','leader'].includes(r)) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                        if (r === 'member') return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
                        if (r === 'former_member' || r === 'alumnus') return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
                        if (['adjacent','collaborator'].includes(r)) return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
                        if (r === 'fan') return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
                        return 'bg-white/10 text-white/50 border-white/20';
                      })()}>
                        {editedOrg.user_relationship?.replace(/_/g, ' ')}
                      </Badge>
                    </div>

                    {/* Membership Model */}
                    <div>
                      <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Membership</p>
                      <Badge variant="outline" className={
                        editedOrg.membership_model === 'strict' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                        editedOrg.membership_model === 'fuzzy' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                        'bg-gray-500/20 text-gray-300 border-gray-500/30'
                      }>
                        {editedOrg.membership_model === 'strict' ? 'Defined roster' :
                         editedOrg.membership_model === 'fuzzy' ? 'Participatory' :
                         'Reference only'}
                      </Badge>
                    </div>

                    {/* Group Type (canonical) */}
                    <div>
                      <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Group Type</p>
                      <Badge variant="outline" className="bg-white/10 text-white/60 border-white/20">
                        {editedOrg.group_type?.replace(/_/g, ' ')}
                      </Badge>
                    </div>

                    {typeof editedOrg.metadata?.subcategory === 'string' && editedOrg.metadata.subcategory && (
                      <div>
                        <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Subcategory</p>
                        <Badge variant="outline" className="bg-white/10 text-white/60 border-white/20">
                          {String(editedOrg.metadata.subcategory).replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    )}

                    {/* Public Entity */}
                    {editedOrg.is_public_entity && (
                      <div>
                        <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Entity Class</p>
                        <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                          Public entity
                        </Badge>
                      </div>
                    )}

                    {/* Lifecycle years */}
                    {(editedOrg.founded_year || editedOrg.dissolved_year) && (
                      <div className="col-span-2">
                        <p className="text-xs text-white/50 mb-1.5 uppercase tracking-wide">Lifecycle</p>
                        <p className="text-sm text-white/70">
                          {editedOrg.founded_year ?? '?'} – {editedOrg.dissolved_year ?? 'present'}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rich organization profile — mission, culture, structure, reputation, … */}
              <OrganizationProfilePanel
                organization={editedOrg}
                onAddInfo={() => setActiveTab('chat')}
              />

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Users className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{members.length}</div>
                      <div className="text-xs text-white/60">Members</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <BookOpen className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{stories.length}</div>
                      <div className="text-xs text-white/60">Stories</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Calendar className="h-8 w-8 text-green-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{events.length}</div>
                      <div className="text-xs text-white/60">Events</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <MapPin className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-white">{locations.length}</div>
                      <div className="text-xs text-white/60">Locations</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Analytics Dashboard */}
              {editedOrg.analytics && (
                <Card className="bg-gradient-to-br from-purple-500/10 via-purple-600/10 to-purple-500/10 border-purple-500/30">
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-purple-400" />
                      Analytics & Rankings
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Your Ranking</div>
                        <div className="text-2xl font-bold text-amber-400">#{editedOrg.analytics.user_ranking}</div>
                        <div className="text-xs text-white/50 mt-1">in group</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Involvement</div>
                        <div className="text-2xl font-bold text-blue-400">{editedOrg.analytics.user_involvement_score}%</div>
                        <div className="text-xs text-white/50 mt-1">active participation</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Importance</div>
                        <div className="text-2xl font-bold text-purple-400">{editedOrg.analytics.importance_score}%</div>
                        <div className="text-xs text-white/50 mt-1">to you</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Priority</div>
                        <div className="text-2xl font-bold text-green-400">{editedOrg.analytics.priority_score}%</div>
                        <div className="text-xs text-white/50 mt-1">urgency level</div>
                      </div>
                    </div>

                    {/* Influence Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-sm text-white/70 mb-2">Group Influence on You</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
                              style={{ width: `${editedOrg.analytics.group_influence_on_user}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-white">{editedOrg.analytics.group_influence_on_user}%</span>
                        </div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 border border-border/30">
                        <div className="text-sm text-white/70 mb-2">Your Influence Over Group</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                              style={{ width: `${editedOrg.analytics.user_influence_over_group}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-white">{editedOrg.analytics.user_influence_over_group}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Additional Metrics */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Value</div>
                        <div className="text-lg font-semibold text-yellow-400">{editedOrg.analytics.value_score}%</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Cohesion</div>
                        <div className="text-lg font-semibold text-pink-400">{editedOrg.analytics.cohesion_score}%</div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-3 border border-border/30">
                        <div className="text-xs text-white/60 mb-1">Activity</div>
                        <div className="text-lg font-semibold text-green-400">{editedOrg.analytics.activity_level}%</div>
                      </div>
                    </div>

                    {/* Trend */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-white/70">Trend:</span>
                      {editedOrg.analytics.trend === 'increasing' && (
                        <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Increasing
                        </Badge>
                      )}
                      {editedOrg.analytics.trend === 'decreasing' && (
                        <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
                          <TrendingDown className="h-3 w-3 mr-1" />
                          Decreasing
                        </Badge>
                      )}
                      {editedOrg.analytics.trend === 'stable' && (
                        <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                          <Minus className="h-3 w-3 mr-1" />
                          Stable
                        </Badge>
                      )}
                    </div>

                    {/* SWOT Analysis */}
                    {((editedOrg.analytics.strengths?.length ?? 0) > 0 ||
                      (editedOrg.analytics.weaknesses?.length ?? 0) > 0 ||
                      (editedOrg.analytics.opportunities?.length ?? 0) > 0 ||
                      (editedOrg.analytics.threats?.length ?? 0) > 0) && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        {editedOrg.analytics.strengths && editedOrg.analytics.strengths.length > 0 && (
                          <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
                            <div className="text-sm font-semibold text-green-400 mb-2">Strengths</div>
                            <ul className="space-y-1">
                              {editedOrg.analytics.strengths.map((strength, i) => (
                                <li key={i} className="text-xs text-white/70">• {strength}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {editedOrg.analytics.weaknesses && editedOrg.analytics.weaknesses.length > 0 && (
                          <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                            <div className="text-sm font-semibold text-red-400 mb-2">Weaknesses</div>
                            <ul className="space-y-1">
                              {editedOrg.analytics.weaknesses.map((weakness, i) => (
                                <li key={i} className="text-xs text-white/70">• {weakness}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {editedOrg.analytics.opportunities && editedOrg.analytics.opportunities.length > 0 && (
                          <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                            <div className="text-sm font-semibold text-blue-400 mb-2">Opportunities</div>
                            <ul className="space-y-1">
                              {editedOrg.analytics.opportunities.map((opp, i) => (
                                <li key={i} className="text-xs text-white/70">• {opp}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {editedOrg.analytics.threats && editedOrg.analytics.threats.length > 0 && (
                          <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
                            <div className="text-sm font-semibold text-orange-400 mb-2">Threats</div>
                            <ul className="space-y-1">
                              {editedOrg.analytics.threats.map((threat, i) => (
                                <li key={i} className="text-xs text-white/70">• {threat}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Knowledge Chat Tab */}
            <TabsContent value="chat" className="mt-4">
              <div className="space-y-4">
                <Card className="bg-violet-500/10 border-violet-500/25">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-white flex items-center gap-2">
                          <Brain className="h-4 w-4 text-violet-300" />
                          What LoreBook knows
                        </h3>
                        <p className="text-xs text-white/45 mt-1">
                          These facts are loaded into this conversation. Ask questions, correct them, or add missing context.
                        </p>
                      </div>
                      {factsLoading && <Loader2 className="h-4 w-4 animate-spin text-violet-300 flex-shrink-0" />}
                    </div>

                    {!factsLoading && orgFacts.length === 0 && (
                      <div className="rounded-lg border border-white/8 bg-black/25 p-3 text-sm text-white/45">
                        No extracted facts yet. Use the chat below to explain what {organization.name} is, who belongs, and why it matters.
                      </div>
                    )}

                    {!factsLoading && orgFacts.length > 0 && (
                      <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
                        {Object.entries(
                          orgFacts.reduce((acc: Record<string, any[]>, fact: any) => {
                            const category = fact.category || 'general';
                            if (!acc[category]) acc[category] = [];
                            acc[category].push(fact);
                            return acc;
                          }, {})
                        ).map(([category, facts]) => {
                          const catLabel: Record<string, string> = {
                            role: 'Your Role', purpose: 'Purpose', dynamics: 'Dynamics',
                            people: 'People', status: 'Status', history: 'History', general: 'General',
                          };
                          const statusBadge: Record<string, { label: string; cls: string }> = {
                            updated:      { label: 'Updated',      cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
                            corrected:    { label: 'Corrected',    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                            contradicted: { label: 'Contradicted', cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
                          };
                          return (
                            <div key={category}>
                              <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-2">
                                {catLabel[category] ?? category}
                              </p>
                              <div className="space-y-2">
                                {(facts as any[]).map((fact: any) => {
                                  const pct = Math.round((fact.confidence ?? 0.7) * 100);
                                  const badge = statusBadge[fact.status as string];
                                  return (
                                    <div key={fact.id} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-white/6 bg-black/25">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white/85 leading-snug">{fact.fact}</p>
                                        {fact.previous_value && (
                                          <p className="text-[11px] text-white/35 mt-1 line-through">{fact.previous_value}</p>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        {badge && (
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${badge.cls}`}>
                                            {badge.label}
                                          </span>
                                        )}
                                        <span className={`text-[10px] tabular-nums font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-orange-400'}`}>
                                          {pct}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        msg.role === 'user'
                          ? 'bg-primary/20 text-white'
                          : 'bg-black/40 text-white border border-border/50'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {streamingMessageId && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-4 bg-black/40 text-white border border-border/50">
                      <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Members</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddMember(!showAddMember)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>

              {showAddMember && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 space-y-4">
                    <Input
                      placeholder="Member name"
                      value={newMember.character_name}
                      onChange={(e) => setNewMember(prev => ({ ...prev, character_name: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <Input
                      placeholder="Role (optional)"
                      value={newMember.role}
                      onChange={(e) => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleAddMember} className="flex-1">
                        Add
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddMember(false)}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {members.length === 0 ? (
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="pt-6 text-center text-white/60">
                      No members yet. Add one to get started!
                    </CardContent>
                  </Card>
                ) : (
                  members.map((member) => (
                    <Card 
                      key={member.id} 
                      className="bg-black/40 border-border/50 cursor-pointer hover:border-primary/50 hover:bg-black/60 transition-all"
                      onClick={async () => {
                        if (member.character_id) {
                          try {
                            const char = await fetchJson<Character>(`/api/characters/${member.character_id}`);
                            setSelectedCharacter(char);
                          } catch (error) {
                            setSelectedCharacter({
                              id: member.character_id,
                              name: member.character_name,
                            } as Character);
                          }
                        } else if (member.character_name) {
                          try {
                            const chars = await fetchJson<Character[]>(`/api/characters/search?name=${encodeURIComponent(member.character_name)}`);
                            if (chars && chars.length > 0) {
                              setSelectedCharacter(chars[0]);
                            } else {
                              setSelectedCharacter({
                                id: `temp-${member.character_name}`,
                                name: member.character_name,
                              } as Character);
                            }
                          } catch (error) {
                            setSelectedCharacter({
                              id: `temp-${member.character_name}`,
                              name: member.character_name,
                            } as Character);
                          }
                        }
                      }}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-white">{member.character_name}</div>
                            {member.role && (
                              <div className="text-sm text-white/60">{member.role}</div>
                            )}
                            {member.notes && (
                              <div className="text-xs text-white/40 mt-1">{member.notes}</div>
                            )}
                            <Badge variant="outline" className="mt-2">
                              {member.status}
                            </Badge>
                            {member.character_id && memberAffiliations[member.character_id]?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                {memberAffiliations[member.character_id].map(org => (
                                  <Badge
                                    key={org.id}
                                    variant="outline"
                                    className="text-[10px] border-purple-500/35 bg-purple-500/10 text-purple-200 cursor-pointer hover:bg-purple-500/20"
                                    onClick={() => {
                                      void fetchJson<{ success: boolean; organization: Organization }>(
                                        `/api/organizations/${org.id}`
                                      )
                                        .then(r => {
                                          if (r.success && r.organization) setSelectedLinkedOrg(r.organization);
                                        })
                                        .catch(() => {});
                                    }}
                                  >
                                    {org.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {affiliationsLoading && member.character_id && !memberAffiliations[member.character_id] && (
                              <p className="text-[10px] text-white/30 mt-1">Loading other groups…</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Stories Tab */}
            <TabsContent value="stories" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Stories</h3>
                <Button variant="outline" size="sm" onClick={() => setShowAddStory(v => !v)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Story
                </Button>
              </div>

              {showAddStory && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 space-y-3">
                    <Input
                      placeholder="Title *"
                      value={newStory.title}
                      onChange={e => setNewStory(v => ({ ...v, title: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <Textarea
                      placeholder="Summary *"
                      value={newStory.summary}
                      onChange={e => setNewStory(v => ({ ...v, summary: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                      rows={3}
                    />
                    <Input
                      type="date"
                      value={newStory.date}
                      onChange={e => setNewStory(v => ({ ...v, date: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void handleAddStory()} disabled={storyLoading} className="flex-1">
                        {storyLoading ? 'Saving...' : 'Save Story'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddStory(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {stories.length === 0 && !showAddStory ? (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 text-center text-white/60">
                    No stories yet. Add one above.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {stories.map((story) => (
                    <Card key={story.id} className="bg-black/40 border-border/50">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-white mb-1">{story.title}</div>
                            <p className="text-sm text-white/70 mb-1">{story.summary}</p>
                            <div className="text-xs text-white/40">{formatDate(story.date)}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => void handleRemoveStory(story.id)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Events</h3>
                <Button variant="outline" size="sm" onClick={() => setShowAddEvent(v => !v)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Event
                </Button>
              </div>

              {showAddEvent && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 space-y-3">
                    <Input
                      placeholder="Event title *"
                      value={newEvent.title}
                      onChange={e => setNewEvent(v => ({ ...v, title: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={newEvent.date}
                        onChange={e => setNewEvent(v => ({ ...v, date: e.target.value }))}
                        className="flex-1 bg-black/60 border-border/50 text-white"
                      />
                      <select
                        value={newEvent.type}
                        onChange={e => setNewEvent(v => ({ ...v, type: e.target.value as OrganizationEvent['type'] }))}
                        aria-label="Event type"
                        className="px-3 py-2 bg-black/60 border border-border/50 rounded-lg text-white text-sm"
                      >
                        <option value="meeting">Meeting</option>
                        <option value="game">Game</option>
                        <option value="social">Social</option>
                        <option value="work">Work</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => void handleAddEvent()} disabled={eventLoading} className="flex-1">
                        {eventLoading ? 'Saving...' : 'Save Event'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddEvent(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {events.length === 0 && !showAddEvent ? (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 text-center text-white/60">
                    No events yet. Add one above.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <Card key={event.id} className="bg-black/40 border-border/50">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">{event.title}</div>
                            <div className="text-xs text-white/50 mt-1">{formatDate(event.date)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{event.type}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => void handleRemoveEvent(event.id)}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Conversation-derived events */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <h4 className="text-sm font-semibold text-white/80">From your conversations</h4>
                  {derivedEvents.length > 0 && (
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40">
                      {derivedEvents.length}
                    </Badge>
                  )}
                </div>
                {derivedLoading ? (
                  <div className="flex items-center gap-2 text-white/50 text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Scanning chat threads…
                  </div>
                ) : derivedEvents.length === 0 ? (
                  <p className="text-xs text-white/40 py-2">
                    No events involving these members were found in your conversations yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {derivedEvents.map((event) => (
                      <Card key={event.id} className="bg-purple-500/5 border-purple-500/20">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-white">{event.title}</div>
                              {event.summary && (
                                <p className="text-sm text-white/60 mt-1 line-clamp-2">{event.summary}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                {event.date && (
                                  <span className="text-xs text-white/40">{formatDate(event.date)}</span>
                                )}
                                {event.involved.length > 0 && (
                                  <span className="text-xs text-white/50">
                                    with {event.involved.slice(0, 4).join(', ')}
                                    {event.involved.length > 4 ? ` +${event.involved.length - 4}` : ''}
                                  </span>
                                )}
                                {event.user_was_present && (
                                  <Badge variant="outline" className="bg-green-500/15 text-green-300 border-green-500/30 text-[10px]">
                                    You were there
                                  </Badge>
                                )}
                                {event.audience && (
                                  <Badge variant="outline" className={`text-[10px] ${AUDIENCE_BADGE[event.audience]}`}>
                                    {AUDIENCE_LABELS[event.audience]}
                                  </Badge>
                                )}
                                {event.subgroup_names && event.subgroup_names.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-300/80">
                                    {event.subgroup_names.join(', ')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Badge variant="outline" className="shrink-0">{event.type}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Locations Tab */}
            <TabsContent value="locations" className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Locations</h3>
                <Button variant="outline" size="sm" onClick={() => setShowAddLocation(v => !v)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Location
                </Button>
              </div>

              {showAddLocation && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 space-y-3">
                    <Input
                      placeholder="Location name *"
                      value={newLocation.location_name}
                      onChange={e => setNewLocation(v => ({ ...v, location_name: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                      onKeyDown={e => e.key === 'Enter' && void handleAddLocation()}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void handleAddLocation()} disabled={locationLoading} className="flex-1">
                        {locationLoading ? 'Saving...' : 'Save Location'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddLocation(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {locations.length === 0 && !showAddLocation ? (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 text-center text-white/60">
                    No locations yet. Add one above.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {locations.map((location) => (
                    <Card key={location.id} className="bg-black/40 border-border/50">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">{location.location_name}</div>
                            <div className="text-sm text-white/60 mt-1">
                              {location.visit_count} {location.visit_count === 1 ? 'visit' : 'visits'}
                            </div>
                            {location.last_visited && (
                              <div className="text-xs text-white/40 mt-1">
                                Last: {formatDate(location.last_visited)}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => void handleRemoveLocation(location.id)}>
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Conversation-derived locations */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <h4 className="text-sm font-semibold text-white/80">From your conversations</h4>
                  {derivedLocations.length > 0 && (
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40">
                      {derivedLocations.length}
                    </Badge>
                  )}
                </div>
                {derivedLoading ? (
                  <div className="flex items-center gap-2 text-white/50 text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Scanning chat threads…
                  </div>
                ) : derivedLocations.length === 0 ? (
                  <p className="text-xs text-white/40 py-2">
                    No places tied to these members were found in your conversations yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {derivedLocations.map((loc) => (
                      <Card key={loc.id} className="bg-purple-500/5 border-purple-500/20">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-white flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                                {loc.name}
                              </div>
                              {loc.involved.length > 0 && (
                                <div className="text-xs text-white/50 mt-1.5">
                                  with {loc.involved.slice(0, 4).join(', ')}
                                  {loc.involved.length > 4 ? ` +${loc.involved.length - 4}` : ''}
                                </div>
                              )}
                            </div>
                            {loc.type && (
                              <Badge variant="outline" className="shrink-0">{loc.type}</Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Relationships Tab */}
            <TabsContent value="relationships" className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-white">Relationships</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleReconcileRelationships()}
                    disabled={reconcilingRelationships}
                    title="Re-scan conversations for subgroup and hierarchy links"
                  >
                    {reconcilingRelationships
                      ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      : <Sparkles className="h-4 w-4 mr-1" />}
                    Learn from chat
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAddRelationship(v => !v)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Relationship
                  </Button>
                </div>
              </div>

              {/* Hierarchy learned from chat */}
              {(derivedHierarchy.parent || derivedHierarchy.subgroups.length > 0) && (
                <Card className="bg-indigo-500/5 border-indigo-500/25">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-400" />
                      <p className="text-sm font-semibold text-white/85">Group structure</p>
                    </div>
                    {derivedHierarchy.parent && (
                      <div className="text-sm">
                        <span className="text-white/45">Part of </span>
                        <button
                          type="button"
                          onClick={() => openLinkedOrg(derivedHierarchy.parent!.id)}
                          className="font-semibold text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
                        >
                          {derivedHierarchy.parent.name}
                        </button>
                        {derivedHierarchy.parent.inferred && (
                          <Badge variant="outline" className="ml-2 text-[10px] border-indigo-500/30 text-indigo-300/70">
                            from chat
                          </Badge>
                        )}
                      </div>
                    )}
                    {derivedHierarchy.subgroups.length > 0 && (
                      <div>
                        <p className="text-xs text-white/45 mb-2">Subgroups</p>
                        <div className="flex flex-wrap gap-2">
                          {derivedHierarchy.subgroups.map(sg => (
                            <button
                              key={sg.id}
                              type="button"
                              onClick={() => openLinkedOrg(sg.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-200 hover:bg-indigo-500/20 transition text-left"
                            >
                              {sg.name}
                              {sg.member_count != null && (
                                <span className="ml-1.5 text-indigo-300/50">· {sg.member_count} members</span>
                              )}
                              {sg.inferred && <span className="ml-1 text-indigo-300/40">· learned</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <OrganizationGroupNetwork
                rootOrgId={organization.id}
                compact
                title={`${organization.name} in context`}
                onOrgClick={openLinkedOrg}
              />

              {showAddRelationship && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 space-y-3">
                    <p className="text-xs text-white/50">
                      {organization.name} <span className="text-white/30">is</span>{' '}
                      <span className="text-indigo-300">{REL_TYPE_LABELS[newRelationship.relationship_type].toLowerCase()}</span>{' '}
                      <span className="text-white/30">→</span>{' '}
                      {newRelationship.to_org_id ? orgNameById(newRelationship.to_org_id) : '…'}
                    </p>
                    <select
                      value={newRelationship.to_org_id}
                      onChange={e => setNewRelationship(v => ({ ...v, to_org_id: e.target.value }))}
                      aria-label="Connected organization"
                      className="w-full px-3 py-2 bg-black/60 border border-border/50 rounded-lg text-white text-sm"
                    >
                      <option value="">Select an organization…</option>
                      {relatedOrgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                    <select
                      value={newRelationship.relationship_type}
                      onChange={e => setNewRelationship(v => ({ ...v, relationship_type: e.target.value as OrgRelationshipType }))}
                      aria-label="Relationship type"
                      className="w-full px-3 py-2 bg-black/60 border border-border/50 rounded-lg text-white text-sm"
                    >
                      {ORG_REL_TYPE_OPTIONS.map(type => (
                        <option key={type} value={type}>{REL_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    <Input
                      placeholder="Notes (optional)"
                      value={newRelationship.notes}
                      onChange={e => setNewRelationship(v => ({ ...v, notes: e.target.value }))}
                      className="bg-black/60 border-border/50 text-white"
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void handleAddRelationship()} disabled={relationshipSaving || !newRelationship.to_org_id} className="flex-1">
                        {relationshipSaving ? 'Saving...' : 'Save Relationship'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddRelationship(false)}>Cancel</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {relationshipsLoading ? (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 text-center text-white/60 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading relationships...
                  </CardContent>
                </Card>
              ) : relationships.length === 0 && !showAddRelationship ? (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="pt-6 text-center text-white/60">
                    No relationships yet. Connect this organization to another one above.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {relationships.map((rel) => {
                    const outgoing = rel.from_org_id === organization.id;
                    const otherOrgId = outgoing ? rel.to_org_id : rel.from_org_id;
                    const otherOrgName = orgNameById(otherOrgId);
                    const inferred = rel.notes?.startsWith('[auto-inferred]');
                    return (
                      <Card key={rel.id} className="bg-black/40 border-border/50">
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => openLinkedOrg(outgoing ? organization.id : otherOrgId)}
                                  className="font-semibold text-white truncate hover:text-indigo-300 transition"
                                >
                                  {outgoing ? organization.name : otherOrgName}
                                </button>
                                {outgoing
                                  ? <ArrowRight className="h-3.5 w-3.5 text-white/40 shrink-0" />
                                  : <ArrowLeft className="h-3.5 w-3.5 text-white/40 shrink-0" />}
                                <button
                                  type="button"
                                  onClick={() => openLinkedOrg(outgoing ? otherOrgId : organization.id)}
                                  className="font-semibold text-white truncate hover:text-indigo-300 transition"
                                >
                                  {outgoing ? otherOrgName : organization.name}
                                </button>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40">
                                  {REL_TYPE_LABELS[rel.relationship_type]}
                                </Badge>
                                {inferred && (
                                  <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300/80">
                                    learned from chat
                                  </Badge>
                                )}
                              </div>
                              {rel.notes && !inferred && (
                                <div className="text-xs text-white/50 mt-1.5">{rel.notes}</div>
                              )}
                              {rel.notes && inferred && (
                                <div className="text-xs text-white/40 mt-1.5 italic">
                                  {rel.notes.replace(/^\[auto-inferred\]\s*/, '')}
                                </div>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => void handleRemoveRelationship(rel.id)}>
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Family Tree Tab (family groups) */}
            <TabsContent value="family" className="mt-4 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <TreePine className="h-5 w-5 text-emerald-400" />
                  {editedOrg.name} — Family Tree
                </h3>
                <p className="text-xs text-white/45 mt-1">
                  Positions inferred from your conversations. Updates as you share more about who is related to whom.
                </p>
              </div>
              <FamilyTreePanel
                scope="organization"
                entityId={organization.id}
                refreshKey={familyRefreshKey}
                title={`No family structure for ${editedOrg.name} yet`}
                hint="Talk about who is related — parents, siblings, cousins — and LoreBook builds the tree."
                onMemberClick={(id, name) => {
                  if (id.startsWith('name-')) return;
                  void fetchJson<Character>(`/api/characters/${id}`)
                    .then(c => setSelectedCharacter(c))
                    .catch(() => setSelectedCharacter({ id, name } as Character));
                }}
              />
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="mt-4 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-400" />
                  Event Timeline
                </h3>
                <p className="text-xs text-white/45 mt-1">
                  Events involving {organization.name}'s members (including subgroups), split by your involvement and group-wide impact.
                </p>
              </div>
              <EventTimelineSwimlanes
                loading={derivedLoading}
                lanes={[
                  { key: 'with', label: 'With you', accent: 'emerald', hint: 'You were there' },
                  { key: 'without', label: 'Without you', accent: 'violet', hint: 'Member-only — you weren\'t present' },
                  { key: 'group_wide', label: 'Group-wide', accent: 'amber', hint: 'Affects the whole group or multiple members' },
                ]}
                events={derivedEvents.map((e): SwimlaneEvent => ({
                  id: e.id,
                  title: e.title,
                  date: e.date ?? '',
                  laneKey: laneKeyForEvent(e),
                  type: e.type,
                  summary: e.summary,
                  meta: [
                    e.involved.length > 0
                      ? `with ${e.involved.slice(0, 4).join(', ')}${e.involved.length > 4 ? ` +${e.involved.length - 4}` : ''}`
                      : null,
                    e.subgroup_names?.length ? `via ${e.subgroup_names.join(', ')}` : null,
                  ].filter(Boolean).join(' · ') || undefined,
                }))}
                emptyTitle="No events yet"
                emptyHint={`Events show up here as ${organization.name}'s members come up in your conversations.`}
              />
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
                  handleChatSubmit();
                }
              }}
              placeholder={`Ask about ${editedOrg.name}...`}
              className="flex-1 bg-black/60 border-white/20 text-white resize-none min-h-[60px] max-h-[120px]"
              rows={2}
            />
            <Button
              onClick={handleChatSubmit}
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
    
    {/* Nested Character Modal */}
    {selectedCharacter && (
      <CharacterDetailModal
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
        onUpdate={() => {
          // Refresh if needed
        }}
      />
    )}
    
    {/* Nested Location Modal */}
    {selectedLocation && (
      <LocationDetailModal
        location={selectedLocation}
        onClose={() => setSelectedLocation(null)}
      />
    )}

    {selectedLinkedOrg && (
      <OrganizationDetailModal
        organization={selectedLinkedOrg}
        onClose={() => setSelectedLinkedOrg(null)}
        onUpdate={onUpdate}
      />
    )}
  </>
  );
};
