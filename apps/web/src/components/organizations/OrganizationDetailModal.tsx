// =====================================================
// ORGANIZATION DETAIL MODAL
// Purpose: Comprehensive organization profile with chatbot editing
// Features: Info, Chat, Members, Stories, Events, Locations, Timeline
// =====================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Users, BookOpen, Calendar, MapPin, MessageSquare, Clock, FileText, Building2, Plus, Edit2, Trash2, Sparkles, TrendingUp, TrendingDown, Minus, Award, Star, Info, Loader2, Link2, ArrowRight, ArrowLeft, Brain, TreePine, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Modal } from '../ui/modal';
import { Tabs, TabsContent } from '../ui/tabs';
import { CharacterDetailModal } from '../characters/CharacterDetailModal';
import { LocationDetailModal } from '../locations/LocationDetailModal';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { schedulePostChatRefresh, onStoryDataUpdated } from '../../lib/storyRefresh';
import { MarkdownRenderer } from '../chat/MarkdownRenderer';
import { OrganizationModalHeader } from './OrganizationModalHeader';
import { OrganizationModalNav, ORG_MODAL_BASE_TABS, type OrgModalTabKey } from './OrganizationModalNav';
import {
  OrganizationInfluencePanel,
  OrganizationInsightsPanel,
  OrganizationLorePanel,
} from './OrganizationLorePanels';
import { OrganizationModalOverview } from './OrganizationModalOverview';
import { OrganizationTimelinePanel } from './OrganizationTimelinePanel';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { getMockOrganizationDerivedEvents } from '../../mocks/organizationTimeline';
import {
  getMockOrganizationFacts,
  getMockMemberAffiliations,
  getMockOrganizationRelationships,
  enrichOrganizationForDemo,
} from '../../mocks/modalDemoData';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { OrganizationGroupNetwork } from './OrganizationGroupNetwork';
import type { Organization, OrganizationMember, OrganizationStory, OrganizationEvent, OrganizationLocation, OrganizationRelationship, OrgRelationshipType } from './OrganizationProfileCard';
import type { Character } from '../characters/CharacterProfileCard';
import type { LocationProfile } from '../locations/LocationProfileCard';

type OrganizationDetailModalProps = {
  organization: Organization;
  allOrganizations?: Organization[];
  onSelectOrganization?: (org: Organization) => void;
  onClose: () => void;
  onUpdate?: () => void;
};

type TabKey = OrgModalTabKey;

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

const BASE_TABS = ORG_MODAL_BASE_TABS;
const TAB_PANEL = 'mt-0 space-y-3';
const TAB_HEADING = 'text-base sm:text-lg font-semibold text-white';

export const OrganizationDetailModal = ({ organization, allOrganizations = [], onSelectOrganization, onClose, onUpdate }: OrganizationDetailModalProps) => {
  const isMockDataEnabled = useShouldUseMockData();
  const resolvedOrganization = useMemo(
    () => (isMockDataEnabled ? enrichOrganizationForDemo(organization) : organization),
    [isMockDataEnabled, organization],
  );
  const [editedOrg, setEditedOrg] = useState<Organization>(resolvedOrganization);
  const tabs = useMemo(() => {
    const list = [...BASE_TABS];
    if (editedOrg.group_type === 'family') {
      list.splice(4, 0, { key: 'family', label: 'Family Tree', shortLabel: 'Family', icon: TreePine });
    }
    list.push({ key: 'danger', label: 'Delete', shortLabel: 'Delete', icon: Trash2 });
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
  const [members, setMembers] = useState<OrganizationMember[]>(resolvedOrganization.members || []);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ character_name: '', role: '', status: 'active' as const });

  // Stories state
  const [stories, setStories] = useState<OrganizationStory[]>(resolvedOrganization.stories || []);
  const [showAddStory, setShowAddStory] = useState(false);
  const [newStory, setNewStory] = useState({ title: '', summary: '', date: new Date().toISOString().split('T')[0] });
  const [storyLoading, setStoryLoading] = useState(false);

  // Events state
  const [events, setEvents] = useState<OrganizationEvent[]>(resolvedOrganization.events || []);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: new Date().toISOString().split('T')[0], type: 'other' as OrganizationEvent['type'] });
  const [eventLoading, setEventLoading] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<OrganizationLocation[]>(resolvedOrganization.locations || []);
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

  // Delete state — two-step confirmation in the Delete tab
  const [deleteStep, setDeleteStep] = useState<null | 'warn' | 'type'>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Knowledge / entity facts state
  const [orgFacts, setOrgFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsLoaded, setFactsLoaded] = useState(false);

  // Modal states for nested entities
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedLinkedOrg, setSelectedLinkedOrg] = useState<Organization | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  
  useEffect(() => {
    setEditedOrg(resolvedOrganization);
    setMembers(resolvedOrganization.members || []);
    setStories(resolvedOrganization.stories || []);
    setEvents(resolvedOrganization.events || []);
    setLocations(resolvedOrganization.locations || []);
  }, [resolvedOrganization]);

  useEffect(() => {
    if (activeTab === 'chat' && chatMessages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm here to help you discuss **${resolvedOrganization.name}** using what LoreBook already knows.\n\nYou can ask about known facts, correct details, add members, record stories/events, link locations, or explain how this group fits into your life.\n\nWhat should we focus on?`,
        timestamp: new Date()
      };
      setChatMessages([welcomeMessage]);
    }
  }, [activeTab, resolvedOrganization.name, chatMessages.length]);

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
    if (isMockDataEnabled) {
      setDerivedEvents(getMockOrganizationDerivedEvents(organization));
      setDerivedLocations(
        (organization.locations ?? []).map((loc) => ({
          id: loc.id,
          name: loc.location_name,
          involved: [],
          source: 'conversation' as const,
        })),
      );
      setDerivedHierarchy({ subgroups: [], related: [] });
      setDerivedLoaded(true);
      return;
    }
    setDerivedLoading(true);
    fetchJson<{ success: boolean; events: DerivedEvent[]; locations: DerivedLocation[]; hierarchy?: DerivedHierarchy }>(
      `/api/organizations/${organization.id}/derived-context`
    )
      .then(r => {
        if (r.success) {
          // Normalize array fields the backend may omit — render code reads
          // .involved.length (production crash: 'involved' undefined).
          setDerivedEvents((r.events || []).map((e) => ({ ...e, involved: e.involved ?? [] })));
          setDerivedLocations((r.locations || []).map((l) => ({ ...l, involved: l.involved ?? [] })));
          setDerivedHierarchy(r.hierarchy ?? { subgroups: [], related: [] });
        }
      })
      .catch(() => {})
      .finally(() => { setDerivedLoading(false); setDerivedLoaded(true); });
  }, [activeTab, organization, derivedLoaded, isMockDataEnabled]);

  useEffect(() => {
    if (factsLoaded || !organization.id) return;
    if (isMockDataEnabled) {
      setOrgFacts(getMockOrganizationFacts(organization));
      setFactsLoaded(true);
      return;
    }
    if (activeTab !== 'chat') return;
    setFactsLoading(true);
    fetchJson<{ success: boolean; facts: any[] }>(`/api/organizations/${organization.id}/facts`)
      .then(r => { if (r.success) setOrgFacts(r.facts); })
      .catch(() => {})
      .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
  }, [activeTab, organization, factsLoaded, isMockDataEnabled]);

  const loadMemberAffiliations = async () => {
    if (!organization.id) return;
    setAffiliationsLoading(true);
    try {
      if (isMockDataEnabled) {
        setMemberAffiliations(getMockMemberAffiliations(organization, allOrganizations));
        return;
      }
      if (organization.id.startsWith('org-')) return;
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
      if (isMockDataEnabled) {
        const { relationships, relatedOrgs: peers } = getMockOrganizationRelationships(
          organization,
          allOrganizations,
        );
        setRelationships(relationships);
        setRelatedOrgs(peers);
        return;
      }
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
    if (isMockDataEnabled) {
      const linked = allOrganizations.find((o) => o.id === orgId);
      if (!linked) return;
      if (onSelectOrganization) {
        onSelectOrganization(linked);
      } else {
        setSelectedLinkedOrg(linked);
      }
      return;
    }
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

  const openOrgMainChat = (prompt?: string) => {
    onClose();
    openChatWithFocus({
      entityId: editedOrg.id,
      entityName: editedOrg.name,
      entityType: 'organization',
      sourceSurface: 'organizations',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.organizations,
      knowledgeScope: 'group membership, culture, and dynamics',
      initialPrompt:
        prompt ??
        `Tell me about ${editedOrg.name} — who belongs, how it works, and what I should know.`,
    });
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

  const resetDeleteFlow = () => {
    setDeleteStep(null);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (deleteConfirmText.trim() !== organization.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await fetchJson(`/api/organizations/${organization.id}`, { method: 'DELETE' });
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete organization:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete group');
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'danger') {
      setDeleteStep(prev => prev ?? 'warn');
    } else {
      resetDeleteFlow();
    }
  }, [activeTab]);

  return (
    <>
    <Modal isOpen={true} onClose={onClose} size="full">
      <div className="flex flex-col h-[100dvh] sm:h-[min(90vh,900px)] min-h-0">
        <OrganizationModalHeader
          organization={editedOrg}
          memberCount={members.length}
          onClose={onClose}
          onOpenChat={() => {
            setActiveTab('chat');
            openOrgMainChat();
          }}
        />

        <OrganizationModalNav
          placement="top"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showFamilyTab={editedOrg.group_type === 'family'}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4 min-h-0">
            {/* Overview Tab */}
            <TabsContent value="info" className="mt-0 space-y-0">
              <OrganizationModalOverview
                organization={editedOrg}
                allOrganizations={allOrganizations}
                members={members}
                stories={stories}
                events={events}
                locationCount={locations.length}
                onSelectOrganization={onSelectOrganization}
                onTabChange={setActiveTab}
                onOpenChat={(prompt) => {
                  setActiveTab('chat');
                  openOrgMainChat(prompt);
                }}
              />
            </TabsContent>

            {/* Knowledge Chat Tab */}
            <TabsContent value="chat" className={TAB_PANEL}>
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-violet-500/30 text-violet-200 hover:bg-violet-500/10 sm:hidden"
                  onClick={() => openOrgMainChat()}
                >
                  <MessageSquare className="h-4 w-4" />
                  Open main chat
                </Button>
                <Card className="bg-violet-500/10 border-violet-500/25">
                  <CardContent className="p-3 sm:pt-4 sm:pb-4">
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
            <TabsContent value="members" className={TAB_PANEL}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={TAB_HEADING}>People ({members.length})</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 px-2.5 text-xs"
                  onClick={() => setShowAddMember(!showAddMember)}
                >
                  <Plus className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Add</span>
                </Button>
              </div>

              {showAddMember && (
                <Card className="bg-black/40 border-border/50">
                  <CardContent className="p-3 sm:pt-6 space-y-3">
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
                    <CardContent className="py-6 text-center text-sm text-white/60">
                      No members yet. Add one to get started!
                    </CardContent>
                  </Card>
                ) : (
                  members.map((member) => (
                    <Card 
                      key={member.id} 
                      className="bg-black/40 border-border/50 cursor-pointer hover:border-primary/50 hover:bg-black/60 transition-all active:scale-[0.99]"
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
                      <CardContent className="p-3 sm:pt-4">
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-sm font-bold text-white/80">
                            {member.character_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-white text-sm truncate">{member.character_name}</div>
                            {member.role && (
                              <div className="text-xs text-white/55 truncate">{member.role}</div>
                            )}
                            {member.notes && (
                              <div className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{member.notes}</div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                {member.status}
                              </Badge>
                            </div>
                            {member.character_id && memberAffiliations[member.character_id]?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
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
                            className="shrink-0 h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            {/* Stories Tab */}
            <TabsContent value="stories" className={TAB_PANEL}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={TAB_HEADING}>Stories ({stories.length})</h3>
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
            <TabsContent value="events" className={TAB_PANEL}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={TAB_HEADING}>Events ({events.length})</h3>
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
            <TabsContent value="locations" className={TAB_PANEL}>
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
            <TabsContent value="relationships" className={TAB_PANEL}>
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
            <TabsContent value="family" className={TAB_PANEL}>
              <div>
                <h3 className={`${TAB_HEADING} flex items-center gap-2`}>
                  <TreePine className="h-4 w-4 text-emerald-400" />
                  Family tree
                </h3>
                <p className="text-xs text-white/45 mt-1">
                  Built from your conversations — share who is related to whom.
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
            <TabsContent value="timeline" className={TAB_PANEL}>
              <OrganizationTimelinePanel
                organization={resolvedOrganization}
                mockMode={isMockDataEnabled}
                active={activeTab === 'timeline'}
              />
            </TabsContent>

            {/* Influence Tab — how this group changed the user */}
            <TabsContent value="influence" className={TAB_PANEL}>
              <OrganizationInfluencePanel organization={resolvedOrganization} />
            </TabsContent>

            {/* Insights Tab — AI-style observations (curated/derived for now) */}
            <TabsContent value="insights" className={TAB_PANEL}>
              <OrganizationInsightsPanel organization={resolvedOrganization} />
            </TabsContent>

            {/* Lore Tab — archetype, themes, symbols, story role */}
            <TabsContent value="lore" className={TAB_PANEL}>
              <OrganizationLorePanel organization={resolvedOrganization} />
            </TabsContent>

            {/* Delete Tab — two-step confirmation, away from the close button */}
            <TabsContent value="danger" className={TAB_PANEL}>
              <Card className="bg-red-500/5 border-red-500/25">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      {deleteStep === 'warn' && (
                        <>
                          <h3 className="text-lg font-semibold text-white">Delete {editedOrg.name}?</h3>
                          <p className="text-sm text-white/60 mt-1">
                            Deleting a group removes it from your Groups &amp; Organizations book. Member links and conversation-derived context may be affected. This cannot be undone.
                          </p>
                          <p className="text-xs text-white/45 mt-2">
                            Step 1 of 2 — continue to type the group name.
                          </p>
                        </>
                      )}
                      {deleteStep === 'type' && (
                        <>
                          <h3 className="text-lg font-semibold text-white">Type the name to confirm</h3>
                          <p className="text-sm text-white/60 mt-1">
                            Enter <span className="font-mono text-red-200">{editedOrg.name}</span> to delete this group.
                          </p>
                          <Input
                            className="mt-3 bg-black/40 border-red-500/20"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder={editedOrg.name}
                            autoFocus
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {deleteError && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                      {deleteError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setActiveTab('info')} disabled={deleting}>
                      Cancel
                    </Button>
                    {deleteStep === 'warn' && (
                      <Button
                        onClick={() => setDeleteStep('type')}
                        className="bg-red-500/15 hover:bg-red-500/25 text-red-100 border border-red-500/30"
                      >
                        Continue
                      </Button>
                    )}
                    {deleteStep === 'type' && (
                      <Button
                        onClick={() => void handleDelete()}
                        disabled={deleting || deleteConfirmText.trim() !== editedOrg.name}
                        className="bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30 disabled:opacity-40"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      >
                        {deleting ? 'Deleting…' : 'Delete group'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </Tabs>

        <OrganizationModalNav
          placement="bottom"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showFamilyTab={editedOrg.group_type === 'family'}
        />

        {/* Sticky chatbox — desktop quick input; mobile uses Chat tab */}
        <div className="hidden sm:block sticky bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-black/90 border-t border-primary/30 p-4 z-10 backdrop-blur-sm shadow-lg shadow-black/50">
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
