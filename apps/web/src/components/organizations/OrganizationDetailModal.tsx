// =====================================================
// ORGANIZATION DETAIL MODAL
// Purpose: Comprehensive organization profile with chatbot editing
// Features: Info, Members, Stories, Timeline, Locations, Chat (main-chat handoff), …
// =====================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Save, Users, BookOpen, Calendar, MapPin, Clock, FileText, Building2, Plus, Edit2, Trash2, Sparkles, TrendingUp, TrendingDown, Minus, Award, Star, Info, Loader2, Link2, ArrowRight, ArrowLeft, TreePine, AlertTriangle, Search, MessageSquare } from 'lucide-react';
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
import { fetchCharacterList } from '../../api/characterList';
import {
  fetchLocationById,
  fetchOrganizationById,
  isEphemeralEntityId,
  locationStub,
  normalizeLocationProfile,
} from '../../lib/hydrateBookEntity';
import { apiCache } from '../../lib/cache';
import { format, parseISO } from 'date-fns';
import { onStoryDataUpdated, dispatchStoryDataUpdated } from '../../lib/storyRefresh';
import { invalidateOrganizationMembershipCaches } from '../../lib/invalidateOrganizationMembershipCaches';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { OrganizationMemberRoleSelect } from '../ui/OrganizationMemberRoleSelect';
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
import { OrganizationModalHeader } from './OrganizationModalHeader';
import { EntityModalBottomNav } from '../common/EntityModalBottomNav';
import {
  OrganizationModalNav,
  ORG_MODAL_BASE_TABS,
  normalizeOrgModalTab,
  type OrgModalTabKey,
} from './OrganizationModalNav';
import { OrganizationModalOverview } from './OrganizationModalOverview';
import { OrganizationActivityPanel } from './OrganizationActivityPanel';
import { PostEventComposer, type PostEventComposerPrefill } from '../events/PostEventComposer';
import { listDemoUserPostedEventsForOrganization, getDemoUserPostedEvent } from '../../mocks/userPostedEventsDemo';
import { OrgTimelineMomentPanel } from './OrgTimelineMomentPanel';
import { openOrgTimelineMomentChat } from './orgTimelineMomentChat';
import {
  FOCUSED_ENTITY_CHAT_PRESETS,
  ORGANIZATION_ROSTER_KNOWLEDGE_SCOPE,
  organizationRosterChatPrompt,
} from '../chat/focusedEntityChatPresets';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { mutationErrorMessage } from '../../store/rtkMutationUtils';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import {
  getMockOrganizationDerivedEvents,
  type OrgDerivedEvent,
} from '../../mocks/organizationTimeline';
import {
  getMockOrganizationMentionTrace,
  getMockMemberAffiliations,
  getMockOrganizationRelationships,
  enrichOrganizationForDemo,
} from '../../mocks/modalDemoData';
import {
  getDemoOrganizationLocationLinks,
  linkDemoLocationOrganization,
  linkDemoOrganizationLocationByName,
  unlinkDemoLocationOrganization,
} from '../../mocks/locationOrganizationDemoData';
import { mockDataService } from '../../services/mockDataService';
import { locationAliasesForDisplay } from '../../lib/locationMergeMetadata';
import { highlightTextTerms } from '../../lib/highlightTextTerms';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { OrganizationGroupNetwork, buildOrgNetworkPreview } from './OrganizationGroupNetwork';
import { locationMatchKey } from './orgNetworkSites';
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
type ManualOrgRelationshipType = OrgRelationshipType | 'contains_subgroup';

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
  source: 'conversation' | 'user_posted';
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

const ORG_REL_TYPE_OPTIONS = Object.keys(REL_TYPE_LABELS) as OrgRelationshipType[];
const MANUAL_ORG_REL_TYPE_OPTIONS: Array<{ value: ManualOrgRelationshipType; label: string }> = [
  { value: 'part_of', label: 'Part of (choose parent)' },
  { value: 'contains_subgroup', label: 'Contains subgroup' },
  ...ORG_REL_TYPE_OPTIONS
    .filter(type => type !== 'part_of')
    .map(type => ({ value: type, label: REL_TYPE_LABELS[type] })),
];
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
const GROUP_TYPE_LABEL_BY_VALUE: Partial<Record<string, string>> = Object.fromEntries(
  GROUP_TYPE_OPTIONS.map(option => [option.value as string, option.label]),
);
/**
 * No DB column tracks "unset" — group_type defaults to 'other'. We
 * distinguish "never detected/never set" from a genuine 'other' pick via
 * metadata.group_type_source: absent or 'user_cleared' means unset.
 */
const isGroupTypeUnset = (org: Pick<Organization, 'metadata'>): boolean => {
  const source = org.metadata?.group_type_source;
  return !source || source === 'user_cleared';
};
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
  // Mobile bottom nav (EntityModalBottomNav) renders Delete as its own
  // dangerAction chip at the end of the row, not as a regular tab.
  const sectionTabs = useMemo(() => tabs.filter((t) => t.key !== 'danger'), [tabs]);

  const [activeTab, setActiveTabState] = useState<TabKey>('info');
  // Mobile-only: header starts collapsed to leave room for tab content; the
  // name row always stays visible, desktop (sm:+) always shows everything.
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySaved, setIdentitySaved] = useState<string | null>(null);
  const [aliasInputError, setAliasInputError] = useState<string | null>(null);

  // Reclassify state (controlled via the EntityTypeSwitcher in the header)
  const [reclassifyTarget, setReclassifyTarget] = useState('');
  const [reclassifyBusy, setReclassifyBusy] = useState(false);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const [reclassifySuccess, setReclassifySuccess] = useState(false);

  /** Close modal and open main chat with this group focused. */
  const openOrgMainChat = useCallback(
    (prompt?: string, knowledgeScope?: string) => {
      const preset = FOCUSED_ENTITY_CHAT_PRESETS.organizations;
      onClose();
      openChatWithFocus({
        entityId: editedOrg.id,
        entityName: editedOrg.name,
        entityType: 'organization',
        sourceSurface: 'organizations',
        sourceLabel: CHAT_FOCUS_SOURCE_LABELS.organizations,
        knowledgeScope: knowledgeScope ?? preset.knowledgeScope,
        initialPrompt: prompt ?? preset.existingPrompt(editedOrg.name),
        arrivedAt: Date.now(),
      });
    },
    [editedOrg.id, editedOrg.name, onClose],
  );

  /** Roster / affiliation session in main chat (creates people + solidifies membership). */
  const openOrgRosterChat = useCallback(() => {
    openOrgMainChat(
      organizationRosterChatPrompt(editedOrg.name),
      ORGANIZATION_ROSTER_KNOWLEDGE_SCOPE,
    );
  }, [editedOrg.name, openOrgMainChat]);

  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(normalizeOrgModalTab(tab));
  }, []);

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
  const [characterBookOptions, setCharacterBookOptions] = useState<
    Array<{ id: string; name: string; aliases?: string[] }>
  >([]);
  const [characterBookLoading, setCharacterBookLoading] = useState(false);
  const [selectedBookCharacterId, setSelectedBookCharacterId] = useState('');
  const [characterBookSearch, setCharacterBookSearch] = useState('');
  const [memberAddError, setMemberAddError] = useState<string | null>(null);
  const [memberAddSuccess, setMemberAddSuccess] = useState<string | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);
  const [syncingFamilyTree, setSyncingFamilyTree] = useState(false);
  const [showNameOnlyAdd, setShowNameOnlyAdd] = useState(false);

  const notifyMembershipChanged = useCallback(
    (characterIds: string[]) => {
      const ids = characterIds.filter(Boolean);
      invalidateOrganizationMembershipCaches({
        characterIds: ids,
        organizationIds: [organization.id],
      });
      dispatchStoryDataUpdated({
        scopes: ['organizations', 'characters'],
        organizationIds: [organization.id],
        characterIds: ids,
      });
      onUpdate?.();
    },
    [organization.id, onUpdate],
  );

  // Stories state
  const [stories, setStories] = useState<OrganizationStory[]>(resolvedOrganization.stories || []);
  const [showAddStory, setShowAddStory] = useState(false);
  const [newStory, setNewStory] = useState({ title: '', summary: '', date: new Date().toISOString().split('T')[0] });
  const [storyLoading, setStoryLoading] = useState(false);
  const [showPostComposer, setShowPostComposer] = useState(false);
  const [postComposerPrefill, setPostComposerPrefill] = useState<PostEventComposerPrefill | null>(null);
  const [timelineMoment, setTimelineMoment] = useState<OrgDerivedEvent | null>(null);
  const [postedStoriesTick, setPostedStoriesTick] = useState(0);
  const [liveEventLinkedStories, setLiveEventLinkedStories] = useState<
    Array<{ id: string; title: string; summary: string; date: string; eventId: string }>
  >([]);

  const demoEventLinkedStories = useMemo(() => {
    void postedStoriesTick;
    return listDemoUserPostedEventsForOrganization(editedOrg.id, editedOrg.name).flatMap((ev) =>
      (ev.metadata.stories ?? []).map((s) => ({
        id: s.id,
        title: ev.title,
        summary: s.body,
        date: s.created_at,
        eventId: ev.id,
      })),
    );
  }, [editedOrg.id, editedOrg.name, postedStoriesTick]);

  const eventLinkedStories = isMockDataEnabled ? demoEventLinkedStories : liveEventLinkedStories;

  useEffect(() => {
    if (isMockDataEnabled || activeTab !== 'stories' || !editedOrg.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchJson<{
          success: boolean;
          events: Array<{
            id: string;
            title: string;
            metadata?: {
              created_via?: string;
              organization_ids?: string[];
              stories?: Array<{ id: string; body: string; created_at: string }>;
            };
          }>;
        }>('/api/conversation/events');
        if (cancelled) return;
        const linked = (res.events ?? [])
          .filter(
            (e) =>
              e.metadata?.created_via === 'user_posted' &&
              (e.metadata.organization_ids ?? []).includes(editedOrg.id),
          )
          .flatMap((ev) =>
            (ev.metadata?.stories ?? []).map((s) => ({
              id: s.id,
              title: ev.title,
              summary: s.body,
              date: s.created_at,
              eventId: ev.id,
            })),
          );
        setLiveEventLinkedStories(linked);
      } catch {
        if (!cancelled) setLiveEventLinkedStories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, editedOrg.id, isMockDataEnabled, postedStoriesTick]);

  // Events state (recorded milestones on the Timeline tab)
  const [events, setEvents] = useState<OrganizationEvent[]>(resolvedOrganization.events || []);
  const [eventLoading, setEventLoading] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<OrganizationLocation[]>(() => {
    const demoLinks = isMockDataEnabled
      ? getDemoOrganizationLocationLinks(resolvedOrganization.id)
      : [];
    const linkedIds = new Set(demoLinks.map((link) => link.location_id));
    return [
      ...demoLinks,
      ...(resolvedOrganization.locations || []).filter(
        (link) => !link.location_id || !linkedIds.has(link.location_id),
      ),
    ];
  });
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ location_name: '' });
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationBookOptions, setLocationBookOptions] = useState<
    Array<{ id: string; name: string; aliases?: string[] }>
  >([]);
  const [locationBookLoading, setLocationBookLoading] = useState(false);
  const [selectedBookLocationId, setSelectedBookLocationId] = useState('');
  const [locationBookSearch, setLocationBookSearch] = useState('');
  const [showNameOnlyLocationAdd, setShowNameOnlyLocationAdd] = useState(false);
  const [locationAddError, setLocationAddError] = useState<string | null>(null);
  const [locationAddSuccess, setLocationAddSuccess] = useState<string | null>(null);

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
  const [newRelationship, setNewRelationship] = useState<{
    to_org_id: string;
    relationship_type: ManualOrgRelationshipType;
    notes: string;
    siteKey: string;
  }>({
    to_org_id: '',
    relationship_type: 'affiliated_with',
    notes: '',
    siteKey: '',
  });
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  const [editingRelationshipId, setEditingRelationshipId] = useState<string | null>(null);
  const [relationshipEdit, setRelationshipEdit] = useState<{ relationship_type: OrgRelationshipType; notes: string }>({
    relationship_type: 'affiliated_with',
    notes: '',
  });

  // Delete state — two-step confirmation in the Delete tab
  const [deleteStep, setDeleteStep] = useState<null | 'warn' | 'type'>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [mentionTrace, setMentionTrace] = useState<OrganizationMentionTrace | null>(null);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionsLoaded, setMentionsLoaded] = useState(false);

  /** Name + aliases used to mark the entity inside mention / fact snippets. */
  const sourceHighlightTerms = useMemo(() => {
    const labels = [
      editedOrg.name,
      ...(editedOrg.aliases ?? []),
      ...(mentionTrace?.labels ?? []),
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const label of labels) {
      const trimmed = String(label ?? '').trim();
      if (trimmed.length < 2) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  }, [editedOrg.name, editedOrg.aliases, mentionTrace?.labels]);

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
    const demoLinks = isMockDataEnabled
      ? getDemoOrganizationLocationLinks(resolvedOrganization.id)
      : [];
    const linkedIds = new Set(demoLinks.map((link) => link.location_id));
    setLocations([
      ...demoLinks,
      ...(resolvedOrganization.locations || []).filter(
        (link) => !link.location_id || !linkedIds.has(link.location_id),
      ),
    ]);
    setReclassifyTarget('');
    setReclassifyBusy(false);
    setReclassifyError(null);
    setReclassifySuccess(false);
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
    if (
      (activeTab !== 'timeline' &&
        activeTab !== 'locations' &&
        activeTab !== 'relationships' &&
        activeTab !== 'info') ||
      derivedLoaded ||
      !organization.id
    ) {
      return;
    }
    if (isMockDataEnabled) {
      const mockDerived = getMockOrganizationDerivedEvents(organization);
      const posted = listDemoUserPostedEventsForOrganization(organization.id, organization.name).map(
        (e) => ({
          id: e.id,
          title: e.title,
          date: e.start_time,
          type: e.type,
          summary: e.summary ?? undefined,
          involved: e.people,
          audience: 'with_user' as const,
          user_was_present: true,
          source: 'user_posted' as const,
        }),
      );
      const existing = new Set(mockDerived.map((e) => e.id));
      setDerivedEvents([...posted.filter((e) => !existing.has(e.id)), ...mockDerived]);
      setDerivedLocations(
        (organization.locations ?? [])
          .filter((loc) => Boolean(loc.location_id))
          .map((loc) => ({
            // Use the Places Book entity id (not the org↔location link id) so
            // these cards can open the same modal as the linked-locations list.
            id: loc.location_id!,
            name: loc.location_name,
            involved: [],
            source: 'conversation' as const,
          })),
      );
      const { relationships: mockRels } = getMockOrganizationRelationships(organization, allOrganizations);
      const parent = mockRels.find(rel => rel.relationship_type === 'part_of' && rel.from_org_id === organization.id);
      const subgroups = mockRels.filter(rel => rel.relationship_type === 'part_of' && rel.to_org_id === organization.id);
      setDerivedHierarchy({
        parent: parent
          ? {
              id: parent.to_org_id,
              name: allOrganizations.find(org => org.id === parent.to_org_id)?.name ?? 'Unknown group',
              relationship_type: 'part_of',
            }
          : undefined,
        subgroups: subgroups.map(rel => ({
          id: rel.from_org_id,
          name: allOrganizations.find(org => org.id === rel.from_org_id)?.name ?? 'Unknown group',
          relationship_type: 'part_of',
        })),
        related: mockRels
          .filter(rel => rel.relationship_type !== 'part_of')
          .map(rel => {
            const otherId = rel.from_org_id === organization.id ? rel.to_org_id : rel.from_org_id;
            return {
              id: otherId,
              name: allOrganizations.find(org => org.id === otherId)?.name ?? 'Unknown group',
              relationship_type: rel.relationship_type,
            };
          }),
      });
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
          setDerivedHierarchy({
            parent: r.hierarchy?.parent,
            subgroups: r.hierarchy?.subgroups ?? [],
            related: r.hierarchy?.related ?? [],
          });
        }
      })
      .catch(() => {})
      .finally(() => { setDerivedLoading(false); setDerivedLoaded(true); });
  }, [activeTab, organization, derivedLoaded, isMockDataEnabled, allOrganizations]);

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
    return onStoryDataUpdated((detail) => {
      setDerivedLoaded(false);
      setMentionsLoaded(false);
      setFamilyRefreshKey(k => k + 1);
      setRelationshipsLoaded(false);
      void loadMemberAffiliations();
      const scopes = detail.scopes ?? [];
      const touchesOrgs =
        scopes.length === 0 ||
        scopes.includes('all') ||
        scopes.includes('organizations') ||
        scopes.includes('characters');
      const touchesThisOrg =
        !detail.organizationIds?.length || detail.organizationIds.includes(organization.id);
      if (
        touchesOrgs &&
        touchesThisOrg &&
        !isMockDataEnabled &&
        !isEphemeralEntityId(organization.id)
      ) {
        invalidateOrganizationMembershipCaches({
          organizationIds: [organization.id],
          characterIds: detail.characterIds ?? [],
        });
        void fetchOrganizationById(organization.id)
          .then((full) => {
            setMembers(full.members || []);
            setEditedOrg((prev) => ({ ...prev, members: full.members || prev.members }));
          })
          .catch(() => {});
      }
    });
  }, [organization.id, isMockDataEnabled]);

  const loadRelationships = useCallback(async () => {
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
  }, [allOrganizations, isMockDataEnabled, organization]);

  useEffect(() => {
    if (activeTab !== 'relationships') return;
    if (!isMockDataEnabled && relationshipsLoaded) return;
    void loadRelationships();
  }, [activeTab, isMockDataEnabled, loadRelationships, relationshipsLoaded]);

  const orgNameById = (id: string): string => {
    if (id === organization.id) return organization.name;
    return relatedOrgs.find(o => o.id === id)?.name || 'Unknown organization';
  };

  const hierarchySiteOptions = useMemo(() => {
    const containsSubgroup = newRelationship.relationship_type === 'contains_subgroup';
    const isPartOf = newRelationship.relationship_type === 'part_of';
    if (!containsSubgroup && !isPartOf) return [];
    const parentOrg = containsSubgroup
      ? organization
      : relatedOrgs.find((org) => org.id === newRelationship.to_org_id);
    const parentLocations = containsSubgroup
      ? locations
      : [
          ...(parentOrg?.locations ?? []),
          ...(isMockDataEnabled && parentOrg
            ? getDemoOrganizationLocationLinks(parentOrg.id)
            : []),
        ];
    const seen = new Set<string>();
    const options: Array<{ key: string; name: string; locationId?: string }> = [];
    for (const loc of parentLocations) {
      const key = locationMatchKey(loc);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push({
        key,
        name: loc.location_name,
        locationId: loc.location_id,
      });
    }
    return options;
  }, [
    isMockDataEnabled,
    locations,
    newRelationship.relationship_type,
    newRelationship.to_org_id,
    organization,
    relatedOrgs,
  ]);

  const groupsAtOrgLocation = useCallback((location: OrganizationLocation) => {
    const key = locationMatchKey(location);
    if (!key) return [];
    const peers = (relatedOrgs.length > 0 ? relatedOrgs : allOrganizations).filter(
      (org) => org.id !== organization.id,
    );
    return peers.filter((org) => {
      const isChild =
        org.parent_group_id === organization.id ||
        relationships.some(
          (rel) =>
            (rel.relationship_type === 'part_of' || rel.relationship_type === 'spawned_from') &&
            rel.from_org_id === org.id &&
            rel.to_org_id === organization.id,
        );
      if (!isChild) return false;
      const orgLocations = [
        ...(org.locations ?? []),
        ...(isMockDataEnabled ? getDemoOrganizationLocationLinks(org.id) : []),
      ];
      return orgLocations.some((loc) => locationMatchKey(loc) === key);
    });
  }, [allOrganizations, isMockDataEnabled, organization.id, relatedOrgs, relationships]);

  const previewNetwork = useMemo(() => {
    if (!isMockDataEnabled) return null;
    return buildOrgNetworkPreview(
      organization,
      relatedOrgs.length > 0 ? relatedOrgs : allOrganizations,
      relationships,
    );
  }, [isMockDataEnabled, organization, relatedOrgs, allOrganizations, relationships]);

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
      const containsSubgroup = newRelationship.relationship_type === 'contains_subgroup';
      const isHierarchy = containsSubgroup || newRelationship.relationship_type === 'part_of';
      const fromOrganizationId = containsSubgroup ? newRelationship.to_org_id : organization.id;
      const toOrganizationId = containsSubgroup ? organization.id : newRelationship.to_org_id;
      const relationshipType: OrgRelationshipType = containsSubgroup
        ? 'part_of'
        : newRelationship.relationship_type as OrgRelationshipType;
      const selectedSite = isHierarchy
        ? hierarchySiteOptions.find((site) => site.key === newRelationship.siteKey)
        : undefined;

      if (isMockDataEnabled) {
        const rel: OrganizationRelationship = {
          id: `demo-rel-${Date.now()}`,
          user_id: 'demo',
          from_org_id: fromOrganizationId,
          to_org_id: toOrganizationId,
          relationship_type: relationshipType,
          notes: newRelationship.notes || undefined,
          created_at: new Date().toISOString(),
        };
        setRelationships((prev) => [rel, ...prev]);
        if (selectedSite) {
          const childId = fromOrganizationId;
          const parentId = toOrganizationId;
          if (selectedSite.locationId) {
            linkDemoLocationOrganization(
              { id: selectedSite.locationId, name: selectedSite.name },
              childId,
              demoOrgHint(),
            );
            linkDemoLocationOrganization(
              { id: selectedSite.locationId, name: selectedSite.name },
              parentId,
              demoOrgHint(),
            );
          } else {
            linkDemoOrganizationLocationByName(childId, selectedSite.name, demoOrgHint());
            linkDemoOrganizationLocationByName(parentId, selectedSite.name, demoOrgHint());
          }
        }
        setNewRelationship({ to_org_id: '', relationship_type: 'affiliated_with', notes: '', siteKey: '' });
        setShowAddRelationship(false);
        return;
      }

      const result = await addOrganizationRelationship({
        organizationId: fromOrganizationId,
        relationship: {
          to_org_id: toOrganizationId,
          relationship_type: relationshipType,
          notes: newRelationship.notes || undefined,
        },
      }).unwrap() as { success: boolean; relationship: OrganizationRelationship };
      if (result.success) {
        setRelationships(prev => [result.relationship, ...prev]);
        if (selectedSite) {
          const payload = {
            location_name: selectedSite.name,
            ...(selectedSite.locationId ? { location_id: selectedSite.locationId } : {}),
          };
          await Promise.all([
            addOrganizationLocation({
              organizationId: fromOrganizationId,
              location: payload,
            }).unwrap().catch(() => null),
            addOrganizationLocation({
              organizationId: toOrganizationId,
              location: payload,
            }).unwrap().catch(() => null),
          ]);
        }
        setNewRelationship({ to_org_id: '', relationship_type: 'affiliated_with', notes: '', siteKey: '' });
        setShowAddRelationship(false);
        setDerivedLoaded(false);
        dispatchStoryDataUpdated({
          scopes: ['organizations'],
          organizationIds: [organization.id, newRelationship.to_org_id],
        });
      }
    } catch (error) {
      console.error('Failed to add relationship:', error);
    } finally {
      setRelationshipSaving(false);
    }
  };

  const beginRelationshipEdit = (relationship: OrganizationRelationship) => {
    setEditingRelationshipId(relationship.id);
    setRelationshipEdit({
      relationship_type: relationship.relationship_type,
      notes: relationship.notes?.replace(/^\[auto-inferred(?::llm)?\]\s*/, '') ?? '',
    });
  };

  const handleUpdateRelationship = async () => {
    if (!editingRelationshipId) return;
    setRelationshipSaving(true);
    try {
      const result = await fetchJson<{ success: boolean; relationship: OrganizationRelationship }>(
        `/api/organizations/${organization.id}/relationships/${editingRelationshipId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(relationshipEdit),
        },
      );
      if (result.success) {
        setRelationships(prev => prev.map(rel => rel.id === editingRelationshipId ? result.relationship : rel));
        setEditingRelationshipId(null);
        setDerivedLoaded(false);
        dispatchStoryDataUpdated({ scopes: ['organizations'], organizationIds: [organization.id] });
      }
    } catch (error) {
      console.error('Failed to update relationship:', error);
    } finally {
      setRelationshipSaving(false);
    }
  };

  const handleRemoveRelationship = async (relationshipId: string) => {
    const removed = relationships.find(rel => rel.id === relationshipId);
    setRelationships(prev => prev.filter(r => r.id !== relationshipId));
    try {
      await removeOrganizationRelationship({ organizationId: organization.id, relationshipId }).unwrap();
      setDerivedLoaded(false);
      dispatchStoryDataUpdated({
        scopes: ['organizations'],
        organizationIds: removed
          ? [removed.from_org_id, removed.to_org_id]
          : [organization.id],
      });
    } catch (error) {
      console.error('Failed to remove relationship:', error);
      setRelationshipsLoaded(false);
      void loadRelationships();
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

  /** Wrong book? Move this group to Person, Place, Project, Skill, or Event. */
  const handleReclassify = async (target: string) => {
    if (!target || reclassifyBusy || reclassifySuccess || !organization.id) return;
    setReclassifyTarget(target);
    setReclassifyBusy(true);
    setReclassifyError(null);
    try {
      const result = await fetchJson<{
        success: boolean;
        reclassified_to: string;
        target?: { mergedIntoExisting?: boolean; targetName?: string };
        error?: string;
      }>(`/api/organizations/${organization.id}/reclassify`, {
        method: 'POST',
        body: JSON.stringify({ targetDomain: target }),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to reclassify group');
      }
      setReclassifySuccess(true);
      apiCache.deletePattern(/\/api\/(organizations|locations|characters|projects|skills|knowledge|conversation|counts|books)/);
      dispatchStoryDataUpdated({ scopes: ['organizations'], organizationIds: [organization.id] });
      onUpdate?.();
      setTimeout(() => onClose(), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reclassify group';
      setReclassifyError(message);
    } finally {
      setReclassifyBusy(false);
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

  /**
   * Progressive Character Book load (same pattern as Places):
   * 1) fast book-index (canonical `characters` rows)
   * 2) full Character Book BFF with a long timeout
   * 3) legacy `/api/characters` last resort
   * Never wipe a successful partial list on a later failure.
   */
  const loadCharacterBookOptions = async () => {
    setCharacterBookLoading(true);
    setMemberAddError(null);
    type BookChar = { id?: string; name?: string; alias?: string[]; aliases?: string[]; type?: string };
    let loaded: Array<{ id: string; name: string; aliases: string[] }> = [];
    let failedAll = false;

    const normalize = (rows: BookChar[]) => {
      const seen = new Set(loaded.map((c) => c.id));
      const next = [...loaded];
      for (const c of rows) {
        if (!c?.id || !c?.name || String(c.id).startsWith('temp-')) continue;
        const id = String(c.id);
        if (seen.has(id)) continue;
        seen.add(id);
        next.push({
          id,
          name: String(c.name),
          aliases: Array.isArray(c.alias)
            ? c.alias.map(String)
            : Array.isArray(c.aliases)
              ? c.aliases.map(String)
              : [],
        });
      }
      return next.sort((a, b) => a.name.localeCompare(b.name));
    };

    const commit = (rows: BookChar[]) => {
      loaded = normalize(rows);
      setCharacterBookOptions(loaded);
    };

    try {
      if (isMockDataEnabled) {
        commit(
          mockDataService.get.characters().map((c) => ({
            id: c.id,
            name: c.name,
            alias: Array.isArray(c.alias) ? c.alias : [],
          })),
        );
        return;
      }

      try {
        const index = await fetchJson<{
          entities?: Array<{ id: string; name: string; aliases?: string[]; type?: string }>;
        }>('/api/entities/book-index?types=character&limit=100');
        commit(
          (index.entities ?? [])
            .filter((e) => !e.type || e.type === 'character')
            .map((e) => ({
              id: e.id,
              name: e.name,
              aliases: e.aliases,
            })),
        );
        // Show index hits immediately while the heavier book payload loads.
        if (loaded.length > 0) setCharacterBookLoading(false);
      } catch (indexError) {
        console.warn('Character book-index unavailable', indexError);
      }

      try {
        const list = await fetchCharacterList<BookChar>({ timeoutMs: 90_000 });
        commit(list);
      } catch (booksError) {
        console.warn('Character Book BFF unavailable', booksError);
        if (loaded.length === 0) {
          try {
            const legacy = await fetchJson<{ characters?: BookChar[] } | BookChar[]>(
              '/api/characters',
              undefined,
              { timeoutMs: 90_000 },
            );
            const rows = Array.isArray(legacy)
              ? legacy
              : Array.isArray((legacy as { characters?: BookChar[] }).characters)
                ? ((legacy as { characters: BookChar[] }).characters ?? [])
                : [];
            commit(rows);
          } catch (legacyError) {
            console.error('Failed to load Character Book options', legacyError);
            failedAll = true;
          }
        }
      }

      if (failedAll && loaded.length === 0) {
        setMemberAddError('Could not load your Character Book. Try again in a moment.');
      } else {
        setCharacterBookOptions(loaded);
      }
    } finally {
      setCharacterBookLoading(false);
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
    if (next) {
      await loadCharacterBookOptions();
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
      const hay = [c.name, ...(c.aliases ?? [])].join(' ').toLowerCase();
      return hay.includes(term);
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
    if (isEphemeralEntityId(organization.id) && !isMockDataEnabled) {
      setMemberAddError('Save this group first before linking people.');
      return;
    }

    setMemberSaving(true);
    setMemberAddError(null);
    try {
      if (isMockDataEnabled) {
        const saved: OrganizationMember = {
          id: `demo-member-${Date.now()}`,
          character_id: chosen.id,
          character_name: chosen.name,
          role: newMember.role.trim() || undefined,
          status: 'active',
        };
        setMembers((prev) => {
          const withoutDup = prev.filter(
            (m) =>
              m.id !== saved.id &&
              m.character_id !== saved.character_id &&
              m.character_name.toLowerCase() !== saved.character_name.toLowerCase(),
          );
          return [...withoutDup, saved];
        });
        setSelectedBookCharacterId('');
        setCharacterBookSearch('');
        setNewMember({ character_name: '', role: '', status: 'active' });
        setShowAddMember(false);
        setMemberAddSuccess(`${chosen.name} linked to this group.`);
        notifyMembershipChanged([chosen.id]);
        return;
      }

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
      notifyMembershipChanged([saved?.character_id || chosen.id]);
    } catch (error) {
      console.error('Failed to add member from Character Book:', error);
      setMemberAddError(
        mutationErrorMessage(error) || 'Could not link this person to the group.',
      );
    } finally {
      setMemberSaving(false);
    }
  };

  /** Name-only fallback when the person is not in the Character Book yet. */
  const handleAddMember = async () => {
    if (!newMember.character_name.trim() || memberSaving) return;
    if (isEphemeralEntityId(organization.id) && !isMockDataEnabled) {
      setMemberAddError('Save this group first before adding people.');
      return;
    }

    setMemberSaving(true);
    setMemberAddError(null);
    try {
      if (isMockDataEnabled) {
        const name = newMember.character_name.trim();
        const bookHit = characterBookOptions.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );
        const saved: OrganizationMember = {
          id: `demo-member-${Date.now()}`,
          character_id: bookHit?.id,
          character_name: bookHit?.name || name,
          role: newMember.role.trim() || undefined,
          status: newMember.status,
        };
        setMembers((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
        setNewMember({ character_name: '', role: '', status: 'active' });
        setShowAddMember(false);
        setShowNameOnlyAdd(false);
        setMemberAddSuccess(
          saved.character_id
            ? `${saved.character_name} matched Character Book and was linked.`
            : `${saved.character_name} added by name (unlinked).`,
        );
        notifyMembershipChanged(saved.character_id ? [saved.character_id] : []);
        return;
      }

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
      notifyMembershipChanged(saved?.character_id ? [saved.character_id] : []);
    } catch (error) {
      console.error('Failed to add member:', error);
      setMemberAddError(mutationErrorMessage(error) || 'Could not add member.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const previous = members;
    const removed = previous.find((m) => m.id === memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    try {
      await removeOrganizationMember({
        organizationId: organization.id,
        itemId: memberId,
        characterId: removed?.character_id,
      }).unwrap();
      notifyMembershipChanged(removed?.character_id ? [removed.character_id] : []);
    } catch (error) {
      console.error('Failed to remove member:', error);
      setMembers(previous);
      setMemberAddError(mutationErrorMessage(error) || 'Could not remove member. Try again.');
    }
  };

  /** Pull in spouse/kids/pets the Family Tree already knows about this group's members. */
  const handleSyncFromFamilyTree = async () => {
    if (syncingFamilyTree) return;
    setSyncingFamilyTree(true);
    setMemberAddError(null);
    try {
      if (isMockDataEnabled) {
        setMemberAddSuccess('Demo mode has no Family Tree to sync from — this works once connected to your real data.');
        return;
      }
      const result = await fetchJson<{ success: boolean; added: number; members: OrganizationMember[] }>(
        `/api/organizations/${organization.id}/sync-from-family-tree`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (result.success) {
        setMembers(result.members || []);
        setMemberAddSuccess(
          result.added > 0
            ? `Added ${result.added} ${result.added === 1 ? 'person' : 'people'} from the Family Tree.`
            : "Everyone the Family Tree knows about is already on this group's roster.",
        );
        notifyMembershipChanged((result.members || []).map((m) => m.character_id).filter((id): id is string => Boolean(id)));
      }
    } catch (error) {
      console.error('Failed to sync from Family Tree:', error);
      setMemberAddError(mutationErrorMessage(error) || 'Could not sync from the Family Tree.');
    } finally {
      setSyncingFamilyTree(false);
    }
  };

  /** Open a roster person's Character modal (Key people + People tab). */
  const openMemberCharacter = useCallback(
    async (member: OrganizationMember) => {
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
        return;
      }
      if (!member.character_name) return;
      try {
        const chars = await fetchJson<Character[]>(
          `/api/characters/search?name=${encodeURIComponent(member.character_name)}`,
        );
        const match = chars?.[0];
        if (!match?.id) {
          setSelectedCharacter({
            id: `temp-${member.character_name}`,
            name: member.character_name,
          } as Character);
          return;
        }
        // Upgrade name-only roster row → durable Character Book link
        // so their Connections → Groups shows this organization.
        if (!isEphemeralEntityId(organization.id)) {
          try {
            const result = (await addOrganizationMember({
              organizationId: organization.id,
              member: {
                character_id: match.id,
                character_name: match.name,
                role: member.role,
                status: member.status || 'active',
              },
            }).unwrap()) as { member?: OrganizationMember };
            const saved = result?.member;
            if (saved?.id) {
              setMembers((prev) => {
                const without = prev.filter(
                  (m) =>
                    m.id !== member.id &&
                    m.id !== saved.id &&
                    m.character_id !== saved.character_id,
                );
                return [...without, saved];
              });
            } else {
              setMembers((prev) =>
                prev.map((m) =>
                  m.id === member.id
                    ? {
                        ...m,
                        character_id: match.id,
                        character_name: match.name,
                      }
                    : m,
                ),
              );
            }
            notifyMembershipChanged([match.id]);
          } catch {
            // Still open the character even if link upgrade fails.
          }
        }
        setSelectedCharacter(match);
      } catch {
        setSelectedCharacter({
          id: `temp-${member.character_name}`,
          name: member.character_name,
        } as Character);
      }
    },
    [addOrganizationMember, notifyMembershipChanged, organization.id],
  );

  const handleAddEvent = async (event: {
    title: string;
    date: string;
    type: OrganizationEvent['type'];
  }) => {
    if (!event.title.trim() || !event.date) return;
    setEventLoading(true);
    try {
      const result = await addOrganizationEvent({
        organizationId: organization.id,
        event,
      }).unwrap() as { success: boolean; event: OrganizationEvent };
      if (result.success) {
        setEvents((prev) => [result.event, ...prev]);
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

  const normalizeLocationOptions = (
    rows: Array<{
      id?: string;
      name?: string;
      aliases?: string[];
      metadata?: Record<string, unknown> | null;
    }>,
  ) => {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; aliases: string[] }> = [];
    for (const loc of rows) {
      if (!loc?.id || !loc?.name || String(loc.id).startsWith('temp-')) continue;
      const id = String(loc.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: String(loc.name),
        aliases: [
          ...(Array.isArray(loc.aliases) ? loc.aliases.map(String) : []),
          ...locationAliasesForDisplay(loc.metadata),
        ],
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };

  /**
   * Progressive Places Book load:
   * 1) fast book-index (canonical `locations` rows)
   * 2) full Places Book BFF (includes people_places-backed cards) with a long timeout
   * Never wipe a successful partial list on a later failure / search miss.
   */
  const loadLocationBookOptions = async () => {
    setLocationBookLoading(true);
    setLocationAddError(null);
    let loaded: Array<{ id: string; name: string; aliases: string[] }> = [];
    let failedAll = false;

    const commit = (
      next: Array<{
        id?: string;
        name?: string;
        aliases?: string[];
        metadata?: Record<string, unknown> | null;
      }>,
    ) => {
      loaded = normalizeLocationOptions([...loaded, ...next]);
      setLocationBookOptions(loaded);
    };

    try {
      if (isMockDataEnabled) {
        commit(
          mockDataService.get.locations().map((loc) => ({
            id: loc.id,
            name: loc.name,
            metadata: loc.metadata ?? null,
          })),
        );
        return;
      }

      try {
        const index = await fetchJson<{
          entities?: Array<{ id: string; name: string; aliases?: string[]; type?: string }>;
        }>('/api/entities/book-index?types=location&limit=100');
        commit(
          (index.entities ?? [])
            .filter((e) => !e.type || e.type === 'location')
            .map((e) => ({
              id: e.id,
              name: e.name,
              aliases: e.aliases,
            })),
        );
        // Show index hits immediately while the heavier book payload loads.
        if (loaded.length > 0) setLocationBookLoading(false);
      } catch (indexError) {
        console.warn('Places book-index unavailable', indexError);
      }

      try {
        const books = await fetchJson<{
          success?: boolean;
          data?: { locations?: Array<{ id?: string; name?: string; metadata?: Record<string, unknown> | null }> };
          locations?: Array<{ id?: string; name?: string; metadata?: Record<string, unknown> | null }>;
        }>('/api/books/locations', undefined, { timeoutMs: 90_000 });
        const raw = books.data?.locations ?? books.locations ?? [];
        commit(raw);
      } catch (booksError) {
        console.warn('Places Book BFF unavailable', booksError);
        if (loaded.length === 0) {
          // Last resort: legacy list (same heavy path Places Book historically used).
          try {
            const legacy = await fetchJson<{
              locations?: Array<{ id?: string; name?: string; metadata?: Record<string, unknown> | null }>;
            }>('/api/locations', undefined, { timeoutMs: 90_000 });
            commit(legacy.locations ?? []);
          } catch (legacyError) {
            console.error('Failed to load Places Book options', legacyError);
            failedAll = true;
          }
        }
      }

      if (failedAll && loaded.length === 0) {
        setLocationAddError('Could not load your Places Book. Try again in a moment.');
      } else {
        setLocationBookOptions(loaded);
      }
    } finally {
      setLocationBookLoading(false);
    }
  };

  const openAddLocationPanel = async () => {
    const next = !showAddLocation;
    setShowAddLocation(next);
    setLocationAddError(null);
    setLocationAddSuccess(null);
    setShowNameOnlyLocationAdd(false);
    setSelectedBookLocationId('');
    setLocationBookSearch('');
    setNewLocation({ location_name: '' });
    if (next) {
      await loadLocationBookOptions();
    }
  };

  const rosterLocationIds = useMemo(
    () => new Set(locations.map((l) => l.location_id).filter((id): id is string => Boolean(id))),
    [locations],
  );

  const availableBookLocations = useMemo(() => {
    const term = locationBookSearch.trim().toLowerCase();
    return locationBookOptions.filter((loc) => {
      if (rosterLocationIds.has(loc.id)) return false;
      const alreadyByName = locations.some(
        (l) => !l.location_id && l.location_name.toLowerCase() === loc.name.toLowerCase(),
      );
      if (alreadyByName) return false;
      if (!term) return true;
      const hay = [loc.name, ...(loc.aliases ?? [])].join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [locationBookOptions, locationBookSearch, locations, rosterLocationIds]);

  const demoOrgHint = () => ({
    name: editedOrg.name,
    group_type: editedOrg.group_type ?? 'other',
    status: editedOrg.status ?? 'active',
    user_relationship: editedOrg.user_relationship ?? 'member',
    description: editedOrg.description ?? '',
  });

  /** Add from Places Book — posts location_id for an official durable link. */
  const handleAddExistingLocation = async () => {
    if (!selectedBookLocationId || locationLoading) return;
    const chosen = locationBookOptions.find((loc) => loc.id === selectedBookLocationId);
    if (!chosen) {
      setLocationAddError('Choose a place from your Places Book.');
      return;
    }
    if (isEphemeralEntityId(organization.id) && !isMockDataEnabled) {
      setLocationAddError('Save this group first before linking places.');
      return;
    }

    setLocationLoading(true);
    setLocationAddError(null);
    try {
      if (isMockDataEnabled) {
        const saved = linkDemoLocationOrganization(chosen, organization.id, demoOrgHint());
        setLocations((prev) => [
          {
            id: saved.id,
            location_id: saved.location_id,
            location_name: saved.location_name,
            visit_count: saved.visit_count,
          },
          ...prev.filter(
            (link) =>
              link.id !== saved.id &&
              link.location_id !== saved.location_id,
          ),
        ]);
        setSelectedBookLocationId('');
        setLocationBookSearch('');
        setNewLocation({ location_name: '' });
        setShowAddLocation(false);
        setLocationAddSuccess(`${chosen.name} linked to this group from your Places Book.`);
        return;
      }

      const result = (await addOrganizationLocation({
        organizationId: organization.id,
        location: {
          location_id: chosen.id,
          location_name: chosen.name,
        },
      }).unwrap()) as { success?: boolean; location?: OrganizationLocation };

      const saved = result?.location;
      if (saved?.id) {
        setLocations((prev) => {
          const withoutDup = prev.filter(
            (l) =>
              l.id !== saved.id &&
              l.location_id !== saved.location_id &&
              l.location_name.toLowerCase() !== saved.location_name.toLowerCase(),
          );
          return [saved, ...withoutDup];
        });
      } else {
        setLocations((prev) => [
          {
            id: `org-loc-${Date.now()}`,
            location_id: chosen.id,
            location_name: chosen.name,
            visit_count: 1,
          },
          ...prev,
        ]);
      }
      setSelectedBookLocationId('');
      setLocationBookSearch('');
      setNewLocation({ location_name: '' });
      setShowAddLocation(false);
      setLocationAddSuccess(`${chosen.name} linked to this group from your Places Book.`);
    } catch (error) {
      console.error('Failed to add location from Places Book:', error);
      setLocationAddError(
        mutationErrorMessage(error) || 'Could not link this place to the group.',
      );
    } finally {
      setLocationLoading(false);
    }
  };

  /** Name-only fallback when the place is not in the Places Book yet. */
  const handleAddLocation = async () => {
    if (!newLocation.location_name.trim() || locationLoading) return;
    if (isEphemeralEntityId(organization.id) && !isMockDataEnabled) {
      setLocationAddError('Save this group first before adding places.');
      return;
    }

    setLocationLoading(true);
    setLocationAddError(null);
    try {
      // Prefer an exact Places Book match when the typed name already exists.
      const exact = locationBookOptions.find(
        (loc) => loc.name.toLowerCase() === newLocation.location_name.trim().toLowerCase(),
      );

      if (isMockDataEnabled) {
        const saved = exact
          ? linkDemoLocationOrganization(exact, organization.id, demoOrgHint())
          : linkDemoOrganizationLocationByName(
              organization.id,
              newLocation.location_name.trim(),
              demoOrgHint(),
            );
        setLocations((prev) => [
          {
            id: saved.id,
            location_id: saved.location_id || undefined,
            location_name: saved.location_name,
            visit_count: saved.visit_count,
          },
          ...prev.filter((l) => l.id !== saved.id),
        ]);
        setNewLocation({ location_name: '' });
        setShowAddLocation(false);
        setShowNameOnlyLocationAdd(false);
        setLocationAddSuccess(
          exact
            ? `${exact.name} linked to this group from your Places Book.`
            : 'Place added. Link it from Places Book later for a durable connection.',
        );
        return;
      }

      const result = (await addOrganizationLocation({
        organizationId: organization.id,
        location: exact
          ? { location_id: exact.id, location_name: exact.name }
          : { location_name: newLocation.location_name.trim() },
      }).unwrap()) as { success?: boolean; location?: OrganizationLocation };

      const saved = result?.location;
      if (saved?.id) {
        setLocations((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)]);
      }
      setNewLocation({ location_name: '' });
      setShowAddLocation(false);
      setShowNameOnlyLocationAdd(false);
      setLocationAddSuccess(
        exact
          ? `${exact.name} linked to this group from your Places Book.`
          : 'Place added. Link it from Places Book later for a durable connection.',
      );
    } catch (error) {
      console.error('Failed to add location:', error);
      setLocationAddError(
        error instanceof Error ? error.message : 'Could not add this place.',
      );
    } finally {
      setLocationLoading(false);
    }
  };

  const handleRemoveLocation = async (locationId: string) => {
    setLocations(prev => prev.filter(l => l.id !== locationId));
    if (isMockDataEnabled) {
      unlinkDemoLocationOrganization(locationId);
      return;
    }
    try {
      await removeOrganizationLocation({ organizationId: organization.id, itemId: locationId }).unwrap();
    } catch (error) {
      console.error('Failed to remove location:', error);
    }
  };

  const openLinkedLocation = async (opts: {
    locationId?: string | null;
    locationName?: string | null;
  }) => {
    const locationId = opts.locationId?.trim() || '';
    const locationName = opts.locationName?.trim() || '';
    if (!locationId && !locationName) return;

    setLocationAddError(null);
    try {
      if (isMockDataEnabled) {
        const locs = mockDataService.get.locations();
        const found =
          (locationId ? locs.find((l) => l.id === locationId) : undefined) ||
          (locationName
            ? locs.find((l) => l.name.toLowerCase() === locationName.toLowerCase())
            : undefined);
        if (found) {
          setSelectedLocation(normalizeLocationProfile(found));
          return;
        }
        setSelectedLocation(
          normalizeLocationProfile(
            locationStub(locationId || `demo-place-${locationName}`, locationName || 'Place'),
          ),
        );
        return;
      }

      if (locationId && !isEphemeralEntityId(locationId)) {
        const full = await fetchLocationById(locationId);
        setSelectedLocation(full);
        return;
      }

      if (locationName) {
        const index = await fetchJson<{
          entities?: Array<{ id: string; name: string }>;
        }>('/api/entities/book-index?types=location&limit=100');
        const hit = (index.entities ?? []).find(
          (e) => e.name.toLowerCase() === locationName.toLowerCase(),
        );
        if (hit?.id) {
          const full = await fetchLocationById(hit.id);
          setSelectedLocation(full);
          return;
        }
      }

      setSelectedLocation(
        normalizeLocationProfile(locationStub(locationId || `place-${Date.now()}`, locationName || 'Place')),
      );
    } catch (error) {
      console.error('Failed to open linked place:', error);
      // Still open a stub so the user can see the place name instead of a dead click.
      setSelectedLocation(
        normalizeLocationProfile(
          locationStub(locationId || `place-${Date.now()}`, locationName || 'Place'),
        ),
      );
      setLocationAddError('Opened a lightweight place card — full Places Book details were unavailable.');
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
          onOpenChat={() => setActiveTab('chat')}
          headerExpanded={headerExpanded}
          onToggleHeaderExpanded={() => setHeaderExpanded((v) => !v)}
          reclassify={{
            busy: reclassifyBusy,
            success: reclassifySuccess,
            error: reclassifyError,
            target: reclassifyTarget,
            onSelect: (value) => void handleReclassify(value),
            onOpenMenu: () => setReclassifyError(null),
          }}
        />

        <OrganizationModalNav
          placement="top"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showFamilyTab={editedOrg.group_type === 'family'}
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(normalizeOrgModalTab(v as TabKey))} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-4 sm:px-6 sm:py-4 min-h-0">
            {/* Overview Tab */}
            <TabsContent value="info" className="mt-0 space-y-3">
              <Card className="overflow-hidden border-white/10 bg-gradient-to-b from-amber-500/[0.05] via-black/45 to-black/50">
                <CardContent className="p-0">
                  <div className="border-b border-white/8 bg-white/[0.02] px-3 py-2.5 sm:px-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h3 className="text-sm font-semibold text-white">Name & aliases</h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            editedOrg.metadata?.identity_locked_by_user
                              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                              : 'border-white/15 bg-white/[0.04] text-white/50'
                          }`}
                          title={
                            editedOrg.metadata?.identity_locked_by_user
                              ? 'You corrected this name — LoreBook treats it as trusted for detection.'
                              : 'Detected from what you shared. Edit to lock the name and aliases.'
                          }
                        >
                          {editedOrg.metadata?.identity_locked_by_user ? 'You set this' : 'Detected'}
                        </Badge>
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
                          <p className="text-xs text-emerald-400" data-testid="identity-saved-confirmation">✓ {identitySaved}</p>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 shrink-0 text-white/55 hover:text-white" onClick={() => setEditingIdentity(true)}>
                          <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Always-visible alias chips — add/remove without full identity form */}
                  <div className="border-b border-white/8 px-3 py-2.5 sm:px-4">
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      data-testid="org-alias-editor"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-white/35 mr-0.5">
                        Also known as
                      </span>
                      {(editedOrg.aliases ?? []).length === 0 && (
                        <span className="text-xs text-white/30">—</span>
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
                        onChange={() => setAliasInputError(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (!value) return;
                            const existing = editedOrg.aliases ?? [];
                            if (value.toLowerCase() === editedOrg.name.trim().toLowerCase()) {
                              setAliasInputError(`"${value}" is already this group's name — try a different alias.`);
                              return;
                            }
                            if (existing.some((a) => a.toLowerCase() === value.toLowerCase())) {
                              setAliasInputError(`"${value}" is already an alias for this group.`);
                              return;
                            }
                            setAliasInputError(null);
                            input.value = '';
                            void saveAliases([...existing, value]);
                          }
                        }}
                      />
                    </div>
                    {aliasInputError && (
                      <p className="mt-1.5 text-[10px] text-red-400" data-testid="org-alias-add-error">
                        {aliasInputError}
                      </p>
                    )}
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
                          value={isGroupTypeUnset(editedOrg) ? '' : (editedOrg.group_type ?? 'other')}
                          onChange={e => {
                            const rawValue = e.target.value;
                            if (rawValue === '') {
                              // Explicit clear: reset to the DB default but flag it as
                              // unset so the UI shows "Not set" and auto-detection is
                              // free to fill it back in from the next conversation.
                              setEditedOrg(prev => ({
                                ...prev,
                                group_type: 'other' as Organization['group_type'],
                                type: 'other' as Organization['type'],
                                metadata: { ...(prev.metadata ?? {}), group_type_source: 'user_cleared' },
                              }));
                              return;
                            }
                            const groupType = rawValue as Organization['group_type'];
                            const legacyTypes = new Set(['friend_group', 'company', 'sports_team', 'club', 'nonprofit', 'family', 'martial_arts', 'other']);
                            setEditedOrg(prev => ({
                              ...prev,
                              group_type: groupType,
                              type: (legacyTypes.has(groupType) ? groupType : 'other') as Organization['type'],
                              // A manual pick locks the field: auto-detection from chat
                              // will never silently overwrite it again.
                              metadata: { ...(prev.metadata ?? {}), group_type_source: 'user_confirmed' },
                            }));
                          }}
                          className={FIELD_SELECT}
                        >
                          <option value="">— Not set —</option>
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
                      {editedOrg.description ? (
                        <p className="text-[15px] sm:text-base leading-relaxed text-white/85">
                          {editedOrg.description}
                        </p>
                      ) : (
                        <p className="text-sm text-white/40 italic">
                          No description yet — edit identity or tell LoreBook what this group is.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {isGroupTypeUnset(editedOrg) ? (
                          <span
                            className="rounded-full border border-dashed border-white/15 bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/40"
                            title="LoreBook hasn't detected a group type yet — it'll fill this in as you talk about this group, or you can set it yourself."
                          >
                            Type not set
                          </span>
                        ) : (
                          <span
                            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 capitalize"
                            title={editedOrg.metadata?.group_type_source === 'user_confirmed' ? 'You set this' : 'Detected from conversation'}
                          >
                            {GROUP_TYPE_LABEL_BY_VALUE[String(editedOrg.group_type ?? editedOrg.type)]
                              ?? String(editedOrg.group_type ?? editedOrg.type).replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/70 capitalize">
                          {String(editedOrg.user_relationship ?? 'referenced').replace(/_/g, ' ')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                          {editedOrg.is_public_entity ? 'Official' : 'Personal'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('sources')}
                          className="rounded-full border border-sky-300/50 bg-sky-500/20 px-2.5 py-1 text-[11px] font-semibold text-sky-100 shadow-[0_0_12px_-2px_rgba(56,189,248,0.45)] hover:bg-sky-500/30 hover:border-sky-200/60"
                        >
                          {mentionsLoading ? '…' : mentionTrace?.total_mentions ?? 0} mentions
                        </button>
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
                derivedEvents={derivedEvents}
                derivedLoading={derivedLoading}
                locationCount={locations.length}
                onSelectOrganization={onSelectOrganization}
                onTabChange={setActiveTab}
                onMemberClick={(member) => void openMemberCharacter(member)}
                onOpenChat={(prompt) => openOrgMainChat(prompt)}
                onOpenLocation={(args) => void openLinkedLocation(args)}
              />
            </TabsContent>

            {/* Chat Tab — hand off to main chat (no in-modal composer) */}
            <TabsContent value="chat" className={TAB_PANEL}>
              <div
                className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-8 text-center space-y-4"
                data-testid="org-chat-panel"
              >
                <MessageSquare className="h-10 w-10 mx-auto text-violet-300/70" />
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">Chat about {editedOrg.name}</h3>
                  <p className="text-sm text-white/50 max-w-md mx-auto">
                    Continue in main chat with this group focused — full thread, memory, and composer live there.
                  </p>
                </div>
                <Button
                  type="button"
                  className="gap-2 bg-violet-500/25 border border-violet-400/35 text-violet-100 hover:bg-violet-500/35"
                  onClick={() => openOrgMainChat()}
                  data-testid="org-open-main-chat"
                >
                  <MessageSquare className="h-4 w-4" />
                  Open main chat with focus
                </Button>
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
                  <div className="flex shrink-0 items-center gap-2">
                    {(editedOrg.group_type === 'family' || editedOrg.type === 'family') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-3 text-xs border-violet-400/30 text-violet-100 hover:bg-violet-500/15"
                        onClick={() => void handleSyncFromFamilyTree()}
                        disabled={syncingFamilyTree}
                        data-testid="org-sync-family-tree"
                        title="Pull in spouse, kids, and pets the Family Tree already knows about this group's members"
                      >
                        {syncingFamilyTree ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <TreePine className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Sync from Family Tree
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-9 px-3 text-xs bg-violet-500/20 border border-violet-400/30 text-violet-100 hover:bg-violet-500/30"
                      onClick={() => void openAddMemberPanel()}
                      data-testid="org-add-member-toggle"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      {showAddMember ? 'Close' : 'Add person'}
                    </Button>
                  </div>
                </div>

              {showAddMember && (
                <div className="border-b border-white/8 bg-black/35 px-3.5 py-3.5 sm:px-4 space-y-3">
                    <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-3 py-2.5 space-y-2">
                      <p className="text-[12px] text-violet-100/80 leading-relaxed">
                        Adding a whole roster? Continue in main chat — create people who aren’t in Character Book yet,
                        solidify who is (and isn’t) in {editedOrg.name}, and fill in group lore. LoreBook remembers what
                        you confirm and your corrections.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full h-9 gap-2 bg-violet-500/25 border border-violet-400/35 text-violet-100 hover:bg-violet-500/35"
                        onClick={() => openOrgRosterChat()}
                        data-testid="org-fill-roster-in-chat"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Fill roster in chat
                      </Button>
                    </div>
                    <p className="text-[12px] text-white/55 leading-relaxed">
                      Or pick someone already in your Character Book — LoreBook saves an official membership link
                      (person ↔ group) in your knowledge base.
                    </p>
                    <SearchWithAutocomplete
                      value={characterBookSearch}
                      onChange={(next) => {
                        setCharacterBookSearch(next);
                        // Typing clears a prior pick unless the text still matches that person.
                        if (selectedBookCharacterId) {
                          const selected = characterBookOptions.find((c) => c.id === selectedBookCharacterId);
                          if (!selected || selected.name.toLowerCase() !== next.trim().toLowerCase()) {
                            setSelectedBookCharacterId('');
                          }
                        }
                      }}
                      onSelectItem={(item) => {
                        setSelectedBookCharacterId(item.id);
                        setCharacterBookSearch(item.name);
                      }}
                      placeholder={
                        characterBookLoading
                          ? 'Loading Character Book…'
                          : 'Type a name to find someone…'
                      }
                      items={availableBookCharacters}
                      getSearchableText={(c) => [c.name, ...(c.aliases ?? [])].join(' ')}
                      getDisplayLabel={(c) => c.name}
                      getItemKey={(c) => c.id}
                      minCharsToSuggest={0}
                      maxSuggestions={12}
                      emptyHint={
                        characterBookLoading
                          ? 'Loading…'
                          : characterBookOptions.length === 0
                            ? 'No people in Character Book yet'
                            : 'No matching characters'
                      }
                      disabled={characterBookLoading || memberSaving}
                      data-testid="org-add-member-character-search"
                      inputProps={{ 'aria-label': 'Search Character Book people' }}
                      inputClassName="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                    />
                    {selectedBookCharacterId && (
                      <div
                        className="flex items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2"
                        data-testid="org-add-member-selected"
                      >
                        <Users className="h-3.5 w-3.5 text-violet-300 shrink-0" />
                        <span className="text-sm text-violet-100 truncate">
                          {characterBookOptions.find((c) => c.id === selectedBookCharacterId)?.name ||
                            characterBookSearch}
                        </span>
                        <Badge variant="outline" className="text-[10px] border-violet-400/30 text-violet-200">
                          Selected
                        </Badge>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <OrganizationMemberRoleSelect
                        value={newMember.role}
                        onChange={(role) => setNewMember((prev) => ({ ...prev, role }))}
                        disabled={memberSaving}
                        data-testid="org-add-member-role"
                        className="h-10 rounded-xl border border-white/12 bg-black/55 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
                      />
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
                      Link people from Character Book, or fill the whole roster in chat — including people who don’t
                      exist in LoreBook yet.
                    </p>
                    {!showAddMember && (
                      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
                        <Button
                          size="sm"
                          className="h-9"
                          onClick={() => void openAddMemberPanel()}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Add person
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 gap-1.5 border-violet-400/30 text-violet-100 hover:bg-violet-500/15"
                          onClick={() => openOrgRosterChat()}
                          data-testid="org-fill-roster-in-chat-empty"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Fill roster in chat
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  members.map((member) => (
                    <button
                      type="button"
                      key={member.id}
                      className="group w-full text-left rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 sm:px-3.5 transition hover:border-violet-400/30 hover:bg-violet-500/[0.08] active:scale-[0.995]"
                      onClick={() => void openMemberCharacter(member)}
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
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-amber-500/[0.07] via-black/40 to-black/50 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-white/8 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-amber-300 shrink-0" />
                      Stories
                      <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/55">
                        {stories.length + eventLinkedStories.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-white/40 mt-0.5 sm:truncate">
                      Stories about this group — from Events, or freeform notes
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 sm:flex-none px-3 text-xs border-amber-400/25 text-amber-100/90 hover:bg-amber-500/15"
                      onClick={() => {
                        setPostComposerPrefill({
                          organization_id: editedOrg.id,
                          organization_name: editedOrg.name,
                        });
                        setShowPostComposer(true);
                      }}
                      data-testid="org-stories-post-event"
                    >
                      <Calendar className="h-3.5 w-3.5 mr-1.5" />
                      Post event
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 flex-1 sm:flex-none px-3 text-xs bg-amber-500/20 border border-amber-400/30 text-amber-100 hover:bg-amber-500/30"
                      onClick={() => setShowAddStory(v => !v)}
                      data-testid="org-add-story-toggle"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      {showAddStory ? 'Close' : 'Add note'}
                    </Button>
                  </div>
                </div>

                {showAddStory && (
                  <div className="border-b border-white/8 bg-black/35 px-3.5 py-3.5 sm:px-4 space-y-3">
                    <p className="text-[11px] text-white/45">
                      Freeform group note (not attached to a Life Log Event). Prefer posting an Event when there’s a date and place.
                    </p>
                    <Input
                      placeholder="Title *"
                      value={newStory.title}
                      onChange={e => setNewStory(v => ({ ...v, title: e.target.value }))}
                      className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                    />
                    <Textarea
                      placeholder="Summary *"
                      value={newStory.summary}
                      onChange={e => setNewStory(v => ({ ...v, summary: e.target.value }))}
                      className="bg-black/55 border-white/12 text-white rounded-xl"
                      rows={3}
                    />
                    <Input
                      type="date"
                      value={newStory.date}
                      onChange={e => setNewStory(v => ({ ...v, date: e.target.value }))}
                      className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => void handleAddStory()}
                        disabled={storyLoading}
                        className="flex-1 h-9 bg-amber-500/25 border border-amber-400/35 text-amber-100 hover:bg-amber-500/35"
                      >
                        {storyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save note'}
                      </Button>
                      <Button variant="outline" className="h-9" onClick={() => setShowAddStory(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="p-2 sm:p-2.5 space-y-1.5">
                  {stories.length === 0 && eventLinkedStories.length === 0 && !showAddStory ? (
                    <div className="rounded-xl border border-dashed border-white/12 bg-black/25 px-4 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10">
                        <BookOpen className="h-5 w-5 text-amber-300/80" />
                      </div>
                      <p className="text-sm font-medium text-white/75">No stories yet</p>
                      <p className="mt-1 text-xs text-white/40 max-w-xs mx-auto leading-relaxed">
                        Post an Event for {editedOrg.name} (date + place), then add what happened — or save a freeform note.
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button
                          size="sm"
                          className="h-9"
                          onClick={() => {
                            setPostComposerPrefill({
                              organization_id: editedOrg.id,
                              organization_name: editedOrg.name,
                            });
                            setShowPostComposer(true);
                          }}
                        >
                          <Calendar className="h-3.5 w-3.5 mr-1.5" />
                          Post event
                        </Button>
                        <Button size="sm" variant="outline" className="h-9" onClick={() => setShowAddStory(true)}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Add note
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {eventLinkedStories.map((story) => (
                        <div
                          key={`event-story-${story.id}`}
                          className="group rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2.5 sm:px-3.5"
                          data-testid="org-event-linked-story"
                        >
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-amber-500/25 to-orange-500/15 border border-amber-400/25 flex items-center justify-center">
                              <Calendar className="h-4 w-4 text-amber-200" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-semibold text-white text-sm">{story.title}</div>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/30 text-amber-200/80">
                                  From event
                                </span>
                              </div>
                              <p className="text-sm text-white/60 mt-0.5 leading-snug">{story.summary}</p>
                              <div className="text-[11px] text-white/35 mt-1.5">{formatDate(story.date)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {stories.map((story) => (
                      <div
                        key={story.id}
                        className="group rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 sm:px-3.5 transition hover:border-amber-400/30 hover:bg-amber-500/[0.06]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-amber-500/25 to-orange-500/15 border border-amber-400/25 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                            <BookOpen className="h-4 w-4 text-amber-200" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-semibold text-white text-sm">{story.title}</div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/15 text-white/45">
                                Freeform
                              </span>
                            </div>
                            <p className="text-sm text-white/60 mt-0.5 leading-snug">{story.summary}</p>
                            <div className="text-[11px] text-white/35 mt-1.5">{formatDate(story.date)}</div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${story.title}`}
                            className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-white/25 opacity-70 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                            onClick={() => void handleRemoveStory(story.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Timeline Tab — with you / without you + recorded milestones */}
            <TabsContent value="timeline" className={TAB_PANEL}>
              <OrganizationActivityPanel
                organization={resolvedOrganization}
                mockMode={isMockDataEnabled}
                active={activeTab === 'timeline'}
                derivedEvents={derivedEvents}
                derivedLoading={derivedLoading}
                recordedEvents={events}
                onAddEvent={handleAddEvent}
                onRemoveEvent={handleRemoveEvent}
                formatDate={formatDate}
                eventSaving={eventLoading}
                onPostEvent={() => {
                  setPostComposerPrefill({
                    organization_id: editedOrg.id,
                    organization_name: editedOrg.name,
                  });
                  setShowPostComposer(true);
                }}
                onEventSelect={(event) => {
                  const demo = getDemoUserPostedEvent(event.id);
                  const stories = demo?.metadata.stories ?? [];
                  const storyBody = stories.map((s) => s.body).filter(Boolean).join('\n\n');
                  setTimelineMoment({
                    ...event,
                    summary: event.summary || demo?.summary || storyBody || undefined,
                    involved:
                      event.involved.length > 0 ? event.involved : demo?.people ?? event.involved,
                  });
                }}
              />
            </TabsContent>

            {/* Locations Tab */}
            <TabsContent value="locations" className={TAB_PANEL}>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-teal-500/[0.07] via-black/40 to-black/50 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-white/8 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-teal-300 shrink-0" />
                      Places
                      <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/55">
                        {locations.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-white/40 mt-0.5 sm:truncate">
                      Linked places for {editedOrg.name}
                      {editedOrg.group_type === 'company' ? ' — groups at each site show below' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-9 w-full sm:w-auto sm:shrink-0 px-3 text-xs bg-teal-500/20 border border-teal-400/30 text-teal-100 hover:bg-teal-500/30"
                    onClick={() => void openAddLocationPanel()}
                    data-testid="org-add-location-toggle"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {showAddLocation ? 'Close' : 'Add place'}
                  </Button>
                </div>

                {showAddLocation && (
                  <div className="border-b border-white/8 bg-black/35 px-3.5 py-3.5 sm:px-4 space-y-3">
                    <p className="text-[12px] text-white/55 leading-relaxed">
                      Pick a place from your Places Book to link it to this group.
                      LoreBook saves an official place ↔ group connection.
                    </p>
                    <SearchWithAutocomplete
                      value={locationBookSearch}
                      onChange={(next) => {
                        setLocationBookSearch(next);
                        if (selectedBookLocationId) {
                          const selected = locationBookOptions.find((l) => l.id === selectedBookLocationId);
                          if (!selected || selected.name.toLowerCase() !== next.trim().toLowerCase()) {
                            setSelectedBookLocationId('');
                          }
                        }
                      }}
                      onSelectItem={(item) => {
                        setSelectedBookLocationId(item.id);
                        setLocationBookSearch(item.name);
                      }}
                      placeholder={
                        locationBookLoading
                          ? 'Loading Places Book…'
                          : 'Type a place name to find it…'
                      }
                      items={availableBookLocations}
                      getSearchableText={(loc) => [loc.name, ...(loc.aliases ?? [])].join(' ')}
                      getDisplayLabel={(loc) => loc.name}
                      getItemKey={(loc) => loc.id}
                      minCharsToSuggest={0}
                      maxSuggestions={12}
                      emptyHint={
                        locationBookLoading
                          ? 'Loading…'
                          : locationBookOptions.length === 0
                            ? 'No places in Places Book yet'
                            : 'No matching places'
                      }
                      disabled={locationBookLoading || locationLoading}
                      data-testid="org-add-location-place-search"
                      inputProps={{ 'aria-label': 'Search Places Book locations' }}
                      inputClassName="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                    />
                    {selectedBookLocationId && (
                      <div
                        className="flex items-center gap-2 rounded-xl border border-teal-400/25 bg-teal-500/10 px-3 py-2"
                        data-testid="org-add-location-selected"
                      >
                        <MapPin className="h-3.5 w-3.5 text-teal-300 shrink-0" />
                        <span className="text-sm text-teal-100 truncate">
                          {locationBookOptions.find((l) => l.id === selectedBookLocationId)?.name ||
                            locationBookSearch}
                        </span>
                        <Badge variant="outline" className="text-[10px] border-teal-400/30 text-teal-200">
                          Selected
                        </Badge>
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="h-10 px-4 text-sm w-full sm:w-auto"
                      disabled={!selectedBookLocationId || locationLoading}
                      onClick={() => void handleAddExistingLocation()}
                      data-testid="org-add-location-submit"
                    >
                      {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add place'}
                    </Button>

                    <button
                      type="button"
                      className="text-[11px] text-white/40 hover:text-white/70 underline-offset-2 hover:underline"
                      onClick={() => setShowNameOnlyLocationAdd((v) => !v)}
                    >
                      {showNameOnlyLocationAdd ? 'Hide name-only add' : 'Place not listed? Add by name'}
                    </button>

                    {showNameOnlyLocationAdd && (
                      <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
                        <p className="text-[10px] text-white/40">
                          If that exact name already exists in Places Book, LoreBook auto-links it.
                          Otherwise the row stays unlinked until you create the place card.
                        </p>
                        <Input
                          placeholder="Place name"
                          value={newLocation.location_name}
                          onChange={(e) =>
                            setNewLocation((prev) => ({ ...prev, location_name: e.target.value }))
                          }
                          className="h-10 bg-black/55 border-white/12 text-white rounded-xl"
                          onKeyDown={(e) => e.key === 'Enter' && void handleAddLocation()}
                          data-testid="org-add-location-name-input"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={!newLocation.location_name.trim() || locationLoading}
                            onClick={() => void handleAddLocation()}
                            data-testid="org-add-location-name-submit"
                          >
                            {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add by name'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={() => setShowNameOnlyLocationAdd(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {locationAddError && (
                      <p className="text-xs text-red-300" data-testid="org-add-location-error">
                        {locationAddError}
                      </p>
                    )}
                  </div>
                )}

                {locationAddSuccess && !showAddLocation && (
                  <p className="px-3.5 sm:px-4 py-2 text-xs text-teal-200/90" data-testid="org-add-location-success">
                    {locationAddSuccess}
                  </p>
                )}

                {locations.length === 0 && !showAddLocation ? (
                  <div className="px-3.5 sm:px-4 py-8 text-center text-white/50 text-sm">
                    No places linked yet. Add one from your Places Book.
                  </div>
                ) : (
                  <div className="divide-y divide-white/6">
                    {locations.map((location) => {
                      const canOpen = Boolean(location.location_id || location.location_name?.trim());
                      return (
                      <div
                        key={location.id}
                        className="flex items-center justify-between gap-3 px-3.5 sm:px-4 py-3"
                        data-testid={`org-location-row-${location.id}`}
                      >
                        <button
                          type="button"
                          className="min-w-0 text-left flex-1 rounded-lg -mx-1 px-1 py-0.5 hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent touch-manipulation"
                          disabled={!canOpen}
                          onClick={() =>
                            canOpen &&
                            void openLinkedLocation({
                              locationId: location.location_id,
                              locationName: location.location_name,
                            })
                          }
                          title={canOpen ? 'Open in Places Book' : undefined}
                          data-testid={`org-location-open-${location.id}`}
                        >
                          <div className="font-semibold text-white flex items-center gap-2 min-w-0">
                            <MapPin className="h-3.5 w-3.5 text-teal-300/80 shrink-0" />
                            <span className="truncate underline-offset-2 decoration-teal-400/40 hover:underline">
                              {location.location_name}
                            </span>
                            {location.location_id ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-teal-400/25 text-teal-200/90 shrink-0"
                              >
                                Linked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-white/15 text-white/45 shrink-0"
                              >
                                Open
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-white/45 mt-1 ml-5">
                            {location.visit_count} {location.visit_count === 1 ? 'visit' : 'visits'}
                            {location.last_visited ? ` · Last ${formatDate(location.last_visited)}` : ''}
                          </div>
                          {groupsAtOrgLocation(location).length > 0 && (
                            <div className="mt-1.5 ml-5 flex flex-wrap gap-1.5">
                              {groupsAtOrgLocation(location).map((group) => (
                                <button
                                  key={group.id}
                                  type="button"
                                  onClick={() => openLinkedOrg(group.id)}
                                  className="rounded-md border border-indigo-400/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-200 hover:bg-indigo-500/20"
                                >
                                  {group.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${location.location_name}`}
                          onClick={() => void handleRemoveLocation(location.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
                      <Card
                        key={loc.id}
                        className="bg-purple-500/5 border-purple-500/20 transition hover:border-purple-400/40 hover:bg-purple-500/10 cursor-pointer"
                        onClick={() =>
                          void openLinkedLocation({
                            locationId: loc.id,
                            locationName: loc.name,
                          })
                        }
                      >
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
              <div className="rounded-xl border border-white/10 bg-black/50 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-400/20 bg-indigo-400/10">
                      <Link2 className="h-4 w-4 text-indigo-300" />
                    </span>
                    <div className="min-w-0">
                      <h3 className={TAB_HEADING}>Relationships</h3>
                      <p className="text-xs text-white/45">How {editedOrg.name} connects to other groups</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-indigo-400/25 text-indigo-100 hover:bg-indigo-500/15"
                      onClick={() => void handleReconcileRelationships()}
                      disabled={reconcilingRelationships}
                      title="Re-scan conversations for subgroup and hierarchy links"
                    >
                      {reconcilingRelationships
                        ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        : <Sparkles className="h-4 w-4 mr-1.5" />}
                      Learn from chat
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 bg-indigo-500/20 border border-indigo-400/30 text-indigo-100 hover:bg-indigo-500/30"
                      onClick={() => setShowAddRelationship(v => !v)}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {showAddRelationship ? 'Close' : 'Add relationship'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Hierarchy learned from chat */}
              {(derivedHierarchy.parent || (derivedHierarchy.subgroups?.length ?? 0) > 0) && (
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-indigo-300" />
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
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-black/40 p-3 sm:p-4">
                <OrganizationGroupNetwork
                  rootOrgId={organization.id}
                  compact
                  title={`${organization.name} in context`}
                  onOrgClick={openLinkedOrg}
                  onLocationClick={(locationId, locationName) => {
                    void openLinkedLocation({ locationId, locationName });
                  }}
                  previewNetwork={previewNetwork}
                  onDisconnect={(edge) => {
                    if (edge.id) {
                      void handleRemoveRelationship(edge.id);
                      return;
                    }
                    const match = relationships.find(rel =>
                      (rel.from_org_id === edge.fromId && rel.to_org_id === edge.toId) ||
                      (rel.from_org_id === edge.toId && rel.to_org_id === edge.fromId),
                    );
                    if (match) void handleRemoveRelationship(match.id);
                  }}
                />
              </div>

              {showAddRelationship && (
                <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.05] p-3.5 sm:p-4 space-y-3">
                  <p className="text-xs text-white/50">
                    {organization.name} <span className="text-white/30">is</span>{' '}
                    <span className="text-indigo-300">
                      {(MANUAL_ORG_REL_TYPE_OPTIONS.find(option => option.value === newRelationship.relationship_type)?.label ?? 'connected to').toLowerCase()}
                    </span>{' '}
                    <span className="text-white/30">→</span>{' '}
                    {newRelationship.to_org_id ? orgNameById(newRelationship.to_org_id) : '…'}
                  </p>
                  <select
                    value={newRelationship.to_org_id}
                    onChange={e => setNewRelationship(v => ({ ...v, to_org_id: e.target.value }))}
                    aria-label="Connected organization"
                    className={FIELD_SELECT}
                  >
                    <option value="">Select an organization…</option>
                    {relatedOrgs.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <select
                    value={newRelationship.relationship_type}
                    onChange={e => setNewRelationship(v => ({ ...v, relationship_type: e.target.value as ManualOrgRelationshipType, siteKey: '' }))}
                    aria-label="Relationship type"
                    className={FIELD_SELECT}
                  >
                    {MANUAL_ORG_REL_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {hierarchySiteOptions.length > 0 && (
                    <select
                      value={newRelationship.siteKey}
                      onChange={e => setNewRelationship(v => ({ ...v, siteKey: e.target.value }))}
                      aria-label="Company location for this group"
                      className={FIELD_SELECT}
                    >
                      <option value="">Any location / company-wide</option>
                      {hierarchySiteOptions.map(site => (
                        <option key={site.key} value={site.key}>{site.name}</option>
                      ))}
                    </select>
                  )}
                  <Input
                    placeholder="Notes (optional)"
                    value={newRelationship.notes}
                    onChange={e => setNewRelationship(v => ({ ...v, notes: e.target.value }))}
                    className={FIELD_INPUT}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void handleAddRelationship()}
                      disabled={relationshipSaving || !newRelationship.to_org_id}
                      className="flex-1 h-10 bg-indigo-500/25 border border-indigo-400/35 text-indigo-100 hover:bg-indigo-500/35"
                    >
                      {relationshipSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save relationship'}
                    </Button>
                    <Button variant="outline" className="h-10" onClick={() => setShowAddRelationship(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {relationshipsLoading ? (
                <div className="rounded-xl border border-white/10 bg-black/40 py-10 flex items-center justify-center gap-2 text-white/55 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading relationships…
                </div>
              ) : relationships.length === 0 && !showAddRelationship && (derivedHierarchy?.subgroups?.length ?? 0) === 0 && (previewNetwork?.edgeCount ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 bg-black/25 px-4 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10">
                    <Link2 className="h-5 w-5 text-indigo-300/80" />
                  </div>
                  <p className="text-sm font-medium text-white/75">No relationships yet</p>
                  <p className="mt-1 text-xs text-white/40 max-w-xs mx-auto leading-relaxed">
                    Connect {editedOrg.name} to another group above, or let LoreBook learn structure from chat.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {relationships.map((rel) => {
                    const outgoing = rel.from_org_id === organization.id;
                    const otherOrgId = outgoing ? rel.to_org_id : rel.from_org_id;
                    const otherOrgName = orgNameById(otherOrgId);
                    const inferred = rel.notes?.startsWith('[auto-inferred]');
                    return (
                      <div
                        key={rel.id}
                        className="group rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 sm:px-3.5 transition hover:border-indigo-400/30 hover:bg-indigo-500/[0.06]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500/25 to-blue-500/15 border border-indigo-400/25 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                            <Link2 className="h-4 w-4 text-indigo-200" />
                          </div>
                          <div className="min-w-0 flex-1">
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
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Edit relationship with ${otherOrgName}`}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/30 opacity-70 transition hover:bg-indigo-500/15 hover:text-indigo-300 group-hover:opacity-100"
                              onClick={() => beginRelationshipEdit(rel)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove relationship with ${otherOrgName}`}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/25 opacity-70 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                              onClick={() => void handleRemoveRelationship(rel.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {editingRelationshipId === rel.id && (
                          <div className="mt-3 grid gap-2 border-t border-white/8 pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
                            <select
                              value={relationshipEdit.relationship_type}
                              onChange={event => setRelationshipEdit(value => ({
                                ...value,
                                relationship_type: event.target.value as OrgRelationshipType,
                              }))}
                              aria-label={`Edit relationship type with ${otherOrgName}`}
                              className={FIELD_SELECT}
                            >
                              {ORG_REL_TYPE_OPTIONS.map(type => (
                                <option key={type} value={type}>{REL_TYPE_LABELS[type]}</option>
                              ))}
                            </select>
                            <Input
                              value={relationshipEdit.notes}
                              onChange={event => setRelationshipEdit(value => ({ ...value, notes: event.target.value }))}
                              placeholder="Notes (optional)"
                              className={FIELD_INPUT}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" disabled={relationshipSaving} onClick={() => void handleUpdateRelationship()}>
                                {relationshipSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                <span className="ml-1.5">Save</span>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRelationshipId(null)}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Sources Tab */}
            <TabsContent value="sources" className="mt-0 space-y-2 sm:space-y-3">
              <div className="rounded-lg sm:rounded-xl border border-sky-400/35 bg-gradient-to-br from-sky-500/20 via-sky-500/[0.07] to-black/50 p-2.5 sm:p-5 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_8px_28px_-12px_rgba(14,165,233,0.45)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <span className="inline-flex h-7 w-7 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl border border-sky-300/40 bg-sky-400/20 shadow-[0_0_20px_-4px_rgba(56,189,248,0.55)]">
                        <Search className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-sky-200" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-sky-200/70">
                          Evidence trail
                        </p>
                        <h3 className="text-sm sm:text-xl font-bold text-white tracking-tight leading-tight">
                          Sources and mentions
                        </h3>
                        <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-sm text-sky-50/70 leading-snug max-w-md">
                          Evidence for this identity across chats, older threads, and extracted facts.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 sm:h-9 w-full border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25 hover:text-white sm:w-auto text-xs"
                    disabled={mentionsLoading}
                    onClick={() => {
                      setMentionsLoaded(false);
                      setMentionTrace(null);
                    }}
                  >
                    {mentionsLoading ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    <span className="ml-1 sm:ml-1.5">Rescan</span>
                  </Button>
                </div>
              </div>

              {mentionsLoading ? (
                <Card className="border-white/10 bg-black/40">
                  <CardContent className="py-5 sm:py-8 text-center text-xs sm:text-sm text-white/55">
                    <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mx-auto mb-1.5 sm:mb-2" />
                    Searching messages, extracted facts, and older threads...
                  </CardContent>
                </Card>
              ) : !mentionTrace ? (
                <Card className="border-white/10 bg-black/40">
                  <CardContent className="py-5 sm:py-8 text-center text-xs sm:text-sm text-white/55">
                    Open this tab to scan for mentions.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                    <div className="rounded-lg sm:rounded-xl border border-sky-400/20 bg-sky-400/10 p-1.5 sm:p-3">
                      <p className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide text-sky-100/60">Total</p>
                      <p className="mt-0.5 sm:mt-1 text-base sm:text-2xl font-bold leading-none text-white tabular-nums">{mentionTrace.total_mentions}</p>
                    </div>
                    <SourceMetric label="Chat" value={mentionTrace.source_counts?.chat_messages ?? 0} />
                    <SourceMetric label="Older" value={mentionTrace.source_counts?.conversation_messages ?? 0} />
                    <SourceMetric label="Facts" value={mentionTrace.facts.length} />
                  </div>

                  {mentionTrace.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl border border-white/8 bg-white/[0.02] p-1.5 sm:p-2">
                      {mentionTrace.labels.map(label => (
                        <Badge key={label} variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-200 text-[10px] sm:text-xs px-1.5 py-0 sm:px-2.5 sm:py-0.5">
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
                              <p className="text-sm leading-relaxed text-white/80">
                                {highlightTextTerms(String(fact.fact ?? ''), sourceHighlightTerms, {
                                  className:
                                    'rounded-sm bg-amber-400/35 text-amber-50 px-0.5 font-semibold ring-1 ring-amber-400/50',
                                  markTestId: 'org-mention-name-highlight',
                                })}
                              </p>
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
                                <p className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
                                  {highlightTextTerms(
                                    mention.snippet,
                                    [
                                      mention.matched_label,
                                      ...sourceHighlightTerms,
                                    ],
                                    {
                                      className:
                                        'rounded-sm bg-amber-400/35 text-amber-50 px-0.5 font-semibold ring-1 ring-amber-400/50',
                                      markTestId: 'org-mention-name-highlight',
                                    },
                                  )}
                                </p>
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
              <div className="rounded-xl border border-white/10 bg-black/50 p-3 sm:p-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10">
                    <TreePine className="h-4 w-4 text-emerald-300" />
                  </span>
                  <div className="min-w-0">
                    <h3 className={TAB_HEADING}>Family tree</h3>
                    <p className="text-xs text-white/45">
                      Built from your conversations — share who is related to whom.
                    </p>
                  </div>
                </div>
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

            {/* Delete Tab — two-step confirmation, away from the close button */}
            <TabsContent value="danger" className={TAB_PANEL}>
              <Card className="border-red-500/25 bg-gradient-to-br from-red-500/10 via-black/40 to-black/50 overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    </span>
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

        <EntityModalBottomNav
          tabs={sectionTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Organization sections"
          dangerAction={{
            label: 'Delete group',
            icon: Trash2,
            onClick: () => setActiveTab('danger'),
            active: activeTab === 'danger',
          }}
        />

      </div>
    </Modal>
    
    {/* Nested Character Modal */}
    {selectedCharacter && (
      <CharacterDetailModal
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
        onUpdate={() => {
          // Refresh this group's roster without rebroadcasting a full story reload loop.
          if (!isEphemeralEntityId(organization.id)) {
            void fetchOrganizationById(organization.id)
              .then((full) => {
                setMembers(full.members || []);
                setEditedOrg((prev) => ({ ...prev, members: full.members || prev.members }));
              })
              .catch(() => {});
          }
          onUpdate?.();
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

    {timelineMoment && (
      <OrgTimelineMomentPanel
        event={timelineMoment}
        organizationName={editedOrg.name}
        onClose={() => setTimelineMoment(null)}
        onContinueInChat={() => {
          const moment = timelineMoment;
          setTimelineMoment(null);
          onClose();
          openOrgTimelineMomentChat({
            event: moment,
            organizationId: editedOrg.id,
            organizationName: editedOrg.name,
          });
        }}
        onPostAsEvent={
          timelineMoment.source === 'user_posted'
            ? undefined
            : () => {
                const moment = timelineMoment;
                setTimelineMoment(null);
                setPostComposerPrefill({
                  organization_id: editedOrg.id,
                  organization_name: editedOrg.name,
                  title: moment.title,
                  start_time: moment.date ?? undefined,
                  story: moment.summary,
                });
                setShowPostComposer(true);
              }
        }
      />
    )}

    {showPostComposer && (
    <PostEventComposer
      open={showPostComposer}
      onClose={() => {
        setShowPostComposer(false);
        setPostComposerPrefill(null);
      }}
      prefill={
        postComposerPrefill ?? {
          organization_id: editedOrg.id,
          organization_name: editedOrg.name,
        }
      }
      onCreated={(created) => {
        setShowPostComposer(false);
        setPostComposerPrefill(null);
        setPostedStoriesTick((n) => n + 1);
        setDerivedEvents((prev) => [
          {
            id: created.id,
            title: created.title,
            date: created.start_time,
            type: 'attended_event',
            summary: undefined,
            involved: [],
            audience: 'with_user',
            user_was_present: true,
            source: 'user_posted',
          },
          ...prev.filter((e) => e.id !== created.id),
        ]);
        setDerivedLoaded(true);
        onUpdate?.();
        // PostEventComposer opens main chat for LLM ingest — close the group modal.
        onClose();
      }}
    />
    )}
  </>
  );
};

function SourceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg sm:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 sm:p-3">
      <p className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide text-white/35">{label}</p>
      <p className="mt-0.5 sm:mt-1 text-base sm:text-2xl font-bold leading-none text-white tabular-nums">{value}</p>
    </div>
  );
}
