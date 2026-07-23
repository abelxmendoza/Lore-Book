// =====================================================
// ORGANIZATION DETAIL MODAL
// Purpose: Comprehensive organization profile with chatbot editing
// Features: Info, Chat, Members, Stories, Events, Locations, Timeline
// =====================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, Users, BookOpen, Calendar, MapPin, MessageSquare, Clock, FileText, Building2, Plus, Edit2, Trash2, Sparkles, TrendingUp, TrendingDown, Minus, Award, Star, Info, Loader2, Link2, ArrowRight, ArrowLeft, Brain, TreePine, AlertTriangle, Search } from 'lucide-react';
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
import { booksApi } from '../../api/books';
import { fetchOrganizationById, isEphemeralEntityId } from '../../lib/hydrateBookEntity';
import { apiCache } from '../../lib/cache';
import { format, parseISO } from 'date-fns';
import { useChatStream } from '../../hooks/useChatStream';
import { schedulePostChatRefresh, onStoryDataUpdated } from '../../lib/storyRefresh';
import {
  useAddOrganizationEventMutation,
  useAddOrganizationLocationMutation,
  useAddOrganizationMemberMutation,
  useAddOrganizationRelationshipMutation,
  useAddOrganizationStoryMutation,
  useDeleteOrganizationMutation,
  useRemoveOrganizationEventMutation,
  useRemoveOrganizationLocationMutation,
  useRemoveOrganizationMemberMutation,
  useRemoveOrganizationRelationshipMutation,
  useRemoveOrganizationStoryMutation,
  useUpdateOrganizationMutation,
} from '../../store/api/entitiesApi';
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
  getMockOrganizationMentionTrace,
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

type OrganizationMentionTrace = {
  labels: string[];
  total_mentions: number;
  source_counts: Record<string, number>;
  mentions: Array<{
    id: string;
    source: 'chat_messages' | 'conversation_messages' | 'entity_facts';
    source_id: string;
    session_id?: string | null;
    thread_title?: string | null;
    role?: string | null;
    matched_label: string;
    occurrence_count: number;
    snippet: string;
    created_at?: string | null;
  }>;
  facts: any[];
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
const GROUP_TYPE_OPTIONS: Array<{ value: Organization['group_type']; label: string }> = [
  { value: 'band', label: 'Band' },
  { value: 'friend_group', label: 'Friend group' },
  { value: 'company', label: 'Company' },
  { value: 'club', label: 'Club' },
  { value: 'community', label: 'Community' },
  { value: 'crew', label: 'Crew' },
  { value: 'collective', label: 'Collective' },
  { value: 'sports_team', label: 'Sports team' },
  { value: 'team', label: 'Team' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'institution', label: 'Institution' },
  { value: 'brand', label: 'Brand' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'family', label: 'Family' },
  { value: 'household', label: 'Household' },
  { value: 'public_entity', label: 'Public entity' },
  { value: 'project', label: 'Project' },
  { value: 'event_group', label: 'Event group' },
  { value: 'other', label: 'Other' },
];
const MEMBERSHIP_MODEL_OPTIONS: Array<{ value: Organization['membership_model']; label: string }> = [
  { value: 'strict', label: 'Defined roster' },
  { value: 'fuzzy', label: 'Loose or scene-based' },
  { value: 'none', label: 'Referenced only' },
];
const USER_RELATIONSHIP_OPTIONS: Array<{ value: Organization['user_relationship']; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'fan', label: 'Fan' },
  { value: 'aware_of', label: 'Aware of' },
  { value: 'referenced', label: 'Referenced' },
  { value: 'adjacent', label: 'Adjacent' },
  { value: 'collaborator', label: 'Collaborator' },
  { value: 'former_member', label: 'Former member' },
  { value: 'leader', label: 'Leader' },
  { value: 'founder', label: 'Founder' },
  { value: 'alumnus', label: 'Alumnus' },
];

const BASE_TABS = ORG_MODAL_BASE_TABS;
const TAB_PANEL = 'mt-0 space-y-3';
const TAB_HEADING = 'text-base sm:text-lg font-semibold text-white';
const FIELD_LABEL = 'text-[10px] font-semibold uppercase tracking-wide text-white/40';
const FIELD_INPUT = 'h-10 bg-black/55 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20';
const FIELD_SELECT = 'h-10 w-full rounded-lg border border-white/10 bg-black/55 px-3 text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20';

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
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySaved, setIdentitySaved] = useState<string | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const { streamChat, isStreaming, cancel } = useChatStream();
  const [updateOrganization] = useUpdateOrganizationMutation();
  const [deleteOrganization] = useDeleteOrganizationMutation();
  const [addOrganizationMember] = useAddOrganizationMemberMutation();
  const [removeOrganizationMember] = useRemoveOrganizationMemberMutation();
  const [addOrganizationEvent] = useAddOrganizationEventMutation();
  const [removeOrganizationEvent] = useRemoveOrganizationEventMutation();
  const [addOrganizationStory] = useAddOrganizationStoryMutation();
  const [removeOrganizationStory] = useRemoveOrganizationStoryMutation();
  const [addOrganizationLocation] = useAddOrganizationLocationMutation();
  const [removeOrganizationLocation] = useRemoveOrganizationLocationMutation();
  const [addOrganizationRelationship] = useAddOrganizationRelationshipMutation();
  const [removeOrganizationRelationship] = useRemoveOrganizationRelationshipMutation();

  // Members state
  const [members, setMembers] = useState<OrganizationMember[]>(resolvedOrganization.members || []);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState({ character_name: '', role: '', status: 'active' as const });
  /** Character Book picker — preferred path (creates official character_id link). */
  const [characterBookOptions, setCharacterBookOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [characterBookLoading, setCharacterBookLoading] = useState(false);
  const [selectedBookCharacterId, setSelectedBookCharacterId] = useState('');
  const [characterBookSearch, setCharacterBookSearch] = useState('');
  const [memberAddError, setMemberAddError] = useState<string | null>(null);
  const [memberAddSuccess, setMemberAddSuccess] = useState<string | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);
  const [showNameOnlyAdd, setShowNameOnlyAdd] = useState(false);

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
  const [mentionTrace, setMentionTrace] = useState<OrganizationMentionTrace | null>(null);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsLoaded, setMentionsLoaded] = useState(false);

  // Modal states for nested entities
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedLinkedOrg, setSelectedLinkedOrg] = useState<Organization | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  
  // Only reset local draft state when switching to a different organization.
  // Parent book refreshes must not wipe in-progress edits or close-side effects.
  useEffect(() => {
    setEditedOrg(resolvedOrganization);
    setMembers(resolvedOrganization.members || []);
    setStories(resolvedOrganization.stories || []);
    setEvents(resolvedOrganization.events || []);
    setLocations(resolvedOrganization.locations || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: id-scoped reset only
  }, [organization.id]);

  useEffect(() => {
    if (isMockDataEnabled || isEphemeralEntityId(organization.id)) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchOrganizationById(organization.id);
        if (cancelled) return;
        setEditedOrg(full);
        setMembers(full.members || []);
        setStories(full.stories || []);
        setEvents(full.events || []);
        setLocations(full.locations || []);
      } catch {
        // Keep seed profile on transient errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organization.id, isMockDataEnabled]);

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

  useEffect(() => {
    if (mentionsLoaded || !organization.id || isMockDataEnabled) return;
    if (activeTab !== 'sources' && activeTab !== 'info') return;
    setMentionsLoading(true);
    fetchJson<{ success: boolean; trace: OrganizationMentionTrace }>(
      `/api/organizations/${organization.id}/mentions?limit=120`
    )
      .then(r => {
        if (r.success) setMentionTrace(r.trace);
      })
      .catch(() => {})
      .finally(() => {
        setMentionsLoading(false);
        setMentionsLoaded(true);
      });
  }, [activeTab, organization.id, mentionsLoaded, isMockDataEnabled]);

  useEffect(() => {
    if (!isMockDataEnabled || mentionsLoaded) return;
    if (activeTab !== 'sources' && activeTab !== 'info') return;
    setMentionTrace(getMockOrganizationMentionTrace(editedOrg));
    setMentionsLoaded(true);
    setMentionsLoading(false);
  }, [activeTab, editedOrg, isMockDataEnabled, mentionsLoaded]);

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
      setMentionsLoaded(false);
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
      const [relResult] = await Promise.all([
        fetchJson<{ success: boolean; relationships: OrganizationRelationship[] }>(
          `/api/organizations/${organization.id}/relationships`
        ),
      ]);
      setRelationships(relResult.relationships || []);
      // Reuse the book's already-loaded org list when available — avoids a
      // redundant GET /api/organizations (5-table fan-out) on every relationships
      // tab open. Fall back to a fetch only when the modal was opened without context.
      if (allOrganizations.length > 0) {
        setRelatedOrgs(allOrganizations.filter(o => o.id !== organization.id));
      } else {
        const orgResult = await fetchJson<{ success: boolean; organizations: Organization[] }>(
          '/api/organizations'
        );
        setRelatedOrgs((orgResult.organizations || []).filter(o => o.id !== organization.id));
      }
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
      const result = await addOrganizationRelationship({
        organizationId: organization.id,
        relationship: {
          to_org_id: newRelationship.to_org_id,
          relationship_type: newRelationship.relationship_type,
          notes: newRelationship.notes || undefined,
        },
      }).unwrap() as { success: boolean; relationship: OrganizationRelationship };
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
      await removeOrganizationRelationship({ organizationId: organization.id, relationshipId }).unwrap();
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

  /**
   * A suggested group (candidate-<uuid>) is not a saved organization; editing
   * it promotes it: accept the candidate WITH the edits, then carry remaining
   * fields (e.g. aliases) onto the newly created organization. Returns true
   * when the candidate path handled the save.
   */
  const promoteCandidateWithEdits = async (values: Record<string, unknown>): Promise<boolean> => {
    const candidateRef = editedOrg.metadata?.group_candidate_id
      ? String(editedOrg.metadata.group_candidate_id)
      : organization.id.startsWith('candidate-')
        ? organization.id.replace(/^candidate-/, '')
        : null;
    if (!candidateRef || isMockDataEnabled) return false;

    const accept = await fetchJson<{ success: boolean; organization_id?: string }>(
      `/api/group-candidates/${candidateRef}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: String(values.name ?? editedOrg.name),
          group_type: (values.group_type ?? editedOrg.group_type) || undefined,
          user_relationship: (values.user_relationship ?? editedOrg.user_relationship) || undefined,
          membership_model: (values.membership_model ?? editedOrg.membership_model) || undefined,
          description: (values.description ?? editedOrg.description) || undefined,
        }),
      },
    );
    if (!accept.organization_id) {
      throw new Error('Could not save this suggested group — accepting it failed.');
    }
    // Aliases and any other fields the accept endpoint does not take.
    await updateOrganization({ id: accept.organization_id, values }).unwrap().catch(() => {});
    apiCache.deletePattern(/\/api\/(organizations|books|counts|group-candidates)/);

    // Keep the modal open on the newly created organization and CONFIRM the
    // save, instead of silently closing while the book reloads underneath.
    const savedName = String(values.name ?? editedOrg.name);
    try {
      const fresh = await fetchJson<{ success: boolean; organization?: Organization }>(
        `/api/organizations/${accept.organization_id}`,
      );
      if (fresh.organization && onSelectOrganization) {
        onSelectOrganization(fresh.organization);
      }
    } catch {
      /* book refresh below still shows the new group */
    }
    setIdentitySaved(
      `Saved — "${savedName}" is now a real group. LoreBook recorded your correction and will use this name going forward.`,
    );
    return true;
  };

  const applyOrgPatch = async (
    values: Record<string, unknown>,
    options?: { markIdentityLocked?: boolean },
  ): Promise<void> => {
    if (await promoteCandidateWithEdits(values)) return;
    if (isEphemeralEntityId(organization.id) && !isMockDataEnabled) {
      throw new Error('This group has no saved record yet — try again after it finishes saving.');
    }

    const previousIdentity = {
      name: editedOrg.name,
      aliases: editedOrg.aliases ?? [],
    };
    const patch: Record<string, unknown> = { ...values };
    if (options?.markIdentityLocked) {
      patch.metadata = {
        ...(editedOrg.metadata ?? {}),
        identity_locked_by_user: true,
        identity_last_corrected_at: new Date().toISOString(),
        previous_identity: previousIdentity,
        manual_identity_correction: {
          ...previousIdentity,
          ...values,
        },
      };
    }

    if (isMockDataEnabled) {
      setEditedOrg((prev) => ({
        ...prev,
        ...patch,
        aliases: Array.isArray(patch.aliases) ? (patch.aliases as string[]) : prev.aliases,
        metadata: (patch.metadata as Organization['metadata']) ?? prev.metadata,
      }));
      return;
    }

    const result = (await updateOrganization({
      id: organization.id,
      values: patch,
    }).unwrap()) as { success?: boolean; organization?: Organization } | Organization;

    const next =
      result && typeof result === 'object' && 'organization' in result && result.organization
        ? result.organization
        : result && typeof result === 'object' && 'id' in result && 'name' in result
          ? (result as Organization)
          : null;

    if (next?.id) {
      setEditedOrg((prev) => ({ ...prev, ...next }));
    } else {
      setEditedOrg((prev) => ({
        ...prev,
        ...patch,
        aliases: Array.isArray(patch.aliases) ? (patch.aliases as string[]) : prev.aliases,
      }));
    }
    apiCache.deletePattern(/\/api\/(organizations|books|counts)/);
    onUpdate?.();
  };

  /** Inline header rename — same path as Character/Location modals. */
  const handleRenameOrganization = async (nextName: string) => {
    const name = nextName.trim();
    if (!name || name === editedOrg.name.trim()) return;
    setSaving(true);
    setIdentityError(null);
    try {
      await applyOrgPatch({ name }, { markIdentityLocked: true });
      setMentionsLoaded(false);
    } catch (error) {
      console.error('Failed to rename organization:', error);
      throw error instanceof Error ? error : new Error('Failed to rename group');
    } finally {
      setSaving(false);
    }
  };

  /** Persist the full alias list ("also known as") for this group. */
  const saveAliases = async (nextAliases: string[]) => {
    const cleaned = [
      ...new Set(
        nextAliases
          .map((a) => a.trim())
          .filter(Boolean)
          .filter((a) => a.toLowerCase() !== editedOrg.name.trim().toLowerCase()),
      ),
    ];
    setSaving(true);
    setMemberAddError(null);
    try {
      await applyOrgPatch({ aliases: cleaned }, { markIdentityLocked: true });
      setMentionsLoaded(false);
    } catch (error) {
      console.error('Failed to save aliases:', error);
      setMemberAddError(error instanceof Error ? error.message : 'Could not update aliases.');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setIdentityError(null);
    try {
      const previousIdentity = {
        name: organization.name,
        aliases: organization.aliases,
        type: organization.type,
        group_type: organization.group_type,
        membership_model: organization.membership_model,
        user_relationship: organization.user_relationship,
        is_public_entity: organization.is_public_entity,
        founded_year: organization.founded_year,
        dissolved_year: organization.dissolved_year,
        description: organization.description,
        location: organization.location,
        founded_date: organization.founded_date,
        status: organization.status,
      };
      const correctedIdentity = {
        name: editedOrg.name,
        aliases: editedOrg.aliases,
        type: editedOrg.type,
        group_type: editedOrg.group_type,
        membership_model: editedOrg.membership_model,
        user_relationship: editedOrg.user_relationship,
        is_public_entity: editedOrg.is_public_entity,
        founded_year: editedOrg.founded_year,
        dissolved_year: editedOrg.dissolved_year,
        description: editedOrg.description,
        location: editedOrg.location,
        founded_date: editedOrg.founded_date,
        status: editedOrg.status,
      };
      const updates = {
        name: editedOrg.name.trim(),
        aliases: [...new Set((editedOrg.aliases ?? []).map((a) => a.trim()).filter(Boolean))],
        type: editedOrg.type,
        group_type: editedOrg.group_type,
        membership_model: editedOrg.membership_model,
        user_relationship: editedOrg.user_relationship,
        is_public_entity: editedOrg.is_public_entity,
        founded_year: editedOrg.founded_year,
        dissolved_year: editedOrg.dissolved_year,
        description: editedOrg.description,
        location: editedOrg.location,
        founded_date: editedOrg.founded_date,
        status: editedOrg.status,
        metadata: {
          ...(organization.metadata ?? {}),
          ...(editedOrg.metadata ?? {}),
          identity_locked_by_user: true,
          identity_last_corrected_at: new Date().toISOString(),
          previous_identity: previousIdentity,
          manual_identity_correction: correctedIdentity,
        },
      };

      if (isMockDataEnabled) {
        setEditedOrg((prev) => ({
          ...prev,
          ...updates,
        }));
        setEditingIdentity(false);
        setMentionTrace(getMockOrganizationMentionTrace({ ...editedOrg, ...updates }));
        setMentionsLoaded(true);
        return;
      }

      setIdentitySaved(null);
      if (await promoteCandidateWithEdits(updates)) {
        setEditingIdentity(false);
        return;
      }
      await updateOrganization({ id: organization.id, values: updates }).unwrap();
      setIdentitySaved(
        `Saved — "${String(updates.name ?? editedOrg.name)}" updated. LoreBook recorded your correction and will remember it.`,
      );

      setEditingIdentity(false);
      setMentionsLoaded(false);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to save organization:', error);
      setIdentityError(
        error instanceof Error && error.message
          ? `Save failed: ${error.message}`
          : 'Save failed — your changes were not stored. Try again.',
      );
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
                      await updateOrganization({ id: organization.id, values: patch }).unwrap();
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
                        await addOrganizationMember({ organizationId: organization.id, member }).unwrap();
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

  const openAddMemberPanel = async () => {
    const next = !showAddMember;
    setShowAddMember(next);
    setMemberAddError(null);
    setMemberAddSuccess(null);
    setShowNameOnlyAdd(false);
    setSelectedBookCharacterId('');
    setCharacterBookSearch('');
    setNewMember({ character_name: '', role: '', status: 'active' });
    if (next && characterBookOptions.length === 0 && !characterBookLoading) {
      setCharacterBookLoading(true);
      try {
        // Prefer books BFF (same source as Character Book page); fall back to list aliases.
        let list: Character[] = [];
        try {
          const book = await booksApi.loadCharacters();
          list = (book.characters ?? []) as Character[];
        } catch {
          const res = await fetchJson<{ characters?: Character[]; success?: boolean } | Character[]>(
            '/api/characters',
          );
          list = Array.isArray(res)
            ? res
            : Array.isArray((res as { characters?: Character[] }).characters)
              ? (res as { characters: Character[] }).characters
              : [];
        }
        setCharacterBookOptions(
          list
            .filter((c) => c?.id && c?.name && !String(c.id).startsWith('temp-'))
            .map((c) => ({ id: c.id, name: c.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } catch {
        setMemberAddError('Could not load your Character Book.');
      } finally {
        setCharacterBookLoading(false);
      }
    }
  };

  const rosterCharacterIds = useMemo(
    () => new Set(members.map((m) => m.character_id).filter((id): id is string => Boolean(id))),
    [members],
  );

  const availableBookCharacters = useMemo(() => {
    const term = characterBookSearch.trim().toLowerCase();
    return characterBookOptions.filter((c) => {
      if (rosterCharacterIds.has(c.id)) return false;
      const alreadyByName = members.some(
        (m) => !m.character_id && m.character_name.toLowerCase() === c.name.toLowerCase(),
      );
      if (alreadyByName) return false;
      if (!term) return true;
      return c.name.toLowerCase().includes(term);
    });
  }, [characterBookOptions, characterBookSearch, members, rosterCharacterIds]);

  /** Add from Character Book — posts character_id for an official durable link. */
  const handleAddExistingCharacter = async () => {
    if (!selectedBookCharacterId || memberSaving) return;
    const chosen = characterBookOptions.find((c) => c.id === selectedBookCharacterId);
    if (!chosen) {
      setMemberAddError('Choose a person from your Character Book.');
      return;
    }
    if (isEphemeralEntityId(organization.id)) {
      setMemberAddError('Save this group first before linking people.');
      return;
    }

    setMemberSaving(true);
    setMemberAddError(null);
    try {
      const result = (await addOrganizationMember({
        organizationId: organization.id,
        member: {
          character_id: chosen.id,
          character_name: chosen.name,
          role: newMember.role.trim() || undefined,
          status: 'active',
        },
      }).unwrap()) as { success?: boolean; member?: OrganizationMember };

      const saved = result?.member;
      if (saved?.id) {
        setMembers((prev) => {
          const withoutDup = prev.filter(
            (m) =>
              m.id !== saved.id &&
              m.character_id !== saved.character_id &&
              m.character_name.toLowerCase() !== saved.character_name.toLowerCase(),
          );
          return [...withoutDup, saved];
        });
      } else {
        setMembers((prev) => [
          ...prev,
          {
            id: `member-${Date.now()}`,
            character_id: chosen.id,
            character_name: chosen.name,
            role: newMember.role.trim() || undefined,
            status: 'active',
          },
        ]);
      }
      setSelectedBookCharacterId('');
      setCharacterBookSearch('');
      setNewMember({ character_name: '', role: '', status: 'active' });
      setShowAddMember(false);
      setMemberAddSuccess(
        `${chosen.name} linked to this group and saved in your knowledge base.`,
      );
      onUpdate?.();
    } catch (error) {
      console.error('Failed to add member from Character Book:', error);
      setMemberAddError(
        error instanceof Error ? error.message : 'Could not link this person to the group.',
      );
    } finally {
      setMemberSaving(false);
    }
  };

  /** Name-only fallback when the person is not in the Character Book yet. */
  const handleAddMember = async () => {
    if (!newMember.character_name.trim() || memberSaving) return;
    if (isEphemeralEntityId(organization.id)) {
      setMemberAddError('Save this group first before adding people.');
      return;
    }

    setMemberSaving(true);
    setMemberAddError(null);
    try {
      const result = (await addOrganizationMember({
        organizationId: organization.id,
        member: {
          character_name: newMember.character_name.trim(),
          role: newMember.role.trim() || undefined,
          status: newMember.status,
        },
      }).unwrap()) as { success?: boolean; member?: OrganizationMember };

      const saved = result?.member;
      if (saved?.id) {
        setMembers((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
      } else {
        setMembers((prev) => [
          ...prev,
          {
            id: `member-${Date.now()}`,
            character_name: newMember.character_name.trim(),
            role: newMember.role.trim() || undefined,
            status: newMember.status,
          },
        ]);
      }
      const linkedName = saved?.character_name || newMember.character_name.trim();
      setNewMember({ character_name: '', role: '', status: 'active' });
      setShowAddMember(false);
      setShowNameOnlyAdd(false);
      setMemberAddSuccess(
        saved?.character_id
          ? `${linkedName} matched Character Book and was linked in your knowledge base.`
          : `${linkedName} added by name (unlinked). Add them to Character Book to solidify.`,
      );
      onUpdate?.();
    } catch (error) {
      console.error('Failed to add member:', error);
      setMemberAddError(error instanceof Error ? error.message : 'Could not add member.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      await removeOrganizationMember({ organizationId: organization.id, itemId: memberId }).unwrap();
      onUpdate?.();
    } catch (error) {
      console.error('Failed to remove member:', error);
      setMembers(previous);
      setMemberAddError('Could not remove member. Try again.');
    }
  };

  const handleAddEvent = async () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    setEventLoading(true);
    try {
      const result = await addOrganizationEvent({
        organizationId: organization.id,
        event: newEvent,
      }).unwrap() as { success: boolean; event: OrganizationEvent };
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
      await removeOrganizationEvent({ organizationId: organization.id, itemId: eventId }).unwrap();
    } catch (error) {
      console.error('Failed to remove event:', error);
    }
  };

  const handleAddStory = async () => {
    if (!newStory.title.trim() || !newStory.summary.trim() || !newStory.date) return;
    setStoryLoading(true);
    try {
      const result = await addOrganizationStory({
        organizationId: organization.id,
        story: newStory,
      }).unwrap() as { success: boolean; story: OrganizationStory };
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
      await removeOrganizationStory({ organizationId: organization.id, itemId: storyId }).unwrap();
    } catch (error) {
      console.error('Failed to remove story:', error);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.location_name.trim()) return;
    setLocationLoading(true);
    try {
      const result = await addOrganizationLocation({
        organizationId: organization.id,
        location: newLocation,
      }).unwrap() as { success: boolean; location: OrganizationLocation };
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
      await removeOrganizationLocation({ organizationId: organization.id, itemId: locationId }).unwrap();
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
      await deleteOrganization(organization.id).unwrap();
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
          onRename={handleRenameOrganization}
          renameDisabled={
            (isEphemeralEntityId(organization.id) ||
              Boolean(editedOrg.metadata?.preview_candidate) ||
              Boolean(editedOrg.metadata?.group_candidate_id)) &&
            !isMockDataEnabled
          }
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
            <TabsContent value="info" className="mt-0 space-y-3">
              <Card className="overflow-hidden border-white/10 bg-black/50">
                <CardContent className="p-0">
                  <div className="border-b border-white/8 bg-white/[0.03] px-3 py-3 sm:px-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10">
                            <Edit2 className="h-3.5 w-3.5 text-amber-300" />
                          </span>
                          <h3 className="text-sm font-semibold text-white">Canonical identity</h3>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              editedOrg.metadata?.identity_locked_by_user
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                                : 'border-sky-500/25 bg-sky-500/10 text-sky-200'
                            }`}
                          >
                            {editedOrg.metadata?.identity_locked_by_user ? 'User corrected' : 'Auto learned'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-white/45">
                          Edits here become the trusted group identity and feed future detection.
                        </p>
                      </div>
                      {editingIdentity ? (
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-white/10"
                            onClick={() => {
                              setEditedOrg(resolvedOrganization);
                              setEditingIdentity(false);
                            }}
                          >
                            Cancel
                          </Button>
                          {identityError && (
                            <p className="w-full text-xs text-red-400" data-testid="identity-save-error">{identityError}</p>
                          )}
                          {identitySaved && !identityError && (
                            <p className="w-full text-xs text-emerald-400" data-testid="identity-save-success">✓ {identitySaved}</p>
                          )}
                          <Button size="sm" className="h-9" onClick={() => void handleSave()} disabled={saving}>
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Save</span>
                          </Button>
                        </div>
                      ) : (
                        <>
                        {identitySaved && (
                          <p className="w-full text-xs text-emerald-400" data-testid="identity-saved-confirmation">✓ {identitySaved}</p>
                        )}
                        <Button variant="outline" size="sm" className="h-9 w-full border-white/10 sm:w-auto" onClick={() => setEditingIdentity(true)}>
                          <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                          Edit identity
                        </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Always-visible alias chips — add/remove without full identity form */}
                  <div className="border-b border-white/8 px-3 py-3 sm:px-4">
                    <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">
                      Also known as
                    </p>
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      data-testid="org-alias-editor"
                    >
                      {(editedOrg.aliases ?? []).length === 0 && (
                        <span className="text-xs text-white/35">No aliases yet</span>
                      )}
                      {(editedOrg.aliases ?? []).map((alias) => (
                        <span
                          key={alias}
                          className="flex items-center gap-1 text-xs pl-2.5 pr-1 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-200"
                        >
                          {alias}
                          <button
                            type="button"
                            aria-label={`Remove alias ${alias}`}
                            className="p-0.5 text-violet-200/40 hover:text-red-300 disabled:opacity-40"
                            disabled={saving || (isEphemeralEntityId(organization.id) && !isMockDataEnabled)}
                            onClick={() =>
                              void saveAliases((editedOrg.aliases ?? []).filter((a) => a !== alias))
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="Add alias…"
                        aria-label="Add group alias"
                        data-testid="org-alias-add-input"
                        disabled={saving || (isEphemeralEntityId(organization.id) && !isMockDataEnabled)}
                        className="w-28 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs text-white placeholder:text-white/25 focus:border-primary/60 focus:outline-none disabled:opacity-40"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (!value) return;
                            const existing = editedOrg.aliases ?? [];
                            if (
                              existing.some((a) => a.toLowerCase() === value.toLowerCase()) ||
                              value.toLowerCase() === editedOrg.name.trim().toLowerCase()
                            ) {
                              input.value = '';
                              return;
                            }
                            input.value = '';
                            void saveAliases([...existing, value]);
                          }
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/30">
                      Press Enter to add. Aliases help chat and detection recognize other names for this group.
                    </p>
                  </div>

                  {editingIdentity ? (
                    <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4">
                      <label className="space-y-1.5 sm:col-span-2">
                        <span className={FIELD_LABEL}>Name</span>
                        <Input
                          value={editedOrg.name}
                          onChange={(e) => setEditedOrg((prev) => ({ ...prev, name: e.target.value }))}
                          className={FIELD_INPUT}
                          aria-label="Group name"
                          data-testid="org-identity-name-input"
                        />
                        <p className="text-[10px] text-white/30">
                          You can also rename from the pencil icon on the title above.
                        </p>
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Group type</span>
                        <select
                          value={editedOrg.group_type ?? 'other'}
                          onChange={e => {
                            const groupType = e.target.value as Organization['group_type'];
                            const legacyTypes = new Set(['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'family', 'martial_arts', 'other']);
                            setEditedOrg(prev => ({
                              ...prev,
                              group_type: groupType,
                              type: (legacyTypes.has(groupType) ? groupType : 'other') as Organization['type'],
                            }));
                          }}
                          className={FIELD_SELECT}
                        >
                          {GROUP_TYPE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Your relationship</span>
                        <select
                          value={editedOrg.user_relationship ?? 'referenced'}
                          onChange={e => setEditedOrg(prev => ({ ...prev, user_relationship: e.target.value as Organization['user_relationship'] }))}
                          className={FIELD_SELECT}
                        >
                          {USER_RELATIONSHIP_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Membership model</span>
                        <select
                          value={editedOrg.membership_model ?? 'none'}
                          onChange={e => setEditedOrg(prev => ({ ...prev, membership_model: e.target.value as Organization['membership_model'] }))}
                          className={FIELD_SELECT}
                        >
                          {MEMBERSHIP_MODEL_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Status</span>
                        <select
                          value={editedOrg.status ?? 'active'}
                          onChange={e => setEditedOrg(prev => ({ ...prev, status: e.target.value as Organization['status'] }))}
                          className={FIELD_SELECT}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="dissolved">Dissolved</option>
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Location</span>
                        <Input
                          value={editedOrg.location ?? ''}
                          onChange={e => setEditedOrg(prev => ({ ...prev, location: e.target.value }))}
                          className={FIELD_INPUT}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className={FIELD_LABEL}>Founded date</span>
                        <Input
                          type="date"
                          value={editedOrg.founded_date ?? ''}
                          onChange={e => setEditedOrg(prev => ({ ...prev, founded_date: e.target.value || undefined }))}
                          className={FIELD_INPUT}
                        />
                      </label>
                      <label className="flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-3 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={Boolean(editedOrg.is_public_entity)}
                          onChange={e => setEditedOrg(prev => ({ ...prev, is_public_entity: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span className="text-sm leading-relaxed text-white/75">This is an official/public entity, not a private friend group.</span>
                      </label>
                      <label className="space-y-1.5 sm:col-span-2">
                        <span className={FIELD_LABEL}>Description</span>
                        <Textarea
                          value={editedOrg.description ?? ''}
                          onChange={e => setEditedOrg(prev => ({ ...prev, description: e.target.value }))}
                          className="min-h-[96px] bg-black/55 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20"
                          rows={3}
                          placeholder="What this group or organization actually is"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3 sm:p-4">
                      {editedOrg.description && (
                        <p className="text-sm leading-relaxed text-white/70 line-clamp-3">
                          {editedOrg.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
                        <p className={FIELD_LABEL}>Type</p>
                        <p className="mt-1 font-medium text-white capitalize">{String(editedOrg.group_type ?? editedOrg.type).replace(/_/g, ' ')}</p>
                      </div>
                      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
                        <p className={FIELD_LABEL}>Relationship</p>
                        <p className="mt-1 font-medium text-white capitalize">{String(editedOrg.user_relationship ?? 'referenced').replace(/_/g, ' ')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('sources')}
                        className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5 text-left transition hover:border-primary/35 hover:bg-primary/5"
                      >
                        <p className={FIELD_LABEL}>Mentions</p>
                        <p className="mt-1 font-semibold text-white tabular-nums">{mentionsLoading ? '...' : mentionTrace?.total_mentions ?? 0}</p>
                      </button>
                      <div className="rounded-lg border border-white/8 bg-white/[0.03] p-2.5">
                        <p className={FIELD_LABEL}>Scope</p>
                        <p className="mt-1 font-medium text-white">{editedOrg.is_public_entity ? 'Official' : 'Personal'}</p>
                      </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/[0.07] via-black/40 to-black/50 overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3.5 py-3 sm:px-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-300 shrink-0" />
                      People
                      <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/55">
                        {members.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-white/40 mt-0.5 truncate">
                      Roster for {editedOrg.name}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 h-9 px-3 text-xs bg-violet-500/20 border border-violet-400/30 text-violet-100 hover:bg-violet-500/30"
                    onClick={() => void openAddMemberPanel()}
                    data-testid="org-add-member-toggle"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {showAddMember ? 'Close' : 'Add person'}
                  </Button>
                </div>

              {showAddMember && (
                <div className="border-b border-white/8 bg-black/35 px-3.5 py-3.5 sm:px-4 space-y-3">
                    <p className="text-[12px] text-white/55 leading-relaxed">
                      Pick someone who already exists in your Character Book. LoreBook saves an official
                      membership link in your knowledge base (person ↔ group).
                    </p>
                    <Input
                      value={characterBookSearch}
                      onChange={(e) => setCharacterBookSearch(e.target.value)}
                      placeholder="Search Character Book…"
                      aria-label="Search Character Book people"
                      data-testid="org-add-member-character-search"
                      disabled={characterBookLoading || memberSaving}
                      className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                    />
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_auto]">
                      <select
                        value={selectedBookCharacterId}
                        onChange={(e) => setSelectedBookCharacterId(e.target.value)}
                        disabled={characterBookLoading || memberSaving}
                        aria-label="Existing character from Character Book"
                        data-testid="org-add-member-character-select"
                        className="h-10 rounded-xl border border-white/12 bg-black/55 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
                      >
                        <option value="">
                          {characterBookLoading
                            ? 'Loading Character Book…'
                            : availableBookCharacters.length === 0
                              ? characterBookSearch.trim()
                                ? 'No matching characters'
                                : 'No available characters'
                              : 'Choose a person…'}
                        </option>
                        {availableBookCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        list="org-member-role-options"
                        value={newMember.role}
                        onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                        placeholder="Role (optional)"
                        aria-label="Membership role"
                        className="h-10 rounded-xl border border-white/12 bg-black/55 px-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
                      />
                      <datalist id="org-member-role-options">
                        {['member', 'leader', 'founder', 'organizer', 'regular', 'alumnus', 'captain', 'coach'].map(
                          (r) => (
                            <option key={r} value={r} />
                          ),
                        )}
                      </datalist>
                      <Button
                        size="sm"
                        className="h-10 px-4 text-sm"
                        disabled={!selectedBookCharacterId || memberSaving}
                        onClick={() => void handleAddExistingCharacter()}
                        data-testid="org-add-member-submit"
                      >
                        {memberSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                      </Button>
                    </div>

                    <button
                      type="button"
                      className="text-[11px] text-white/40 hover:text-white/70 underline-offset-2 hover:underline"
                      onClick={() => setShowNameOnlyAdd((v) => !v)}
                    >
                      {showNameOnlyAdd ? 'Hide name-only add' : 'Person not listed? Add by name'}
                    </button>

                    {showNameOnlyAdd && (
                      <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
                        <p className="text-[10px] text-white/40">
                          If that exact name already exists in Character Book, LoreBook auto-links them.
                          Otherwise the row stays unlinked until you create their character card.
                        </p>
                        <Input
                          placeholder="Member name"
                          value={newMember.character_name}
                          onChange={(e) =>
                            setNewMember((prev) => ({ ...prev, character_name: e.target.value }))
                          }
                          className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => void handleAddMember()}
                            className="flex-1 h-9"
                            disabled={!newMember.character_name.trim() || memberSaving}
                          >
                            Add by name
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9"
                            onClick={() => {
                              setShowAddMember(false);
                              setShowNameOnlyAdd(false);
                              setMemberAddError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {memberAddError && (
                      <p className="text-xs text-red-400" role="alert">
                        {memberAddError}
                      </p>
                    )}
                </div>
              )}

              {memberAddSuccess && !showAddMember && (
                <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 sm:px-4">
                  <p className="text-xs text-emerald-200" role="status" data-testid="org-add-member-success">
                    {memberAddSuccess}
                  </p>
                </div>
              )}

              <div className="p-2 sm:p-2.5 space-y-1.5">
                {members.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/12 bg-black/25 px-4 py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10">
                      <Users className="h-5 w-5 text-violet-300/80" />
                    </div>
                    <p className="text-sm font-medium text-white/75">No people yet</p>
                    <p className="mt-1 text-xs text-white/40 max-w-xs mx-auto leading-relaxed">
                      Add someone from your Character Book to build this group’s roster.
                    </p>
                    {!showAddMember && (
                      <Button
                        size="sm"
                        className="mt-4 h-9"
                        onClick={() => void openAddMemberPanel()}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add person
                      </Button>
                    )}
                  </div>
                ) : (
                  members.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      className="group w-full text-left rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 sm:px-3.5 transition hover:border-violet-400/30 hover:bg-violet-500/[0.08] active:scale-[0.995]"
                      onClick={async () => {
                        if (member.character_id) {
                          try {
                            const char = await fetchJson<Character>(`/api/characters/${member.character_id}`);
                            setSelectedCharacter(char);
                          } catch {
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
                          } catch {
                            setSelectedCharacter({
                              id: `temp-${member.character_name}`,
                              name: member.character_name,
                            } as Character);
                          }
                        }
                      }}
                    >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15 border border-violet-400/25 flex items-center justify-center text-sm font-bold text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                            {member.character_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-white text-sm truncate">
                                {member.character_name}
                              </span>
                              {member.character_id ? (
                                <span
                                  className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200"
                                  title="Linked to Character Book"
                                >
                                  <Link2 className="h-2.5 w-2.5" />
                                  Linked
                                </span>
                              ) : (
                                <span
                                  className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200/90"
                                  title="Name only — not linked to Character Book"
                                >
                                  Name only
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/45">
                              {member.role ? (
                                <span className="text-white/60">{member.role}</span>
                              ) : (
                                <span className="text-white/30">No role set</span>
                              )}
                              <span className="text-white/20">·</span>
                              <span className="capitalize">{member.status}</span>
                            </div>
                            {member.notes && (
                              <div className="text-[11px] text-white/35 mt-0.5 line-clamp-1">{member.notes}</div>
                            )}
                            {member.character_id && memberAffiliations[member.character_id]?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                                {memberAffiliations[member.character_id].map((org) => (
                                  <Badge
                                    key={org.id}
                                    variant="outline"
                                    className="text-[10px] border-purple-500/30 bg-purple-500/10 text-purple-200 cursor-pointer hover:bg-purple-500/20"
                                    onClick={() => {
                                      void fetchJson<{ success: boolean; organization: Organization }>(
                                        `/api/organizations/${org.id}`,
                                      )
                                        .then((r) => {
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
                          <button
                            type="button"
                            aria-label={`Remove ${member.character_name}`}
                            className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-white/25 opacity-70 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRemoveMember(member.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                    </button>
                  ))
                )}
              </div>
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

            {/* Sources Tab */}
            <TabsContent value="sources" className={TAB_PANEL}>
              <div className="rounded-xl border border-white/10 bg-black/50 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10">
                        <Search className="h-4 w-4 text-sky-300" />
                      </span>
                      <div>
                        <h3 className={TAB_HEADING}>Sources and mentions</h3>
                        <p className="text-xs text-white/45">
                          Evidence for this identity across chats, older threads, and extracted facts.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full border-white/10 sm:w-auto"
                    disabled={mentionsLoading}
                    onClick={() => {
                      setMentionsLoaded(false);
                      setMentionTrace(null);
                    }}
                  >
                    {mentionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="ml-1.5">Rescan</span>
                  </Button>
                </div>
              </div>

              {mentionsLoading ? (
                <Card className="border-white/10 bg-black/40">
                  <CardContent className="py-8 text-center text-white/55">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Searching messages, extracted facts, and older threads...
                  </CardContent>
                </Card>
              ) : !mentionTrace ? (
                <Card className="border-white/10 bg-black/40">
                  <CardContent className="py-8 text-center text-white/55">
                    Open this tab to scan for mentions.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-100/60">Total</p>
                      <p className="mt-1 text-2xl font-bold leading-none text-white tabular-nums">{mentionTrace.total_mentions}</p>
                    </div>
                    <SourceMetric label="Chat" value={mentionTrace.source_counts?.chat_messages ?? 0} />
                    <SourceMetric label="Older" value={mentionTrace.source_counts?.conversation_messages ?? 0} />
                    <SourceMetric label="Facts" value={mentionTrace.facts.length} />
                  </div>

                  {mentionTrace.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] p-2">
                      {mentionTrace.labels.map(label => (
                        <Badge key={label} variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-200">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Card className="border-white/10 bg-black/45">
                    <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-white">Extracted identity facts</h4>
                        <Badge variant="outline" className="border-white/10 text-[10px] text-white/50">
                          {mentionTrace.facts.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                      {mentionTrace.facts.length === 0 ? (
                        <p className="text-sm text-white/45">No extracted facts are tied to this organization yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {mentionTrace.facts.slice(0, 12).map((fact: any) => (
                            <div key={fact.id} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                              <p className="text-sm leading-relaxed text-white/80">{fact.fact}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {fact.category && <Badge variant="outline" className="border-white/10 text-[10px] text-white/45">{fact.category}</Badge>}
                                {typeof fact.confidence === 'number' && <Badge variant="outline" className="border-emerald-500/20 text-[10px] text-emerald-200/75">{Math.round(fact.confidence * 100)}%</Badge>}
                                {fact.status && <Badge variant="outline" className="border-amber-500/20 text-[10px] text-amber-200/75">{fact.status}</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="space-y-2.5">
                    {mentionTrace.mentions.length === 0 ? (
                      <Card className="border-white/10 bg-black/40">
                        <CardContent className="py-8 text-center text-white/55">
                          No message mentions found for the current name or aliases.
                        </CardContent>
                      </Card>
                    ) : (
                      mentionTrace.mentions.map(mention => (
                        <Card key={mention.id} className="border-white/10 bg-black/45 transition-colors hover:border-sky-500/25">
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-[10px] text-sky-200">
                                    {mention.matched_label}
                                  </Badge>
                                  <Badge variant="outline" className="border-white/10 text-[10px] text-white/45">
                                    {mention.source === 'chat_messages'
                                      ? 'Chat'
                                      : mention.source === 'conversation_messages'
                                        ? 'Legacy thread'
                                        : 'Entity fact'}
                                  </Badge>
                                  {mention.role && <Badge variant="outline" className="border-white/10 text-[10px] capitalize text-white/45">{mention.role}</Badge>}
                                </div>
                                {mention.thread_title && (
                                  <p className="mb-1 truncate text-xs font-medium text-white/65">{mention.thread_title}</p>
                                )}
                                <p className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">{mention.snippet}</p>
                                <div className="mt-2 flex items-center gap-2 text-[10px] text-white/30">
                                  {mention.created_at && <span>{formatDate(mention.created_at)}</span>}
                                  <span className="h-1 w-1 rounded-full bg-white/20" />
                                  <span>{mention.source_id.slice(0, 8)}</span>
                                </div>
                              </div>
                              <div className="flex h-8 w-full shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-xs font-semibold text-white/70 tabular-nums sm:w-12">
                                x{mention.occurrence_count}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </>
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

function SourceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/35">{label}</p>
      <p className="mt-1 text-2xl font-bold leading-none text-white tabular-nums">{value}</p>
    </div>
  );
}
