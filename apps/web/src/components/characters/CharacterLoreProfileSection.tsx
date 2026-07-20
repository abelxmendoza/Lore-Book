/**
 * Skills, hobbies, interests, groups, and people associations — from chat-derived lore only.
 */
import { useMemo, useState } from 'react';
import {
  Briefcase,
  Heart,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Users,
  UserX,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { UnknownField } from '../ui/UnknownField';
import { fetchCharacterList } from '../../api/characterList';
import type {
  CharacterLoreProfile,
  CharacterLoreItem,
  CharacterPersonAssociation,
} from '../../api/characterLoreProfile';
import type { Character } from './CharacterProfileCard';

export const WORLD_RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'friend', label: 'Friend' },
  { value: 'close_friend', label: 'Close friend' },
  { value: 'best_friend', label: 'Best friend' },
  { value: 'acquaintance', label: 'Acquaintance' },
  { value: 'family', label: 'Family' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'mentor', label: 'Mentor' },
  { value: 'bandmate', label: 'Bandmate' },
  { value: 'scene_friend', label: 'Scene friend' },
  { value: 'collaborator', label: 'Collaborator' },
  { value: 'rival', label: 'Rival' },
  { value: 'enemy', label: 'Enemy' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'crush', label: 'Crush' },
  { value: 'dating', label: 'Dating' },
  { value: 'situationship', label: 'Situationship' },
  { value: 'ex_lover', label: 'Ex-lover' },
] as const;

const WORLD_RELATIONSHIP_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'inferred', label: 'Inferred' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'ended', label: 'Ended' },
  { value: 'complicated', label: 'Complicated' },
] as const;

export type CharacterWorldRelationship = {
  id?: string;
  character_id: string;
  character_name?: string;
  relationship_type: string;
  closeness_score?: number;
  summary?: string;
  status?: string;
};

type EditablePerson = {
  key: string;
  characterId: string | null;
  name: string;
  relationshipType: string;
  status?: string;
  associationKind: CharacterPersonAssociation['associationKind'] | 'confirmed';
  summary?: string;
  domain?: string;
  closenessScore?: number;
  relationshipId?: string;
  editable: boolean;
};

type Props = {
  profile: CharacterLoreProfile | null;
  loading: boolean;
  currentCharacterId: string;
  characterFirstName: string;
  relationships?: CharacterWorldRelationship[];
  onAskInChat: (prompt: string) => void;
  onOpenCharacter?: (characterId: string) => void;
  onAddPerson?: (targetCharacterId: string, relationshipType: string, status: string) => Promise<void>;
  onUpdatePerson?: (relationshipId: string, patch: { relationship_type?: string; status?: string }) => Promise<void>;
  onDeletePerson?: (relationshipId: string) => Promise<void>;
};

function LoreChipList({
  items,
  emptyLabel,
  askPrompt,
  onAskInChat,
}: {
  items: CharacterLoreItem[];
  emptyLabel: string;
  askPrompt: string;
  onAskInChat: (prompt: string) => void;
}) {
  if (items.length === 0) {
    return <UnknownField label={emptyLabel} prompt={askPrompt} onAskInChat={onAskInChat} />;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className="text-xs px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] text-white/85"
          title={item.evidence ?? item.category}
        >
          {item.label}
          {item.confidence != null && item.confidence >= 0.75 && (
            <span className="ml-1 text-[9px] text-emerald-400/80">●</span>
          )}
        </span>
      ))}
    </div>
  );
}

function associationBadge(kind: CharacterPersonAssociation['associationKind'] | 'confirmed') {
  switch (kind) {
    case 'confirmed':
      return { label: 'Confirmed', className: 'bg-sky-500/15 text-sky-200 border-sky-500/30' };
    case 'direct':
      return { label: 'Know them', className: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' };
    case 'mentioned':
      return { label: 'Mentioned only', className: 'bg-amber-500/15 text-amber-200 border-amber-500/30' };
    case 'peripheral':
      return { label: 'Via someone else', className: 'bg-violet-500/15 text-violet-200 border-violet-500/30' };
    default:
      return { label: 'Story link', className: 'bg-white/10 text-white/60 border-white/15' };
  }
}

export function CharacterLoreProfileSection({
  profile,
  loading,
  currentCharacterId,
  characterFirstName,
  relationships = [],
  onAskInChat,
  onOpenCharacter,
  onAddPerson,
  onUpdatePerson,
  onDeletePerson,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [characterOptions, setCharacterOptions] = useState<Character[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [selectedType, setSelectedType] = useState('friend');
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Characters removed this session — kept out of the list so a deleted person
  // doesn't reappear from the lore-derived side (state stays consistent until the
  // next reload, when the server no longer surfaces them).
  const [dismissedCharacterIds, setDismissedCharacterIds] = useState<Set<string>>(new Set());
  const [editorError, setEditorError] = useState<string | null>(null);

  const mergedPeople = useMemo<EditablePerson[]>(() => {
    const byKey = new Map<string, EditablePerson>();

    for (const rel of relationships) {
      if (!rel.character_id || rel.character_name === 'You') continue;
      const key = rel.character_id;
      byKey.set(key, {
        key,
        characterId: rel.character_id,
        name: rel.character_name ?? 'Unknown',
        relationshipType: rel.relationship_type,
        status: rel.status,
        associationKind: 'confirmed',
        summary: rel.summary,
        closenessScore: rel.closeness_score,
        relationshipId: rel.id,
        editable: Boolean(rel.id),
      });
    }

    for (const person of profile?.people ?? []) {
      const key = person.characterId ?? person.name.toLowerCase();
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key: `${key}-${person.relationshipType}`,
        characterId: person.characterId,
        name: person.name,
        relationshipType: person.relationshipType,
        associationKind: person.associationKind,
        summary: person.summary,
        domain: person.domain,
        closenessScore: person.closenessScore,
        editable: false,
      });
    }

    return Array.from(byKey.values()).filter(
      (person) => !person.characterId || !dismissedCharacterIds.has(person.characterId),
    );
  }, [profile?.people, relationships, dismissedCharacterIds]);

  const existingCharacterIds = new Set(
    mergedPeople.map((person) => person.characterId).filter((id): id is string => Boolean(id))
  );

  const availableCharacterOptions = characterOptions.filter(
    (option) => option.id !== currentCharacterId && !existingCharacterIds.has(option.id)
  );

  const loadCharacterOptions = async () => {
    if (charactersLoading || characterOptions.length > 0) return;
    setCharactersLoading(true);
    setEditorError(null);
    try {
      const list = await fetchCharacterList<Character>();
      setCharacterOptions(list.filter((item) => item.status !== 'archived'));
    } catch (error) {
      console.error('Failed to load character suggestions:', error);
      setEditorError('Could not load character suggestions.');
    } finally {
      setCharactersLoading(false);
    }
  };

  const toggleAdd = async () => {
    const nextOpen = !addOpen;
    setAddOpen(nextOpen);
    if (nextOpen) await loadCharacterOptions();
  };

  const addPerson = async () => {
    if (!onAddPerson || !selectedCharacterId) return;
    setSavingKey('add');
    setEditorError(null);
    try {
      await onAddPerson(selectedCharacterId, selectedType, selectedStatus);
      setSelectedCharacterId('');
      setSelectedType('friend');
      setSelectedStatus('active');
      setAddOpen(false);
    } catch (error) {
      console.error('Failed to add world person:', error);
      setEditorError(error instanceof Error ? error.message : 'Could not add this person.');
    } finally {
      setSavingKey(null);
    }
  };

  // Convert an auto-detected (lore-derived) person into a real, managed
  // relationship — the easy way to add an existing character you already see
  // listed. Once linked they gain the type/status editors and a delete button.
  const linkPerson = async (characterId: string, relationshipType: string) => {
    if (!onAddPerson) return;
    setSavingKey(`link-${characterId}`);
    setEditorError(null);
    try {
      await onAddPerson(characterId, relationshipType || 'friend', 'active');
    } catch (error) {
      console.error('Failed to link world person:', error);
      setEditorError(error instanceof Error ? error.message : 'Could not add this connection.');
    } finally {
      setSavingKey(null);
    }
  };

  const updatePerson = async (
    relationshipId: string,
    patch: { relationship_type?: string; status?: string },
  ) => {
    if (!onUpdatePerson) return;
    setSavingKey(`${relationshipId}-${Object.keys(patch)[0]}`);
    setEditorError(null);
    try {
      await onUpdatePerson(relationshipId, patch);
    } catch (error) {
      console.error('Failed to update world person:', error);
      setEditorError(error instanceof Error ? error.message : 'Could not update this connection.');
    } finally {
      setSavingKey(null);
    }
  };

  const deletePerson = async (relationshipId: string, characterId?: string) => {
    if (!onDeletePerson) return;
    setSavingKey(`${relationshipId}-delete`);
    setEditorError(null);
    try {
      await onDeletePerson(relationshipId);
      // Keep them out of the list even if they'd otherwise re-derive from lore.
      if (characterId) setDismissedCharacterIds((prev) => new Set(prev).add(characterId));
    } catch (error) {
      console.error('Failed to delete world person:', error);
      setEditorError(error instanceof Error ? error.message : 'Could not remove this connection.');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/40">
        Loading skills, interests, and connections…
      </section>
    );
  }

  const displayProfile = profile ?? {
    characterId: currentCharacterId,
    characterName: characterFirstName,
    generatedAt: new Date(0).toISOString(),
    skills: [],
    hobbies: [],
    interests: [],
    groups: [],
    people: [],
    loreSnippets: [],
    mentionOnly: false,
  };

  return (
    <div className="space-y-4">
      {displayProfile.mentionOnly && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2.5 flex items-start gap-2 text-xs text-amber-100/90">
          <UserX className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            LoreBook only knows {characterFirstName} from what you&apos;ve said — you may not know them personally.
            Details below come from your mentions, not assumptions.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-indigo-500/20 bg-indigo-950/15 p-3.5">
          <h3 className="text-xs font-bold text-indigo-200/90 flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Skills
          </h3>
          <LoreChipList
            items={displayProfile.skills}
            emptyLabel="Skills"
            askPrompt={`What skills does ${characterFirstName} have? `}
            onAskInChat={onAskInChat}
          />
        </section>

        <section className="rounded-xl border border-pink-500/20 bg-pink-950/15 p-3.5">
          <h3 className="text-xs font-bold text-pink-200/90 flex items-center gap-1.5 mb-2">
            <Heart className="h-3.5 w-3.5" /> Hobbies & interests
          </h3>
          <LoreChipList
            items={[...displayProfile.hobbies, ...displayProfile.interests]}
            emptyLabel="Hobbies & interests"
            askPrompt={`What are ${characterFirstName}'s hobbies and interests? `}
            onAskInChat={onAskInChat}
          />
        </section>
      </div>

      <section className="rounded-xl border border-teal-500/20 bg-teal-950/15 p-3.5">
        <h3 className="text-xs font-bold text-teal-200/90 flex items-center gap-1.5 mb-2">
          <Briefcase className="h-3.5 w-3.5" /> Groups & affiliations
        </h3>
        {displayProfile.groups.length === 0 ? (
          <UnknownField
            label="Groups"
            prompt={`What teams, companies, or groups is ${characterFirstName} part of? `}
            onAskInChat={onAskInChat}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {displayProfile.groups.map((g) => (
              <Badge
                key={g.organizationId}
                variant="outline"
                className="text-[11px] bg-teal-500/10 text-teal-100 border-teal-500/25"
              >
                {g.name}
                {g.role ? ` · ${g.role.replace(/_/g, ' ')}` : ''}
                {g.type ? ` (${g.type.replace(/_/g, ' ')})` : ''}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> People in their world
          </h3>
          {onAddPerson && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleAdd}
              className="h-7 px-2 text-[11px] border-white/15 bg-white/[0.03] text-white/70 hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>
        {addOpen && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-2 space-y-2">
            <div className="grid sm:grid-cols-[1fr_150px_130px_auto] gap-2">
              <select
                value={selectedCharacterId}
                onChange={(event) => setSelectedCharacterId(event.target.value)}
                disabled={charactersLoading}
                className="h-9 rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
              >
                <option value="">Choose existing character</option>
                {availableCharacterOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
              <select
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                className="h-9 rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
              >
                {WORLD_RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="h-9 rounded-md border border-white/10 bg-black/50 px-2 text-xs text-white"
              >
                {WORLD_RELATIONSHIP_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={addPerson}
                disabled={!selectedCharacterId || savingKey === 'add' || charactersLoading}
                className="h-9 text-xs"
              >
                {savingKey === 'add' || charactersLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
              </Button>
            </div>
            {availableCharacterOptions.length === 0 && !charactersLoading && (
              <p className="text-[10px] text-white/35">No other Character Book people are available to add.</p>
            )}
          </div>
        )}
        {editorError && (
          <p className="text-[11px] text-red-300 mb-2">{editorError}</p>
        )}
        {mergedPeople.length === 0 ? (
          <UnknownField
            label="Connections"
            prompt={`Who is ${characterFirstName} connected to in your story? `}
            onAskInChat={onAskInChat}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {mergedPeople.slice(0, 10).map((person) => {
              const badge = associationBadge(person.associationKind);
              const clickable = person.characterId && onOpenCharacter;
              return (
                <div
                  key={person.key}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => person.characterId && onOpenCharacter?.(person.characterId)}
                      className={`text-sm font-medium text-white truncate text-left ${
                        clickable ? 'hover:text-primary cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      {person.name}
                    </button>
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                  </div>
                  {person.editable && person.relationshipId ? (
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                      <select
                        value={person.relationshipType}
                        onChange={(event) => updatePerson(person.relationshipId!, { relationship_type: event.target.value })}
                        disabled={savingKey?.startsWith(person.relationshipId)}
                        className="h-7 min-w-0 rounded-md border border-white/10 bg-black/50 px-1.5 text-[10px] text-white capitalize"
                      >
                        {WORLD_RELATIONSHIP_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <select
                        value={person.status ?? 'active'}
                        onChange={(event) => updatePerson(person.relationshipId!, { status: event.target.value })}
                        disabled={savingKey?.startsWith(person.relationshipId)}
                        className="h-7 min-w-0 rounded-md border border-white/10 bg-black/50 px-1.5 text-[10px] text-white capitalize"
                      >
                        {WORLD_RELATIONSHIP_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => deletePerson(person.relationshipId!, person.characterId ?? undefined)}
                        disabled={savingKey === `${person.relationshipId}-delete`}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-red-500/20 text-red-300/80 hover:bg-red-500/10 disabled:opacity-50"
                        aria-label={`Remove ${person.name}`}
                      >
                        {savingKey === `${person.relationshipId}-delete`
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-white/45 capitalize truncate">
                        {person.relationshipType.replace(/_/g, ' ')}
                        {person.domain ? ` · ${person.domain}` : ''}
                      </p>
                      {person.characterId && onAddPerson && (
                        <button
                          type="button"
                          onClick={() => linkPerson(person.characterId!, person.relationshipType)}
                          disabled={savingKey === `link-${person.characterId}`}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary/90 hover:bg-primary/20 disabled:opacity-50"
                          title={`Add ${person.name} as a managed relationship`}
                          aria-label={`Add ${person.name} as a relationship`}
                        >
                          {savingKey === `link-${person.characterId}`
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Plus className="h-3 w-3" />}
                          Add
                        </button>
                      )}
                    </div>
                  )}
                  {person.summary && (
                    <p className="text-[10px] text-white/35 mt-1 line-clamp-2">{person.summary}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {displayProfile.loreSnippets.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
          <h3 className="text-xs font-bold text-white/70 flex items-center gap-1.5 mb-2">
            <Layers className="h-3.5 w-3.5" /> Other lore
          </h3>
          <ul className="space-y-1.5 text-xs text-white/65">
            {displayProfile.loreSnippets.slice(0, 6).map((snippet) => (
              <li key={snippet.id} className="flex gap-2">
                <span className="text-white/25 shrink-0 capitalize">{snippet.category?.replace(/_/g, ' ')}</span>
                <span>{snippet.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
