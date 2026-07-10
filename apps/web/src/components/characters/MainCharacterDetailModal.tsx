import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Star,
  Sparkles,
  BookOpen,
  Users,
  Clock,
  Brain,
  MessageSquare,
  ChevronRight,
  Tag,
  Briefcase,
  DollarSign,
  Activity,
  Smile,
  Heart as HeartIcon,
  Home,
  MapPin,
  Target,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CharacterAvatar } from './CharacterAvatar';
import { CharacterDetailModal } from './CharacterDetailModal';
import { CharacterTitleSection } from './CharacterTitleSection';
import { CharacterTimelinePanel } from './CharacterTimelinePanel';
import { CharacterKnowledgeBase, type CharacterKnowledgeBaseData } from './CharacterKnowledgeBase';
import { CharacterMediaPanel } from './CharacterMediaPanel';
import type { Character } from './CharacterProfileCard';
import { OnboardingProfileSection, type OnboardingProfile } from './OnboardingProfileSection';
import { useMainCharacterProfile } from '../../hooks/useMainCharacterProfile';
import { selfCharacterApi } from '../../api/selfCharacter';
import { getMainCharacterDisplayName, getSelfProfileRoleTagline, personalizeSelfSummary } from '../../lib/characterDisplay';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { format, parseISO } from 'date-fns';
import { fetchJson } from '../../lib/api';

type Props = {
  character: Character;
  user?: {
    user_metadata?: Record<string, unknown>;
    email?: string | null;
  } | null;
  onClose: () => void;
  onUpdate?: () => void;
};

const MAIN_CHARACTER_TABS = [
  { value: 'story', label: 'Your Story', shortLabel: 'Story', icon: BookOpen },
  { value: 'people', label: 'Your People', shortLabel: 'People', icon: Users },
  { value: 'timeline', label: 'Timeline', shortLabel: 'Time', icon: Clock },
  { value: 'lore', label: 'What Lore Knows', shortLabel: 'Lore', icon: Brain },
  { value: 'photos', label: 'Your Photos', shortLabel: 'Photos', icon: ImageIcon },
  { value: 'memories', label: 'Memories', shortLabel: 'Mem', icon: Sparkles },
  { value: 'chat', label: 'Talk to Lore', shortLabel: 'Chat', icon: MessageSquare },
] as const;

type MainTab = (typeof MAIN_CHARACTER_TABS)[number]['value'];

const PILLAR_GROUPS: Array<{ title: string; icon: typeof Home; types: string[] }> = [
  { title: 'Where you are', icon: MapPin, types: ['living_situation', 'location', 'hometown'] },
  { title: 'What you do', icon: Briefcase, types: ['occupation', 'workplace', 'employment_status', 'skill'] },
  { title: 'Who you are', icon: Smile, types: ['personality_trait', 'relationship_status', 'lifestyle_pattern'] },
  { title: 'What drives you', icon: Target, types: ['core_value', 'goal', 'career_goal', 'financial_status'] },
];

const getAttributeIcon = (type: string) => {
  switch (type) {
    case 'employment_status':
    case 'occupation':
    case 'workplace':
      return <Briefcase className="h-3 w-3" />;
    case 'financial_status':
      return <DollarSign className="h-3 w-3" />;
    case 'lifestyle_pattern':
      return <Activity className="h-3 w-3" />;
    case 'personality_trait':
      return <Smile className="h-3 w-3" />;
    case 'relationship_status':
      return <HeartIcon className="h-3 w-3" />;
    case 'living_situation':
      return <Home className="h-3 w-3" />;
    default:
      return <Tag className="h-3 w-3" />;
  }
};

const getAttributeColor = (type: string) => {
  switch (type) {
    case 'employment_status':
    case 'occupation':
    case 'workplace':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'financial_status':
      return 'bg-green-500/20 text-green-300 border-green-500/30';
    case 'lifestyle_pattern':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'personality_trait':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    case 'relationship_status':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    case 'living_situation':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
    default:
      return 'bg-white/10 text-white/60 border-white/20';
  }
};

function formatRelationshipType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMemoryDate(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

/**
 * Dedicated protagonist modal — visually and structurally distinct from CharacterDetailModal.
 */
export const MainCharacterDetailModal = ({ character, user, onClose, onUpdate }: Props) => {
  const [activeTab, setActiveTab] = useState<MainTab>('story');
  const [selectedConnection, setSelectedConnection] = useState<Character | null>(null);
  const profile = useMainCharacterProfile(character);

  // Local editable state for solidifying self identity in this modal
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editMiddle, setEditMiddle] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [newEditAlias, setNewEditAlias] = useState('');

  const displayName = getMainCharacterDisplayName(profile.character, user);
  const isYouName = /^you$/i.test(displayName.trim());
  const roleLine = getSelfProfileRoleTagline(profile.roleTagline || profile.character.role);

  // Sync editable identity fields when profile updates (for rendering and editing)
  useEffect(() => {
    const ch = profile.character || {};
    setEditFirst(ch.first_name || '');
    setEditMiddle((ch.metadata?.middle_name as string) || ch.middle_name || '');
    setEditLast(ch.last_name || '');
    setEditOccupation(ch.role || '');
    setEditAliases(ch.alias || []);
  }, [profile.character]);

  const avatarUrl =
    profile.character.avatar_url ||
    (user?.user_metadata?.custom_avatar_url as string | undefined) ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    null;

  const heroSummary = personalizeSelfSummary(
    profile.wittyTagline || profile.profileSummary || profile.character.summary,
  );

  const sortedRelationships = useMemo(
    () =>
      [...profile.relationships].sort(
        (a, b) => (b.closeness_score ?? 0) - (a.closeness_score ?? 0),
      ),
    [profile.relationships],
  );

  const statItems = [
    {
      label: 'Your messages',
      shortLabel: 'Messages',
      value: profile.stats?.messageCount ?? profile.character.message_count ?? 0,
    },
    {
      label: 'Your memories',
      shortLabel: 'Memories',
      value: profile.character.memory_count ?? profile.memories.length,
    },
    {
      label: 'Your people',
      shortLabel: 'People',
      value: profile.character.relationship_count ?? sortedRelationships.length,
    },
    {
      label: 'Facts about you',
      shortLabel: 'Facts',
      value: profile.stats?.factCount ?? profile.facts.length,
    },
  ];

  const openSelfChat = (initialPrompt?: string) => {
    openChatWithFocus({
      entityId: profile.character.id,
      entityName: isYouName ? 'You' : displayName,
      entityType: 'character',
      sourceSurface: 'characters',
      sourceLabel: 'Your profile',
      knowledgeScope: 'your personal profile',
      initialPrompt,
    });
    onClose();
  };

  const saveIdentityEdits = async () => {
    if (!profile.character?.id) return;
    try {
      await fetchJson(`/api/characters/${profile.character.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editFirst.trim() || undefined,
          middleName: editMiddle.trim() || undefined,
          lastName: editLast.trim() || undefined,
          role: editOccupation.trim() || undefined,
          alias: editAliases.filter(Boolean),
          metadata: {
            ...(profile.character.metadata || {}),
            middle_name: editMiddle.trim() || null,
            occupation_source: 'user_confirmed',
          },
        }),
      });
      await profile.reload();
      setEditingIdentity(false);
      onUpdate?.();
      // Bring everything together: solidify identity across lore, continuity, knowledge
      await selfCharacterApi.repairIdentity().catch(() => {});
    } catch (e) {
      console.error('Failed to save self identity edits', e);
      alert('Could not save changes. Please try again.');
    }
  };

  const cancelIdentityEdits = () => {
    setEditingIdentity(false);
    // reset from current profile
    const ch = profile.character || {};
    setEditFirst(ch.first_name || '');
    setEditMiddle((ch.metadata?.middle_name as string) || ch.middle_name || '');
    setEditLast(ch.last_name || '');
    setEditOccupation(ch.role || '');
    setEditAliases(ch.alias || []);
  };

  const addEditAlias = (val?: string) => {
    const v = val !== undefined ? val : newEditAlias;
    const trimmed = v.trim();
    if (trimmed && !editAliases.includes(trimmed)) {
      setEditAliases([...editAliases, trimmed]);
      setNewEditAlias('');
    }
  };

  const removeEditAlias = (val: string) => {
    setEditAliases(editAliases.filter(a => a !== val));
  };

  const knowledgeInitialData = useMemo((): Partial<CharacterKnowledgeBaseData> => ({
      characterId: profile.character.id,
      name: displayName,
      summary: profile.profileSummary,
      facts: profile.facts,
      knowledgeClaims: profile.knowledgeClaims as CharacterKnowledgeBaseData['knowledgeClaims'],
      profile: {
        relationshipToUser: null,
        memoryCount: profile.memories.length,
        timelineEventCount: 0,
        timelineEvents: [],
      },
      intelligence: {
        totalEvidenceItems:
          profile.facts.length + profile.knowledgeClaims.length + profile.attributes.length,
        lastUpdated: profile.stats?.lastSyncedAt ?? null,
        learningScore: Math.min(
          100,
          profile.facts.length * 8 + profile.knowledgeClaims.length * 12 + profile.attributes.length * 4,
        ),
      },
    }), [profile, displayName]);

  const tabPanelClass =
    'mt-3 sm:mt-4 min-w-0 max-w-full overflow-x-hidden focus-visible:outline-none data-[state=inactive]:hidden';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (profile.loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
        <div className="text-amber-200/70">Loading your profile…</div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-black/92 backdrop-blur-md overscroll-none"
        data-testid="main-character-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Your personal profile"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="relative flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 bg-gradient-to-br from-amber-950/35 via-black to-purple-950/30 sm:h-[95vh] sm:max-h-[95vh] sm:max-w-5xl sm:rounded-2xl sm:border-2 sm:border-amber-500/45 shadow-[0_0_48px_rgba(251,191,36,0.18)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-amber-500/12 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />

          {/* Personal profile banner + actions */}
          <div
            className="relative flex shrink-0 items-start justify-between gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 sm:px-5"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
          >
            <p className="min-w-0 flex-1 text-xs sm:text-sm text-amber-100/90 leading-snug pt-0.5">
              <span className="font-semibold">Your personal profile</span>
              <span className="hidden sm:inline text-amber-200/60">
                {' '}— everything here is about you, the app user, not another character.
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9 text-white/60 hover:text-white hover:bg-white/10 touch-manipulation"
                onClick={() => void profile.reload()}
                aria-label="Refresh profile"
                disabled={profile.loading}
              >
                {profile.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9 text-white/60 hover:text-white hover:bg-white/10 touch-manipulation"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Desktop hero header */}
          <header className="relative hidden shrink-0 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-950/25 to-purple-900/15 sm:block">
            <div className="flex items-start gap-3 p-5">
              <div className="flex min-w-[7.5rem] flex-col items-center justify-center gap-2 border-r border-amber-500/25 bg-gradient-to-b from-amber-500/20 to-transparent px-1 py-1 pr-4">
                <CharacterAvatar
                  url={avatarUrl}
                  characterId={profile.character.id}
                  archetype={profile.character.archetype}
                  role={profile.character.role}
                  name={displayName}
                  size={64}
                  className="ring-2 ring-amber-400/55 ring-offset-2 ring-offset-black/80"
                />
                <Badge
                  variant="outline"
                  className="mt-2 flex items-center gap-1 border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200"
                >
                  <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                  This is you
                </Badge>
              </div>

              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-400/80">
                  Your profile
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-3xl font-bold tracking-tight text-white">You</h2>
                  <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber-400/80">
                    app user
                  </span>
                </div>
                {!isYouName && (
                  <p className="mt-1 break-words text-sm text-amber-200/70">{displayName}</p>
                )}
                {/* Structured names under official title - consistent with other modals */}
                {(() => {
                  const ch = profile.character || {};
                  const first = ch.first_name || '';
                  const middle = (typeof ch.metadata?.middle_name === 'string' ? ch.metadata.middle_name : ch.middle_name) || '';
                  const last = ch.last_name || '';
                  const full = [first, middle, last].filter(Boolean).join(' ').trim();
                  const aliases = (ch.alias || []).filter(Boolean);
                  if (!full && aliases.length === 0) return null;
                  return (
                    <p className="mt-0.5 text-xs text-amber-300/70 truncate">
                      {full && <span>{full}</span>}
                      {aliases.length > 0 && <span className="text-amber-400/60"> {full ? '· ' : ''}{aliases.join(' / ')}</span>}
                    </p>
                  );
                })()}

                {/* Editable official title for main/self too */}
                <div className="mt-1 max-w-xl">
                  <CharacterTitleSection
                    character={profile.character}
                    onUpdated={() => {
                      // refresh self to bring edits into profile, lore, continuity
                      selfCharacterApi?.ensureSelf?.().catch(() => {});
                      void profile.reload();
                    }}
                  />
                </div>

                <p className="mt-1 break-words text-sm font-medium text-amber-200/60">{roleLine}</p>

                {profile.character.archetype &&
                  !/^protagonist$/i.test(profile.character.archetype) && (
                  <Badge
                    variant="outline"
                    className="mt-2 border-primary/30 bg-primary/15 px-1.5 py-0 text-[10px] text-primary"
                  >
                    <Sparkles className="mr-1 h-2.5 w-2.5" />
                    Your {profile.character.archetype.toLowerCase()} side
                  </Badge>
                )}

                <div className="mt-3 grid grid-cols-4 gap-2">
                  {statItems.map(({ label, value }) => (
                    <div
                      key={label}
                      className="min-w-0 rounded-lg border border-amber-500/20 bg-black/35 px-2.5 py-2 text-center"
                    >
                      <p className="text-xl font-bold tabular-nums leading-none text-amber-100">{value}</p>
                      <p className="mt-0.5 truncate text-xs uppercase tracking-wide text-white/45">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </header>

          {/* Tabs + scroll body */}
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as MainTab)}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 sm:px-5"
          >
            {/* Mobile identity strip — tiny avatar, no stats hogging space */}
            <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 py-2 sm:hidden">
              <CharacterAvatar
                url={avatarUrl}
                characterId={profile.character.id}
                archetype={profile.character.archetype}
                role={profile.character.role}
                name={displayName}
                size={32}
                className="ring-1 ring-amber-400/55"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-base font-bold text-white">You</h2>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 border-amber-400/50 bg-amber-500/20 px-1.5 py-0 text-[10px] text-amber-200"
                  >
                    <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" />
                    This is you
                  </Badge>
                </div>
                <p className="truncate text-[11px] text-amber-200/60">{roleLine}</p>
              </div>
            </div>

            <TabsList
              className="mt-2 grid h-auto w-full max-w-full shrink-0 grid-cols-4 gap-1 border border-amber-500/25 bg-black/45 p-1 sm:mt-3 sm:grid-cols-7"
              aria-label="Your profile sections"
            >
              {MAIN_CHARACTER_TABS.map(({ value, label, shortLabel, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-testid={`main-tab-${value}`}
                  aria-label={label}
                  className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 rounded-md px-1.5 py-2 sm:px-2 min-h-[44px] sm:min-h-0 text-[10px] sm:text-xs font-medium leading-tight touch-manipulation data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-100 data-[state=active]:border data-[state=active]:border-amber-400/40"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-center sm:text-left">
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain overflow-x-hidden touch-pan-y [-webkit-overflow-scrolling:touch]"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
            >
              {/* Mobile stats — inside scroll area, not fixed header */}
              <div className="mt-2 grid grid-cols-4 gap-1.5 sm:hidden">
                {statItems.map(({ label, shortLabel, value }) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-lg border border-amber-500/20 bg-black/35 px-1 py-1.5 text-center"
                  >
                    <p className="text-sm font-bold tabular-nums leading-none text-amber-100">{value}</p>
                    <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-white/45">{shortLabel}</p>
                  </div>
                ))}
              </div>

              {/* Story */}
              <TabsContent value="story" className={`${tabPanelClass} space-y-4 sm:space-y-5`}>
                <blockquote className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/30 to-black/40 p-4 sm:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/70 mb-2">
                    In your words
                  </p>
                  <p className="text-sm sm:text-base text-white/85 leading-relaxed italic">
                    {heroSummary}
                  </p>
                </blockquote>

                {/* Editable core identity - to solidify basic knowledge, attributes, name, occupation, aliases about self */}
                <section className="rounded-xl border border-amber-500/20 bg-black/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">Core identity (editable)</h3>
                    {!editingIdentity ? (
                      <Button size="sm" variant="outline" className="border-amber-500/30 text-xs" onClick={() => setEditingIdentity(true)}>
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={cancelIdentityEdits}>Cancel</Button>
                        <Button size="sm" onClick={saveIdentityEdits}>Save & solidify</Button>
                      </div>
                    )}
                  </div>

                  {editingIdentity ? (
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-amber-200/70 mb-0.5">First name</label>
                          <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="w-full bg-black/50 border border-amber-500/20 rounded px-2 py-1 text-white text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-amber-200/70 mb-0.5">Middle name</label>
                          <input value={editMiddle} onChange={e => setEditMiddle(e.target.value)} className="w-full bg-black/50 border border-amber-500/20 rounded px-2 py-1 text-white text-xs" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-amber-200/70 mb-0.5">Last name</label>
                          <input value={editLast} onChange={e => setEditLast(e.target.value)} className="w-full bg-black/50 border border-amber-500/20 rounded px-2 py-1 text-white text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-amber-200/70 mb-0.5">Occupation / Role</label>
                        <input value={editOccupation} onChange={e => setEditOccupation(e.target.value)} className="w-full bg-black/50 border border-amber-500/20 rounded px-2 py-1 text-white text-xs" placeholder="Your occupation or primary role" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-amber-200/70 mb-0.5">Nicknames & Aliases (multiple)</label>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {editAliases.map((a, i) => (
                            <span key={i} className="bg-amber-500/10 border border-amber-500/20 text-amber-100 text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                              {a} <button onClick={() => removeEditAlias(a)} className="text-amber-300 hover:text-white">×</button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input 
                            value={newEditAlias}
                            onChange={e => setNewEditAlias(e.target.value)}
                            placeholder="Add alias" 
                            className="flex-1 bg-black/50 border border-amber-500/20 rounded px-2 py-1 text-xs text-white" 
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEditAlias(); } }}
                          />
                          <button onClick={() => addEditAlias()} className="text-xs border border-amber-500/30 px-2 rounded hover:bg-amber-500/10">Add</button>
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-400/60">Saving will update your core identity across Lore, continuity, and knowledge systems.</p>
                    </div>
                  ) : (
                    <div className="text-xs text-white/70">
                      <div>First: <span className="text-white">{editFirst || '—'}</span> Middle: <span className="text-white">{editMiddle || '—'}</span> Last: <span className="text-white">{editLast || '—'}</span></div>
                      <div>Occupation: <span className="text-white">{editOccupation || profile.character.role || '—'}</span></div>
                      {editAliases.length > 0 && <div>Aliases: <span className="text-white">{editAliases.join(', ')}</span></div>}
                      <p className="mt-1 text-[10px] text-amber-400/50">Click Edit to solidify your identity details.</p>
                    </div>
                  )}
                </section>

                <OnboardingProfileSection
                  profile={
                    (profile.character?.metadata as Record<string, unknown> | undefined)
                      ?.onboarding_profile as OnboardingProfile | undefined
                  }
                />

                {profile.contextHooks.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80 mb-2">
                      Your context
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.contextHooks.map((hook) => (
                        <Badge
                          key={hook}
                          variant="outline"
                          className="bg-amber-500/10 text-amber-200/90 border-amber-500/25 text-xs px-2.5 py-1"
                        >
                          {hook}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80 mb-3">
                    Your life at a glance
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PILLAR_GROUPS.map(({ title, icon: Icon, types }) => {
                      const items = profile.attributes.filter((a) =>
                        types.includes(a.attributeType),
                      );
                      return (
                        <div
                          key={title}
                          className="rounded-xl border border-amber-500/15 bg-black/35 p-3 sm:p-4 space-y-2"
                        >
                          <div className="flex items-center gap-2 text-amber-200/90">
                            <Icon className="h-4 w-4 text-amber-400/80" />
                            <span className="text-sm font-medium">{title}</span>
                          </div>
                          {items.length > 0 ? (
                            <ul className="space-y-1.5">
                              {items.map((attr, i) => (
                                <li
                                  key={`${attr.attributeType}-${i}`}
                                  className="text-sm text-white/75 flex items-start gap-2"
                                >
                                  <span className="text-amber-400/50 mt-0.5">·</span>
                                  <span>{attr.attributeValue}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-white/40 italic">
                              Tell Lore about this in chat — it fills in as you share.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {profile.attributes.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80 mb-2">
                      Your details
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.attributes.map((attr, i) => (
                        <Badge
                          key={`${attr.attributeType}-${attr.attributeValue}-${i}`}
                          variant="outline"
                          className={`${getAttributeColor(attr.attributeType)} text-xs px-2.5 py-1 flex items-center gap-1`}
                          title={`${attr.attributeType}: ${attr.attributeValue}`}
                        >
                          {getAttributeIcon(attr.attributeType)}
                          <span className="truncate max-w-[min(14rem,100%)] sm:max-w-[14rem]">{attr.attributeValue}</span>
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {profile.attributes.length === 0 && !profile.loading && (
                  <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-950/10 p-4 sm:p-5 text-center space-y-3">
                    <p className="text-sm text-white/65">
                      Lore builds your personal profile as you chat and add life details.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-amber-500/40 text-amber-200 hover:bg-amber-500/15"
                      onClick={() => openSelfChat('Help me build out my personal profile.')}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Start with Lore
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* People */}
              <TabsContent value="people" className={`${tabPanelClass} space-y-3`}>
                <p className="text-xs text-white/50 px-1">
                  People in your life — tap someone to see their full character profile.
                </p>
                {sortedRelationships.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/15 bg-black/35 p-6 text-center">
                    <Users className="h-10 w-10 mx-auto mb-3 text-amber-400/30" />
                    <p className="text-sm text-white/60">
                      People you mention in chat appear here as your cast.
                    </p>
                  </div>
                ) : (
                  sortedRelationships.map((rel, i) => {
                    const name = rel.character_name || 'Unknown';
                    const relId = rel.character_id || rel.id || `rel-${i}`;
                    return (
                      <button
                        key={relId}
                        type="button"
                        onClick={() =>
                          setSelectedConnection({
                            id: rel.character_id || rel.id || relId,
                            name,
                            role: rel.relationship_type,
                            summary: rel.summary,
                            status: rel.status || 'active',
                          } as Character)
                        }
                        className="w-full min-h-[48px] text-left rounded-xl border border-amber-500/15 bg-black/35 hover:bg-amber-950/20 hover:border-amber-500/30 transition-colors p-3 sm:p-4 flex items-start gap-3 group touch-manipulation active:bg-amber-950/25"
                      >
                        <CharacterAvatar
                          characterId={rel.character_id}
                          name={name}
                          size={40}
                          className="flex-shrink-0 ring-1 ring-white/10"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white group-hover:text-amber-100">
                              {name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-white/5 text-white/60 border-white/15"
                            >
                              {formatRelationshipType(rel.relationship_type)}
                            </Badge>
                            {typeof rel.closeness_score === 'number' && rel.closeness_score > 0 && (
                              <span className="text-[10px] text-amber-400/70 font-mono">
                                {Math.round(rel.closeness_score)}% close
                              </span>
                            )}
                          </div>
                          {rel.summary && (
                            <p className="text-xs sm:text-sm text-white/55 mt-1 line-clamp-2">
                              {rel.summary}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-5 w-5 text-amber-400/30 group-hover:text-amber-300 flex-shrink-0 mt-1" />
                      </button>
                    );
                  })
                )}
              </TabsContent>

              {/* Timeline */}
              <TabsContent value="timeline" className={tabPanelClass}>
                <CharacterTimelinePanel
                  characterId={profile.character.id}
                  characterName={displayName}
                  mockMode={profile.isMockDataEnabled}
                  active={activeTab === 'timeline'}
                  isSelfProfile
                />
              </TabsContent>

              {/* Lore */}
              <TabsContent value="lore" className={tabPanelClass}>
                <CharacterKnowledgeBase
                  characterId={profile.character.id}
                  characterName={displayName}
                  mockMode={profile.isMockDataEnabled}
                  active={activeTab === 'lore'}
                  initialData={knowledgeInitialData}
                  isSelfProfile
                  onAskInChat={(prompt) => openSelfChat(prompt)}
                />
              </TabsContent>

              {/* Photos — selfies & photos of you */}
              <TabsContent value="photos" className={`${tabPanelClass} space-y-3`}>
                {(() => {
                  const look = (profile.character.metadata as Record<string, unknown> | undefined)?.look_profile as
                    | { traits?: string[]; lastUpdated?: string; confidence?: number }
                    | undefined;
                  const traits = look?.traits ?? [];
                  return traits.length > 0 ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80 mb-1.5">
                        How LoreBook sees you
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {traits.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[10px] border-amber-500/30 text-amber-100/90"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                      {look?.lastUpdated && (
                        <p className="mt-2 text-[10px] text-white/40">
                          Updated {formatMemoryDate(look.lastUpdated)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-white/50 px-1">
                      Selfies and photos of you land here. LoreBook learns appearance traits over time.
                    </p>
                  );
                })()}
                <CharacterMediaPanel
                  characterId={profile.character.id}
                  characterName={displayName}
                  kind="photo"
                />
              </TabsContent>

              {/* Memories */}
              <TabsContent value="memories" className={`${tabPanelClass} space-y-3`}>
                <p className="text-xs text-white/50 px-1">
                  Your recent memories from chat and journal.
                </p>
                {profile.memories.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/15 bg-black/35 p-6 text-center">
                    <Sparkles className="h-10 w-10 mx-auto mb-3 text-amber-400/30" />
                    <p className="text-sm text-white/60">
                      Recent memories from your chats and journal will show up here.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 border-amber-500/40 text-amber-200 hover:bg-amber-500/15"
                      onClick={() => setActiveTab('chat')}
                    >
                      Talk to Lore
                    </Button>
                  </div>
                ) : (
                  profile.memories.map((memory) => (
                    <article
                      key={memory.id}
                      className="rounded-xl border border-amber-500/15 bg-black/35 p-3 sm:p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-white">{memory.title}</h4>
                        <span className="text-[10px] text-white/40 whitespace-nowrap">
                          {formatMemoryDate(memory.date)}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-white/60 line-clamp-3">{memory.content}</p>
                      {memory.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {memory.tags.slice(0, 4).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-[10px] bg-white/5 text-white/50 border-white/10"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </article>
                  ))
                )}
              </TabsContent>

              {/* Chat */}
              <TabsContent value="chat" className={`${tabPanelClass} flex flex-col min-h-[min(40vh,360px)] sm:min-h-[min(52vh,480px)]`}>
                <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-950/25 to-black/40 p-3 sm:p-5 space-y-3 sm:space-y-4">
                  <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                    Main chat already knows your full personal profile — your goals, attributes,
                    and what you&apos;ve shared about your life.
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                    {[
                      'Help me update my resume profile.',
                      "What's Lore learned about me lately?",
                      'Reflect on my story arc so far.',
                      'What should I focus on next in my life?',
                    ].map((starter) => (
                      <button
                        type="button"
                        key={starter}
                        onClick={() => openSelfChat(starter)}
                        className="text-left px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border border-amber-500/20 bg-black/40 hover:bg-amber-950/25 hover:border-amber-500/40 transition-colors text-xs sm:text-sm text-white/70 hover:text-white/90 break-words"
                      >
                        &ldquo;{starter}&rdquo;
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => openSelfChat()}
                    className="w-full py-2.5 sm:py-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/35 text-amber-200 hover:text-amber-100 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    Open main chat
                  </button>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {selectedConnection && (
        <CharacterDetailModal
          character={selectedConnection}
          onClose={() => setSelectedConnection(null)}
          onUpdate={() => {
            setSelectedConnection(null);
            void profile.reload();
            onUpdate?.();
          }}
        />
      )}
    </>
  );
};
