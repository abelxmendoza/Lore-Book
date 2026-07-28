import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { shortDisplayName } from '../../lib/displayName';
import { EntityModalBottomNav } from '../common/EntityModalBottomNav';
import { dedupeRelationshipsByPerson } from '../../lib/dedupeCharacterRelationships';
import { CharacterPerceptionsTab } from '../perceptions/CharacterPerceptionsTab';
import { X, Save, Instagram, Twitter, Facebook, Linkedin, Github, Globe, Mail, Phone, Calendar, Users, Tag, Sparkles, FileText, Network, MessageSquare, Brain, Clock, Database, Layers, TrendingUp, TrendingDown, Minus, Heart, Star, Zap, BarChart3, Lightbulb, Award, User, Hash, Link2, Eye, Building2, UserCircle, TreePine, AlertCircle, AlertTriangle, Briefcase, DollarSign, Activity, Smile, Heart as HeartIcon, Home, Trash2, RefreshCw, Loader2, ImageIcon, Shield, ChevronDown, MapPin, Plus, BookOpen } from 'lucide-react';
import { XProvenanceBadge } from '../integrations/XProvenanceBadge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';
import { MemoryCardComponent } from '../memory-explorer/MemoryCard';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { FamilyTreeView, createMockFamilyTreeForCharacter, createMockUserFamilyTree } from '../family/FamilyTreeView';
import { FamilyTreePanel } from '../family/FamilyTreePanel';
import { FamilyTreeCopyAllButton } from '../family/FamilyTreeCopyAllButton';
import { RelationshipEditor } from '../family/RelationshipEditor';
import { useFamilyTreeEditing } from '../family/useFamilyTreeEditing';
import { OrganizationDetailModal } from '../organizations/OrganizationDetailModal';
import type { Organization } from '../organizations/OrganizationProfileCard';
import { LocationDetailModal, type LocationProfile } from '../locations/LocationDetailModal';
import { PerceptionDetailModal } from '../perceptions/PerceptionDetailModal';
import { fetchJson } from '../../lib/api';
import { apiCache } from '../../lib/cache';
import { invalidateCache } from '../../lib/requestCache';
import { invalidateOrganizationMembershipCaches } from '../../lib/invalidateOrganizationMembershipCaches';
import { OrganizationMemberRoleSelect } from '../ui/OrganizationMemberRoleSelect';
import { CreateGroupFromCharacterPanel } from './CreateGroupFromCharacterPanel';
import { fetchCharacterLoreProfile, type CharacterLoreProfile } from '../../api/characterLoreProfile';
import { formatEpistemicPercent } from '../../lib/epistemicLabels';
import { onStoryDataUpdated, dispatchStoryDataUpdated } from '../../lib/storyRefresh';
import { UnknownField } from '../ui/UnknownField';
import { InsufficientData } from '../ui/InsufficientData';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import type { Character } from './CharacterProfileCard';
import { CharacterInfoPanel } from './CharacterInfoPanel';
import { EditableEntityName } from '../common/EditableEntityName';
import { CharacterAvatar } from './CharacterAvatar';
import { ConnectionSectionHeader } from './ConnectionSectionHeader';
import { useMockData } from '../../contexts/MockDataContext';
import { mockDataService } from '../../services/mockDataService';
import {
  getMockAttributes,
  getMockAllAttributes,
  getMockDynamics,
  getMockInfluenceProfile,
  getMockInfluenceInsights,
  getMockFacts,
  getMockKnowledgeClaims,
  getMockSceneCandidates,
} from '../../mocks/characterIntelligence';
import { getMockRomanticRelationshipForCharacter } from '../../mocks/romanticLifeImpact';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { openChatThreadAtMessage } from '../../lib/chatThreadJump';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import { FOCUSED_ENTITY_CHAT_PRESETS } from '../chat/focusedEntityChatPresets';
import type { PerceptionEntry } from '../../types/perception';
import { EntityProvenancePanel } from './EntityProvenancePanel';
import { ContradictionResolutionPanel } from './ContradictionResolutionPanel';
import { CharacterStoryPanel } from './CharacterStoryPanel';
import { EntityLorebookCompileControl } from '../lorebook/EntityLorebookCompileControl';
import { CharacterKnowledgeBase } from './CharacterKnowledgeBase';
import { CharacterEvidenceLocker } from './CharacterEvidenceLocker';
import { CharacterMediaPanel } from './CharacterMediaPanel';
import { RelationshipPeripheralsPanel } from './RelationshipPeripheralsPanel';
import { isSelfCharacter, isSyntheticSelfId } from '../../lib/isSelfCharacter';
import { selfCharacterApi } from '../../api/selfCharacter';
import {
  CONNECTION_STAGE_LABELS,
  getPublicFigureConnection,
  getSceneNetwork,
  isPublicFigureCharacter,
} from '../../lib/publicFigure';
import {
  getCharacterContextHooks,
  getCharacterRealName,
  getCharacterWittyTagline,
} from '../../lib/characterDisplay';
import { getCharacterDisplayTitle } from '../../lib/characterDisplayTitle';
import { CharacterTitleSection } from './CharacterTitleSection';
import { useCharacterQuery } from '../../hooks/useCharacterQuery';
import type { CharacterChatMention } from '../../hooks/useCharacterProfileBundleTypes';
import type { CharacterKnowledgeBaseData } from './CharacterKnowledgeBase';
import { useUpdateCharacterMutation, useReclassifyEntityMutation } from '../../store/api/entitiesApi';

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

type CharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  evidence?: string;
  startTime?: string;
  endTime?: string;
};

type CharacterDetail = Character & {
  first_name?: string | null;
  middle_name?: string | null;
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

type SelfProfileMemory = {
  id: string;
  entry_id: string;
  date: string;
  summary: string | null;
  content: string;
  source: 'chat' | 'journal';
  tags: string[];
};

type RomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
};

type CharacterDetailModalProps = {
  character: Character;
  onClose: () => void;
  onUpdate: () => void;
  relationship?: RomanticRelationship;
  /** Protagonist / self profile — amber styling, no delete, synthetic-id safe. */
  isMainCharacter?: boolean;
  /** Open directly on a tab (e.g. from Dating & Romance → Character Book link). */
  initialTab?: TabKey | 'network' | 'history';
  /** Deep-link into a specific Info-tab field (e.g. Role from an Unknown chip). */
  initialFocusField?: 'role' | null;
  onInitialFocusFieldHandled?: () => void;
};

type TabKey = 'info' | 'social' | 'relationships' | 'perceptions' | 'timeline' | 'chat' | 'insights' | 'metadata' | 'knowledge' | 'evidence' | 'photos' | 'messages';

/** Legacy `network` deep-links land on Connections; legacy `history` → Story. */
function resolveInitialTab(tab: TabKey | 'network' | 'history' | undefined): TabKey {
  if (tab === 'network') return 'relationships';
  if (tab === 'history') return 'timeline';
  return tab ?? 'info';
}

const tabs: Array<{ key: TabKey; label: string; shortLabel: string; icon: typeof FileText }> = [
  { key: 'info',          label: 'Info',              shortLabel: 'Info',       icon: FileText },
  { key: 'knowledge',     label: 'What I Know',       shortLabel: 'Know',       icon: Brain },
  { key: 'chat',          label: 'Intelligence Chat', shortLabel: 'Chat',       icon: MessageSquare },
  { key: 'relationships', label: 'Connections',       shortLabel: 'Links',      icon: Network },
  { key: 'timeline',      label: 'Story',             shortLabel: 'Story',      icon: BookOpen },
  { key: 'insights',      label: 'Insights',          shortLabel: 'Insights',   icon: BarChart3 },
  { key: 'perceptions',   label: 'Perceptions',       shortLabel: 'Views',      icon: Eye },
  { key: 'photos',        label: 'Photo Gallery',     shortLabel: 'Photos',     icon: ImageIcon },
  { key: 'messages',      label: 'Messages',          shortLabel: 'Msgs',       icon: MessageSquare },
  { key: 'evidence',      label: 'Evidence Locker',   shortLabel: 'Evidence',   icon: Shield },
  { key: 'social',        label: 'Social',            shortLabel: 'Social',     icon: Globe },
  { key: 'metadata',      label: 'Metadata',          shortLabel: 'Meta',       icon: Database },
];

/**
 * Entity types a misfiled character can be moved to. Each target book applies
 * its own admission rules server-side (see reclassifyCharacterService) — e.g.
 * Places rejects events/relative positions, Projects rejects non-project
 * phrases — so a move can come back with the rule's rejection reason.
 */
const RECLASSIFY_OPTIONS: Array<{ value: string; label: string; hint: string; icon: typeof FileText }> = [
  { value: 'organization', label: 'Group / Organization', hint: 'Bands, teams, companies, communities', icon: Building2 },
  { value: 'location',     label: 'Location / Place',     hint: 'Checked against Places rules first',   icon: MapPin },
  { value: 'event',        label: 'Event',                hint: 'A happening — moves to the Events book', icon: Calendar },
  { value: 'project',      label: 'Project',              hint: 'Checked against Projects rules first', icon: Briefcase },
  { value: 'skill',        label: 'Skill',                hint: 'An ability or craft',                  icon: Award },
];

/**
 * Entity type switcher (header control). The single place to reclassify
 * a misclassified entity to another book.
 */
const EntityTypeSwitcher = ({
  busy,
  success,
  error,
  target,
  onSelect,
  onOpenMenu,
}: {
  busy: boolean;
  success: boolean;
  error: string | null;
  target: string;
  onSelect: (value: string) => void;
  /** Called when the menu is toggled — lets the modal clear a stale error. */
  onOpenMenu: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const successLabel = RECLASSIFY_OPTIONS.find((o) => o.value === target)?.label ?? target;

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Tooltip content="Entity in the wrong book? Click to reclassify (e.g. group or place). The target book validates it.">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); onOpenMenu(); }}
          disabled={busy || success}
          aria-haspopup="menu"
          aria-expanded={open ? 'true' : 'false'}
          aria-label="Reclassify entity type (if in wrong book)"
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 shadow-sm ${
            success
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/15 hover:text-white hover:border-white/30'
          }`}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <User className="h-3 w-3" />}
          {success ? `Moved to ${successLabel} ✓` : 'Person'}
          {!success && <ChevronDown className="h-3 w-3 opacity-70" />}
        </button>
      </Tooltip>
      {open && !success && (
        <div
          role="menu"
          aria-label="Change entity type"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-white/15 bg-zinc-900/95 backdrop-blur-sm shadow-xl p-1"
        >
          <p className="px-2 pt-1.5 pb-2 text-[9px] text-white/50">
            Move to the correct book (target validates).
          </p>
          {RECLASSIFY_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => onSelect(option.value)}
                disabled={busy}
                className="w-full flex items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/[0.08] disabled:opacity-50"
              >
                <OptionIcon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-white/50" />
                <span className="min-w-0">
                  <span className="block text-xs text-white/85 font-medium">{option.label}</span>
                  <span className="block text-[10px] text-white/40 leading-tight">{option.hint}</span>
                </span>
                {busy && target === option.value && (
                  <Loader2 className="h-3 w-3 ml-auto mt-1 animate-spin text-white/60" />
                )}
              </button>
            );
          })}
          {error && (
            <p className="px-2 py-1.5 text-[10px] text-red-400 border-t border-white/10 mt-1">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const CharacterDetailModal = ({
  character,
  onClose,
  onUpdate,
  relationship,
  isMainCharacter: isMainCharacterProp,
  initialTab,
  initialFocusField = null,
  onInitialFocusFieldHandled,
}: CharacterDetailModalProps) => {
  const navigate = useNavigate();
  const { useMockData: isMockDataEnabled } = useMockData();
  const [updateCharacter] = useUpdateCharacterMutation();
  const isMainCharacter = isMainCharacterProp ?? isSelfCharacter(character);
  const characterQueryEnabled =
    !isMockDataEnabled &&
    !isSyntheticSelfId(character.id) &&
    !character.id.startsWith('dummy-') &&
    !isMainCharacter;
  const {
    query: characterQuery,
    loading: characterQueryLoading,
    error: characterQueryError,
    loadSections,
  } = useCharacterQuery(character.id, {
    enabled: characterQueryEnabled,
    sections: 'core',
  });
  const profileBundle = useMemo(() => {
    if (!characterQuery?.sections?.identity) return null;
    const identity = characterQuery.sections.identity as Record<string, unknown>;
    return {
      characterId: characterQuery.characterId,
      detail: identity,
      knowledgeBase: characterQuery.sections.knowledge as CharacterKnowledgeBaseData | undefined,
      loreProfile: characterQuery.sections.lore as CharacterLoreProfile | undefined,
      chatMentions: (characterQuery.sections.chatMentions as CharacterChatMention[]) ?? [],
      generatedAt: characterQuery.generatedAt,
      organizations: characterQuery.sections.organizations,
      attributes: characterQuery.sections.attributes,
      memories: characterQuery.sections.memories,
      provenance: characterQuery.sections.provenance,
    };
  }, [characterQuery]);
  const profileBundleLoading = characterQueryLoading;
  const profileBundleError = characterQueryError;
  const profileBundleEnabled = characterQueryEnabled;
  const [editedCharacter, setEditedCharacter] = useState<CharacterDetail>(character as CharacterDetail);
  const [profileWittyTagline, setProfileWittyTagline] = useState<string | null>(
    getCharacterWittyTagline(character)
  );
  const [profileContextHooks, setProfileContextHooks] = useState<string[]>(
    getCharacterContextHooks(character)
  );
  const [profileRealName, setProfileRealName] = useState<string | null>(
    getCharacterRealName(character)
  );
  const [deleteStep, setDeleteStep] = useState<null | 'warn' | 'type'>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('wrong_person_or_not_real');
  const [deleteReasonNote, setDeleteReasonNote] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Reclassify state (controlled via the EntityTypeSwitcher in the header)
  const [reclassifyTarget, setReclassifyTarget] = useState('');
  const [reclassifyBusy, setReclassifyBusy] = useState(false);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const [reclassifySuccess, setReclassifySuccess] = useState(false);

  const [reclassifyEntity] = useReclassifyEntityMutation();
  const loreAvatarsEnabled = import.meta.env.VITE_ENABLE_LORE_AVATARS === 'true';
  const [loreAvatarBusy, setLoreAvatarBusy] = useState(false);
  const [loreAvatarError, setLoreAvatarError] = useState<string | null>(null);

  const generateLorePortrait = async () => {
    if (isMockDataEnabled) return;
    setLoreAvatarBusy(true);
    setLoreAvatarError(null);
    try {
      const { characterAvatarApi } = await import('../../api/characterAvatar');
      const result = await characterAvatarApi.generateFromLore(character.id);
      if (!result.success) {
        setLoreAvatarError(result.message);
        return;
      }
      setEditedCharacter((prev) => ({ ...prev, avatar_url: result.avatar_url }));
      invalidateCache('/api/characters');
    } catch {
      setLoreAvatarError('Could not generate portrait from lore.');
    } finally {
      setLoreAvatarBusy(false);
    }
  };

  const canDeleteCharacter =
    !isMainCharacter &&
    !isSyntheticSelfId(character.id) &&
    !character.id.startsWith('dummy-') &&
    !character.id.startsWith('temp-');

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

  const archiveCharacter = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (isMockDataEnabled) {
        mockDataService.mutate.characters.upsert({
          ...(editedCharacter as Character),
          status: 'archived',
        });
        onUpdate();
        onClose();
        return;
      }
      await updateCharacter({
        id: character.id,
        values: {
          status: 'archived',
          metadata: {
            deletion_reason: deleteReason,
            deletion_reason_note: deleteReasonNote.trim() || undefined,
            deletion_reason_recorded_at: new Date().toISOString(),
          },
        },
      }).unwrap();
      invalidateCache(character.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to archive character:', err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to archive character');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRenameCharacter = async (nextName: string) => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === editedCharacter.name) return;
    setEditedCharacter((prev) => ({ ...prev, name: trimmed }));
    if (isMockDataEnabled) {
      mockDataService.mutate.characters.upsert({ ...(editedCharacter as Character), name: trimmed });
      onUpdate();
      return;
    }
    try {
      await updateCharacter({
        id: character.id,
        values: {
          name: trimmed,
          metadata: { name_source: 'user_confirmed', name_confirmed_at: new Date().toISOString() },
        },
      }).unwrap();
      invalidateCache(character.id);
      onUpdate();

      // Any character's rename can change a name shown elsewhere (Family
      // Tree nodes, relationship lists, etc.) — those views only refetch on
      // this event, so it must fire for every rename, not just the main
      // character, and it must include 'family' or FamilyTreePanel's
      // scope-filtered listener never picks it up.
      dispatchStoryDataUpdated({ scopes: ['characters', 'family'], characterIds: [character.id] });

      // For main/self character: immediately adapt the system
      if (isMainCharacter && !isMockDataEnabled) {
        selfCharacterApi.ensureSelf().catch(() => {});
        selfCharacterApi.getProfile().then(applySelfProfile).catch(() => {});
        selfCharacterApi.repairIdentity().catch(() => {});
      }
    } catch (err) {
      // Roll back optimistic rename and surface the error inline (EditableEntityName).
      setEditedCharacter((prev) => ({ ...prev, name: editedCharacter.name }));
      throw err instanceof Error ? err : new Error('Failed to rename character');
    }
  };

  const invalidateRelationshipViews = (otherCharacterId?: string) => {
    invalidateCache(character.id);
    // The other side of the link has its own cached knowledge-base/profile-bundle
    // entries that this edit also affects (relationships are read bidirectionally),
    // but no listener is mounted for it right now to pick up the dispatch below.
    if (otherCharacterId && otherCharacterId !== character.id) invalidateCache(otherCharacterId);
    invalidateCache('/api/characters');
    invalidateCache('/api/conversation/romantic-relationships');
  };

  const upsertLocalRelationship = (nextRelationship: Relationship) => {
    setEditedCharacter((prev) => {
      const relationships = prev.relationships ?? [];
      const withoutExisting = relationships.filter((rel) => {
        if (nextRelationship.id && rel.id === nextRelationship.id) return false;
        return rel.character_id !== nextRelationship.character_id;
      });
      return {
        ...prev,
        relationships: [nextRelationship, ...withoutExisting],
        relationship_count: Math.max(prev.relationship_count ?? 0, withoutExisting.length + 1),
      };
    });
  };

  const addWorldPerson = async (targetCharacterId: string, relationshipType: string, status: string) => {
    if (isMockDataEnabled) return;
    const response = await fetchJson<{ success: boolean; relationship: Relationship }>(
      '/api/relationships/character-links',
      {
        method: 'POST',
        body: JSON.stringify({
          source_character_id: editedCharacter.id ?? character.id,
          target_character_id: targetCharacterId,
          relationship_type: relationshipType,
          status,
        }),
      }
    );
    upsertLocalRelationship(response.relationship);
    invalidateRelationshipViews(targetCharacterId);
    dispatchStoryDataUpdated({ scopes: ['characters'], characterIds: [character.id, targetCharacterId] });
    // Manual "People in their world" add is recorded with user_confirmed + manual flags in backend.
    // This feeds entity authority, continuity, biography, and lorebook so the system learns the connection
    // as high-confidence ground truth for identity and long-term narrative.
    if (isMainCharacter && !isMockDataEnabled) {
      selfCharacterApi.ensureSelf().catch(() => {});
      selfCharacterApi.repairIdentity().catch(() => {});
      dispatchStoryDataUpdated({ scopes: ['characters'], characterIds: [character.id, targetCharacterId] });
    }
  };

  const updateWorldPerson = async (
    relationshipId: string,
    patch: { relationship_type?: string; status?: string },
  ) => {
    if (isMockDataEnabled) return;
    const response = await fetchJson<{ success: boolean; relationship: Relationship }>(
      `/api/relationships/character-links/${relationshipId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    upsertLocalRelationship(response.relationship);
    invalidateRelationshipViews(response.relationship.character_id);
    dispatchStoryDataUpdated({
      scopes: ['characters'],
      characterIds: [character.id, response.relationship.character_id],
    });
    // Manual update learned by system (high authority for continuity/identity).
  };

  const deleteWorldPerson = async (relationshipId: string) => {
    if (isMockDataEnabled) return;
    const otherCharacterId = editedCharacter.relationships?.find((rel) => rel.id === relationshipId)?.character_id;
    await fetchJson<{ success: boolean }>(
      `/api/relationships/character-links/${relationshipId}`,
      { method: 'DELETE' }
    );
    setEditedCharacter((prev) => {
      const relationships = (prev.relationships ?? []).filter((rel) => rel.id !== relationshipId);
      return {
        ...prev,
        relationships,
        relationship_count: relationships.length,
      };
    });
    invalidateRelationshipViews(otherCharacterId);
    dispatchStoryDataUpdated({
      scopes: ['characters'],
      characterIds: otherCharacterId ? [character.id, otherCharacterId] : [character.id],
    });
    // Delete from "People in their world" is a user correction — system treats removal as authoritative for graph/continuity.
    if (isMainCharacter && !isMockDataEnabled) {
      selfCharacterApi.ensureSelf().catch(() => {});
      selfCharacterApi.repairIdentity().catch(() => {});
      dispatchStoryDataUpdated({
        scopes: ['characters'],
        characterIds: otherCharacterId ? [character.id, otherCharacterId] : [character.id],
      });
    }
  };

  const resetDeleteFlow = () => {
    setDeleteStep(null);
    setDeleteConfirmText('');
    setDeleteReason('wrong_person_or_not_real');
    setDeleteReasonNote('');
    setDeleteError(null);
  };

  const handleReclassify = async (target: string) => {
    if (!target || reclassifyBusy || reclassifySuccess) return;
    setReclassifyTarget(target);
    setReclassifyBusy(true);
    setReclassifyError(null);
    setReclassifySuccess(false);
    try {
      if (isMockDataEnabled) {
        // For mock, just update locally and pretend moved
        mockDataService.mutate.characters.upsert({
          ...(editedCharacter as Character),
          metadata: {
            ...(editedCharacter.metadata || {}),
            reclassified_to: target,
            reclassified_at: new Date().toISOString(),
          },
        });
        setReclassifySuccess(true);
        onUpdate();
        setTimeout(() => onClose(), 800);
        return;
      }

      await reclassifyEntity({ id: character.id, targetDomain: target }).unwrap();
      setReclassifySuccess(true);
      invalidateCache(character.id);
      onUpdate();
      // Close after success so user sees it in the target book
      setTimeout(() => onClose(), 600);
    } catch (err) {
      console.error('Reclassify failed', err);
      // 422 = the target book's rules rejected the move; surface the reason.
      const serverMessage = (err as { data?: { error?: string } })?.data?.error;
      setReclassifyError(
        serverMessage ?? (err instanceof Error ? err.message : 'Failed to reclassify entity')
      );
    } finally {
      setReclassifyBusy(false);
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

  // Tooltip content generators for badges
  const getStatusTooltip = (status?: string | null) => {
    switch (status) {
      case 'active':
        return 'Active: This character is currently part of your ongoing story. They appear frequently in recent conversations and events.';
      case 'inactive':
        return 'Inactive: This character hasn\'t been mentioned recently. They may have faded from your current narrative but remain in your memory.';
      case 'archived':
        return 'Archived: This character has been archived, likely because they\'re no longer relevant to your current life story.';
      default:
        return 'Status: Character status is automatically determined based on how recently and frequently they appear in your conversations.';
    }
  };

  const getImportanceTooltip = (level?: string | null, score?: number | null, influenceOnUser?: number) => {
    const scoreText = score !== null && score !== undefined ? ` (Score: ${Math.round(score)}/100)` : '';
    const lowPresence = level === 'minor' || level === 'background';
    const highImpact = (influenceOnUser ?? 0) >= 70;
    let base: string;
    switch (level) {
      case 'protagonist':
        base = `Protagonist${scoreText}: This character is central to your story. They appear frequently, have deep relationships with you, and significantly impact your narrative. Assigned based on mention frequency, relationship depth, and emotional significance.`;
        break;
      case 'major':
        base = `Major${scoreText}: This character plays an important role in your story. They appear regularly and have meaningful connections. Assigned based on consistent mentions and relationship significance.`;
        break;
      case 'supporting':
        base = `Supporting${scoreText}: This character appears occasionally and contributes to your story. They have moderate significance. Assigned based on periodic mentions and moderate relationship depth.`;
        break;
      case 'minor':
        base = `Minor${scoreText}: This character appears infrequently in your story. Assigned based on rare mentions or shallow relationship depth.`;
        break;
      case 'background':
        base = `Background${scoreText}: This character is mentioned but appears rarely in your story. They're part of the background context. Assigned based on very rare mentions or third-party references.`;
        break;
      default:
        base = `Importance Level${scoreText}: Automatically calculated based on how often you mention this character, the depth of your relationship, and their role in your story.`;
    }
    if (lowPresence && highImpact && influenceOnUser != null) {
      return `${base} Despite low presence in your story, they have high impact on you (influence: ${influenceOnUser}/100).`;
    }
    return base;
  };

  const getProximityTooltip = (level?: string | null) => {
    switch (level) {
      case 'direct':
        return 'Direct: You know this person directly and have personal interactions with them. This is assigned when you mention direct conversations, meetings, or shared experiences.';
      case 'indirect':
        return 'Indirect: You know this person through someone else. They\'re connected to you through mutual relationships. Assigned when mentioned in context of other people you know.';
      case 'distant':
        return 'Distant: You barely know this person. You may have met them once or know them only superficially. Assigned based on limited mentions or casual references.';
      case 'unmet':
        return 'Unmet: You haven\'t met this person yet, but they\'ve been mentioned in your conversations. They exist in your story but not in your direct experience.';
      case 'third_party':
        return 'Third Party: This person was mentioned by others but you don\'t know them personally. They\'re part of someone else\'s story that you\'re aware of.';
      default:
        return 'Proximity: Tracks how directly you know this person, automatically determined from how you mention them in conversations.';
    }
  };

  const getRelationshipDepthTooltip = (depth?: string | null) => {
    switch (depth) {
      case 'close':
        return 'Close: You have a deep, meaningful relationship with this person. Assigned based on frequent mentions, emotional language, shared experiences, and significant interactions.';
      case 'moderate':
        return 'Moderate: You have a meaningful but not deeply intimate relationship. Assigned based on regular but not frequent mentions and moderate emotional connection.';
      case 'casual':
        return 'Casual: You have a friendly but not deep relationship. Assigned based on occasional mentions and light interactions.';
      case 'acquaintance':
        return 'Acquaintance: You know this person but aren\'t close. Assigned based on infrequent mentions and minimal relationship depth.';
      case 'mentioned_only':
        return 'Mentioned Only: This person has been mentioned but you don\'t have an established relationship. Assigned when they appear in conversations but lack relationship indicators.';
      default:
        return 'Relationship Depth: Automatically determined from the frequency and emotional tone of your interactions with this person.';
    }
  };

  const getLikelihoodToMeetTooltip = (likelihood?: string | null) => {
    switch (likelihood) {
      case 'very_likely':
        return 'Very Likely: Based on your conversations, you\'re very likely to meet this person soon. Assigned when you mention plans, upcoming events, or strong intentions to meet.';
      case 'likely':
        return 'Likely: There\'s a good chance you\'ll meet this person. Assigned when you mention potential meetings or moderate connection opportunities.';
      case 'possible':
        return 'Possible: Meeting this person is possible but not certain. Assigned when there are some connection points but no concrete plans.';
      case 'unlikely':
        return 'Unlikely: It\'s unlikely you\'ll meet this person. Assigned when there are few or no connection opportunities mentioned.';
      case 'very_unlikely':
        return 'Very Unlikely: It\'s very unlikely you\'ll meet this person. Assigned when they\'re distant, third-party, or there are no connection paths.';
      default:
        return 'Likelihood to Meet: Estimated based on your proximity level, relationship context, and mentions of potential meetings or connections.';
    }
  };

  const getNicknameTooltip = () => {
    return 'Nickname: This display name is a nickname rather than their formal name. The system detected this from your conversations when you consistently use a different name than their full name.';
  };

  const getAliasTooltip = (alias: string) => {
    return `Alias/Nickname: "${alias}" is an alternative name you use for this person. The system learned this from your conversations when you refer to them by different names.`;
  };

  const getRoleTooltip = (role?: string | null) => {
    return `Occupation / Role: "${role}" — for you (main character) this is typically your occupation or primary activity. For others, it describes their role in your life or story. Editable in the Info tab.`;
  };

  const getArchetypeTooltip = (archetype?: string | null) => {
    return `Archetype: "${archetype}" represents the archetypal role this person plays in your narrative. This is inferred from patterns in your conversations, their influence on you, and the nature of your relationship.`;
  };

  const getTagTooltip = (tag: string) => {
    return `Tag: "${tag}" is a theme or category associated with this character. Tags are automatically extracted from your conversations to help organize and understand the context of your relationships.`;
  };

  const getSharedBadgeTooltip = () => {
    return 'Shared: You and this character both belong to this group or organization. This is determined by detecting when you mention both yourself and this character in the context of the same group.';
  };

  const getNotSharedBadgeTooltip = () => {
    return 'Not Shared: This character belongs to this group or organization, but you don\'t. This is determined when you mention the character\'s affiliation without indicating your own membership.';
  };

  const getRelationshipTrendTooltip = (trend: string) => {
    switch (trend) {
      case 'deepening':
        return 'Deepening: Your relationship with this person is growing stronger over time. This is detected by analyzing increasing mention frequency, more positive sentiment, and growing relationship depth scores.';
      case 'weakening':
        return 'Weakening: Your relationship with this person may be fading. This is detected by decreasing mention frequency, less positive sentiment, or increasing time between interactions.';
      case 'stable':
        return 'Stable: Your relationship with this person has remained consistent. This is detected when mention frequency, sentiment, and relationship depth have remained relatively constant over time.';
      default:
        return 'Relationship Trend: Automatically calculated by analyzing changes in interaction frequency, sentiment, and relationship depth over time.';
    }
  };

  // Analytics metric tooltip generators
  const getClosenessScoreTooltip = (score: number, character: CharacterDetail) => {
    const relationship = character.relationships?.find(r => r.character_name === 'You' || !r.character_name);
    const closenessBase = relationship?.closeness_score || 0;
    const sharedCount = character.shared_memories?.length || 0;
    
    let explanation = `Closeness Score: ${score}%\n\n`;
    explanation += `This score is calculated from:\n`;
    explanation += `• Relationship closeness base: ${closenessBase}/10 (from relationship data)\n`;
    explanation += `• Shared experiences: ${sharedCount} memories/events together\n`;
    explanation += `• Emotional depth indicators from your conversations\n`;
    explanation += `• Frequency of positive interactions and mentions\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% indicates a very close relationship. You mention this person frequently, have deep emotional connections, and share many meaningful experiences together.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% indicates a close relationship. You have regular interactions and meaningful connections, though there's room to deepen the bond further.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% indicates a moderate closeness. The relationship is developing, with some shared experiences and growing connection.`;
    } else {
      explanation += `A score of ${score}% indicates a developing relationship. You're getting to know this person, but the connection is still forming.`;
    }
    
    return explanation;
  };

  const getImportanceScoreTooltip = (score: number, character: CharacterDetail) => {
    const importanceLevel = character.importance_level || 'unknown';
    const mentionCount = character.metadata?.mention_count || 0;
    const roleSignificance = character.role ? 'high' : 'moderate';
    
    let explanation = `Importance Score: ${score}%\n\n`;
    explanation += `This score reflects how central ${character.name} is to your story:\n`;
    explanation += `• Importance level: ${importanceLevel}\n`;
    explanation += `• Mention frequency: ${mentionCount > 0 ? `${mentionCount} mentions` : 'Based on relationship depth'}\n`;
    explanation += `• Role significance: ${roleSignificance}\n`;
    explanation += `• Relationship depth and emotional impact\n`;
    explanation += `• Impact on your decisions and life events\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means this person is central to your narrative. They appear frequently, influence your decisions, and significantly impact your story.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means this person plays an important role. They appear regularly and have meaningful influence on your life.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means this person has moderate importance. They contribute to your story but aren't central to it.`;
    } else {
      explanation += `A score of ${score}% means this person has lower importance. They appear occasionally but have limited impact on your narrative.`;
    }
    
    return explanation;
  };

  const getPriorityScoreTooltip = (score: number, character: CharacterDetail) => {
    const recency = character.shared_memories && character.shared_memories.length > 0 
      ? 'Recent interactions' 
      : 'No recent interactions';
    const urgency = score >= 70 ? 'High urgency' : score >= 50 ? 'Moderate urgency' : 'Low urgency';
    
    let explanation = `Priority Score: ${score}%\n\n`;
    explanation += `This score indicates how urgent or prioritized this relationship is:\n`;
    explanation += `• Interaction recency: ${recency}\n`;
    explanation += `• Urgency level: ${urgency}\n`;
    explanation += `• Pending conversations or plans\n`;
    explanation += `• Emotional significance in current context\n`;
    explanation += `• Active projects or shared goals\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means high priority. This relationship needs attention soon - there may be pending conversations, active projects, or time-sensitive matters.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means moderate priority. The relationship is active and worth maintaining, but not urgent.`;
    } else {
      explanation += `A score of ${score}% means lower priority. The relationship is stable and doesn't require immediate attention.`;
    }
    
    return explanation;
  };

  const getEngagementScoreTooltip = (score: number, character: CharacterDetail) => {
    const interactionCount = character.shared_memories?.length || 0;
    const frequency = score >= 70 ? 'Very frequent' : score >= 50 ? 'Regular' : 'Occasional';
    
    let explanation = `Engagement Score: ${score}%\n\n`;
    explanation += `This score measures how actively you interact with ${character.name}:\n`;
    explanation += `• Interaction frequency: ${frequency}\n`;
    explanation += `• Total shared experiences: ${interactionCount}\n`;
    explanation += `• Conversation frequency in your chats\n`;
    explanation += `• Response time and engagement level\n`;
    explanation += `• Active participation in shared activities\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means very high engagement. You interact frequently, respond quickly, and actively participate in shared activities.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means regular engagement. You maintain consistent interaction and stay connected.`;
    } else {
      explanation += `A score of ${score}% means occasional engagement. Interactions happen but aren't frequent or consistent.`;
    }
    
    return explanation;
  };

  const getAnalyticsRelationshipDepthTooltip = (score: number, sharedExperiences: number) => {
    let explanation = `Relationship Depth: ${score}%\n\n`;
    explanation += `This measures the emotional and experiential depth of your relationship:\n`;
    explanation += `• Shared experiences: ${sharedExperiences} memories/events\n`;
    explanation += `• Emotional intimacy indicators\n`;
    explanation += `• Depth of conversations and topics discussed\n`;
    explanation += `• Vulnerability and trust levels\n`;
    explanation += `• Long-term connection and history\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% indicates very deep connection. You share intimate experiences, have deep conversations, and trust each other significantly.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% indicates meaningful depth. You have substantial shared history and meaningful connections.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% indicates developing depth. The relationship is growing, with some meaningful experiences but room to deepen further.`;
    } else {
      explanation += `A score of ${score}% indicates surface-level connection. The relationship is still developing and hasn't reached deep levels yet.`;
    }
    
    return explanation;
  };

  const getInteractionFrequencyTooltip = (score: number) => {
    let explanation = `Interaction Frequency: ${score}%\n\n`;
    explanation += `This measures how often you interact with this person:\n`;
    explanation += `• Calculated over the last 90 days\n`;
    explanation += `• Based on mentions in conversations\n`;
    explanation += `• Shared events and memories\n`;
    explanation += `• Message frequency and response patterns\n`;
    explanation += `• Regular vs. sporadic interaction patterns\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means very frequent interaction. You connect multiple times per week, maintaining regular communication.`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means regular interaction. You connect weekly or bi-weekly, maintaining consistent contact.`;
    } else if (score >= 30) {
      explanation += `A score of ${score}% means occasional interaction. You connect monthly or less frequently.`;
    } else {
      explanation += `A score of ${score}% means infrequent interaction. Contact is rare or sporadic.`;
    }
    
    return explanation;
  };

  const getInfluenceTooltip = (score: number, type: 'their' | 'yours', characterName: string) => {
    const direction = type === 'their' ? 'Their influence on you' : 'Your influence over them';
    let explanation = `${direction}: ${score}%\n\n`;
    explanation += `This measures how much ${type === 'their' ? characterName + ' influences' : 'you influence ' + characterName}:\n`;
    explanation += `• Decision-making impact\n`;
    explanation += `• Opinion and perspective influence\n`;
    explanation += `• Emotional impact and support\n`;
    explanation += `• Behavioral changes or adaptations\n`;
    explanation += `• Advice seeking and giving patterns\n\n`;
    
    if (score >= 70) {
      explanation += `A score of ${score}% means ${type === 'their' ? 'strong influence' : 'you have strong influence'}. ${type === 'their' ? 'Their opinions and actions significantly impact your decisions and emotions.' : 'Your opinions and actions significantly impact their decisions and emotions.'}`;
    } else if (score >= 50) {
      explanation += `A score of ${score}% means ${type === 'their' ? 'moderate influence' : 'you have moderate influence'}. ${type === 'their' ? 'They have meaningful impact on your thoughts and choices.' : 'You have meaningful impact on their thoughts and choices.'}`;
    } else {
      explanation += `A score of ${score}% means ${type === 'their' ? 'limited influence' : 'you have limited influence'}. ${type === 'their' ? 'Their impact on you is minimal or developing.' : 'Your impact on them is minimal or developing.'}`;
    }
    
    return explanation;
  };

  const getSentimentScoreTooltip = (score: number) => {
    const isPositive = score >= 0;
    let explanation = `Sentiment Score: ${score > 0 ? '+' : ''}${score}\n\n`;
    explanation += `This measures the overall emotional tone of your relationship:\n`;
    explanation += `• Range: -100 (very negative) to +100 (very positive)\n`;
    explanation += `• Based on emotional language in conversations\n`;
    explanation += `• Positive vs. negative interaction patterns\n`;
    explanation += `• Conflict frequency and resolution\n`;
    explanation += `• Support and encouragement levels\n\n`;
    
    if (score >= 50) {
      explanation += `A score of ${score} indicates a very positive relationship. Interactions are consistently positive, supportive, and uplifting.`;
    } else if (score >= 20) {
      explanation += `A score of ${score} indicates a positive relationship. Most interactions are positive, with occasional neutral moments.`;
    } else if (score >= -20) {
      explanation += `A score of ${score} indicates a neutral to slightly ${isPositive ? 'positive' : 'negative'} relationship. Interactions are mixed, with both positive and challenging moments.`;
    } else {
      explanation += `A score of ${score} indicates a challenging relationship. There are more negative interactions than positive ones, suggesting tension or conflict.`;
    }
    
    return explanation;
  };

  const getTrustScoreTooltip = (score: number) => {
    let explanation = `Trust Score: ${score}%\n\n`;
    explanation += `This measures how much you trust this person:\n`;
    explanation += `• Reliability and consistency\n`;
    explanation += `• Confidentiality and discretion\n`;
    explanation += `• Honesty and transparency\n`;
    explanation += `• Vulnerability and sharing patterns\n`;
    explanation += `• Past behavior and dependability\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high trust. You trust them with sensitive information and rely on them significantly.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good trust. You trust them in most situations and feel comfortable sharing.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means developing trust. You're building trust but aren't fully comfortable yet.`;
    } else {
      explanation += `A score of ${score}% means low trust. You're cautious and haven't established strong trust yet.`;
    }
    
    return explanation;
  };

  const getSupportScoreTooltip = (score: number) => {
    let explanation = `Support Score: ${score}%\n\n`;
    explanation += `This measures how supportive this person is:\n`;
    explanation += `• Emotional support provided\n`;
    explanation += `• Practical help and assistance\n`;
    explanation += `• Encouragement and motivation\n`;
    explanation += `• Being there during difficult times\n`;
    explanation += `• Celebrating successes together\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high support. They're consistently there for you, offering both emotional and practical support.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good support. They provide meaningful support when needed.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate support. They offer support but it may be inconsistent.`;
    } else {
      explanation += `A score of ${score}% means limited support. Support is minimal or still developing.`;
    }
    
    return explanation;
  };

  const getConflictScoreTooltip = (score: number) => {
    let explanation = `Conflict Score: ${score}%\n\n`;
    explanation += `This measures the level of conflict in your relationship:\n`;
    explanation += `• Disagreement frequency\n`;
    explanation += `• Argument intensity\n`;
    explanation += `• Unresolved tensions\n`;
    explanation += `• Communication breakdowns\n`;
    explanation += `• Negative interaction patterns\n\n`;
    
    if (score >= 50) {
      explanation += `A score of ${score}% means high conflict. There are frequent disagreements, arguments, or unresolved tensions that need attention.`;
    } else if (score >= 30) {
      explanation += `A score of ${score}% means moderate conflict. Occasional disagreements occur but are usually resolved.`;
    } else if (score >= 15) {
      explanation += `A score of ${score}% means low conflict. Disagreements are rare and minor.`;
    } else {
      explanation += `A score of ${score}% means minimal conflict. The relationship is harmonious with very few disagreements.`;
    }
    
    return explanation;
  };

  const getValueScoreTooltip = (score: number) => {
    let explanation = `Value Score: ${score}%\n\n`;
    explanation += `This measures the value this person brings to your life:\n`;
    explanation += `• Personal growth and learning\n`;
    explanation += `• Joy and positive experiences\n`;
    explanation += `• Practical benefits and opportunities\n`;
    explanation += `• Emotional enrichment\n`;
    explanation += `• Overall life improvement\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high value. They significantly enrich your life and contribute to your growth and happiness.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good value. They bring meaningful positive contributions to your life.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate value. They add some value but it's not consistently high.`;
    } else {
      explanation += `A score of ${score}% means limited value. Their contribution to your life is minimal or still developing.`;
    }
    
    return explanation;
  };

  const getRelevanceScoreTooltip = (score: number) => {
    let explanation = `Relevance Score: ${score}%\n\n`;
    explanation += `This measures how relevant this person is to your current life:\n`;
    explanation += `• Current involvement in your life\n`;
    explanation += `• Recent interactions and mentions\n`;
    explanation += `• Connection to current goals/projects\n`;
    explanation += `• Present-day significance\n`;
    explanation += `• Active vs. historical relationship\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high relevance. They're actively involved in your current life and regularly appear in your present narrative.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means good relevance. They're part of your current life, though not central to it.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate relevance. They appear occasionally but aren't central to your current life.`;
    } else {
      explanation += `A score of ${score}% means low relevance. They're more of a historical connection than a current active part of your life.`;
    }
    
    return explanation;
  };

  const getActivityLevelTooltip = (score: number) => {
    let explanation = `Activity Level: ${score}%\n\n`;
    explanation += `This measures how active this relationship is:\n`;
    explanation += `• Recent interaction frequency\n`;
    explanation += `• Communication patterns\n`;
    explanation += `• Shared activities and events\n`;
    explanation += `• Engagement in conversations\n`;
    explanation += `• Overall relationship momentum\n\n`;
    
    if (score >= 80) {
      explanation += `A score of ${score}% means very high activity. The relationship is very active with frequent interactions and ongoing engagement.`;
    } else if (score >= 60) {
      explanation += `A score of ${score}% means high activity. The relationship is active with regular interactions.`;
    } else if (score >= 40) {
      explanation += `A score of ${score}% means moderate activity. Interactions happen but aren't frequent.`;
    } else {
      explanation += `A score of ${score}% means low activity. The relationship is relatively inactive with infrequent contact.`;
    }
    
    return explanation;
  };

  // Generate mock analytics data
  const generateMockAnalytics = (character: CharacterDetail) => {
    // Generate realistic mock data based on character properties
    const baseScore = character.importance_score || 50;
    const closenessBase = character.relationships?.find(r => r.character_name === 'You' || !r.character_name)?.closeness_score || 5;
    
    return {
      closeness_score: Math.min(100, Math.round(closenessBase * 10 + Math.random() * 20)),
      importance_score: Math.round(baseScore),
      priority_score: Math.round(40 + Math.random() * 40),
      engagement_score: Math.round(50 + Math.random() * 40),
      relationship_depth: Math.round(60 + Math.random() * 30),
      interaction_frequency: Math.round(45 + Math.random() * 40),
      recency_score: Math.round(30 + Math.random() * 50),
      relevance_score: Math.round(50 + Math.random() * 40),
      value_score: Math.round(55 + Math.random() * 35),
      character_influence_on_user: Math.round(40 + Math.random() * 40),
      user_influence_over_character: Math.round(30 + Math.random() * 40),
      sentiment_score: Math.round(-20 + Math.random() * 80), // -20 to +60
      trust_score: Math.round(50 + Math.random() * 40),
      support_score: Math.round(45 + Math.random() * 45),
      conflict_score: Math.round(10 + Math.random() * 30),
      activity_level: Math.round(40 + Math.random() * 50),
      shared_experiences: character.shared_memories?.length || Math.round(5 + Math.random() * 15),
      relationship_duration_days: Math.round(30 + Math.random() * 300),
      trend: ['deepening', 'stable', 'weakening'][Math.floor(Math.random() * 3)] as 'deepening' | 'stable' | 'weakening',
      strengths: [
        'Strong communication',
        'Reliable and trustworthy',
        'Supportive during challenges',
        'Shared interests and values',
        'Positive influence on your growth'
      ].slice(0, Math.floor(Math.random() * 3) + 2),
      weaknesses: [
        'Occasional misunderstandings',
        'Different communication styles',
        'Limited time together'
      ].slice(0, Math.floor(Math.random() * 2) + 1),
      opportunities: [
        'Deepen connection through shared activities',
        'Build stronger trust through consistency',
        'Explore new experiences together'
      ].slice(0, Math.floor(Math.random() * 2) + 1),
      risks: [
        'Distance may affect closeness',
        'Miscommunication could strain relationship'
      ].slice(0, Math.floor(Math.random() * 1) + 1),
    };
  };

  const deriveAnalyticsFromCharacter = (character: CharacterDetail) => {
    const memoryCount = Math.max(character.memory_count ?? 0, character.shared_memories?.length ?? 0, sharedMemoryCards.length);
    const relationshipCount = Math.max(character.relationship_count ?? 0, character.relationships?.length ?? 0);
    const importanceScore = Math.round(character.importance_score ?? Math.min(100, 20 + memoryCount * 8 + relationshipCount * 6));
    const closenessBase = character.relationship_depth === 'close' ? 75
      : character.relationship_depth === 'moderate' ? 55
      : character.relationship_depth === 'casual' ? 35
      : character.relationship_depth === 'acquaintance' ? 20
      : 15;
    const closenessScore = Math.min(100, closenessBase + Math.min(25, memoryCount * 4));
    const activityLevel = Math.min(100, memoryCount * 10 + relationshipCount * 5);
    const engagementScore = Math.min(100, activityLevel + (character.status === 'active' ? 15 : 0));
    const relationshipDepth = Math.min(100, closenessScore + Math.min(15, relationshipCount * 3));
    const influence = Math.min(100, importanceScore + (['family', 'romantic', 'mentor'].includes(character.archetype ?? '') ? 15 : 0));

    return {
      closeness_score: closenessScore,
      importance_score: importanceScore,
      priority_score: Math.min(100, Math.round((importanceScore + engagementScore) / 2)),
      engagement_score: engagementScore,
      relationship_depth: relationshipDepth,
      interaction_frequency: Math.min(100, memoryCount * 12),
      recency_score: memoryCount > 0 ? 55 : 20,
      relevance_score: Math.min(100, importanceScore + (character.status === 'active' ? 10 : 0)),
      value_score: Math.min(100, importanceScore + 10),
      character_influence_on_user: influence,
      user_influence_over_character: Math.max(10, Math.min(100, Math.round(influence * 0.75))),
      sentiment_score: 20,
      trust_score: character.relationship_depth === 'close' ? 75 : character.relationship_depth === 'moderate' ? 55 : 35,
      support_score: character.archetype === 'ally' || character.archetype === 'mentor' || character.archetype === 'family' ? 70 : 45,
      conflict_score: 10,
      activity_level: activityLevel,
      shared_experiences: memoryCount,
      relationship_duration_days: 0,
      trend: memoryCount >= 3 ? 'deepening' as const : 'stable' as const,
      strengths: [
        relationshipCount > 0 ? 'Connected in your social graph' : null,
        memoryCount > 0 ? 'Appears in recorded memories' : null,
        character.archetype ? `Known as ${character.archetype}` : null,
      ].filter((item): item is string => Boolean(item)),
      weaknesses: [],
      opportunities: ['Add more stories to improve confidence'],
      risks: [],
    };
  };

  const [loading, setLoading] = useState(false);
  // Start false — seed from the character prop immediately; enrich in background.
  const [loadingDetails, setLoadingDetails] = useState(false);
  /** Once details have rendered, background profile-bundle refreshes must not blank the modal. */
  const detailsReadyRef = useRef(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [sharedMemoryCards, setSharedMemoryCards] = useState<MemoryCard[]>([]);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [activeTab, setActiveTabState] = useState<TabKey>(() =>
    resolveInitialTab(initialFocusField ? 'info' : initialTab),
  );

  useEffect(() => {
    if (initialFocusField) {
      setActiveTabState('info');
      return;
    }
    if (initialTab) setActiveTabState(resolveInitialTab(initialTab));
  }, [initialTab, initialFocusField, character.id]);
  const askInChat = (prompt: string) => {
    // Never re-inject the retired Maya/correction boilerplate. Empty prompt =
    // focus chip only (Groups / affiliations). Other fields may still prefill.
    const trimmed = prompt.trim();
    const romantic =
      relationship ??
      (isMockDataEnabled
        ? getMockRomanticRelationshipForCharacter(editedCharacter.id, editedCharacter.name)
        : undefined);
    if (romantic) {
      openChatWithFocus({
        entityId: editedCharacter.id,
        entityName: getCharacterDisplayTitle(editedCharacter),
        entityType: 'character',
        relationshipId: romantic.id,
        relationshipName: getCharacterDisplayTitle(editedCharacter),
        sourceSurface: 'love',
        sourceLabel: CHAT_FOCUS_SOURCE_LABELS.love,
        knowledgeScope: 'romantic relationship from character profile',
        ...(trimmed ? { initialPrompt: trimmed } : {}),
        arrivedAt: Date.now(),
        baseline: {
          affectionScore: Math.round((romantic.affection_score ?? 0.5) * 100),
          healthScore: Math.round((romantic.relationship_health ?? 0.5) * 100),
        },
      });
    } else {
      openChatWithFocus({
        entityId: editedCharacter.id,
        entityName: getCharacterDisplayTitle(editedCharacter),
        entityType: 'character',
        sourceSurface: 'characters',
        sourceLabel: CHAT_FOCUS_SOURCE_LABELS.characters,
        knowledgeScope: FOCUSED_ENTITY_CHAT_PRESETS.characters.knowledgeScope,
        initialPrompt: trimmed || FOCUSED_ENTITY_CHAT_PRESETS.characters.existingPrompt(getCharacterDisplayTitle(editedCharacter)),
        arrivedAt: Date.now(),
      });
    }
    onClose();
  };

  /** "From your chats" mention click: jump to the exact thread/message and highlight the name. */
  const handleOpenThread = (sessionId: string, messageId: string) => {
    const aliases = Array.isArray(editedCharacter.alias)
      ? editedCharacter.alias.filter((a): a is string => typeof a === 'string')
      : [];
    // Navigate first so modal teardown can't race away the router update.
    openChatThreadAtMessage(navigate, {
      sessionId,
      messageId,
      highlightTerms: [
        getCharacterDisplayTitle(editedCharacter),
        editedCharacter.name,
        ...aliases,
      ],
    });
    onClose();
  };

  /**
   * Intelligence Chat stays in-modal as a launchpad. Leaving for main chat
   * only happens when the user picks a starter or "Open main chat" — so they
   * can still switch tabs without being kicked out of the character modal.
   */
  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
  };
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [characterOrganizations, setCharacterOrganizations] = useState<Array<Organization & { user_is_member: boolean; character_role?: string; character_member_notes?: string }>>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  /** Bumped to force Groups & Organizations to refetch after membership changes. */
  const [orgsReloadToken, setOrgsReloadToken] = useState(0);
  /** Keeps just-added groups visible if a laggy by-character refetch still returns []. */
  const pendingOptimisticOrgsRef = useRef<
    Array<Organization & { user_is_member: boolean; character_role?: string; character_member_notes?: string }>
  >([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  const [selectedPerception, setSelectedPerception] = useState<PerceptionEntry | null>(null);
  const [selectedCharacterForModal, setSelectedCharacterForModal] = useState<Character | null>(null);
  const [characterAttributes, setCharacterAttributes] = useState<CharacterAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [loreProfile, setLoreProfile] = useState<CharacterLoreProfile | null>(null);
  const [loreProfileLoading, setLoreProfileLoading] = useState(false);
  const [knowledgeClaims, setKnowledgeClaims] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeLoaded, setKnowledgeLoaded] = useState(false);
  const [characterFacts, setCharacterFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsLoaded, setFactsLoaded] = useState(false);
  const [sceneCandidates, setSceneCandidates] = useState<any[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);

  // ── Relationship Intelligence (dynamics + influence) ────────────────────────
  const [dynamics, setDynamics] = useState<any | null>(null);
  const [dynamicsLoading, setDynamicsLoading] = useState(false);
  const [dynamicsLoaded, setDynamicsLoaded] = useState(false);
  const [influenceProfile, setInfluenceProfile] = useState<any | null>(null);
  const [influenceInsights, setInfluenceInsights] = useState<any[]>([]);
  const [influenceLoading, setInfluenceLoading] = useState(false);
  const [influenceLoaded, setInfluenceLoaded] = useState(false);

  // ── Provenance ──────────────────────────────────────────────────────────────
  const [provenance, setProvenance] = useState<any | null>(null);
  const [provenanceLoaded, setProvenanceLoaded] = useState(false);

  const [familyRefreshKey, setFamilyRefreshKey] = useState(0);
  // Make this character's family tree editable in the modal — same exclude/delete/
  // keep/edit-relationship actions as the user's own Family Book.
  const familyEditing = useFamilyTreeEditing({
    enabled: !isMockDataEnabled,
    onChanged: () => setFamilyRefreshKey((k) => k + 1),
  });

  // ── Temporal attributes (all historical, not just current) ─────────────────
  const [allAttributes, setAllAttributes] = useState<any[]>([]);
  const [allAttributesLoaded, setAllAttributesLoaded] = useState(false);

  // Character-specific mock organizations — shared (user is also a member) vs theirs only
  const getMockOrganizations = (): Array<Organization & { user_is_member: boolean; character_role?: string }> => {
    // Add G1 defaults to any mock org that pre-dates the canonical group model
    type RawMockOrg = Omit<Organization, 'group_type' | 'membership_model' | 'user_relationship' | 'is_public_entity'>
      & { user_is_member: boolean; character_role?: string; group_type?: Organization['group_type'] };
    const withG1 = (org: RawMockOrg): Organization & { user_is_member: boolean; character_role?: string } => ({
      group_type: (org.type as unknown as Organization['group_type']) ?? 'other',
      membership_model: 'strict',
      user_relationship: org.user_is_member ? 'member' : 'aware_of',
      is_public_entity: false,
      ...org,
    } as Organization & { user_is_member: boolean; character_role?: string });

    const SHARED: Record<string, Array<RawMockOrg>> = {
      'Sarah Chen': [
        { id: 'org-sc-1', name: 'Creative Writing Circle', aliases: [], type: 'club', description: 'Weekly writing sessions and story feedback', status: 'active', member_count: 6, usage_count: 18, confidence: 0.91, last_seen: new Date(Date.now() - 7*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Co-Founder', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Co-Founder', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }, { id: '3', character_name: 'Emma Thompson', role: 'Member', status: 'active' }] },
        { id: 'org-sc-2', name: 'Tech Alumni Network', aliases: [], type: 'affiliation', description: 'Former colleagues from tech careers', status: 'active', member_count: 12, usage_count: 7, confidence: 0.78, last_seen: new Date(Date.now() - 30*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Member', status: 'active' }] },
        { id: 'org-sc-3', name: 'Women in Product', aliases: [], type: 'affiliation', description: 'Professional community for women in product roles', status: 'active', member_count: 45, usage_count: 5, confidence: 0.82, last_seen: new Date(Date.now() - 14*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Member', members: [{ id: '1', character_name: 'Sarah Chen', role: 'Member', status: 'active' }] },
      ],
      'Marcus Johnson': [
        { id: 'org-mj-1', name: 'Creative Entrepreneurs Network', aliases: [], type: 'friend_group', description: 'Founders and creatives building outside of corporate paths', status: 'active', member_count: 9, usage_count: 14, confidence: 0.88, last_seen: new Date(Date.now() - 14*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Organizer', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Organizer', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-mj-2', name: 'Executive Coaching Association', aliases: [], type: 'affiliation', description: 'Professional body for certified executive coaches', status: 'active', member_count: 220, usage_count: 2, confidence: 0.93, last_seen: new Date(Date.now() - 45*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Certified Member', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Certified Member', status: 'active' }] },
        { id: 'org-mj-3', name: 'Venture Capital Advisory Board', aliases: [], type: 'affiliation', description: 'Advisory network for early-stage startups', status: 'active', member_count: 18, usage_count: 3, confidence: 0.79, last_seen: new Date(Date.now() - 60*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Advisor', members: [{ id: '1', character_name: 'Marcus Johnson', role: 'Advisor', status: 'active' }] },
      ],
      'Alex Rivera': [
        { id: 'org-ar-1', name: 'Indie Music Collective', aliases: [], type: 'club', description: 'Independent artists collaborating outside the label system', status: 'active', member_count: 14, usage_count: 22, confidence: 0.89, last_seen: new Date(Date.now() - 7*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Producer', members: [{ id: '1', character_name: 'Alex Rivera', role: 'Producer', status: 'active' }, { id: '2', character_name: 'You', role: 'Artist', status: 'active' }] },
        { id: 'org-ar-2', name: 'Audio Engineers Guild', aliases: [], type: 'affiliation', description: 'Professional society for audio engineering practitioners', status: 'active', member_count: 85, usage_count: 4, confidence: 0.91, last_seen: new Date(Date.now() - 30*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Member', members: [{ id: '1', character_name: 'Alex Rivera', role: 'Member', status: 'active' }] },
      ],
      'Alex': [
        { id: 'org-alex-1', name: 'Hiking Enthusiasts Club', aliases: [], type: 'club', description: 'Weekend trail hikes and outdoor adventures', status: 'active', member_count: 22, usage_count: 11, confidence: 0.85, last_seen: new Date(Date.now() - 20*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Alex', role: 'Member', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-alex-2', name: 'Environmental Science Society', aliases: [], type: 'affiliation', description: 'Graduate-level research community focused on sustainability', status: 'active', member_count: 38, usage_count: 3, confidence: 0.87, last_seen: new Date(Date.now() - 45*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Researcher', members: [{ id: '1', character_name: 'Alex', role: 'Researcher', status: 'active' }] },
      ],
      'Jordan Kim': [
        { id: 'org-jk-1', name: 'Kim Family Circle', aliases: [], type: 'friend_group', description: 'The family group and extended network', status: 'active', member_count: 8, usage_count: 25, confidence: 0.98, last_seen: new Date(Date.now() - 5*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: 'Jordan Kim', role: 'Member', status: 'active' }, { id: '2', character_name: 'You', role: 'Member', status: 'active' }] },
        { id: 'org-jk-2', name: 'University Alumni Association', aliases: [], type: 'affiliation', description: 'Alumni network from their university program', status: 'active', member_count: 120, usage_count: 4, confidence: 0.74, last_seen: new Date(Date.now() - 90*86400000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: false, character_role: 'Alumnus', members: [{ id: '1', character_name: 'Jordan Kim', role: 'Alumnus', status: 'active' }] },
      ],
    };
    // Default orgs for characters not explicitly mapped; apply G1 defaults to all
    const raw: RawMockOrg[] = SHARED[editedCharacter.name] ?? [
      { id: 'org-default-1', name: 'Creative Community', aliases: [], type: 'friend_group', description: 'Shared creative network', status: 'active', member_count: 8, usage_count: 6, confidence: 0.72, last_seen: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_is_member: true, character_role: 'Member', members: [{ id: '1', character_name: editedCharacter.name, role: 'Member', status: 'active' }] },
    ];
    return raw.map(withG1);
  };

  // Create mock shared memories for display
  const createMockMemories = (characterName: string): MemoryCard[] => {
    const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString();
    const profiles: Record<string, MemoryCard[]> = {
      'Sarah Chen': [
        { id: 'sm-sc-1', title: 'Told Sarah about leaving tech', content: `Sat with Sarah at Blue Bottle for three hours. Told her I was thinking about leaving software to focus on music and writing. She didn't try to talk me out of it. She just said "what's stopping you?" That question changed something.`, date: d(2280), tags: ['turning point', 'career'], mood: 'nervous', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'The Decision Year' },
        { id: 'sm-sc-2', title: 'Sarah got the PM promotion', content: `Sarah called to tell me she made the transition to PM. I remember how scared she was to make that move a year ago. Now she sounds lighter. We celebrated at our usual spot.`, date: d(1820), tags: ['milestone', 'celebration'], mood: 'proud', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'Parallel Transitions' },
        { id: 'sm-sc-3', title: 'Writing sprint at the coffee shop', content: `First writing session with Sarah since she started the new role. She brought her laptop and we both worked in silence for two hours, then talked about what we were each building. It felt like the old days but better.`, date: d(1240), tags: ['creative', 'writing', 'coffee'], mood: 'focused', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'Creative Renaissance' },
        { id: 'sm-sc-4', title: 'Talked about the breakup', content: `Sarah was the first person I told about things ending with Taylor. She sat with it for a while before saying anything. When she did, she said exactly the right thing.`, date: d(900), tags: ['support', 'vulnerability'], mood: 'sad', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'The Hard Season' },
        { id: 'sm-sc-5', title: 'Introduced to Alex (girlfriend)', content: `Sarah introduced me to her friend Alex at the coffee shop. I wasn't expecting anything — just a quick hi. We talked for three hours. Sarah kept smiling in the background.`, date: d(365), tags: ['introduction', 'new beginnings'], mood: 'curious', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen', 'Alex'], chapterTitle: 'New Connections' },
        { id: 'sm-sc-6', title: 'Late night coffee, talked about the EP', content: `Sarah listened to the first full rough mix of the EP. She had notes, sharp ones. But she started by saying she was proud of me. I needed to hear that.`, date: d(80), tags: ['music', 'creative feedback'], mood: 'grateful', source: 'journal', sourceIcon: '📖', characters: ['Sarah Chen'], chapterTitle: 'First Album' },
      ],
      'Marcus Johnson': [
        { id: 'sm-mj-1', title: 'First meeting at the entrepreneurship event', content: `Marcus spent an hour with me at the event when he didn't have to. He asked about my work, really listened, then told me something I've thought about every week since: "most people protect their dreams by never starting them."`, date: d(1826), tags: ['mentor', 'turning point'], mood: 'inspired', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'Finding Direction' },
        { id: 'sm-mj-2', title: 'Marcus introduced me to Alex Rivera', content: `Marcus introduced me to Alex Rivera at the coffee shop, said we should work together. He has a sense for these things. The introduction took five minutes but it changed everything.`, date: d(1460), tags: ['introduction', 'music', 'creative'], mood: 'excited', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson', 'Alex Rivera'], chapterTitle: 'Creative Expansion' },
        { id: 'sm-mj-3', title: 'Coaching session: the fear conversation', content: `Marcus asked me what I was most afraid of. I said failing publicly. He said that was the wrong fear to have — the real one was succeeding and still feeling empty. That reframe was everything.`, date: d(1100), tags: ['coaching', 'growth', 'fear'], mood: 'uncomfortable but needed', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'The Inner Work' },
        { id: 'sm-mj-4', title: 'Told Marcus about the EP decision', content: `Told Marcus I was committing to releasing the EP. He didn't celebrate immediately — he asked if I was ready for what comes after it. Good question. The right question.`, date: d(400), tags: ['creative', 'music', 'decision'], mood: 'determined', source: 'journal', sourceIcon: '📖', characters: ['Marcus Johnson'], chapterTitle: 'First Album' },
      ],
      'Alex': [
        { id: 'sm-alex-1', title: 'First conversation at the coffee shop', content: `Sarah introduced us. We ended up staying two hours past when we planned to leave. She asked me to play one of my songs. I actually did — on my phone, embarrassingly — and she listened like it mattered. It did.`, date: d(365), tags: ['first meeting', 'music', 'connection'], mood: 'surprised', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'New Connection' },
        { id: 'sm-alex-2', title: 'First hike together', content: `Went up the trail behind the reservoir. We barely talked the first hour — just walked. On the way back she said it was her favorite kind of date. I didn't know it was a date. Guess it was.`, date: d(290), tags: ['outdoors', 'connection', 'nature'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'Building Something' },
        { id: 'sm-alex-3', title: 'She listened to the album demos', content: `Played her the raw demos of the EP. She didn't say much. Then she said one of the songs made her think of something she hadn't thought about in years. That's all I needed to hear.`, date: d(180), tags: ['music', 'creative', 'intimacy'], mood: 'vulnerable', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'First Album' },
        { id: 'sm-alex-4', title: 'She stayed over the first time', content: `She brought wildflowers. Said she found them on the trail this morning and thought of me. I realized I\'ve been thinking about her every single day. I think she knows.`, date: d(120), tags: ['relationship', 'milestone'], mood: 'joyful', source: 'journal', sourceIcon: '📖', characters: ['Alex'], chapterTitle: 'Deepening' },
      ],
      'Jordan Kim': [
        { id: 'sm-jk-1', title: 'Running in the park after the layoff news', content: `Jordan showed up at my door at 7am, said let\'s run. I was still processing the shock. We ran for an hour without talking about it. On the bench afterward Jordan said "you\'ll figure it out." I believed it only because it was Jordan.`, date: d(1100), tags: ['support', 'family', 'hard time'], mood: 'supported', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim'], chapterTitle: 'The Hard Season' },
        { id: 'sm-jk-2', title: 'Jordan met Alex for the first time', content: `Brought Alex to Jordan\'s place for dinner. Jordan asked all the right questions — not interrogation, just genuine. When we left Alex said "I like them a lot." That meant everything.`, date: d(300), tags: ['family', 'relationship', 'approval'], mood: 'proud', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim', 'Alex'], chapterTitle: 'Expanding Circles' },
        { id: 'sm-jk-3', title: 'Sunday morning call', content: `Jordan called just to check in — didn\'t need anything, just called. We talked for 45 minutes about nothing in particular. Some conversations you hold onto.`, date: d(60), tags: ['family', 'connection'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: ['Jordan Kim'], chapterTitle: 'Present' },
      ],
    };
    const specific = profiles[characterName];
    if (specific) return specific;
    // Generic fallback with time-spanning dates
    const d2 = (daysAgo: number) => d(daysAgo);
    return [
      { id: `mm-1-${characterName}`, title: `First real conversation with ${characterName}`, content: `Something about that first conversation stayed with me. ${characterName} had a way of listening that made me want to say more than I usually do.`, date: d2(540), tags: ['connection', 'first meeting'], mood: 'curious', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-2-${characterName}`, title: `${characterName} showed up when it mattered`, content: `I didn't ask for help. ${characterName} just showed up. That kind of thing is rare and I try not to take it for granted.`, date: d2(360), tags: ['support', 'friendship'], mood: 'grateful', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-3-${characterName}`, title: `Working on something together`, content: `Spent the afternoon working alongside ${characterName}. Not even on the same project — just in the same space, both building something. Good energy.`, date: d2(180), tags: ['collaboration', 'work'], mood: 'focused', source: 'journal', sourceIcon: '📖', characters: [characterName] },
      { id: `mm-4-${characterName}`, title: `Catching up after a while apart`, content: `Hadn't seen ${characterName} in a few months. Picked up exactly where we left off. Some relationships don't need maintenance — they just hold.`, date: d2(30), tags: ['reconnection', 'friendship'], mood: 'warm', source: 'journal', sourceIcon: '📖', characters: [characterName] },
    ];
  };

  const selfMemoryToCard = (memory: SelfProfileMemory, characterName: string): MemoryCard => ({
    id: memory.id,
    title: memory.summary || memory.content.slice(0, 80) || 'Conversation memory',
    content: memory.content || memory.summary || '',
    date: memory.date,
    tags: memory.tags || [],
    source: memory.source === 'chat' ? 'chat' : 'journal',
    sourceIcon: memory.source === 'chat' ? '💬' : '📖',
    characters: [characterName],
  });
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll position when tab changes
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Generate mock relationship and proximity data
  const generateMockRelationshipData = (character: CharacterDetail): Partial<CharacterDetail> => {
    const mockData: Partial<CharacterDetail> = {};
    
    // Generate proximity level based on character properties
    if (!character.proximity_level) {
      const proximityOptions: Array<'direct' | 'indirect' | 'distant' | 'unmet' | 'third_party'> = ['direct', 'indirect', 'distant', 'unmet', 'third_party'];
      // Weight towards 'direct' for characters with relationships or shared memories
      if (character.relationships && character.relationships.length > 0) {
        mockData.proximity_level = 'direct';
      } else if (character.shared_memories && character.shared_memories.length > 0) {
        mockData.proximity_level = 'direct';
      } else {
        // Random selection with weights
        const weights = [0.5, 0.2, 0.15, 0.1, 0.05]; // direct, indirect, distant, unmet, third_party
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < proximityOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.proximity_level = proximityOptions[i];
            break;
          }
        }
      }
    }
    
    // Generate relationship depth based on character properties
    if (!character.relationship_depth) {
      const depthOptions: Array<'close' | 'moderate' | 'casual' | 'acquaintance' | 'mentioned_only'> = ['close', 'moderate', 'casual', 'acquaintance', 'mentioned_only'];
      // Weight towards 'close' or 'moderate' for characters with many shared memories
      if (character.shared_memories && character.shared_memories.length >= 10) {
        mockData.relationship_depth = 'close';
      } else if (character.shared_memories && character.shared_memories.length >= 5) {
        mockData.relationship_depth = 'moderate';
      } else if (character.shared_memories && character.shared_memories.length > 0) {
        mockData.relationship_depth = 'casual';
      } else {
        // Random selection with weights
        const weights = [0.2, 0.3, 0.25, 0.15, 0.1]; // close, moderate, casual, acquaintance, mentioned_only
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < depthOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.relationship_depth = depthOptions[i];
            break;
          }
        }
      }
    }
    
    // Generate has_met based on proximity
    if (character.has_met === null || character.has_met === undefined) {
      const proximity = mockData.proximity_level || character.proximity_level;
      mockData.has_met = proximity === 'direct' || 
                        proximity === 'indirect' || 
                        proximity === 'distant';
    }
    
    // Generate likelihood_to_meet based on proximity and relationship
    if (!character.likelihood_to_meet) {
      const proximity = mockData.proximity_level || character.proximity_level;
      if (proximity === 'unmet') {
        const likelihoodOptions: Array<'likely' | 'possible' | 'unlikely' | 'never'> = ['likely', 'possible', 'unlikely', 'never'];
        const weights = [0.3, 0.4, 0.2, 0.1];
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < likelihoodOptions.length; i++) {
          cumulative += weights[i];
          if (rand <= cumulative) {
            mockData.likelihood_to_meet = likelihoodOptions[i];
            break;
          }
        }
      } else if (proximity === 'third_party') {
        mockData.likelihood_to_meet = 'unlikely';
      } else {
        mockData.likelihood_to_meet = null; // Already met or know them
      }
    }
    
    // Generate context_of_mention for indirect/third-party characters
    const proximity = mockData.proximity_level || character.proximity_level;
    if (!character.context_of_mention && (proximity === 'indirect' || proximity === 'third_party')) {
      const contexts = [
        `Mentioned by ${character.relationships?.[0]?.character_name || 'a mutual friend'} in conversations about shared activities.`,
        `Discussed in context of ${character.role || 'a group'} that you're both part of.`,
        `Brought up during conversations about ${character.archetype || 'mutual connections'}.`,
        `Referenced in discussions about ${character.tags?.[0] || 'shared interests'}.`
      ];
      mockData.context_of_mention = contexts[Math.floor(Math.random() * contexts.length)];
    }
    
    return mockData;
  };

  useEffect(() => {
    detailsReadyRef.current = false;
    // Seed from the card/list payload immediately so the modal never blanks
    // while profile-bundle / detail fetches run.
    setEditedCharacter(character as CharacterDetail);
    setLoadingDetails(false);
  }, [character.id]);

  useEffect(() => {
    if (!profileBundle?.detail) return;
    const detail = profileBundle.detail as CharacterDetail & {
      witty_tagline?: string | null;
      real_name?: string | null;
      context_hooks?: string[];
    };
    setEditedCharacter(detail);
    setProfileWittyTagline(detail.witty_tagline ?? getCharacterWittyTagline(detail));
    setProfileContextHooks(
      Array.isArray(detail.context_hooks) ? detail.context_hooks : getCharacterContextHooks(detail),
    );
    setProfileRealName(detail.real_name ?? getCharacterRealName(detail));

    // Prefer batch-hydrated memories from Character Query when present.
    const hydrated = profileBundle.memories as
      | Array<{
          id: string;
          entry_id: string;
          date: string;
          summary?: string;
          title?: string | null;
          content?: string | null;
          tags?: string[];
          source?: string | null;
        }>
      | undefined;
    if (hydrated && hydrated.length > 0) {
      setSharedMemoryCards(
        hydrated.map((memory) => ({
          id: memory.id,
          entry_id: memory.entry_id,
          date: memory.date,
          summary: memory.summary ?? memory.title ?? memory.content?.slice(0, 140) ?? null,
          content: memory.content ?? memory.summary ?? '',
          source: (memory.source as 'chat' | 'journal' | undefined) ?? 'journal',
          tags: memory.tags ?? [],
          character_name: detail.name,
        })) as any,
      );
    } else if (detail.shared_memories && detail.shared_memories.length > 0) {
      void loadSharedMemories(detail.shared_memories);
    } else {
      setSharedMemoryCards([]);
    }

    if (profileBundle.attributes?.current) {
      setCharacterAttributes(
        (profileBundle.attributes.current as CharacterAttribute[]).map((a) => ({
          attributeType: String((a as any).attributeType ?? (a as any).attribute_type ?? ''),
          attributeValue: String((a as any).attributeValue ?? (a as any).attribute_value ?? ''),
          confidence: Number((a as any).confidence ?? 0),
          evidence: (a as any).evidence,
        })),
      );
      setLoadingAttributes(false);
    }
    if (profileBundle.attributes?.history) {
      setAllAttributes(profileBundle.attributes.history as any[]);
    }
    if (profileBundle.loreProfile) {
      setLoreProfile(profileBundle.loreProfile);
      setLoreProfileLoading(false);
    }
    if (Array.isArray(profileBundle.organizations)) {
      const list = profileBundle.organizations as Organization[];
      const activeRels = new Set(['founder', 'leader', 'member', 'collaborator', 'adjacent', 'alumnus']);
      setCharacterOrganizations(
        list.map((org) => {
          const member = org.members?.find(
            (m) =>
              (detail.id && m.character_id === detail.id) ||
              m.character_name?.toLowerCase() === String(detail.name ?? '').toLowerCase(),
          );
          return {
            ...org,
            user_is_member: activeRels.has(org.user_relationship),
            character_role: member?.role,
            character_member_notes: member?.notes,
          };
        }),
      );
      setOrgsLoaded(true);
    }
    if (profileBundle.provenance) {
      setProvenance(profileBundle.provenance as any);
    }

    detailsReadyRef.current = true;
    setLoadingDetails(false);
  }, [profileBundle]);

  useEffect(() => {
    let cancelled = false;

    const applySelfProfile = (profile: Awaited<ReturnType<typeof selfCharacterApi.getProfile>>) => {
      const selfCharacterName = profile.character.name || character.name;
      const selfMemories = (profile.recentMemories ?? []).map(memory =>
        selfMemoryToCard(memory, selfCharacterName)
      );
      setEditedCharacter({
        ...(profile.character as CharacterDetail),
        importance_level: 'protagonist',
        shared_memories: (profile.recentMemories ?? []).map(memory => ({
          id: memory.id,
          entry_id: memory.entry_id,
          date: memory.date,
          summary: memory.summary ?? memory.content.slice(0, 140),
        })),
        analytics: {
          ...(profile.character.analytics ?? {}),
          closeness_score: 100,
          relationship_depth: 100,
          interaction_frequency: profile.stats.messageCount,
          recency_score: selfMemories.length > 0 ? 1 : 0,
          character_influence_on_user: 100,
          user_influence_over_character: 100,
          importance_score: 100,
          priority_score: 100,
          relevance_score: 100,
          value_score: 100,
          sentiment_score: 0,
          trust_score: 100,
          support_score: 100,
          conflict_score: 0,
          engagement_score: Math.min(100, profile.stats.messageCount),
          activity_level: Math.min(100, profile.stats.messageCount),
          shared_experiences: selfMemories.length,
          relationship_duration_days: 0,
          trend: 'stable',
        },
      });
      setCharacterAttributes(profile.attributes ?? []);
      setCharacterFacts(profile.facts ?? []);
      setFactsLoaded(true);
      setKnowledgeClaims(profile.knowledgeClaims ?? []);
      setKnowledgeLoaded(true);
      setSharedMemoryCards(selfMemories);
      setProfileWittyTagline(profile.wittyTagline ?? getCharacterWittyTagline(profile.character));
      setProfileContextHooks(profile.contextHooks ?? getCharacterContextHooks(profile.character));
      setProfileRealName(profile.realName ?? getCharacterRealName(profile.character));
    };

    const markDetailsReady = () => {
      if (!cancelled) {
        detailsReadyRef.current = true;
        setLoadingDetails(false);
      }
    };

    const loadLegacyCharacterDetail = async () => {
      try {
        const response = await fetchJson<CharacterDetail & {
          witty_tagline?: string | null;
          real_name?: string | null;
          context_hooks?: string[];
        }>(`/api/characters/${character.id}`);

        if (cancelled) return;

        setEditedCharacter(response);
        setProfileWittyTagline(response.witty_tagline ?? getCharacterWittyTagline(response));
        setProfileContextHooks(response.context_hooks ?? getCharacterContextHooks(response));
        setProfileRealName(response.real_name ?? getCharacterRealName(response));

        if (response.shared_memories && response.shared_memories.length > 0) {
          await loadSharedMemories(response.shared_memories);
        } else {
          setSharedMemoryCards([]);
        }
      } catch (error) {
        console.error('Failed to load character details:', error);
        if (!cancelled) {
          setEditedCharacter(character as CharacterDetail);
          setSharedMemoryCards([]);
        }
      } finally {
        markDetailsReady();
      }
    };

    const loadFullDetails = async () => {
      // Profile-bundle path: enrich in the background. Never blank the modal —
      // the character card payload is already on screen.
      if (profileBundleEnabled) {
        if (profileBundleLoading) {
          return;
        }
        if (profileBundle?.detail) {
          markDetailsReady();
          return;
        }
        if (detailsReadyRef.current) {
          return;
        }
        if (profileBundleError) {
          console.warn('Character profile bundle failed; falling back to detail fetch', profileBundleError);
        }
        await loadLegacyCharacterDetail();
        return;
      }
      if (isMainCharacter && !isMockDataEnabled) {
        try {
          if (isSyntheticSelfId(character.id)) {
            await selfCharacterApi.ensureSelf().catch(() => {});
          }
          const profile = await selfCharacterApi.getProfile();
          if (cancelled) return;
          applySelfProfile(profile);
        } catch (error) {
          console.error('Failed to load self profile:', error);
          if (!cancelled) {
            setEditedCharacter({
              ...character,
              importance_level: 'protagonist',
            } as CharacterDetail);
            setSharedMemoryCards([]);
          }
        } finally {
          markDetailsReady();
        }
        return;
      }
      if (isSyntheticSelfId(character.id) && !isMockDataEnabled) {
        if (!cancelled) {
          setEditedCharacter({
            ...character,
            importance_level: 'protagonist',
          } as CharacterDetail);
          setSharedMemoryCards([]);
          markDetailsReady();
        }
        return;
      }
      if (isMockDataEnabled || isSyntheticSelfId(character.id)) {
        const mockMemories = createMockMemories(character.name);
        const mockRelationshipData = generateMockRelationshipData(character as CharacterDetail);
        const demoCharacter = {
          ...character,
          importance_level: isMainCharacter ? 'protagonist' : character.importance_level,
          ...mockRelationshipData,
          memory_count: Math.max(character.memory_count ?? 0, mockMemories.length),
          relationship_count: Math.max(character.relationship_count ?? 0, character.relationships?.length ?? 0),
          shared_memories: mockMemories.map((memory) => ({
            id: memory.id,
            entry_id: memory.id,
            date: memory.date,
            summary: memory.title,
          })),
        } as CharacterDetail;
        if (!cancelled) {
          setEditedCharacter(demoCharacter);
          setSharedMemoryCards(mockMemories);
          markDetailsReady();
        }
        return;
      }

      await loadLegacyCharacterDetail();
    };
    void loadFullDetails();
    return () => {
      cancelled = true;
    };
  }, [
    character.id,
    character.name,
    isMockDataEnabled,
    isMainCharacter,
    profileBundleEnabled,
    profileBundle,
    profileBundleLoading,
    profileBundleError,
  ]);

  // Load character attributes (skip when Character Query core already provided them)
  useEffect(() => {
    if (profileBundle?.attributes?.current) return;
    const loadAttributes = async () => {
      setLoadingAttributes(true);
      try {
        if (isMockDataEnabled) {
          setCharacterAttributes(getMockAttributes(character));
          return;
        }
        if (isMainCharacter && !isMockDataEnabled) {
          const profile = await selfCharacterApi.getProfile();
          setCharacterAttributes(profile.attributes || []);
          setLoadingAttributes(false);
          return;
        }
        if (isSyntheticSelfId(character.id)) {
          setCharacterAttributes(isMockDataEnabled ? getMockAttributes(character) : []);
          setLoadingAttributes(false);
          return;
        }
        const response = await fetchJson<{ attributes: CharacterAttribute[] }>(`/api/characters/${character.id}/attributes?currentOnly=true`);
        const realAttributes = response.attributes || [];
        if (realAttributes.length === 0 && isMockDataEnabled) {
          setCharacterAttributes(getMockAttributes(character));
        } else {
          setCharacterAttributes(realAttributes);
        }
      } catch {
        if (isMockDataEnabled) {
          setCharacterAttributes(getMockAttributes(character));
        } else {
          setCharacterAttributes([]);
        }
      } finally {
        setLoadingAttributes(false);
      }
    };
    void loadAttributes();
  }, [character.id, character.name, isMainCharacter, isMockDataEnabled, profileBundle?.attributes?.current]);

  useEffect(() => {
    if (profileBundle?.loreProfile) return;
    if (isMockDataEnabled || !character.id || character.id.startsWith('dummy-') || character.id.startsWith('temp-')) {
      setLoreProfile(null);
      return;
    }
    let cancelled = false;
    setLoreProfileLoading(true);
    // Bust only lore-profile (not by-character / profile-bundle) so Info groups stay in sync.
    apiCache.deletePattern(
      new RegExp(`/api/characters/${character.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/lore-profile`),
    );
    invalidateCache(`/api/characters/${character.id}/lore-profile`);
    fetchCharacterLoreProfile(character.id)
      .then((profile) => {
        if (cancelled) return;
        if (!profile) {
          setLoreProfile(null);
          return;
        }
        // Keep Connections-synced groups if they already landed; otherwise use lore-profile.
        setLoreProfile((prev) => ({
          ...profile,
          groups: prev?.groups?.length ? prev.groups : profile.groups,
        }));
      })
      .catch(() => {
        if (!cancelled) setLoreProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoreProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [character.id, isMockDataEnabled, orgsReloadToken, profileBundle?.loreProfile]);

  // Keep Info-tab group chips aligned with Connections memberships (same durable links).
  useEffect(() => {
    if (isMockDataEnabled) return;
    setLoreProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: characterOrganizations.map((o) => ({
          organizationId: o.id,
          name: o.name,
          type: o.group_type ?? o.type,
          role: o.character_role,
          userRelationship: o.user_relationship,
        })),
      };
    });
  }, [characterOrganizations, isMockDataEnabled]);

  // Load insights when Insights tab is active and ensure analytics exist
  useEffect(() => {
    if (activeTab === 'insights') {
      // In DEMO mode only: generate synthetic analytics when none exist
      if (!editedCharacter.analytics && isMockDataEnabled) {
        const mockAnalytics = generateMockAnalytics(editedCharacter);
        setEditedCharacter(prev => ({
          ...prev,
          analytics: mockAnalytics
        }));
      }
      
      if (!insights && !loadingInsights) {
      setLoadingInsights(true);
      // Generate AI insights based on character data
      setTimeout(() => {
          const closenessScore = editedCharacter.analytics?.closeness_score || editedCharacter.metadata?.closeness_score || 0;
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
    }
  }, [activeTab, insights, loadingInsights, editedCharacter]);

  // ── Load intelligence (dynamics + influence) for Info / Story tabs ───────────
  useEffect(() => {
    if ((activeTab !== 'info' && activeTab !== 'timeline') || dynamicsLoaded) return;
    const name = encodeURIComponent(character.name);

    if (isMockDataEnabled) {
      // Centralized demo intelligence — covers the full roster, not just heroes.
      setDynamics(getMockDynamics(character));
      setInfluenceProfile(getMockInfluenceProfile(character));
      setInfluenceInsights(getMockInfluenceInsights(character));
      setDynamicsLoaded(true);
      setInfluenceLoaded(true);
      return;
    }

    setDynamicsLoading(true);
    setInfluenceLoading(true);

    Promise.all([
      fetchJson<any>(`/api/relationship-dynamics/${name}`).catch(() => null),
      fetchJson<{ profiles: any[] }>(`/api/influence/profiles`).catch(() => null),
      fetchJson<{ insights: any[] }>(`/api/influence/insights?person=${name}`).catch(() => null),
    ]).then(([dyn, infProfiles, infInsights]) => {
      if (dyn) setDynamics(dyn);
      if (infProfiles?.profiles) {
        const match = infProfiles.profiles.find((p: any) =>
          p.person?.toLowerCase() === character.name.toLowerCase()
        );
        if (match) setInfluenceProfile(match);
      }
      if (infInsights?.insights) setInfluenceInsights(infInsights.insights);
    }).finally(() => {
      setDynamicsLoading(false);
      setInfluenceLoading(false);
      setDynamicsLoaded(true);
      setInfluenceLoaded(true);
    });
  }, [activeTab, character.name, character.id, dynamicsLoaded, isMockDataEnabled]);

  useEffect(() => {
    return onStoryDataUpdated((detail) => {
      setFamilyRefreshKey(k => k + 1);
      const scopes = detail.scopes ?? [];
      const touchesOrgs =
        scopes.length === 0 ||
        scopes.includes('all') ||
        scopes.includes('organizations') ||
        scopes.includes('characters');
      const touchesThisCharacter =
        !detail.characterIds?.length || detail.characterIds.includes(character.id);
      if (touchesOrgs && touchesThisCharacter) {
        // Force a fresh membership fetch (bypass stale apiCache from earlier empty loads).
        setOrgsReloadToken((n) => n + 1);
      }
    });
  }, [character.id]);

  // ── Load provenance (skip when Character Query already provided it) ─────────
  useEffect(() => {
    if (provenanceLoaded || isMockDataEnabled) return;
    if (profileBundle?.provenance) {
      setProvenanceLoaded(true);
      return;
    }
    if (!character.id || character.id.startsWith('dummy-') || character.id.startsWith('char-')) return;
    fetchJson<any>(`/api/characters/${character.id}/provenance`)
      .then(r => setProvenance(r))
      .catch(() => {})
      .finally(() => setProvenanceLoaded(true));
  }, [character.id, provenanceLoaded, isMockDataEnabled, profileBundle?.provenance]);

  // ── Load ALL attributes (including historical) ───────────────────────────────
  useEffect(() => {
    if (allAttributesLoaded) return;
    if (profileBundle?.attributes?.history) {
      setAllAttributesLoaded(true);
      return;
    }
    if (isMockDataEnabled) {
      setAllAttributes(getMockAllAttributes(character));
      setAllAttributesLoaded(true);
      return;
    }
    if (!character.id || character.id.startsWith('dummy-')) return;
    fetchJson<{ attributes: any[] }>(`/api/characters/${character.id}/attributes`)
      .then(r => { if (r.attributes) setAllAttributes(r.attributes); })
      .catch(() => {})
      .finally(() => setAllAttributesLoaded(true));
  }, [character.id, character.name, allAttributesLoaded, isMockDataEnabled, characterAttributes, profileBundle?.attributes?.history]);

  // Lazy-load heavy Character Query sections when their tabs open.
  useEffect(() => {
    if (!characterQueryEnabled || !character.id) return;
    if (activeTab === 'relationships' || activeTab === 'social') {
      void loadSections('family');
    } else if (activeTab === 'timeline') {
      void loadSections('timelines');
    } else if (activeTab === 'photos' || activeTab === 'messages') {
      void loadSections('media');
    } else if (activeTab === 'evidence') {
      void loadSections('evidence');
    } else if (activeTab === 'insights') {
      void loadSections('dynamics');
    }
  }, [activeTab, character.id, characterQueryEnabled, loadSections]);

  // Load knowledge claims + character facts when Knowledge tab opens
  useEffect(() => {
    if (activeTab !== 'knowledge') return;

    if (profileBundle?.knowledgeBase) {
      setCharacterFacts(profileBundle.knowledgeBase.facts ?? []);
      setKnowledgeClaims(profileBundle.knowledgeBase.knowledgeClaims ?? []);
      setSceneCandidates(profileBundle.knowledgeBase.sceneCandidates ?? []);
      setFactsLoaded(true);
      setKnowledgeLoaded(true);
      setScenesLoaded(true);
      return;
    }

    if (isMockDataEnabled) {
      // Demo mode: hydrate the "What I Know" tab from centralized mock intelligence
      // so it is congruent with the rest of the demo card instead of rendering empty.
      if (!factsLoaded) {
        setCharacterFacts(getMockFacts(character));
        setFactsLoaded(true);
      }
      if (!knowledgeLoaded) {
        setKnowledgeClaims(getMockKnowledgeClaims(character));
        setKnowledgeLoaded(true);
      }
      if (!scenesLoaded) {
        setSceneCandidates(getMockSceneCandidates(character));
        setScenesLoaded(true);
      }
      return;
    }

    if (!knowledgeLoaded) {
      setKnowledgeLoading(true);
      const loadKnowledge = isMainCharacter
        ? selfCharacterApi.getProfile().then(r => r.knowledgeClaims ?? [])
        : fetchJson<{ success: boolean; claims: any[] }>(
            `/api/knowledge/character-context/${encodeURIComponent(character.name)}`
          ).then(r => (r.success ? r.claims : []));

      loadKnowledge
        .then(claims => { setKnowledgeClaims(claims); })
        .catch(() => {})
        .finally(() => { setKnowledgeLoading(false); setKnowledgeLoaded(true); });
    }

    if (!factsLoaded && character.id && !character.id.startsWith('dummy-') && !(isMainCharacter && !isMockDataEnabled)) {
      setFactsLoading(true);
      fetchJson<{ success: boolean; facts: any[] }>(
        `/api/characters/${character.id}/facts`
      )
        .then(r => { if (r.success) setCharacterFacts(r.facts); })
        .catch(() => {})
        .finally(() => { setFactsLoading(false); setFactsLoaded(true); });
    }

    if (!scenesLoaded && character.id && !character.id.startsWith('dummy-')) {
      fetchJson<{ success: boolean; candidates: any[] }>(
        `/api/characters/${character.id}/scene-candidates`
      )
        .then(r => { if (r.success) setSceneCandidates(r.candidates); })
        .catch(() => {})
        .finally(() => setScenesLoaded(true));
    }
  }, [activeTab, character.id, character.name, knowledgeLoaded, factsLoaded, scenesLoaded, isMockDataEnabled, isMainCharacter]);

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


  // Drop optimistic rows when switching characters so they never leak across modals.
  useEffect(() => {
    pendingOptimisticOrgsRef.current = [];
  }, [character.id]);

  // Fetch real organizations for this character (skip when Character Query already provided them).
  useEffect(() => {
    if (isMockDataEnabled) return;
    if (profileBundle?.organizations) return;
    let cancelled = false;
    const load = async () => {
      invalidateOrganizationMembershipCaches({
        characterIds: character.id ? [character.id] : [],
      });
      try {
        // Send both id and name so legacy name-only roster rows still resolve.
        const params = new URLSearchParams();
        if (character.id) params.set('character_id', character.id);
        if (character.name) params.set('character_name', character.name);
        const res = await fetchJson<{ success: boolean; organizations?: Organization[] }>(
          `/api/organizations/by-character?${params.toString()}`,
        );
        if (cancelled) return;
        const list = Array.isArray(res.organizations) ? res.organizations : [];
        // Mark each org: user_is_member = true when *you* also have an active role there.
        const activeRels = new Set(['founder', 'leader', 'member', 'collaborator', 'adjacent', 'alumnus']);
        const withMeta = list.map((org) => {
          const member = org.members?.find(
            (m) =>
              (character.id && m.character_id === character.id) ||
              m.character_name.toLowerCase() === character.name.toLowerCase(),
          );
          return {
            ...org,
            user_is_member: activeRels.has(org.user_relationship),
            character_role: member?.role,
            character_member_notes: member?.notes,
          };
        });
        // Drop optimistic rows once the server confirms them; keep the rest if refetch is still empty/stale.
        const confirmedIds = new Set(withMeta.map((o) => o.id));
        pendingOptimisticOrgsRef.current = pendingOptimisticOrgsRef.current.filter(
          (o) => !confirmedIds.has(o.id),
        );
        const merged = [...withMeta];
        for (const pending of pendingOptimisticOrgsRef.current) {
          if (!merged.some((o) => o.id === pending.id)) merged.push(pending);
        }
        setCharacterOrganizations(merged);
      } catch {
        // Non-fatal — keep prior list
      } finally {
        if (!cancelled) setOrgsLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [character.id, character.name, isMockDataEnabled, orgsReloadToken, profileBundle?.organizations]);

  // ── Manual editing: connections (Character Book) + memberships (Groups & Orgs book) ──
  const [connectionAddOpen, setConnectionAddOpen] = useState(false);
  const [connectionOptions, setConnectionOptions] = useState<Character[]>([]);
  const [connectionOptionsLoading, setConnectionOptionsLoading] = useState(false);
  const [connectionTargetId, setConnectionTargetId] = useState('');
  const [connectionType, setConnectionType] = useState('friend');
  const [connectionSaving, setConnectionSaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [orgAddOpen, setOrgAddOpen] = useState(false);
  const [orgOptions, setOrgOptions] = useState<Organization[]>([]);
  const [orgOptionsLoading, setOrgOptionsLoading] = useState(false);
  const [orgTargetId, setOrgTargetId] = useState('');
  const [orgMemberRole, setOrgMemberRole] = useState('');
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMemberError, setOrgMemberError] = useState<string | null>(null);
  const [roleSavingOrgId, setRoleSavingOrgId] = useState<string | null>(null);

  const toggleConnectionAdd = async () => {
    const next = !connectionAddOpen;
    setConnectionAddOpen(next);
    setConnectionError(null);
    if (next && connectionOptions.length === 0 && !connectionOptionsLoading) {
      setConnectionOptionsLoading(true);
      try {
        const res = await fetchJson<{ characters: Character[] }>('/api/characters');
        setConnectionOptions((res.characters ?? []).filter((c) => c.status !== 'archived'));
      } catch {
        setConnectionError('Could not load your Character Book.');
      } finally {
        setConnectionOptionsLoading(false);
      }
    }
  };

  const addConnection = async () => {
    if (!connectionTargetId || connectionSaving) return;
    setConnectionSaving(true);
    setConnectionError(null);
    try {
      const res = await fetchJson<{
        success: boolean;
        relationship: NonNullable<Character['relationships']>[number];
      }>('/api/relationships/character-links', {
        method: 'POST',
        body: JSON.stringify({
          source_character_id: editedCharacter.id,
          target_character_id: connectionTargetId,
          relationship_type: connectionType.trim() || 'friend',
        }),
      });
      const rel = res.relationship;
      setEditedCharacter((prev) => ({
        ...prev,
        relationships: [
          ...(prev.relationships ?? []).filter((r) => r.character_id !== rel.character_id),
          rel,
        ],
      }));
      setConnectionTargetId('');
      setConnectionType('friend');
      setConnectionAddOpen(false);
      invalidateRelationshipViews(rel.character_id);
      dispatchStoryDataUpdated({ scopes: ['characters'], characterIds: [character.id, rel.character_id] });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not add connection.');
    } finally {
      setConnectionSaving(false);
    }
  };

  const removeConnection = async (rel: { id?: string; character_id?: string; character_name?: string }) => {
    if (!rel.id) return;
    const who = rel.character_name ?? 'this person';
    if (!window.confirm(`Remove the connection with ${who}? Their character card stays in your book.`)) return;
    try {
      await fetchJson(`/api/relationships/character-links/${rel.id}`, { method: 'DELETE' });
      setEditedCharacter((prev) => ({
        ...prev,
        relationships: (prev.relationships ?? []).filter((r) => r.id !== rel.id),
      }));
      invalidateRelationshipViews(rel.character_id);
      dispatchStoryDataUpdated({
        scopes: ['characters'],
        characterIds: rel.character_id ? [character.id, rel.character_id] : [character.id],
      });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not remove connection.');
    }
  };

  const toggleOrgAdd = async () => {
    const next = !orgAddOpen;
    setOrgAddOpen(next);
    setOrgMemberError(null);
    if (next && orgOptions.length === 0 && !orgOptionsLoading) {
      setOrgOptionsLoading(true);
      try {
        const res = await fetchJson<{ success: boolean; organizations: Organization[] }>('/api/organizations');
        setOrgOptions(res.organizations ?? []);
      } catch {
        setOrgMemberError('Could not load your Groups & Organizations book.');
      } finally {
        setOrgOptionsLoading(false);
      }
    }
  };

  const addOrgMembership = async () => {
    if (!orgTargetId || orgSaving) return;
    const targetId = orgTargetId;
    const role = orgMemberRole.trim() || 'member';
    const selectedOrg = orgOptions.find((o) => o.id === targetId);
    setOrgSaving(true);
    setOrgMemberError(null);
    try {
      await fetchJson(`/api/organizations/${targetId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          character_name: editedCharacter.name,
          character_id: editedCharacter.id,
          role: orgMemberRole.trim() || undefined,
        }),
      });
      // Optimistic: show the group in Connections immediately (don't wait on refetch).
      if (selectedOrg) {
        const activeRels = new Set(['founder', 'leader', 'member', 'collaborator', 'adjacent', 'alumnus']);
        const optimistic = {
          ...selectedOrg,
          user_is_member: activeRels.has(selectedOrg.user_relationship),
          character_role: role,
          members: [
            ...(selectedOrg.members ?? []),
            {
              id: `local-${Date.now()}`,
              character_id: editedCharacter.id,
              character_name: editedCharacter.name,
              role,
              status: 'active' as const,
            },
          ],
        };
        pendingOptimisticOrgsRef.current = [
          ...pendingOptimisticOrgsRef.current.filter((o) => o.id !== optimistic.id),
          optimistic,
        ];
        setCharacterOrganizations((prev) => {
          if (prev.some((o) => o.id === selectedOrg.id)) {
            return prev.map((o) =>
              o.id === selectedOrg.id ? { ...o, character_role: role } : o,
            );
          }
          return [...prev, optimistic];
        });
      }
      setOrgTargetId('');
      setOrgMemberRole('');
      setOrgAddOpen(false);
      invalidateOrganizationMembershipCaches({
        characterIds: [character.id],
        organizationIds: [targetId],
      });
      setOrgsReloadToken((n) => n + 1);
      dispatchStoryDataUpdated({
        scopes: ['characters', 'organizations'],
        characterIds: [character.id],
        organizationIds: [targetId],
      });
    } catch (error) {
      setOrgMemberError(error instanceof Error ? error.message : 'Could not add to group.');
    } finally {
      setOrgSaving(false);
    }
  };

  /** Update role on an existing membership (POST is idempotent by character_id). */
  const updateOrgMembershipRole = async (org: Organization, role: string) => {
    const nextRole = role.trim();
    if (!nextRole || roleSavingOrgId) return;
    setRoleSavingOrgId(org.id);
    setOrgMemberError(null);
    try {
      await fetchJson(`/api/organizations/${org.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          character_name: editedCharacter.name,
          character_id: editedCharacter.id,
          role: nextRole,
        }),
      });
      setCharacterOrganizations((prev) =>
        prev.map((o) => (o.id === org.id ? { ...o, character_role: nextRole } : o)),
      );
      invalidateOrganizationMembershipCaches({
        characterIds: [character.id],
        organizationIds: [org.id],
      });
      dispatchStoryDataUpdated({
        scopes: ['characters', 'organizations'],
        characterIds: [character.id],
        organizationIds: [org.id],
      });
    } catch (error) {
      setOrgMemberError(error instanceof Error ? error.message : 'Could not update role.');
    } finally {
      setRoleSavingOrgId(null);
    }
  };

  const removeOrgMembership = async (org: Organization) => {
    const firstName = shortDisplayName(editedCharacter.name);
    const member = (org.members ?? []).find(
      (m) =>
        m.character_id === editedCharacter.id ||
        m.character_name.toLowerCase() === editedCharacter.name.toLowerCase(),
    );
    if (!member) {
      setOrgMemberError(`Couldn't find ${firstName}'s membership record in ${org.name}.`);
      return;
    }
    if (!window.confirm(`Remove ${firstName} from ${org.name}? The group stays in your book.`)) return;
    try {
      await fetchJson(`/api/organizations/${org.id}/members/${member.id}`, { method: 'DELETE' });
      pendingOptimisticOrgsRef.current = pendingOptimisticOrgsRef.current.filter((o) => o.id !== org.id);
      setCharacterOrganizations((prev) => prev.filter((o) => o.id !== org.id));
      invalidateOrganizationMembershipCaches({
        characterIds: [character.id],
        organizationIds: [org.id],
      });
      setOrgsReloadToken((n) => n + 1);
      dispatchStoryDataUpdated({
        scopes: ['characters', 'organizations'],
        characterIds: [character.id],
        organizationIds: [org.id],
      });
    } catch (error) {
      setOrgMemberError(error instanceof Error ? error.message : 'Could not remove membership.');
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
          return {
            id: memory.id,
            title: memory.summary || `Memory with ${character.name}`,
            content: memory.summary || `Mentioned ${character.name}`,
            date: memory.date,
            tags: ['character-memory'],
            source: 'journal',
            sourceIcon: '📖',
            characters: [character.name],
          } satisfies MemoryCard;
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
      if (isMockDataEnabled) {
        mockDataService.mutate.characters.upsert(editedCharacter as Character);
        onUpdate();
        onClose();
        return;
      }
      await updateCharacter({
        id: character.id,
        values: {
          name: editedCharacter.name,
          firstName: editedCharacter.first_name,
          middleName:
            editedCharacter.middle_name ??
            (typeof editedCharacter.metadata?.middle_name === 'string' ? editedCharacter.metadata.middle_name : undefined),
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
        }
      }).unwrap();
      invalidateCache(character.id);
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

  const currentAttributes = characterAttributes.filter(attr => attr.isCurrent !== false);
  const attributesByType = (types: string[]) => currentAttributes.filter(attr => types.includes(attr.attributeType));
  const firstAttributeValue = (types: string[]) => attributesByType(types)[0]?.attributeValue;
  const confidenceLabel = (confidence?: number) => confidence == null ? null : formatEpistemicPercent(confidence);
  const prettyAttributeType = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const HONORIFIC_RE = /^(mr|mrs|ms|miss|mx|dr|prof|professor|sir|dame|lord|lady|rev|fr|father)\.?$/i;
  const nameParts = editedCharacter.name.trim().split(/\s+/);
  const hasHonorificFirstName = Boolean(editedCharacter.first_name && HONORIFIC_RE.test(editedCharacter.first_name));
  const firstName = hasHonorificFirstName
    ? editedCharacter.name
    : editedCharacter.first_name || (HONORIFIC_RE.test(nameParts[0] ?? '') ? editedCharacter.name : nameParts[0]) || editedCharacter.name;
  const displayName = isMainCharacter && profileRealName
    ? profileRealName
    : getCharacterDisplayTitle(editedCharacter);
  const wittyTagline =
    profileWittyTagline ||
    getCharacterWittyTagline(editedCharacter) ||
    (isMainCharacter ? null : null);
  const isRomanticRelationshipType = (type = '') => /\b(romantic|dating|date|boyfriend|girlfriend|partner|spouse|wife|husband|fianc|lover|crush|situationship|ex)\b/i.test(type);
  const romanticConnections = dedupeRelationshipsByPerson(
    (editedCharacter.relationships ?? []).filter(
      (rel) =>
        rel.character_name &&
        rel.character_name !== 'You' &&
        isRomanticRelationshipType(rel.relationship_type),
    ),
  );
  const relationshipStatus = firstAttributeValue(['relationship_status']) ??
    (romanticConnections.length > 0 ? romanticConnections[0].relationship_type.replace(/_/g, ' ') : undefined);
  const workAttributes = attributesByType(['employment_status', 'occupation', 'workplace', 'company', 'industry', 'job', 'side_hustle', 'brand', 'business', 'skill', 'certification', 'education']);
  const occupations = attributesByType(['occupation', 'job']).map(attr => attr.attributeValue);
  const workplaces = attributesByType(['workplace', 'company']).map(attr => attr.attributeValue);
  const sideHustles = attributesByType(['side_hustle', 'brand', 'business']).map(attr => attr.attributeValue);
  const companyOrganizations = (isMockDataEnabled ? getMockOrganizations() : characterOrganizations)
    .filter(org => ['company', 'brand', 'vendor', 'affiliation'].includes(String(org.group_type ?? org.type ?? '').toLowerCase()));
  const lifeMap = [
    { label: 'Location', value: firstAttributeValue(['location', 'living_situation', 'hometown']), prompt: `Where ${editedCharacter.name} lives or is from: ` },
    { label: 'Culture', value: firstAttributeValue(['nationality', 'cultural_background', 'ethnicity']), prompt: `${editedCharacter.name}'s cultural background: ` },
    { label: 'Education', value: firstAttributeValue(['education', 'school', 'degree', 'certification']), prompt: `${editedCharacter.name}'s education or certifications: ` },
    { label: 'Values', value: firstAttributeValue(['core_value', 'values', 'motivation']), prompt: `What ${editedCharacter.name} cares about: ` },
    { label: 'Goals', value: firstAttributeValue(['goal', 'career_goal', 'personal_goal', 'dream']), prompt: `${editedCharacter.name}'s goals: ` },
    { label: 'Interests', value: firstAttributeValue(['interest', 'hobby', 'music', 'sport', 'favorite_activity']), prompt: `${editedCharacter.name}'s interests and hobbies: ` },
  ];
  const behaviorAttributes = attributesByType(['personality_trait', 'communication_style', 'temperament', 'lifestyle_pattern', 'habit', 'decision_style', 'stress_response']);
  const socialStanding = (editedCharacter.metadata as any)?.social_standing as { tier?: string; score?: number; connector?: boolean } | undefined;
  const publicFigureConnection = getPublicFigureConnection(editedCharacter);
  const isPublicFigureChar = isPublicFigureCharacter(editedCharacter);
  const sceneNetwork = getSceneNetwork(editedCharacter);
  const connectionStageLabels = CONNECTION_STAGE_LABELS;

  const openCharacterByRelationship = async (rel: Relationship) => {
    if (isMockDataEnabled) {
      setSelectedCharacterForModal({
        id: rel.character_id || `temp-${rel.character_name}`,
        name: rel.character_name || 'Unknown',
        archetype: rel.relationship_type,
        role: rel.relationship_type.replace(/_/g, ' '),
        status: rel.status ?? 'inferred',
        summary: rel.summary,
        importance_level: rel.closeness_score && rel.closeness_score >= 8 ? 'major' : 'supporting',
        importance_score: Math.min(100, Math.max(35, (rel.closeness_score ?? 5) * 10)),
        relationship_depth: rel.closeness_score && rel.closeness_score >= 8 ? 'close' : 'moderate',
        memory_count: 4,
        relationship_count: 1,
      } as Character);
      return;
    }

    try {
      if (rel.character_id) {
        const related = await fetchJson<Character>(`/api/characters/${rel.character_id}`);
        setSelectedCharacterForModal(related);
        return;
      }
    } catch {
      // Fall through to minimal modal seed.
    }
    setSelectedCharacterForModal({
      id: rel.character_id || `temp-${rel.character_name}`,
      name: rel.character_name || 'Unknown',
    } as Character);
  };

  const openCharacterById = async (characterId: string) => {
    if (isMockDataEnabled) return;
    try {
      const related = await fetchJson<Character>(`/api/characters/${characterId}`);
      setSelectedCharacterForModal(related);
    } catch {
      // ignore — card stays non-clickable fallback
    }
  };

  const strongestConnections = dedupeRelationshipsByPerson(
    (editedCharacter.relationships ?? []).filter(
      (rel) => rel.character_name && rel.character_name !== 'You',
    ),
  )
    .sort((left, right) => (right.closeness_score ?? 0) - (left.closeness_score ?? 0))
    .slice(0, 5);
  const uniqueConnections = dedupeRelationshipsByPerson(
    (editedCharacter.relationships ?? []).filter(
      (rel) => rel.character_name && rel.character_name !== 'You',
    ),
  );
  const storyGroups = (isMockDataEnabled ? getMockOrganizations() : characterOrganizations);

  const resolvedRomanticRelationship = useMemo(() => {
    if (relationship) return relationship;
    if (!isMockDataEnabled) return undefined;
    return getMockRomanticRelationshipForCharacter(editedCharacter.id, editedCharacter.name);
  }, [relationship, isMockDataEnabled, editedCharacter.id, editedCharacter.name]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm overscroll-none"
      data-testid={isMainCharacter ? 'main-character-modal' : 'character-modal'}
      role="dialog"
      aria-modal="true"
    >
      <div className={`bg-gradient-to-br from-black via-black/95 to-black border-0 sm:border-2 rounded-none sm:rounded-2xl w-full h-[100dvh] max-h-[100dvh] sm:h-[92vh] sm:max-h-[92vh] sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl overflow-hidden flex flex-col shadow-2xl ${
        isMainCharacter
          ? 'border-amber-500/40 shadow-amber-500/15'
          : 'border-primary/30 shadow-primary/20'
      }`}>
        {/* Header — compact on mobile; full hero on sm+ */}
        <div className={`relative border-b-2 flex-shrink-0 ${
          isMainCharacter
            ? 'bg-gradient-to-r from-amber-500/20 via-amber-950/30 to-purple-900/20 border-amber-500/35'
            : 'bg-gradient-to-r from-primary/20 via-purple-900/20 to-primary/20 border-primary/30'
        }`}>
          <Button
            variant="ghost"
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex-shrink-0 hover:bg-white/10 h-9 w-9 sm:h-10 sm:w-10 p-0 touch-manipulation"
            aria-label="Close"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>

          {/* Mobile: minimal sticky header — compact */}
          <div
            className="sm:hidden px-2 py-1.5 pr-12 border-b border-white/10"
            style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top, 0px))' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative flex-shrink-0 flex flex-col items-center gap-1">
                <CharacterAvatar
                  url={editedCharacter.avatar_url}
                  characterId={editedCharacter.id}
                  archetype={editedCharacter.archetype}
                  role={editedCharacter.role}
                  name={editedCharacter.name}
                  size={28}
                />
                {!isMainCharacter && loreAvatarsEnabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[9px] text-white/50 hover:text-white/80"
                    disabled={loreAvatarBusy}
                    onClick={() => void generateLorePortrait()}
                  >
                    {loreAvatarBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                    <span className="ml-1">From lore</span>
                  </Button>
                )}
                {loreAvatarError && (
                  <p className="text-[9px] text-amber-400/90 max-w-[7rem] text-center leading-tight">{loreAvatarError}</p>
                )}
                {editedCharacter.status && (
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <span
                      className={`block h-2 w-2 rounded-full ring-2 ring-black/80 ${
                        editedCharacter.status === 'active'
                          ? 'bg-green-400'
                          : editedCharacter.status === 'unmet'
                            ? 'bg-orange-400'
                            : 'bg-gray-400'
                      }`}
                      aria-hidden
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5 min-w-0 flex-wrap">
                  <h2 className="text-base font-bold text-white break-words">
                    {displayName === editedCharacter.name ? (
                      <EditableEntityName
                        name={editedCharacter.name}
                        onSave={handleRenameCharacter}
                        label="character name"
                        className="break-words"
                      />
                    ) : (
                      displayName
                    )}
                  </h2>
                  {isMainCharacter && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300 mt-0.5" aria-hidden />
                  )}
                  {!isMainCharacter && (
                    <EntityTypeSwitcher
                      busy={reclassifyBusy}
                      success={reclassifySuccess}
                      error={reclassifyError}
                      target={reclassifyTarget}
                      onSelect={handleReclassify}
                      onOpenMenu={() => setReclassifyError(null)}
                    />
                  )}
                </div>
                {editedCharacter.role ? (
                  <p className="text-[11px] text-white/50 break-words">{editedCharacter.role}</p>
                ) : editedCharacter.archetype ? (
                  <p className="text-[11px] text-white/50 break-words">{editedCharacter.archetype}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Desktop: dense identity header — keep tabs/content dominant */}
          <div className="hidden sm:block p-2 pr-12 lg:p-2.5 lg:pr-14">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <div className="relative flex-shrink-0 flex flex-col items-center gap-0.5">
                {/* Phase ring around avatar */}
                {(() => {
                  const c = editedCharacter.analytics?.closeness_score ?? 0;
                  const r = editedCharacter.analytics?.recency_score ?? 0;
                  const ringColor =
                    c >= 70 && r >= 0.6 ? 'ring-purple-500/70 shadow-[0_0_10px_rgba(168,85,247,0.6)]' :
                    c >= 45 || r >= 0.4  ? 'ring-cyan-500/60' :
                    c >= 20 || r >= 0.2  ? 'ring-amber-500/50' :
                    'ring-white/10';
                  return (
                    <div className={`ring-2 ${ringColor} rounded-full`}>
                      <CharacterAvatar
                        url={editedCharacter.avatar_url}
                        characterId={editedCharacter.id}
                        archetype={editedCharacter.archetype}
                        role={editedCharacter.role}
                        name={editedCharacter.name}
                        size={36}
                        className="sm:w-9 sm:h-9 lg:w-10 lg:h-10"
                      />
                    </div>
                  );
                })()}
                {!isMainCharacter && loreAvatarsEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-7 w-7 border-white/15 text-white/70 hover:text-white"
                    disabled={loreAvatarBusy}
                    onClick={() => void generateLorePortrait()}
                    title="Generate a portrait from what LoreBook knows about them"
                    aria-label="Generate portrait from lore"
                  >
                    {loreAvatarBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                  </Button>
                )}
                {loreAvatarError && (
                  <p className="text-[10px] text-amber-400/90 max-w-[5.5rem] text-center leading-tight">{loreAvatarError}</p>
                )}
                {editedCharacter.status && (
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <Tooltip content={getStatusTooltip(editedCharacter.status)}>
                    <Badge
                      className={`${
                        editedCharacter.status === 'active'
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : editedCharacter.status === 'unmet'
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 border-dashed'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        } text-[9px] px-1 py-0 cursor-help`}
                    >
                      {editedCharacter.status === 'unmet' ? 'Unmet' : editedCharacter.status}
                    </Badge>
                    </Tooltip>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
	                <div className="flex items-center gap-1.5 flex-wrap">
	                  <h2 className="text-base lg:text-lg font-bold text-white tracking-tight break-words leading-tight">
	                    {displayName === editedCharacter.name ? (
	                      <EditableEntityName
	                        name={editedCharacter.name}
	                        onSave={handleRenameCharacter}
	                        label="character name"
	                      />
	                    ) : (
	                      displayName
	                    )}
	                  </h2>
                    {isMainCharacter && (
                      <>
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-200 border-amber-400/50 text-[9px] px-1.5 py-0 flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                          Main
                        </Badge>
                        {/^me$/i.test(editedCharacter.name) && profileRealName && (
                          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/70 border border-amber-500/25 rounded px-1.5 py-0">
                            Me
                          </span>
                        )}
                        <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/70 border border-amber-500/25 rounded px-1.5 py-0">
                          you
                        </span>
                      </>
                    )}
                    {!isMainCharacter && (
                      <EntityTypeSwitcher
                        busy={reclassifyBusy}
                        success={reclassifySuccess}
                        error={reclassifyError}
                        target={reclassifyTarget}
                        onSelect={handleReclassify}
                        onOpenMenu={() => setReclassifyError(null)}
                      />
                    )}
	                </div>

                {/* Name controls collapsed by default — parent already shows the display name */}
                <div className="max-w-2xl">
                  <CharacterTitleSection
                    character={editedCharacter}
                    compact
                    omitTitle
                    onUpdated={(patch) => {
                      setEditedCharacter((prev) => ({ ...prev, ...patch }));
                      if (isMainCharacter && !isMockDataEnabled) {
                        selfCharacterApi.ensureSelf().catch(() => {});
                        selfCharacterApi.getProfile().then(applySelfProfile).catch(() => {});
                        selfCharacterApi.repairIdentity().catch(() => {});
                        dispatchStoryDataUpdated({ scopes: ['characters'], characterIds: [character.id] });
                      }
                    }}
                  />
                </div>

                {wittyTagline && (
                  <p className="text-[11px] text-white/55 italic leading-snug line-clamp-1 max-w-2xl" title={wittyTagline}>
                    {wittyTagline}
                  </p>
                )}

                {/* LoreBook + meta chips share one row */}
                <div className="flex flex-wrap items-center gap-1">
                  <EntityLorebookCompileControl
                    subjectLabel={displayName || editedCharacter.name}
                    focus={{ characterId: editedCharacter.id, themes: displayName || editedCharacter.name }}
                    testId="character-modal-lorebook-compile"
                    className="py-0.5 pl-1.5 pr-1.5"
                  />
                  {editedCharacter.importance_level && (
                    <Tooltip content={getImportanceTooltip(editedCharacter.importance_level, editedCharacter.importance_score, editedCharacter.analytics?.character_influence_on_user)}>
                      <Badge
                        variant="outline"
                        className={`${getImportanceColor(editedCharacter.importance_level)} text-[9px] px-1.5 py-0 flex items-center gap-0.5 cursor-help`}
                      >
                        {getImportanceIcon(editedCharacter.importance_level)}
                        {getImportanceLabel(editedCharacter.importance_level)}
                      </Badge>
                    </Tooltip>
                  )}
                  {editedCharacter.role && (
                    <Tooltip content={getRoleTooltip(editedCharacter.role)}>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[9px] px-1.5 py-0 cursor-help max-w-[10rem] truncate">
                        {editedCharacter.role}
                      </Badge>
                    </Tooltip>
                  )}
                  {editedCharacter.archetype && (
                    <Tooltip content={getArchetypeTooltip(editedCharacter.archetype)}>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[9px] px-1.5 py-0 cursor-help max-w-[9rem] truncate">
                        {editedCharacter.archetype}
                      </Badge>
                    </Tooltip>
                  )}
                  {editedCharacter.pronouns && (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] px-1.5 py-0">
                      {editedCharacter.pronouns}
                    </Badge>
                  )}
                  {editedCharacter.metadata?.kinship_label && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[9px] px-1.5 py-0">
                      {String(editedCharacter.metadata.kinship_label)}
                    </Badge>
                  )}
                  {profileContextHooks.slice(0, 2).map((hook) => (
                    <Badge
                      key={hook}
                      variant="outline"
                      className={`text-[8px] px-1 py-0 ${
                        isMainCharacter
                          ? 'bg-amber-500/10 text-amber-200/90 border-amber-500/25'
                          : 'bg-primary/10 text-primary/90 border-primary/25'
                      }`}
                    >
                      {hook}
                    </Badge>
                  ))}
                  {(editedCharacter.importance_level === 'minor' || editedCharacter.importance_level === 'background') &&
                    (editedCharacter.analytics?.character_influence_on_user ?? 0) >= 70 && (
                    <Badge
                      variant="outline"
                      className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[8px] px-1 py-0 flex items-center gap-0.5"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      High impact
                    </Badge>
                  )}
                </div>

                {/* Originating external posts (X/Twitter) — provenance back to the source */}
                {(() => {
                  const raw = editedCharacter.metadata?.external_sources;
                  const sources = (Array.isArray(raw) ? raw : []) as Array<{
                    provider?: string;
                    sourceId?: string;
                    url?: string;
                    postedAt?: string;
                    excerpt?: string;
                  }>;
                  const xSources = sources.filter((s) => s.provider === 'x' && s.url);
                  if (xSources.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {xSources.slice(0, 2).map((s) => (
                        <Tooltip
                          key={s.sourceId ?? s.url}
                          content={s.excerpt ? `“${s.excerpt}”` : 'This entity came from one of your X posts'}
                        >
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0 text-[9px] text-sky-300 hover:bg-sky-500/20 transition"
                          >
                            <Twitter className="h-2.5 w-2.5" />
                            From X
                            {s.postedAt ? ` · ${new Date(s.postedAt).toLocaleDateString()}` : ''}
                          </a>
                        </Tooltip>
                      ))}
                      {xSources.length > 2 && (
                        <span className="text-[9px] text-white/40 self-center">
                          +{xSources.length - 2} more
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* ── Intelligence quick-stats bar ── */}
                {(dynamics || editedCharacter.analytics) && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1 border-t border-white/8">
                    {/* Health score */}
                    {dynamics?.health?.health_score != null && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              dynamics.health.health_score >= 80 ? 'bg-emerald-400' :
                              dynamics.health.health_score >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${dynamics.health.health_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/45">
                          {dynamics.health.health_score} health
                        </span>
                      </div>
                    )}
                    {/* Trend */}
                    {dynamics?.health?.trends?.health_trend && (
                      <span className={`text-[10px] ${
                        dynamics.health.trends.health_trend === 'improving' ? 'text-emerald-400' :
                        dynamics.health.trends.health_trend === 'declining' ? 'text-red-400' : 'text-white/40'
                      }`}>
                        {dynamics.health.trends.health_trend === 'improving' ? '↑' :
                         dynamics.health.trends.health_trend === 'declining' ? '↓' : '→'}
                        {' '}{dynamics.health.trends.health_trend}
                      </span>
                    )}
                    {/* Stage */}
                    {dynamics?.lifecycle?.current_stage && (
                      <span className="text-[10px] text-white/35 capitalize">
                        {dynamics.lifecycle.current_stage}
                      </span>
                    )}
                    {/* Memory count */}
                    {(editedCharacter.memory_count ?? 0) > 0 && (
                      <span className="text-[10px] text-white/35">
                        {editedCharacter.memory_count} memories
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Desktop: vertical sidebar */}
          <nav
            className="hidden md:flex flex-shrink-0 md:border-r border-border/60 md:w-44 lg:w-52 overflow-y-hidden overflow-x-hidden bg-black/20 flex-col min-h-0 h-full"
            aria-label="Character sections"
          >
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 w-full px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium transition text-left border-l-2 ${
                      isActive
                        ? 'border-l-primary bg-primary/10 text-white'
                        : 'border-l-transparent text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={tab.label}
                    data-testid={
                      tab.key === 'relationships'
                        ? 'character-tab-connections'
                        : tab.key === 'timeline'
                          ? 'character-tab-story'
                          : undefined
                    }
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {canDeleteCharacter && (
              <div className="flex-shrink-0 border-t border-amber-500/15 p-2 sm:p-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteStep('warn');
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium text-amber-200/80 hover:text-amber-100 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition text-left"
                  aria-label="Archive character"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span>Archive character</span>
                </button>
              </div>
            )}
          </nav>

          <div
            ref={contentRef}
            className="flex-1 min-h-0 bg-black/40 touch-pan-y [-webkit-overflow-scrolling:touch] overflow-y-auto overflow-x-hidden overscroll-contain p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-8 sm:pb-12 lg:pb-16"
          >
            {/* Mobile: profile context lives in scroll body, not fixed header */}
            {!loadingDetails && (
              <div className="sm:hidden space-y-2 pb-3 border-b border-white/10 shrink-0">
                {wittyTagline && (
                  <p className="text-xs text-white/70 italic leading-snug line-clamp-2">{wittyTagline}</p>
                )}
                <CharacterTitleSection
                  character={editedCharacter}
                  compact
                  omitTitle
                  onUpdated={(patch) => setEditedCharacter((prev) => ({ ...prev, ...patch }))}
                />
                {profileContextHooks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {profileContextHooks.slice(0, 4).map((hook) => (
                      <Badge
                        key={hook}
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${
                          isMainCharacter
                            ? 'bg-amber-500/10 text-amber-200/90 border-amber-500/25'
                            : 'bg-primary/10 text-primary/90 border-primary/25'
                        }`}
                      >
                        {hook}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  {editedCharacter.role && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[9px] px-1.5 py-0">
                      {editedCharacter.role}
                    </Badge>
                  )}
                  {editedCharacter.pronouns && (
                    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[9px] px-1.5 py-0">
                      {editedCharacter.pronouns}
                    </Badge>
                  )}
                  {editedCharacter.importance_level && (
                    <Badge variant="outline" className={`${getImportanceColor(editedCharacter.importance_level)} text-[9px] px-1.5 py-0`}>
                      {getImportanceLabel(editedCharacter.importance_level)}
                    </Badge>
                  )}
                </div>
                {(dynamics || editedCharacter.analytics) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40">
                    {dynamics?.health?.health_score != null && (
                      <span>{dynamics.health.health_score} health</span>
                    )}
                    {(editedCharacter.memory_count ?? 0) > 0 && (
                      <span>{editedCharacter.memory_count} memories</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {loadingDetails && (
              <div className="text-center py-12 text-white/60">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-lg">Loading character details...</p>
              </div>
            )}
            {!loadingDetails && activeTab === 'info' && (
              <CharacterInfoPanel
                editedCharacter={editedCharacter}
                setEditedCharacter={setEditedCharacter}
                characterId={editedCharacter.id ?? character.id}
                onUpdate={onUpdate}
                relationship={resolvedRomanticRelationship}
                dynamics={dynamics}
                askInChat={askInChat}
                relationshipStatus={relationshipStatus}
                romanticConnections={romanticConnections}
                strongestConnections={strongestConnections}
                lifeMap={lifeMap}
                occupations={occupations}
                workplaces={workplaces}
                sideHustles={sideHustles}
                behaviorAttributes={behaviorAttributes}
                socialStanding={socialStanding}
                characterAttributes={currentAttributes}
                loadingAttributes={loadingAttributes}
                provenance={provenance}
                isMockDataEnabled={isMockDataEnabled}
                openCharacterByRelationship={openCharacterByRelationship}
                loreProfile={loreProfile}
                loreProfileLoading={loreProfileLoading}
                onOpenCharacterById={openCharacterById}
                onAddWorldPerson={addWorldPerson}
                onUpdateWorldPerson={updateWorldPerson}
                onDeleteWorldPerson={deleteWorldPerson}
                focusField={initialFocusField}
                onFocusFieldHandled={onInitialFocusFieldHandled}
                isSelfCharacter={isMainCharacter}
              />
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
              <div className="space-y-8">
                {/* Relationship to You */}
                <div>
                  <ConnectionSectionHeader icon={Users} title="Relationship to You" />
                  <Card className="bg-gradient-to-br from-primary/10 to-purple-900/20 border-primary/30">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {(editedCharacter.role || editedCharacter.archetype) && (
                          <div className="grid grid-cols-2 gap-4">
                            {editedCharacter.role && (
                              <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Role</span>
                                <p className="text-white font-medium mt-0.5">{editedCharacter.role}</p>
                              </div>
                            )}
                            {editedCharacter.archetype && (
                              <div>
                                <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Archetype</span>
                                <p className="text-white font-medium mt-0.5">{editedCharacter.archetype}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {editedCharacter.summary && (
                          <div>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Summary</span>
                            <p className="text-white/80 text-sm mt-1">{editedCharacter.summary}</p>
                          </div>
                        )}
                        {editedCharacter.relationships && editedCharacter.relationships.length > 0 && (
                          <div>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Closeness</span>
                            {editedCharacter.relationships.find(r => r.character_name === 'You' || !r.character_name) && (
                              <div className="mt-1.5">
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

                {/* Family Tree */}
                <div className="pt-8 border-t border-white/[0.06]">
                  <ConnectionSectionHeader icon={TreePine} title="Family Tree" />
                  <Card className="bg-black/40 border-border/50">
                    <CardContent className="p-4">
                      {isMockDataEnabled ? (() => {
                        const mockTree =
                          createMockFamilyTreeForCharacter(editedCharacter.name) ??
                          createMockUserFamilyTree();
                        return (
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <FamilyTreeCopyAllButton
                                tree={mockTree}
                                title={`Family tree — ${shortDisplayName(editedCharacter.name)}`}
                                filters={[
                                  `characterId=${editedCharacter.id}`,
                                  'mode=demo',
                                ]}
                                data-testid="character-modal-family-copy-all"
                              />
                            </div>
                            <FamilyTreeView
                              tree={mockTree}
                              onMemberClick={(member) => {
                                if (!member.is_self) {
                                  setSelectedCharacterForModal({
                                    id: member.id,
                                    name: member.name,
                                  } as Character);
                                }
                              }}
                            />
                          </div>
                        );
                      })() : (
                        <FamilyTreePanel
                          scope="character"
                          entityId={editedCharacter.id}
                          refreshKey={familyRefreshKey}
                          title={`No family tree for ${shortDisplayName(editedCharacter.name)} yet`}
                          copyTitle={`Family tree — ${shortDisplayName(editedCharacter.name)}`}
                          hint="Share how they're related to you or others in chat — LoreBook infers positions and keeps updating."
                          {...familyEditing.editHandlers}
                          onMemberClick={(id, name) => {
                            if (id.startsWith('name-')) return;
                            void (async () => {
                              try {
                                const c = await fetchJson<Character>(`/api/characters/${id}`);
                                setSelectedCharacterForModal(c);
                              } catch {
                                setSelectedCharacterForModal({ id, name } as Character);
                              }
                            })();
                          }}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Friends & Other Connections */}
                {(
                  <div className="pt-8 border-t border-white/[0.06]">
                    <ConnectionSectionHeader
                      icon={UserCircle}
                      title="Friends & Other Connections"
                      action={
                        !isMockDataEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-white/55"
                            onClick={() => void toggleConnectionAdd()}
                            data-testid="add-connection-toggle"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="ml-1">{connectionAddOpen ? 'Close' : 'Add'}</span>
                          </Button>
                        )
                      }
                    />
                    {connectionAddOpen && !isMockDataEnabled && (
                      <Card className="bg-black/40 border-border/50 mb-3">
                        <CardContent className="p-3">
                          <p className="text-[10px] text-white/35 mb-2">
                            Link a person who already exists in your Character Book.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
                            <select
                              value={connectionTargetId}
                              onChange={(e) => setConnectionTargetId(e.target.value)}
                              disabled={connectionOptionsLoading}
                              aria-label="Existing character"
                              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none"
                            >
                              <option value="">
                                {connectionOptionsLoading ? 'Loading…' : 'Choose a person…'}
                              </option>
                              {connectionOptions
                                .filter(
                                  (c) =>
                                    c.id !== editedCharacter.id &&
                                    !(editedCharacter.relationships ?? []).some(
                                      (r) => r.character_id === c.id,
                                    ),
                                )
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                            <input
                              list="connection-type-options"
                              value={connectionType}
                              onChange={(e) => setConnectionType(e.target.value)}
                              placeholder="Relationship (e.g. friend)"
                              aria-label="Relationship type"
                              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none"
                            />
                            <datalist id="connection-type-options">
                              {['friend', 'best friend', 'close friend', 'acquaintance', 'coworker', 'bandmate', 'classmate', 'roommate', 'neighbor', 'mentor', 'rival', 'ex'].map((t) => (
                                <option key={t} value={t} />
                              ))}
                            </datalist>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!connectionTargetId || connectionSaving}
                              onClick={() => void addConnection()}
                              data-testid="add-connection-submit"
                            >
                              {connectionSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                            </Button>
                          </div>
                          {connectionError && (
                            <p className="text-xs text-red-400 mt-2">{connectionError}</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                    {!connectionAddOpen && connectionError && (
                      <p className="text-xs text-red-400 mb-2">{connectionError}</p>
                    )}
                    <div className="space-y-2">
                      {uniqueConnections.map((rel) => (
                          <Card 
                            key={rel.character_id ?? rel.id} 
                            className="bg-black/40 border-border/50 cursor-pointer hover:border-primary/50 hover:bg-black/60 transition-all"
                            onClick={() => void openCharacterByRelationship(rel)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-white">{rel.character_name}</p>
                                    <Tooltip content={`Relationship Type: "${rel.relationship_type}" describes how ${rel.character_name} relates to ${editedCharacter.name}. This is automatically detected from your conversations when you describe their connection.`}>
                                      <span className="text-xs text-primary/70 px-2 py-0.5 rounded bg-primary/10 border border-primary/20 cursor-help">
                                      {rel.relationship_type}
                                    </span>
                                    </Tooltip>
                                  </div>
                                  {rel.summary && <p className="text-sm text-white/60 mt-1">{rel.summary}</p>}
                                </div>
                                {rel.closeness_score !== undefined && (
                                  <div className="text-right ml-4">
                                    <span className="text-xs text-white/50 block">Closeness</span>
                                    <span className="text-sm font-medium text-primary">{rel.closeness_score}/10</span>
                                  </div>
                                )}
                                {!isMockDataEnabled && rel.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-2 h-7 w-7 p-0 text-white/30 hover:text-red-400"
                                    aria-label={`Remove connection with ${rel.character_name}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void removeConnection(rel);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      {uniqueConnections.length === 0 && (
                        <div className="text-center py-8 text-white/40">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No connections tracked yet</p>
                          {!isMockDataEnabled && !connectionAddOpen && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3 h-8 text-xs"
                              onClick={() => void toggleConnectionAdd()}
                              data-testid="empty-add-connection"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add a connection manually
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Wider network (inferred periphery — formerly its own tab) */}
                {editedCharacter.id && (
                  <div className="pt-8 border-t border-white/[0.06]">
                    <RelationshipPeripheralsPanel
                      anchorKind="character"
                      anchorId={editedCharacter.id}
                      anchorName={editedCharacter.name}
                      title="Wider network"
                      description={`People LoreBook has inferred around ${shortDisplayName(editedCharacter.name)} — confirm, dismiss, or promote them into Character Book.`}
                      onUpdate={onUpdate}
                    />
                  </div>
                )}

                {/* Groups & Organizations */}
                {(() => {
                  const orgs = isMockDataEnabled ? getMockOrganizations() : characterOrganizations;
                  const shared = orgs.filter((o: any) => o.user_is_member);
                  const theirs = orgs.filter((o: any) => !o.user_is_member);
                  const OrgCard = ({ org, isShared }: { org: any; isShared: boolean }) => (
                    <div
                      key={org.id}
                      className={`p-3 rounded-lg border transition-all flex flex-col gap-2 ${
                        isShared
                          ? 'bg-green-500/8 border-green-500/25 hover:bg-green-500/15 hover:border-green-500/40'
                          : 'bg-white/4 border-white/10 hover:bg-white/8 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedOrganization(org)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-white/90 truncate">{org.name}</p>
                            <Badge variant="outline" className={`text-[10px] py-0 ${
                              org.group_type === 'community' ? 'border-emerald-500/25 text-emerald-300' :
                              org.group_type === 'club' ? 'border-blue-500/25 text-blue-300' :
                              org.group_type === 'institution' ? 'border-purple-500/25 text-purple-300' :
                              org.group_type === 'company' ? 'border-orange-500/25 text-orange-300' :
                              org.group_type === 'sports_team' ? 'border-cyan-500/25 text-cyan-300' :
                              'border-white/15 text-white/45'
                            }`}>{(org.group_type ?? org.type)?.replace(/_/g, ' ')}</Badge>
                          </div>
                          {org.description && <p className="text-xs text-white/45 mt-0.5 truncate">{org.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                            {org.member_count > 0 && <span>{org.member_count} members</span>}
                            {org.confidence != null && <span>{formatEpistemicPercent(org.confidence)}</span>}
                          </div>
                          {org.character_member_notes && (
                            <p className="text-[10px] text-white/35 mt-1 line-clamp-1">{org.character_member_notes}</p>
                          )}
                        </button>
                        <Badge variant="outline" className={`flex-shrink-0 text-[10px] py-0 mt-0.5 ${
                          isShared
                            ? 'bg-green-500/15 text-green-300 border-green-500/30'
                            : 'bg-white/5 text-white/35 border-white/15'
                        }`}>
                          {isShared ? 'Shared' : 'Theirs'}
                        </Badge>
                        {!isMockDataEnabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 h-6 w-6 p-0 mt-0.5 text-white/25 hover:text-red-400"
                            aria-label={`Remove ${shortDisplayName(editedCharacter.name)} from ${org.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeOrgMembership(org);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {!isMockDataEnabled && (
                        <div onClick={(e) => e.stopPropagation()} className="max-w-xs">
                          <OrganizationMemberRoleSelect
                            value={org.character_role || ''}
                            disabled={roleSavingOrgId === org.id}
                            data-testid={`org-role-select-${org.id}`}
                            onChange={(role) => {
                              if (role && role !== (org.character_role || '')) {
                                void updateOrgMembershipRole(org, role);
                              }
                            }}
                            className="h-8 rounded-lg border border-white/10 bg-black/50 px-2 text-[11px] text-white focus:border-primary/60 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <div data-testid="character-groups-section" className="pt-8 border-t border-white/[0.06]">
                      <ConnectionSectionHeader
                        icon={Building2}
                        title="Groups & Organizations"
                        meta={`${orgs.length} total`}
                        action={
                          !isMockDataEnabled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] text-white/55"
                              onClick={() => void toggleOrgAdd()}
                              data-testid="add-membership-toggle"
                            >
                              <Plus className="h-3 w-3" />
                              <span className="ml-1">{orgAddOpen ? 'Close' : 'Add'}</span>
                            </Button>
                          )
                        }
                      />
                      <p className="text-xs text-white/35 mb-3">
                        Same links as the Groups &amp; Organizations book — add or remove here and both sides stay in sync.
                      </p>
                      {orgAddOpen && !isMockDataEnabled && (
                        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.035] p-3">
                          <p className="text-[10px] text-white/35 mb-2">
                            Add {shortDisplayName(editedCharacter.name)} to a group that already exists in your Groups &amp; Organizations book.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
                            <select
                              value={orgTargetId}
                              onChange={(e) => setOrgTargetId(e.target.value)}
                              disabled={orgOptionsLoading}
                              aria-label="Existing group or organization"
                              className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white focus:border-primary/60 focus:outline-none"
                            >
                              <option value="">
                                {orgOptionsLoading ? 'Loading…' : 'Choose a group…'}
                              </option>
                              {orgOptions
                                .filter((o) => !orgs.some((existing: any) => existing.id === o.id))
                                .map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                            </select>
                            <OrganizationMemberRoleSelect
                              value={orgMemberRole}
                              onChange={setOrgMemberRole}
                              disabled={orgSaving}
                              data-testid="add-membership-role"
                            />
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!orgTargetId || orgSaving}
                              onClick={() => void addOrgMembership()}
                              data-testid="add-membership-submit"
                            >
                              {orgSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                            </Button>
                          </div>
                          <CreateGroupFromCharacterPanel
                            character={{
                              id: editedCharacter.id,
                              name: editedCharacter.name,
                              role: editedCharacter.role,
                              archetype: editedCharacter.archetype,
                            }}
                            onOpenedChat={() => {
                              setOrgAddOpen(false);
                              onClose();
                            }}
                            testIdPrefix="create-group"
                          />
                        </div>
                      )}
                      {orgMemberError && !isMockDataEnabled && (
                        <p className="text-xs text-red-400 mb-2">{orgMemberError}</p>
                      )}
                      {orgs.length === 0 && (
                        <p className="text-xs text-white/30 italic text-center py-4">No group memberships detected yet.</p>
                      )}
                      {shared.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">You are both in</p>
                          <div className="space-y-2">
                            {shared.map((org: any) => <OrgCard key={org.id} org={org} isShared={true} />)}
                          </div>
                        </div>
                      )}
                      {theirs.length > 0 && (
                        <div>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                            {shortDisplayName(editedCharacter.name)}&apos;s groups
                          </p>
                          <div className="space-y-2">
                            {theirs.map((org: any) => <OrgCard key={org.id} org={org} isShared={false} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Associated Characters (for indirect/third-party characters) */}
                {(editedCharacter.proximity_level === 'indirect' || editedCharacter.proximity_level === 'third_party' || editedCharacter.associated_with_character_ids) && (
                  <div className="pt-8 border-t border-white/[0.06]">
                    <ConnectionSectionHeader icon={Link2} title="Associated With" />
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
              <CharacterPerceptionsTab
                personId={editedCharacter.id}
                personName={editedCharacter.name}
              />
            )}

            {/* Story Tab — events + journal memories (was Timeline / History) */}
            {!loadingDetails && activeTab === 'timeline' && (
              <CharacterStoryPanel
                characterId={character.id}
                characterName={editedCharacter.name}
                mockMode={isMockDataEnabled}
                active={activeTab === 'timeline'}
                memories={sharedMemoryCards}
                memoriesLoading={loadingMemories}
                stageHistory={dynamics?.lifecycle?.stage_history ?? []}
                onSelectMemory={(memory) => setSelectedMemory(memory)}
                onOpenPerceptions={() => setActiveTab('perceptions')}
              />
            )}

            {/* Insights Tab */}
            {!loadingDetails && activeTab === 'insights' && (
              <div className="space-y-6">
                {(() => {
                  const analytics = editedCharacter.analytics ?? (isMockDataEnabled ? generateMockAnalytics(editedCharacter) : deriveAnalyticsFromCharacter(editedCharacter));
                  const firstName = shortDisplayName(editedCharacter.name);

                  // ── 1. Relationship Sentence ────────────────────────────────
                  const phaseLabel = (() => {
                    const c = analytics.closeness_score ?? 0;
                    const r = analytics.recency_score ?? 0;
                    if (c >= 70 && r >= 0.6) return 'a Core relationship';
                    if (c >= 45 || r >= 0.4) return 'an Active relationship';
                    if (c >= 20 || r >= 0.2) return 'a Fading relationship';
                    return 'a Dormant relationship';
                  })();
                  const trendPhrase = analytics.trend === 'deepening' ? 'currently deepening' : analytics.trend === 'weakening' ? 'showing signs of distance' : 'holding steady';
                  const influencePhrase = (() => {
                    const inf = analytics.character_influence_on_user ?? 0;
                    if (inf >= 75) return `${firstName}'s influence on your decisions and outlook is significant`;
                    if (inf >= 50) return `${firstName} has a meaningful influence on how you think and act`;
                    return `${firstName}'s presence in your story is noted but not dominant`;
                  })();
                  const durationPhrase = (() => {
                    const days = analytics.relationship_duration_days ?? 0;
                    if (days >= 1095) return `over ${Math.floor(days / 365)} years`;
                    if (days >= 365) return 'over a year';
                    if (days >= 90) return 'several months';
                    return 'a few months';
                  })();
                  const relationshipSentence = `${firstName} is ${phaseLabel} — ${trendPhrase} after ${durationPhrase} together. ${influencePhrase}.`;

                  // ── 2. Why This Person Matters ────────────────────────────
                  const whyMatters: string[] = [];
                  if ((analytics.character_influence_on_user ?? 0) >= 70) whyMatters.push(`High influence — ${firstName} consistently shapes how you think and the decisions you make`);
                  if ((analytics.closeness_score ?? 0) >= 75) whyMatters.push(`Deep closeness — this is one of your most connected relationships`);
                  if ((analytics.shared_experiences ?? 0) >= 10) whyMatters.push(`${analytics.shared_experiences} shared experiences — a relationship built through real moments`);
                  if (analytics.trend === 'deepening') whyMatters.push(`This relationship is actively growing stronger`);
                  if ((analytics.support_score ?? 0) >= 70) whyMatters.push(`High support score — ${firstName} shows up when it matters`);
                  if ((analytics.trust_score ?? 0) >= 80) whyMatters.push(`Exceptional trust — rare at this level`);
                  if (dynamics?.lifecycle?.current_stage === 'deepening') whyMatters.push(`Currently in the deepening stage of relationship development`);
                  // Add influence insights if loaded
                  if (influenceInsights?.length) {
                    influenceInsights.slice(0, 2).forEach(i => {
                      if (i.type === 'positive_influence' || i.type === 'uplifting_person') whyMatters.push(i.message);
                    });
                  }

                  // ── Score → plain-language reason helpers ──────────────
                  const closenessWhy = analytics.closeness_score >= 80
                    ? `${analytics.shared_experiences ?? 0} shared experiences + consistently high emotional depth in conversations`
                    : analytics.closeness_score >= 55
                    ? `Regular contact and moderate emotional engagement across ${analytics.shared_experiences ?? 0} memories`
                    : `Still building — fewer shared moments recorded so far`;
                  const importanceWhy = analytics.importance_score >= 80
                    ? `${firstName} appears during pivotal moments — career decisions, personal milestones, and major transitions`
                    : analytics.importance_score >= 55
                    ? `Steady presence across multiple areas of your life over time`
                    : `Mentioned occasionally — not yet a central figure in your story`;
                  const priorityWhy = analytics.priority_score >= 70
                    ? `High closeness + recent activity signals this relationship deserves active attention now`
                    : analytics.priority_score >= 45
                    ? `Moderate engagement — worth maintaining but not urgent`
                    : `Low recent activity — this relationship may need re-engagement`;
                  const engagementWhy = analytics.engagement_score >= 70
                    ? `Frequent, consistent interactions over the last 90 days`
                    : analytics.engagement_score >= 45
                    ? `Moderate interaction — you stay in touch but not constantly`
                    : `Infrequent contact recently — engagement has tapered off`;
                  const trustWhy = analytics.trust_score >= 80
                    ? `High trust — you share personal information and rely on ${firstName} for important decisions`
                    : analytics.trust_score >= 55
                    ? `Moderate trust — you confide in ${firstName} on some things but not everything`
                    : `Trust is still developing with ${firstName}`;
                  const supportWhy = analytics.support_score >= 70
                    ? `${firstName} shows up for you — emotionally present during difficult periods`
                    : analytics.support_score >= 45
                    ? `${firstName} is supportive when needed, though not always available`
                    : `Limited support patterns recorded between you`;
                  const conflictWhy = analytics.conflict_score >= 50
                    ? `Conflict is notable — disagreements or tension appear regularly in your entries`
                    : analytics.conflict_score >= 25
                    ? `Occasional friction, but generally manageable`
                    : `Low conflict — this relationship is largely harmonious`;

                  // ── "Why this matters" bullet colors by content type ────
                  const whyColors = [
                    'border-violet-500/30 bg-violet-950/20 text-violet-300',
                    'border-emerald-500/30 bg-emerald-950/20 text-emerald-300',
                    'border-amber-500/30 bg-amber-950/20 text-amber-300',
                    'border-cyan-500/30 bg-cyan-950/20 text-cyan-300',
                    'border-rose-500/30 bg-rose-950/20 text-rose-300',
                  ];

                  return (
                    <>
                      {/* ── Relationship sentence — hero card ── */}
                      <div className="relative p-5 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/12 via-purple-900/15 to-primary/8 overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                        <p className="text-[10px] font-semibold text-primary/60 uppercase tracking-widest mb-2">Relationship Summary</p>
                        <p className="text-sm sm:text-base text-white/90 leading-relaxed relative z-10">{relationshipSentence}</p>
                      </div>

                      {/* ── Why this person matters — color-coded bullets ── */}
                      {whyMatters.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2.5">Why {firstName} Matters</p>
                          <div className="space-y-1.5">
                            {whyMatters.slice(0, 5).map((reason, i) => (
                              <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${whyColors[i % whyColors.length]}`}>
                                <div className="h-1.5 w-1.5 rounded-full bg-current mt-1.5 flex-shrink-0 opacity-80" />
                                <p className="text-xs sm:text-sm text-white/85 leading-snug">{reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Full analytics ── */}
                      <div className="pt-1">
                        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3">Signal Breakdown</p>

                      <Card className="bg-black/20 border border-white/8">
                      <CardContent className="space-y-6 p-4 sm:p-5">
                        {/* Key Metrics Grid — 4 colored cards with "why" */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Closeness', value: analytics.closeness_score, unit: '%', color: 'from-pink-500/25 to-pink-900/20', border: 'border-pink-500/35', text: 'text-pink-300', why: closenessWhy },
                            { label: 'Importance', value: analytics.importance_score, unit: '%', color: 'from-amber-500/25 to-amber-900/20', border: 'border-amber-500/35', text: 'text-amber-300', why: importanceWhy },
                            { label: 'Priority', value: analytics.priority_score, unit: '%', color: 'from-emerald-500/25 to-emerald-900/20', border: 'border-emerald-500/35', text: 'text-emerald-300', why: priorityWhy },
                            { label: 'Engagement', value: analytics.engagement_score, unit: '%', color: 'from-sky-500/25 to-sky-900/20', border: 'border-sky-500/35', text: 'text-sky-300', why: engagementWhy },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border ${m.border} bg-gradient-to-br ${m.color} p-3 sm:p-4`}>
                              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">{m.label}</p>
                              <p className={`text-2xl sm:text-3xl font-bold ${m.text} mb-1.5`}>{m.value}{m.unit}</p>
                              <p className="text-[10px] text-white/45 leading-snug">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* Depth + Frequency compact bars */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Depth', value: analytics.relationship_depth, color: 'bg-purple-500', text: 'text-purple-300', bg: 'bg-purple-950/20 border-purple-500/25', why: `${analytics.shared_experiences} shared experiences recorded — emotional depth derived from conversation patterns` },
                            { label: 'Frequency', value: analytics.interaction_frequency, color: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-950/20 border-sky-500/25', why: `Based on mentions and contact events in the last 90 days` },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border p-3 sm:p-4 ${m.bg}`}>
                              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">{m.label}</p>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.value}%` }} />
                                </div>
                                <span className={`text-sm font-bold tabular-nums ${m.text}`}>{m.value}%</span>
                              </div>
                              <p className="text-[10px] text-white/40 leading-snug">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* ── 7. Bidirectional Influence Bar ───────────── */}
                        <div className="p-4 rounded-xl border border-white/10 bg-white/4 space-y-3">
                          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Influence Dynamic</p>
                          <div className="space-y-3">
                            {/* Their influence on you */}
                            <div>
                              <div className="flex justify-between text-xs text-white/45 mb-1">
                                <span>{shortDisplayName(editedCharacter.name)}&apos;s influence on you</span>
                                <span className="font-semibold text-white/70">{analytics.character_influence_on_user}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-violet-500 rounded-full"
                                    style={{ width: `${analytics.character_influence_on_user}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-white/30 w-6">←</span>
                              </div>
                            </div>
                            {/* Your influence on them */}
                            <div>
                              <div className="flex justify-between text-xs text-white/45 mb-1">
                                <span>Your influence on {shortDisplayName(editedCharacter.name)}</span>
                                <span className="font-semibold text-white/70">{analytics.user_influence_over_character}%</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-white/8 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-cyan-500 rounded-full"
                                    style={{ width: `${analytics.user_influence_over_character}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-white/30 w-6">→</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-white/25 leading-snug">
                            {analytics.character_influence_on_user > analytics.user_influence_over_character + 15
                              ? `${shortDisplayName(editedCharacter.name)} has more influence over you than you have over them — this relationship shapes you significantly.`
                              : analytics.user_influence_over_character > analytics.character_influence_on_user + 15
                              ? `You have more influence in this relationship than ${shortDisplayName(editedCharacter.name)} does.`
                              : 'Balanced influence — this relationship is roughly reciprocal.'}
                          </p>
                        </div>

                        {/* Social + Additional signals — compact 2-col grid with "why" */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Sentiment',  value: `${analytics.sentiment_score > 0 ? '+' : ''}${analytics.sentiment_score}`, pct: Math.max(0, Math.min(100, analytics.sentiment_score + 50)), color: 'from-green-500/20 to-green-900/15', border: 'border-green-500/30', text: analytics.sentiment_score >= 0 ? 'text-green-300' : 'text-red-300', bar: analytics.sentiment_score >= 0 ? 'bg-green-500' : 'bg-red-500', why: trustWhy },
                            { label: 'Trust',      value: `${analytics.trust_score}%`,  pct: analytics.trust_score,    color: 'from-blue-500/20 to-blue-900/15',    border: 'border-blue-500/30',    text: 'text-blue-300',    bar: 'bg-blue-500',    why: trustWhy },
                            { label: 'Support',    value: `${analytics.support_score}%`, pct: analytics.support_score,  color: 'from-teal-500/20 to-teal-900/15',    border: 'border-teal-500/30',    text: 'text-teal-300',    bar: 'bg-teal-500',    why: supportWhy },
                            { label: 'Conflict',   value: `${analytics.conflict_score}%`, pct: analytics.conflict_score, color: 'from-red-500/20 to-red-900/15',      border: 'border-red-500/30',     text: 'text-red-300',     bar: 'bg-red-500',     why: conflictWhy },
                            { label: 'Value',      value: `${analytics.value_score}%`,   pct: analytics.value_score,    color: 'from-amber-500/20 to-amber-900/15',  border: 'border-amber-500/30',   text: 'text-amber-300',   bar: 'bg-amber-500',   why: `How much ${firstName} enriches your life beyond just frequency of contact` },
                            { label: 'Activity',   value: `${analytics.activity_level}%`, pct: analytics.activity_level, color: 'from-violet-500/20 to-violet-900/15', border: 'border-violet-500/30', text: 'text-violet-300',  bar: 'bg-violet-500',  why: `How active this relationship has been recently across conversations and entries` },
                          ].map(m => (
                            <div key={m.label} className={`rounded-xl border ${m.border} bg-gradient-to-br ${m.color} p-3`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{m.label}</p>
                                <p className={`text-sm font-bold tabular-nums ${m.text}`}>{m.value}</p>
                              </div>
                              <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1.5">
                                <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.pct}%` }} />
                              </div>
                              <p className="text-[9px] text-white/35 leading-snug line-clamp-2">{m.why}</p>
                            </div>
                          ))}
                        </div>

                        {/* Trend — compact pill */}
                        <div className={`rounded-xl border p-3 flex items-center gap-3 ${
                          analytics.trend === 'deepening' ? 'border-emerald-500/30 bg-emerald-950/20' :
                          analytics.trend === 'weakening' ? 'border-red-500/30 bg-red-950/20' :
                          'border-white/10 bg-white/5'
                        }`}>
                          <div className={`flex items-center gap-1.5 text-sm font-semibold ${
                            analytics.trend === 'deepening' ? 'text-emerald-300' :
                            analytics.trend === 'weakening' ? 'text-red-300' : 'text-white/60'
                          }`}>
                            {analytics.trend === 'deepening' && <TrendingUp className="h-4 w-4" />}
                            {analytics.trend === 'weakening' && <TrendingDown className="h-4 w-4" />}
                            {analytics.trend === 'stable' && <Minus className="h-4 w-4" />}
                            <span className="capitalize">{analytics.trend}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/50 leading-snug">
                              {analytics.trend === 'deepening'
                                ? `This relationship is growing stronger — interaction quality and frequency are both increasing`
                                : analytics.trend === 'weakening'
                                ? `Signs of distance — contact has reduced and emotional intensity is lower than historical average`
                                : `This relationship has held consistent — no major shifts in either direction`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[10px] text-white/30">Known for</p>
                            <p className="text-sm font-bold text-indigo-300">{analytics.relationship_duration_days}d</p>
                          </div>
                        </div>

                        {/* SWOT Analysis */}
                        {((analytics.strengths?.length ?? 0) > 0 ||
                          (analytics.weaknesses?.length ?? 0) > 0 ||
                          (analytics.opportunities?.length ?? 0) > 0 ||
                          (analytics.risks?.length ?? 0) > 0) && (
                          <div>
                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                              <Lightbulb className="h-5 w-5 text-yellow-400" />
                              SWOT Analysis
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                              {analytics.strengths && analytics.strengths.length > 0 && (
                                <Card className="bg-gradient-to-br from-green-500/20 via-green-600/15 to-green-500/20 border-2 border-green-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-green-300 mb-3 flex items-center gap-2">
                                      <Zap className="h-4 w-4" />
                                      Strengths
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.strengths.map((strength, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-green-400 mt-1">•</span>
                                          <span>{strength}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.weaknesses && analytics.weaknesses.length > 0 && (
                                <Card className="bg-gradient-to-br from-red-500/20 via-red-600/15 to-red-500/20 border-2 border-red-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-red-300 mb-3 flex items-center gap-2">
                                      <AlertCircle className="h-4 w-4" />
                                      Weaknesses
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.weaknesses.map((weakness, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-red-400 mt-1">•</span>
                                          <span>{weakness}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.opportunities && analytics.opportunities.length > 0 && (
                                <Card className="bg-gradient-to-br from-blue-500/20 via-blue-600/15 to-blue-500/20 border-2 border-blue-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-blue-300 mb-3 flex items-center gap-2">
                                      <Star className="h-4 w-4" />
                                      Opportunities
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.opportunities.map((opp, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-blue-400 mt-1">•</span>
                                          <span>{opp}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                              )}
                              {analytics.risks && analytics.risks.length > 0 && (
                                <Card className="bg-gradient-to-br from-orange-500/20 via-orange-600/15 to-orange-500/20 border-2 border-orange-500/40 shadow-lg">
                                  <CardContent className="p-5">
                                    <div className="text-base font-bold text-orange-300 mb-3 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4" />
                                      Risks
                                    </div>
                                    <ul className="space-y-2">
                                      {analytics.risks.map((risk, i) => (
                                        <li key={i} className="text-sm text-white/90 flex items-start gap-2">
                                          <span className="text-orange-400 mt-1">•</span>
                                          <span>{risk}</span>
                                        </li>
                                  ))}
                                </ul>
                                  </CardContent>
                                </Card>
                            )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  </>
                  );
                })()}
              </div>
            )}

            {/* ── Intelligence Chat — in-modal launchpad (leave only on CTA) ── */}
            {!loadingDetails && activeTab === 'chat' && (
              <div
                className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-8 text-center space-y-4"
                data-testid="character-intelligence-chat-panel"
              >
                <MessageSquare className="h-10 w-10 mx-auto text-violet-300/70" />
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-white">
                    Chat about {shortDisplayName(editedCharacter.name)}
                  </h3>
                  <p className="text-sm text-white/50 max-w-md mx-auto">
                    Stay in this profile to keep browsing tabs. When you&apos;re ready, open main chat
                    with their focus chip — full thread, memory, and composer live there.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:gap-2 max-w-lg mx-auto text-left">
                  {[
                    `What do you know about ${editedCharacter.name}?`,
                    `How has my relationship with ${editedCharacter.name} changed?`,
                    `I need to talk about what happened with ${editedCharacter.name}.`,
                    `What should I know before I see ${editedCharacter.name} next?`,
                  ].map((starter) => (
                    <button
                      type="button"
                      key={starter}
                      onClick={() => askInChat(starter)}
                      className="text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-violet-500/20 bg-black/40 hover:bg-violet-950/25 hover:border-violet-500/40 transition-colors text-xs sm:text-sm text-white/70 hover:text-white/90 break-words"
                    >
                      &ldquo;{starter}&rdquo;
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => askInChat('')}
                  className="inline-flex items-center justify-center gap-2 mx-auto px-4 py-2.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/35 text-violet-100 hover:text-violet-50 text-xs sm:text-sm font-medium transition-colors"
                  data-testid="character-open-main-chat"
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  Open main chat
                </button>
              </div>
            )}

            {/* Metadata Tab */}
            {/* Legacy Relationship Intelligence body kept out of Chat — lives under Insights when loaded. */}
            {false && !loadingDetails && activeTab === 'chat' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Relationship Intelligence
                  </h3>
                  <p className="text-xs text-white/45 mt-1">
                    Why does {shortDisplayName(editedCharacter.name)} matter? How have they shaped you?
                  </p>
                </div>

                {(dynamicsLoading || influenceLoading) && (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!dynamicsLoading && !influenceLoading && (
                  <>
                    {/* ── Influence Profile ── */}
                    {influenceProfile && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Influence on Your Life</h4>
                        <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-950/10 space-y-4">
                          {/* Net influence gauge */}
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex justify-between text-xs text-white/50 mb-1">
                                <span>Net Influence</span>
                                <span className="font-semibold text-yellow-300">{Math.round((influenceProfile.net_influence ?? 0) * 100)}%</span>
                              </div>
                              <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 rounded-full" style={{ width: `${Math.round((influenceProfile.net_influence ?? 0) * 100)}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* Impact grid */}
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Emotional Impact', val: influenceProfile.emotional_impact, color: 'text-pink-300', bg: 'bg-pink-500' },
                              { label: 'Behavioral Impact', val: influenceProfile.behavioral_impact, color: 'text-blue-300', bg: 'bg-blue-500' },
                              { label: 'Uplift Score', val: influenceProfile.uplift_score, color: 'text-emerald-300', bg: 'bg-emerald-500' },
                              { label: 'Toxicity Score', val: influenceProfile.toxicity_score, color: 'text-red-300', bg: 'bg-red-500', invert: true },
                            ].map(({ label, val, color, bg, invert }) => {
                              const pct = Math.round(Math.abs(val ?? 0) * 100);
                              const display = invert ? 100 - pct : pct;
                              return (
                                <div key={label} className="p-2.5 rounded-lg bg-white/5 border border-white/8">
                                  <p className="text-[10px] text-white/40 mb-1">{label}</p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                                      <div className={`h-full ${bg}/60 rounded-full`} style={{ width: `${display}%` }} />
                                    </div>
                                    <span className={`text-xs font-semibold ${color}`}>{pct}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Interaction count */}
                          {influenceProfile.interaction_count > 0 && (
                            <p className="text-[10px] text-white/30 pt-1 border-t border-white/8">
                              Based on {influenceProfile.interaction_count} recorded interactions
                            </p>
                          )}
                        </div>

                        {/* Influence insights */}
                        {influenceInsights.length > 0 && (
                          <div className="space-y-2">
                            {influenceInsights.slice(0, 4).map((insight: any, i: number) => {
                              const insightColors: Record<string, string> = {
                                positive_influence:      'border-emerald-500/25 bg-emerald-950/15 text-emerald-300',
                                uplifting_person:        'border-emerald-500/20 bg-emerald-950/10 text-emerald-200',
                                toxic_pattern:           'border-red-500/25 bg-red-950/15 text-red-300',
                                behavior_shift_detected: 'border-blue-500/25 bg-blue-950/15 text-blue-300',
                                dominant_influence:      'border-yellow-500/25 bg-yellow-950/15 text-yellow-300',
                                high_risk_person:        'border-orange-500/25 bg-orange-950/15 text-orange-300',
                              };
                              const cls = insightColors[insight.type] ?? 'border-white/10 bg-white/5 text-white/70';
                              return (
                                <div key={i} className={`p-3 rounded-lg border ${cls}`}>
                                  <p className="text-xs leading-relaxed">{insight.message}</p>
                                  {insight.confidence && (
                                    <p className="text-[10px] opacity-50 mt-1">{formatEpistemicPercent(insight.confidence)}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Relationship Dynamics ── */}
                    {dynamics && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Relationship Dynamics</h4>

                        {/* Health score */}
                        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-white/40">Relationship Health</p>
                              <p className="text-xl font-bold text-white mt-0.5">
                                {dynamics.health?.health_score ?? 0}
                                <span className="text-xs text-white/40 font-normal ml-1">/100</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold capitalize ${
                                dynamics.health?.overall_health === 'excellent' ? 'text-emerald-400' :
                                dynamics.health?.overall_health === 'good' ? 'text-green-400' :
                                dynamics.health?.overall_health === 'fair' ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>{dynamics.health?.overall_health ?? 'unknown'}</p>
                              {dynamics.health?.trends?.health_trend && (
                                <p className="text-[10px] text-white/40 mt-0.5 capitalize">{dynamics.health.trends.health_trend}</p>
                              )}
                            </div>
                          </div>

                          {/* Health factor bars */}
                          {dynamics.health?.factors && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/8">
                              {Object.entries(dynamics.health.factors as Record<string, number>).map(([key, val]) => (
                                <div key={key}>
                                  <div className="flex justify-between text-[10px] text-white/35 mb-0.5">
                                    <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                                    <span>{Math.round(val)}</span>
                                  </div>
                                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${val}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Stage progression */}
                        {dynamics.lifecycle?.stage_history?.length > 0 && (
                          <div className="p-3 rounded-xl border border-white/10 bg-white/5">
                            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Stage Progression</p>
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                              {(dynamics.lifecycle.stage_history as any[]).map((s: any, i: number) => (
                                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                                  <div className={`px-2 py-1 rounded text-[10px] font-medium ${
                                    i === dynamics.lifecycle.stage_history.length - 1
                                      ? 'bg-primary/20 text-primary border border-primary/30'
                                      : 'bg-white/5 text-white/40'
                                  }`}>
                                    <span className="capitalize">{s.stage}</span>
                                    {s.start_date && (
                                      <span className="ml-1 opacity-50 hidden sm:inline">
                                        {new Date(s.start_date).getFullYear()}
                                      </span>
                                    )}
                                  </div>
                                  {i < dynamics.lifecycle.stage_history.length - 1 && (
                                    <span className="text-white/20 text-xs">→</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Metrics row */}
                        {dynamics.metrics && (
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: 'Freq / mo', val: dynamics.metrics.interaction_frequency?.toFixed(1) },
                              { label: 'Sentiment', val: `${Math.round((dynamics.metrics.average_sentiment ?? 0) * 100)}%` },
                              { label: 'Positive', val: `${Math.round((dynamics.metrics.positive_ratio ?? 0) * 100)}%` },
                            ].map(({ label, val }) => (
                              <div key={label} className="p-2 rounded-lg bg-white/5 border border-white/8 text-center">
                                <p className="text-[10px] text-white/35">{label}</p>
                                <p className="text-sm font-semibold text-white/85 mt-0.5">{val ?? '—'}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Strengths + concerns */}
                        {(dynamics.health?.strengths?.length > 0 || dynamics.health?.concerns?.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {dynamics.health.strengths?.length > 0 && (
                              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10">
                                <p className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider mb-1.5">Strengths</p>
                                <ul className="space-y-1">
                                  {dynamics.health.strengths.map((s: string, i: number) => (
                                    <li key={i} className="text-xs text-white/70 flex items-start gap-1.5">
                                      <span className="text-emerald-400 mt-0.5">•</span>{s}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {dynamics.health?.concerns?.length > 0 && (
                              <div className="p-3 rounded-lg border border-orange-500/20 bg-orange-950/10">
                                <p className="text-[10px] font-semibold text-orange-400/70 uppercase tracking-wider mb-1.5">Concerns</p>
                                <ul className="space-y-1">
                                  {dynamics.health.concerns.map((c: string, i: number) => (
                                    <li key={i} className="text-xs text-white/70 flex items-start gap-1.5">
                                      <span className="text-orange-400 mt-0.5">•</span>{c}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Common topics */}
                        {dynamics.common_topics?.length > 0 && (
                          <div>
                            <p className="text-[10px] text-white/35 mb-1.5">Topics you discuss together</p>
                            <div className="flex flex-wrap gap-1.5">
                              {dynamics.common_topics.map((t: string) => (
                                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/50 bg-white/5">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!influenceProfile && !dynamics && (
                      <InsufficientData
                        icon={Zap}
                        accent="yellow"
                        title={`Still learning about ${shortDisplayName(editedCharacter.name)}`}
                        description={`LoreBook builds relationship intelligence — influence, health, and dynamics — from your entries over time. A few more mentions of ${shortDisplayName(editedCharacter.name)} will fill this in.`}
                        action={{
                          label: `Tell LoreBook about ${shortDisplayName(editedCharacter.name)}`,
                          icon: MessageSquare,
                          onClick: () => askInChat(`Here's what's going on with ${editedCharacter.name}: `),
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Entity Knowledge Base ── */}
            {!loadingDetails && activeTab === 'knowledge' && (
              <CharacterKnowledgeBase
                characterId={character.id}
                characterName={editedCharacter.name}
                character={editedCharacter as Character}
                mockMode={isMockDataEnabled}
                active={activeTab === 'knowledge'}
                initialData={profileBundle?.knowledgeBase}
                skipFetch={Boolean(profileBundle?.knowledgeBase)}
                chatMentions={profileBundle?.chatMentions}
                onAskInChat={askInChat}
                onOpenThread={handleOpenThread}
              />
            )}

            {!loadingDetails && activeTab === 'evidence' && (
              <CharacterEvidenceLocker
                characterId={character.id}
                characterName={editedCharacter.name}
                mockMode={isMockDataEnabled}
                active={activeTab === 'evidence'}
              />
            )}

            {!loadingDetails && activeTab === 'photos' && (
              <CharacterMediaPanel
                characterId={character.id}
                characterName={editedCharacter.name}
                kind="photo"
              />
            )}

            {!loadingDetails && activeTab === 'messages' && (
              <CharacterMediaPanel
                characterId={character.id}
                characterName={editedCharacter.name}
                kind="message"
              />
            )}

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

        <EntityModalBottomNav
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Character sections"
          breakpoint="md"
          dangerAction={
            canDeleteCharacter
              ? {
                  label: 'Archive',
                  icon: Trash2,
                  active: deleteStep !== null,
                  onClick: () => {
                    setDeleteStep('warn');
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  },
                }
              : undefined
          }
        />
        </div>


      </div>

      {deleteStep && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/25 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                {deleteStep === 'warn' ? (
                  <>
                    <h3 className="text-lg font-semibold text-white">Archive {displayName}?</h3>
                    <p className="text-sm text-white/60 mt-1">
                      This hides their card from your Character Book but keeps their knowledge, facts, and conversation links in your database. Use Rescan conversations to restore them if needed.
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="block text-xs font-medium text-white/70">
                        Why are you removing this card?
                      </label>
                      <select
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                        value={deleteReason}
                        onChange={(event) => setDeleteReason(event.target.value)}
                        aria-label="Why are you removing this card?"
                      >
                        <option value="wrong_person_or_not_real">Wrong character, not real, or hallucinated</option>
                        <option value="not_relevant_to_my_life">Not relevant to my life</option>
                        <option value="no_romantic_interest">No romantic interest whatsoever</option>
                        <option value="duplicate_or_should_merge">Duplicate or should be merged elsewhere</option>
                        <option value="belongs_to_another_domain">Belongs in another book, not Character Book</option>
                        <option value="privacy_cleanup">Privacy cleanup</option>
                        <option value="other">Other</option>
                      </select>
                      <Textarea
                        className="min-h-[72px] bg-black/40 border-white/10 text-white"
                        value={deleteReasonNote}
                        onChange={(event) => setDeleteReasonNote(event.target.value)}
                        placeholder="Optional note for LoreBook to learn from this correction"
                      />
                    </div>
                    <p className="text-xs text-white/45 mt-2">
                      Step 1 of 2 — type the character name to confirm.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-white">Type the name to confirm</h3>
                    <p className="text-sm text-white/60 mt-1">
                      Enter <span className="font-mono text-amber-200">{displayName}</span> to archive this character.
                    </p>
                    <Input
                      className="mt-3 bg-black/40 border-red-500/20"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={displayName}
                      autoFocus
                    />
                  </>
                )}
              </div>
            </div>
            {deleteError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetDeleteFlow} disabled={deleteBusy}>
                Cancel
              </Button>
              {deleteStep === 'warn' ? (
                <Button
                  onClick={() => setDeleteStep('type')}
                  className="bg-red-500/15 hover:bg-red-500/25 text-red-100 border border-red-500/30"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={() => void archiveCharacter()}
                  disabled={deleteBusy || deleteConfirmText.trim() !== displayName}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30 disabled:opacity-40"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  {deleteBusy ? 'Archiving...' : 'Archive character'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
      {/* Organization Detail Modal */}
      {selectedOrganization && (
        <OrganizationDetailModal
          organization={selectedOrganization}
          onClose={() => setSelectedOrganization(null)}
          onUpdate={() => {
            // Refresh if needed
          }}
        />
      )}

      {/* Character Detail Modal (for nested characters) */}
      {selectedCharacterForModal && (
        <CharacterDetailModal
          character={selectedCharacterForModal}
          onClose={() => setSelectedCharacterForModal(null)}
          onUpdate={() => {
            // Refresh if needed
          }}
        />
      )}

      {/* Family-tree relationship editor (this character's tree) */}
      {familyEditing.editorMember && (
        <RelationshipEditor
          member={familyEditing.editorMember}
          members={[]}
          onSave={(edit) => familyEditing.saveRelationship(familyEditing.editorMember!, edit)}
          onClose={() => familyEditing.setEditorMember(null)}
        />
      )}
      <familyEditing.ToastContainer />

      {/* Location Detail Modal */}
      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}

      {/* Perception Detail Modal */}
      {selectedPerception && (
        <PerceptionDetailModal
          perception={selectedPerception}
          onClose={() => setSelectedPerception(null)}
          onUpdate={(updated) => {
            setSelectedPerception(updated);
          }}
        />
      )}
    </div>
  );
};
