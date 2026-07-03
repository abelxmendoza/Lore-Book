/**
 * Character Info tab — priority-ordered profile overview.
 */

import {
  Clock,
  Heart,
  Info,
  MapPin,
  Smile,
  Sparkles,
  Star,
  Briefcase,
  User,
  Users,
  Save,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '../ui/badge';
import { UnknownField } from '../ui/UnknownField';
import { toFieldSource } from '../common/FieldSourceBadge';
import { EditableField, type EditableFieldOption } from '../common/EditableField';
import { useUpdateCharacterMutation } from '../../store/api/entitiesApi';
import { fetchJson } from '../../lib/api';
import type { Character } from './CharacterProfileCard';
import { RelationshipFlagsPanel } from '../love/RelationshipFlagsPanel';
import { RelationshipLifeImpactPanel } from '../love/RelationshipLifeImpactPanel';
import { CharacterLoreProfileSection } from './CharacterLoreProfileSection';
import type { CharacterLoreProfile } from '../../api/characterLoreProfile';
import { resolveMockRelationshipInfluence } from '../../mocks/romanticLifeImpact';
import { suggestDisplayTitleFromNames, getCharacterDisplayTitle } from '../../lib/characterDisplayTitle';

type Relationship = {
  id?: string;
  character_id?: string;
  character_name?: string;
  relationship_type: string;
  status?: string;
  summary?: string;
  closeness_score?: number;
  is_situationship?: boolean;
  exclusivity_status?: string;
  compatibility_score?: number;
  relationship_health?: number;
  affection_score?: number;
  emotional_intensity?: number;
  is_current?: boolean;
  start_date?: string;
  pros?: string[];
  cons?: string[];
  red_flags?: string[];
  green_flags?: string[];
  metadata?: Record<string, unknown>;
};

type CharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  evidence?: string;
};

type LifeMapItem = { label: string; value?: string; prompt: string };

const SEX_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
];

const ORIENTATION_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'heterosexual', label: 'Heterosexual' },
  { value: 'queer', label: 'Queer' },
];

export type CharacterInfoPanelProps = {
  editedCharacter: Character;
  setEditedCharacter: React.Dispatch<React.SetStateAction<Character>>;
  characterId: string;
  onUpdate: () => void;
  relationship?: Relationship;
  dynamics: { health?: { health_score?: number; trends?: { health_trend?: string } }; lifecycle?: { current_stage?: string } } | null;
  askInChat: (prompt: string) => void;
  relationshipStatus?: string;
  romanticConnections: Relationship[];
  strongestConnections: Relationship[];
  lifeMap: LifeMapItem[];
  occupations: string[];
  workplaces: string[];
  sideHustles: string[];
  behaviorAttributes: CharacterAttribute[];
  socialStanding?: { tier?: string; score?: number };
  characterAttributes: CharacterAttribute[];
  loadingAttributes: boolean;
  provenance: { mentionCount?: number; firstMentionedAt?: string; lastMentionedAt?: string; sourceUtterances?: { content: string; created_at: string }[] } | null;
  isMockDataEnabled: boolean;
  openCharacterByRelationship: (rel: Relationship) => void;
  loreProfile?: CharacterLoreProfile | null;
  loreProfileLoading?: boolean;
  onOpenCharacterById?: (characterId: string) => void;
  onAddWorldPerson?: (targetCharacterId: string, relationshipType: string, status: string) => Promise<void>;
  onUpdateWorldPerson?: (relationshipId: string, patch: { relationship_type?: string; status?: string }) => Promise<void>;
  onDeleteWorldPerson?: (relationshipId: string) => Promise<void>;
};

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-white/35 truncate">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function parseAliases(raw: string, primaryName: string): string[] {
  const primaryKey = primaryName.trim().toLowerCase();
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const alias = part.replace(/\s+/g, ' ').trim();
    const key = alias.toLowerCase();
    if (!alias || key === primaryKey || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

function inferNameParts(character: Character): { firstName: string; middleName: string; lastName: string } {
  const meta = (character.metadata ?? {}) as Record<string, unknown>;
  const explicitMiddle = typeof meta.middle_name === 'string' ? meta.middle_name : character.middle_name;
  const firstName = character.first_name ?? '';
  const lastName = character.last_name ?? '';
  if (firstName || explicitMiddle || lastName) {
    const lastParts = lastName.trim().split(/\s+/).filter(Boolean);
    return {
      firstName,
      middleName: explicitMiddle ?? (lastParts.length > 1 ? lastParts.slice(0, -1).join(' ') : ''),
      lastName: explicitMiddle ? lastName : (lastParts.length > 1 ? lastParts[lastParts.length - 1] : lastName),
    };
  }

  const parts = character.name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

export function CharacterInfoPanel({
  editedCharacter,
  setEditedCharacter,
  characterId,
  onUpdate,
  relationship,
  dynamics,
  askInChat,
  relationshipStatus,
  romanticConnections,
  strongestConnections,
  lifeMap,
  occupations,
  workplaces,
  sideHustles,
  behaviorAttributes,
  socialStanding,
  characterAttributes,
  loadingAttributes,
  provenance,
  isMockDataEnabled,
  openCharacterByRelationship,
  loreProfile,
  loreProfileLoading = false,
  onOpenCharacterById,
  onAddWorldPerson,
  onUpdateWorldPerson,
  onDeleteWorldPerson,
}: CharacterInfoPanelProps) {
  const [updateCharacter] = useUpdateCharacterMutation();
  const meta = (editedCharacter.metadata ?? {}) as Record<string, unknown>;
  const standingOverride = (meta.standing_override as { tier?: string } | null)?.tier ?? null;
  const impactOverride = typeof meta.impact_override === 'number' ? meta.impact_override : null;
  const sexValue = typeof meta.sex === 'string' ? meta.sex : 'unknown';
  const orientationValue = typeof meta.sexual_orientation === 'string' ? meta.sexual_orientation : 'unknown';
  const sexSource = toFieldSource(meta.sex_source, sexValue !== 'unknown');
  const orientationSource = toFieldSource(meta.sexual_orientation_source, orientationValue !== 'unknown');
  const inferredNameParts = useMemo(
    () => inferNameParts(editedCharacter),
    [
      editedCharacter.id,
      editedCharacter.name,
      editedCharacter.first_name,
      editedCharacter.middle_name,
      editedCharacter.last_name,
      editedCharacter.metadata?.middle_name,
    ],
  );
  const [firstNameDraft, setFirstNameDraft] = useState(inferredNameParts.firstName);
  const [middleNameDraft, setMiddleNameDraft] = useState(inferredNameParts.middleName);
  const [lastNameDraft, setLastNameDraft] = useState(inferredNameParts.lastName);
  const [aliasesList, setAliasesList] = useState<string[]>(editedCharacter.alias ?? []);
  const [newAlias, setNewAlias] = useState('');
  const [roleDraft, setRoleDraft] = useState(editedCharacter.role || '');

  const addAlias = () => {
    const val = newAlias.trim();
    if (val && !aliasesList.includes(val)) {
      setAliasesList([...aliasesList, val]);
      setNewAlias('');
    }
  };

  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    setFirstNameDraft(inferredNameParts.firstName);
    setMiddleNameDraft(inferredNameParts.middleName);
    setLastNameDraft(inferredNameParts.lastName);
    setAliasesList(editedCharacter.alias ?? []);
    setRoleDraft(editedCharacter.role || '');
  }, [editedCharacter.id, inferredNameParts.firstName, inferredNameParts.middleName, inferredNameParts.lastName, editedCharacter.alias, editedCharacter.role]);

  const humanizeType = (t: string) =>
    t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const baseRelationshipTypeOptions: EditableFieldOption[] = [
    { value: 'boyfriend', label: 'Boyfriend' },
    { value: 'girlfriend', label: 'Girlfriend' },
    { value: 'wife', label: 'Wife' },
    { value: 'husband', label: 'Husband' },
    { value: 'fiancé', label: 'Fiance' },
    { value: 'fiancée', label: 'Fiancee' },
    { value: 'lover', label: 'Lover' },
    { value: 'fuck_buddy', label: 'Fuck buddy' },
    { value: 'ex_boyfriend', label: 'Ex-boyfriend' },
    { value: 'ex_girlfriend', label: 'Ex-girlfriend' },
    { value: 'ex_wife', label: 'Ex-wife' },
    { value: 'ex_husband', label: 'Ex-husband' },
    { value: 'ex_lover', label: 'Ex-lover' },
    { value: 'situationship', label: 'Situationship' },
    { value: 'crush', label: 'Crush' },
    { value: 'dating', label: 'Dating' },
    { value: 'talking', label: 'Talking' },
    { value: 'hooking_up', label: 'Hooking up' },
    { value: 'one_night_stand', label: 'One-night stand' },
    { value: 'friends_with_benefits', label: 'Friends with benefits' },
    { value: 'complicated', label: 'Complicated' },
    { value: 'on_break', label: 'On break' },
    { value: 'in_love', label: 'In love' },
    { value: 'obsession', label: 'Obsession' },
    { value: 'infatuation', label: 'Infatuation' },
    { value: 'lust', label: 'Lust' },
  ];
  const relationshipTypeOptions: EditableFieldOption[] =
    relationship?.relationship_type && !baseRelationshipTypeOptions.some((option) => option.value === relationship.relationship_type)
      ? [{ value: relationship.relationship_type, label: humanizeType(relationship.relationship_type) }, ...baseRelationshipTypeOptions]
      : baseRelationshipTypeOptions;
  const relationshipStatusOptions: EditableFieldOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'on_break', label: 'On break' },
    { value: 'ended', label: 'Ended' },
    { value: 'complicated', label: 'Complicated' },
    { value: 'paused', label: 'Paused' },
    { value: 'ghosted', label: 'Ghosted' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'unrequited', label: 'Unrequited' },
    { value: 'fading', label: 'Fading' },
    { value: 'rekindled', label: 'Rekindled' },
  ];
  const tierLabels: Record<string, string> = {
    inner_circle: 'Inner circle',
    close: 'Close',
    regular: 'Regular',
    peripheral: 'Peripheral',
    public_figure: 'Public figure',
  };

  const persistOverride = async (key: string, value: unknown) => {
    const patch =
      key === 'sex' || key === 'sexual_orientation'
        ? {
            [key]: value,
            [`${key}_source`]: value === 'unknown' ? 'unknown' : 'user_confirmed',
            [`${key}_confirmed_at`]: value === 'unknown' ? null : new Date().toISOString(),
          }
        : { [key]: value };
    setEditedCharacter((prev) => ({
      ...prev,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...patch },
    }));
    try {
      await updateCharacter({ id: characterId, values: { metadata: patch } }).unwrap();
      onUpdate();
    } catch (err) {
      console.error('Failed to save character override:', err);
      throw err instanceof Error ? err : new Error('Could not save character field');
    }
  };

  const saveIdentityNames = async () => {
    const aliases = [...aliasesList];
    const firstName = firstNameDraft.trim();
    const middleName = middleNameDraft.trim();
    const lastName = lastNameDraft.trim();
    const role = roleDraft.trim();
    const metadataPatch = {
      middle_name: middleName || null,
      middle_name_source: middleName ? 'user_confirmed' : 'user_cleared',
      name_parts_confirmed_at: new Date().toISOString(),
    };

    setIdentitySaving(true);
    setIdentityError(null);
    setEditedCharacter((prev) => ({
      ...prev,
      first_name: firstName || null,
      middle_name: middleName || null,
      last_name: lastName || null,
      alias: aliases,
      role: role || null,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...metadataPatch },
    }));

    try {
      await updateCharacter({
        id: characterId,
        values: {
          name: editedCharacter.name,
          firstName: firstName || undefined,
          middleName: middleName || undefined,
          lastName: lastName || undefined,
          alias: aliases,
          role: role || undefined,
          metadata: metadataPatch,
        },
      }).unwrap();

      // Auto-sync a friendly card title from the new structured names (nickname + first)
      // only if the user hasn't locked a custom title. This keeps names vs title clearly separated
      // while giving good defaults for cards.
      const currentTitleMeta = (editedCharacter.metadata?.display_title as any) || {};
      const isLocked = currentTitleMeta.stability === 'locked';
      if (!isLocked) {
        const suggested = suggestDisplayTitleFromNames({
          ...editedCharacter,
          first_name: firstName,
          last_name: lastName,
          alias: aliases,
          metadata: { ...(editedCharacter.metadata || {}), ...metadataPatch },
        });
        if (suggested && suggested !== getCharacterDisplayTitle(editedCharacter as any)) {
          setEditedCharacter((prev) => ({
            ...prev,
            metadata: {
              ...((prev.metadata ?? {}) as Record<string, unknown>),
              display_title: {
                ...currentTitleMeta,
                primaryTitle: suggested,
                stability: 'stable',
                titleType: 'structured',
                generatedFromNames: true,
              },
            },
          }));
        }
      }

      onUpdate();
    } catch (err) {
      console.error('Failed to save character identity names:', err);
      setIdentityError(err instanceof Error ? err.message : 'Could not save names.');
    } finally {
      setIdentitySaving(false);
    }
  };

  const persistRelationshipType = async (nextType: string) => {
    if (!relationship?.id) throw new Error('This relationship is not editable yet.');
    await fetchJson<{ success: boolean; relationship: Relationship }>(
      `/api/conversation/romantic-relationships/${relationship.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          relationship_type: nextType,
          metadata: {
            relationship_type_source: 'user_confirmed',
            relationship_type_confirmed_at: new Date().toISOString(),
          },
          reason: 'user_corrected_relationship_type',
        }),
      }
    );
    onUpdate();
  };

  const persistRelationshipStatus = async (nextStatus: string) => {
    if (!relationship?.id) throw new Error('This relationship is not editable yet.');
    await fetchJson<{ success: boolean; relationship: Relationship }>(
      `/api/conversation/romantic-relationships/${relationship.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          metadata: {
            relationship_status_source: 'user_confirmed',
            relationship_status_confirmed_at: new Date().toISOString(),
          },
          reason: 'user_corrected_relationship_status',
        }),
      }
    );
    onUpdate();
  };

  const healthScore = dynamics?.health?.health_score;
  const healthTrend = dynamics?.health?.trends?.health_trend;
  const memoryCount = editedCharacter.memory_count ?? 0;
  const connectionCount = editedCharacter.relationship_count ?? editedCharacter.relationships?.length ?? 0;
  const standing =
    standingOverride ?? socialStanding?.tier ?? editedCharacter.importance_level ?? 'Still learning';

  const mockProvenanceMap: Record<string, NonNullable<CharacterInfoPanelProps['provenance']>> = {
    'Sarah Chen': { mentionCount: 156, firstMentionedAt: '2018-09-20T00:00:00Z', lastMentionedAt: new Date(Date.now() - 7 * 86400000).toISOString(), sourceUtterances: [{ content: 'I had coffee with Sarah today — she was the first person I told about wanting to leave tech.', created_at: '2018-09-20T00:00:00Z' }] },
    'Marcus Johnson': { mentionCount: 98, firstMentionedAt: '2020-03-12T00:00:00Z', lastMentionedAt: new Date(Date.now() - 14 * 86400000).toISOString(), sourceUtterances: [{ content: 'Met Marcus at that entrepreneurship event.', created_at: '2020-03-12T00:00:00Z' }] },
  };
  const p = isMockDataEnabled ? mockProvenanceMap[editedCharacter.name] ?? provenance : provenance;
  const lifeImpact =
    relationship && isMockDataEnabled
      ? resolveMockRelationshipInfluence({
          relationshipId: relationship.id,
          personId: characterId,
          personName: editedCharacter.name,
        })
      : undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. Story summary ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-black/40 to-black/60 p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-white">Who they are to you</h2>
            {editedCharacter.role && (
              <p className="text-xs text-primary/80 mt-0.5 capitalize">Occupation: {editedCharacter.role.replace(/_/g, ' ')}</p>
            )}
          </div>
        </div>
        {editedCharacter.summary ? (
          <p className="text-sm sm:text-base text-white/85 leading-relaxed whitespace-pre-wrap">{editedCharacter.summary}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-white/45 italic">
              LoreBook is still learning {editedCharacter.name.split(' ')[0]}&apos;s story.
            </p>
            <UnknownField
              label="Their story"
              prompt={`Let me tell you about ${editedCharacter.name}: `}
              onAskInChat={askInChat}
            />
          </div>
        )}
        {editedCharacter.archetype && (
          <Badge variant="outline" className="mt-3 bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs">
            {editedCharacter.archetype}
          </Badge>
        )}
      </section>

      {/* ── 2. At a glance ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">At a glance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatCell
            label="Standing"
            value={tierLabels[standing] ?? String(standing).replace(/_/g, ' ')}
          />
          <StatCell label="Memories" value={memoryCount} sub={memoryCount === 1 ? 'mention' : 'mentions'} />
          <StatCell label="Connections" value={connectionCount} />
          {relationshipStatus ? (
            <StatCell label="Status" value={relationshipStatus} />
          ) : (
            <StatCell label="Depth" value={editedCharacter.relationship_depth?.replace(/_/g, ' ') ?? '—'} />
          )}
          {healthScore != null && (
            <StatCell
              label="Relationship health"
              value={`${healthScore}%`}
              sub={healthTrend ? `${healthTrend === 'improving' ? '↑' : healthTrend === 'declining' ? '↓' : '→'} ${healthTrend}` : undefined}
            />
          )}
          {editedCharacter.importance_score != null && (
            <StatCell label="Importance" value={`${Math.round(editedCharacter.importance_score)}/100`} />
          )}
          {dynamics?.lifecycle?.current_stage && (
            <StatCell label="Life stage" value={dynamics.lifecycle.current_stage.replace(/_/g, ' ')} />
          )}
          {(editedCharacter.alias?.length ?? 0) > 0 && (
            <StatCell label="Also known as" value={editedCharacter.alias!.slice(0, 2).join(', ')} />
          )}
        </div>
      </section>

      {/* ── 2b. Identity details ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10">
            <User className="h-4 w-4 text-white/55" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">Identity details (structured names)</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              First / Middle / Last + Nicknames are the canonical record for this person. These drive matching, family trees,
              and relationship logic. The <span className="font-medium text-white/70">card title</span> (shown on lists and in CharacterTitleSection) is a separate, presentational value — typically “Nickname (First Last)” or a contextual form.
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">First</span>
                  <input
                    value={firstNameDraft}
                    onChange={(e) => setFirstNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">Middle</span>
                  <input
                    value={middleNameDraft}
                    onChange={(e) => setMiddleNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">Last</span>
                  <input
                    value={lastNameDraft}
                    onChange={(e) => setLastNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="text-[10px] uppercase tracking-wide text-white/35">Occupation / Role</span>
                <input
                  value={roleDraft}
                  onChange={(e) => setRoleDraft(e.target.value)}
                  placeholder="e.g. Software Engineer, Student, Musician"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                  autoComplete="off"
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[10px] uppercase tracking-wide text-white/35">Nicknames / aliases (multiple)</span>
                <div className="mt-1 flex flex-wrap gap-1 min-h-[32px]">
                  {aliasesList.map((alias, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white">
                      {alias}
                      <button
                        type="button"
                        onClick={() => setAliasesList(aliasesList.filter((_, i) => i !== idx))}
                        className="ml-1 text-white/50 hover:text-white/80"
                        aria-label={`Remove ${alias}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex gap-2">
                  <input
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                    placeholder="Add nickname or alias and press Enter"
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={addAlias}
                    disabled={!newAlias.trim()}
                    className="rounded-lg border border-primary/35 bg-primary/15 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </label>
              {identityError && <p className="mt-2 text-xs text-red-300">{identityError}</p>}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveIdentityNames()}
                  disabled={identitySaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {identitySaving ? 'Saving...' : 'Save names'}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <EditableField
                label="Sex"
                value={sexValue}
                displayValue={SEX_OPTIONS.find((option) => option.value === sexValue)?.label ?? humanizeType(sexValue)}
                source={sexSource}
                variant="select"
                options={SEX_OPTIONS}
                onSave={(next) => persistOverride('sex', next)}
              />
              <EditableField
                label="Sexual orientation"
                value={orientationValue}
                displayValue={ORIENTATION_OPTIONS.find((option) => option.value === orientationValue)?.label ?? humanizeType(orientationValue)}
                source={orientationSource}
                variant="select"
                options={ORIENTATION_OPTIONS}
                onSave={(next) => persistOverride('sexual_orientation', next)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Skills, hobbies, groups, people (mention-derived lore) ───── */}
      <CharacterLoreProfileSection
        profile={loreProfile ?? null}
        loading={loreProfileLoading}
        currentCharacterId={characterId}
        characterFirstName={editedCharacter.name.split(' ')[0]}
        relationships={editedCharacter.relationships}
        onAskInChat={askInChat}
        onOpenCharacter={onOpenCharacterById}
        onAddPerson={onAddWorldPerson}
        onUpdatePerson={onUpdateWorldPerson}
        onDeletePerson={onDeleteWorldPerson}
      />

      {/* ── 3. Your relationship (romantic / close) ──────────────────── */}
      {relationship && (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">Your relationship</h3>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <EditableField
              label="Relationship type"
              value={relationship.relationship_type}
              displayValue={relationshipTypeOptions.find((option) => option.value === relationship.relationship_type)?.label ?? humanizeType(relationship.relationship_type)}
              source={toFieldSource(relationship.metadata?.relationship_type_source, Boolean(relationship.relationship_type))}
              variant="select"
              options={relationshipTypeOptions}
              onSave={persistRelationshipType}
              disabled={!relationship.id || isMockDataEnabled}
            />
            <EditableField
              label="Status"
              value={relationship.status ?? 'active'}
              displayValue={relationshipStatusOptions.find((option) => option.value === relationship.status)?.label ?? humanizeType(relationship.status ?? 'active')}
              source={toFieldSource(relationship.metadata?.relationship_status_source, Boolean(relationship.status))}
              variant="select"
              options={relationshipStatusOptions}
              onSave={persistRelationshipStatus}
              disabled={!relationship.id || isMockDataEnabled}
            />
          </div>
          {relationship.is_situationship && (
            <div className="mb-3">
              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">Situationship</Badge>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <StatCell label="Compatibility" value={`${Math.round((relationship.compatibility_score ?? 0) * 100)}%`} />
            <StatCell label="Health" value={`${Math.round((relationship.relationship_health ?? 0) * 100)}%`} />
            <StatCell label="Your interest" value={`${Math.round((relationship.affection_score ?? 0) * 100)}%`} />
            {relationship.start_date && (
              <StatCell
                label="Since"
                value={new Date(relationship.start_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              />
            )}
          </div>
          {(relationship.pros?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {relationship.pros!.length > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.pros!.slice(0, 3).map((pro, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-emerald-400">+</span>{pro}</li>
                  ))}
                </ul>
              )}
              {(relationship.cons?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.cons!.slice(0, 3).map((con, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-red-400">−</span>{con}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3">
            <RelationshipFlagsPanel
              redFlags={relationship.red_flags ?? []}
              greenFlags={relationship.green_flags ?? []}
              compact
            />
          </div>
          {lifeImpact && (
            <div className="mt-4 pt-4 border-t border-rose-500/15">
              <h4 className="text-xs font-semibold text-rose-200/90 mb-2">Life impact</h4>
              <RelationshipLifeImpactPanel
                influence={lifeImpact}
                personName={editedCharacter.name.split(' ')[0]}
                compact
              />
            </div>
          )}
        </section>
      )}

      {/* ── 4. Work & life ───────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5">
          <h3 className="text-xs font-bold text-amber-200/90 flex items-center gap-1.5 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> Work
          </h3>
          {occupations.length > 0 || workplaces.length > 0 || sideHustles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {[...occupations, ...workplaces, ...sideHustles].slice(0, 8).map((v) => (
                <Badge key={v} variant="outline" className="text-[11px] bg-amber-500/10 text-amber-200 border-amber-500/25">{v}</Badge>
              ))}
            </div>
          ) : (
            <UnknownField label="Work" prompt={`What ${editedCharacter.name} does for work: `} onAskInChat={askInChat} />
          )}
        </section>

        <section className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3.5">
          <h3 className="text-xs font-bold text-cyan-200/90 flex items-center gap-1.5 mb-2">
            <MapPin className="h-3.5 w-3.5" /> Life details
          </h3>
          <div className="space-y-1.5">
            {lifeMap.filter((i) => i.value).slice(0, 4).map((item) => (
              <div key={item.label} className="flex justify-between gap-2 text-xs">
                <span className="text-white/40">{item.label}</span>
                <span className="text-white/80 text-right truncate">{item.value}</span>
              </div>
            ))}
            {lifeMap.filter((i) => !i.value).slice(0, 2).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => askInChat(item.prompt)}
                className="text-[11px] text-primary/80 hover:text-primary"
              >
                + Add {item.label.toLowerCase()}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── 5. Key people ──────────────────────────────────────────────── */}
      {(strongestConnections.length > 0 || romanticConnections.length > 0) && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Key people
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {[...romanticConnections, ...strongestConnections.filter((s) => !romanticConnections.some((r) => r.character_id === s.character_id))].slice(0, 4).map((rel) => (
              <button
                key={rel.id ?? rel.character_id ?? rel.character_name}
                type="button"
                onClick={() => openCharacterByRelationship(rel)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left hover:border-primary/30 hover:bg-primary/5 transition-colors touch-manipulation"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">{rel.character_name}</span>
                  {rel.closeness_score != null && (
                    <span className="text-[10px] text-emerald-400 shrink-0">{rel.closeness_score}/10</span>
                  )}
                </div>
                <p className="text-[10px] text-white/40 capitalize mt-0.5 truncate">
                  {rel.relationship_type.replace(/_/g, ' ')}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 6. Personality ───────────────────────────────────────────── */}
      {behaviorAttributes.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Smile className="h-3.5 w-3.5" /> Personality & patterns
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {behaviorAttributes.slice(0, 8).map((attr) => (
              <span
                key={`${attr.attributeType}-${attr.attributeValue}`}
                className="text-xs px-2.5 py-1 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-200"
                title={attr.evidence}
              >
                {attr.attributeValue}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── 7. Your ranking overrides ──────────────────────────────────── */}
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Your ranking</h3>
        </div>
        <p className="text-xs text-white/50 mb-3">Override computed standing — your call wins.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">Standing</label>
            <select
              data-testid="standing-override-select"
              aria-label="Standing tier override"
              value={standingOverride ?? 'auto'}
              onChange={(e) => {
                const v = e.target.value;
                void persistOverride('standing_override', v === 'auto' ? null : { tier: v, set_at: new Date().toISOString() });
              }}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="auto">Auto{tierLabels[socialStanding?.tier ?? ''] ? ` (${tierLabels[socialStanding!.tier!]})` : ''}</option>
              <option value="inner_circle">Inner circle</option>
              <option value="close">Close</option>
              <option value="regular">Regular</option>
              <option value="peripheral">Peripheral</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">
              Impact on you {impactOverride !== null ? `· ${impactOverride}/100` : ''}
            </label>
            {impactOverride === null ? (
              <button
                type="button"
                data-testid="impact-override-enable"
                onClick={() => void persistOverride('impact_override', Math.round(editedCharacter.analytics?.character_influence_on_user ?? 50))}
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-left text-xs text-white/60 hover:border-emerald-500/40"
              >
                Auto ({Math.round(editedCharacter.analytics?.character_influence_on_user ?? 0)}/100) — tap to set
              </button>
            ) : (
              <input
                type="range"
                min={0}
                max={100}
                value={impactOverride}
                aria-label="Impact on me"
                data-testid="impact-override-slider"
                onChange={(e) => setEditedCharacter((prev) => ({
                  ...prev,
                  metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), impact_override: Number(e.target.value) },
                }))}
                onPointerUp={(e) => void persistOverride('impact_override', Number((e.currentTarget as HTMLInputElement).value))}
                className="w-full accent-emerald-400 mt-2"
              />
            )}
          </div>
        </div>
      </section>

      {/* ── 8. Detected attributes ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Detected from chat
          </h3>
          {characterAttributes.length > 0 && (
            <span className="text-[10px] text-white/25">{characterAttributes.length}</span>
          )}
        </div>
        {loadingAttributes ? (
          <p className="text-xs text-white/40 flex items-center gap-2 py-2">
            <Clock className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : characterAttributes.length === 0 ? (
          <p className="text-xs text-white/35 py-1">
            No attributes yet — keep journaling about {editedCharacter.name.split(' ')[0]}.
          </p>
        ) : (
          <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {characterAttributes.slice(0, 12).map((attr, idx) => (
              <div key={idx} className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.02]">
                <span className="text-[9px] uppercase tracking-wide text-white/30 shrink-0 mt-0.5 w-16">
                  {attr.attributeType.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90">{attr.attributeValue}</p>
                  {attr.evidence && (
                    <p className="text-[10px] text-white/35 mt-0.5 line-clamp-1 italic">{attr.evidence}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 9. Provenance ──────────────────────────────────────────────── */}
      {p && (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> How LoreBook knows them
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-2">
            {(p.mentionCount ?? 0) > 0 && <span><strong className="text-white/75">{p.mentionCount}</strong> mentions</span>}
            {p.firstMentionedAt && (
              <span>First: {new Date(p.firstMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
            {p.lastMentionedAt && (
              <span>Last: {new Date(p.lastMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
          </div>
          {p.sourceUtterances?.[0] && (
            <blockquote className="border-l-2 border-white/15 pl-3 text-xs text-white/55 italic line-clamp-2">
              &ldquo;{p.sourceUtterances[0].content}&rdquo;
            </blockquote>
          )}
        </section>
      )}

      <p className="text-[10px] text-white/30 flex items-center gap-1.5 pb-2">
        <Info className="h-3 w-3 shrink-0" />
        Profile updates from your conversations. Use Chat to add or correct details.
      </p>
    </div>
  );
}
