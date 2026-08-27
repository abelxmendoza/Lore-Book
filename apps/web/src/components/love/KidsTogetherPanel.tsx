// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useMemo, useState } from 'react';
import { Baby, Loader2, PawPrint, Plus, Trash2, Users, X } from 'lucide-react';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';
import { Button } from '../ui/button';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';

export type KidTogether = {
  id: string;
  name: string;
  /** 'together' = both parents; 'step' = belongs to just one of them. */
  relation: 'together' | 'step';
  belongsTo?: 'both' | 'self' | 'partner';
  coParents?: Array<{ id?: string; name: string; relation_label?: string }>;
};

export type PetTogether = {
  id: string;
  name: string;
  /** 'together' = both own it; 'step' = one side brought it into the relationship. */
  relation: 'together' | 'step';
  belongsTo?: 'both' | 'self' | 'partner';
  species?: string | null;
};

export type DependentKind = 'child' | 'pet';
export type DependentBelongsTo = 'both' | 'self' | 'partner';

export type DependentCandidate = {
  id: string;
  name: string;
  archetype?: string | null;
  species?: string | null;
};

export type AddDependentInput = {
  kind: DependentKind;
  belongsTo: DependentBelongsTo;
  characterId?: string;
  name: string;
  species?: string;
};

type KidsAndPetsTogetherPanelProps = {
  kids: KidTogether[];
  pets?: PetTogether[];
  loading: boolean;
  partnerName: string;
  /** Prefer in-place Character modal (Love surface) over navigating to Character Book. */
  onOpenPeripheralCharacter?: (characterId: string) => void;
  onCloseModal?: () => void;
  candidateCharacters?: DependentCandidate[];
  excludeCharacterIds?: string[];
  busy?: boolean;
  error?: string | null;
  onAddDependent?: (input: AddDependentInput) => Promise<void> | void;
  onRemoveDependent?: (characterId: string, kind: DependentKind) => Promise<void> | void;
  onOpenAddPanel?: () => void;
};

function isPetCandidate(candidate: DependentCandidate): boolean {
  return candidate.archetype === 'pet' || Boolean(candidate.species);
}

/** Dating & Romance — offspring, step-kids, shared pets, and other co-parents. */
export function KidsTogetherPanel({
  kids,
  pets = [],
  loading,
  partnerName,
  onOpenPeripheralCharacter,
  onCloseModal,
  candidateCharacters = [],
  excludeCharacterIds = [],
  busy = false,
  error = null,
  onAddDependent,
  onRemoveDependent,
  onOpenAddPanel,
}: KidsAndPetsTogetherPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<DependentKind>('child');
  const [belongsTo, setBelongsTo] = useState<DependentBelongsTo>('both');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [species, setSpecies] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState<{ id: string; kind: DependentKind } | null>(null);

  const openCharacter = (characterId: string) => {
    if (onOpenPeripheralCharacter) {
      onOpenPeripheralCharacter(characterId);
      return;
    }
    onCloseModal?.();
    openCharacterBookModal({ characterId, tab: 'info' });
  };

  const linkedIds = useMemo(
    () => new Set([...kids.map((k) => k.id), ...pets.map((p) => p.id), ...excludeCharacterIds.filter(Boolean)]),
    [kids, pets, excludeCharacterIds],
  );

  const pickerItems = useMemo(() => {
    const available = candidateCharacters.filter((c) => !linkedIds.has(c.id));
    const kindMatched = available.filter((c) => (kind === 'pet' ? isPetCandidate(c) : !isPetCandidate(c)));
    return kindMatched.length > 0 ? kindMatched : available;
  }, [candidateCharacters, linkedIds, kind]);

  const resetAddForm = () => {
    setKind('child');
    setBelongsTo('both');
    setName('');
    setSelectedId('');
    setSpecies('');
  };

  const openAddPanel = () => {
    setShowAdd(true);
    onOpenAddPanel?.();
  };

  const submitAdd = async () => {
    const trimmed = name.trim();
    if (!onAddDependent || (!selectedId && !trimmed) || busy) return;
    await onAddDependent({
      kind,
      belongsTo,
      characterId: selectedId || undefined,
      name: trimmed || pickerItems.find((c) => c.id === selectedId)?.name || '',
      species: kind === 'pet' ? species.trim() || undefined : undefined,
    });
    resetAddForm();
    setShowAdd(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Baby className="h-6 w-6 text-pink-400/50 animate-pulse" />
      </div>
    );
  }

  const together = kids.filter((k) => k.relation === 'together');
  const step = kids.filter((k) => k.relation === 'step');
  const petsTogether = pets.filter((p) => p.relation === 'together');
  const petsOneSided = pets.filter((p) => p.relation !== 'together');
  const isEmpty = kids.length === 0 && pets.length === 0;
  const canCurate = Boolean(onAddDependent);

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0" data-testid="kids-together-panel">
      {canCurate && (
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant={showAdd ? 'outline' : 'default'}
            className="h-9"
            onClick={() => {
              if (showAdd) {
                setShowAdd(false);
                resetAddForm();
                return;
              }
              openAddPanel();
            }}
            data-testid="kids-together-add-toggle"
          >
            {showAdd ? <X className="h-3.5 w-3.5 mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            {showAdd ? 'Close' : 'Add child or pet'}
          </Button>
        </div>
      )}

      {showAdd && canCurate && (
        <div
          className="rounded-lg border border-pink-500/20 bg-black/40 px-3 py-3 sm:p-4 space-y-3"
          data-testid="kids-together-add-form"
        >
          <div className="grid grid-cols-2 gap-2">
            <KindToggle value={kind} onChange={setKind} />
            <BelongsToggle value={belongsTo} onChange={setBelongsTo} partnerName={partnerName} />
          </div>
          <SearchWithAutocomplete
            value={name}
            onChange={(next) => {
              setName(next);
              if (selectedId) {
                const selected = pickerItems.find((c) => c.id === selectedId);
                if (!selected || selected.name.toLowerCase() !== next.trim().toLowerCase()) {
                  setSelectedId('');
                }
              }
            }}
            onSelectItem={(item) => {
              setSelectedId(item.id);
              setName(item.name);
              if (item.species) setSpecies(item.species);
            }}
            placeholder={kind === 'pet' ? 'Search a pet or type a name' : 'Search a person or type a name'}
            items={pickerItems}
            getSearchableText={(item) => item.name}
            getDisplayLabel={(item) => item.name}
            getItemKey={(item) => item.id}
            minCharsToSuggest={0}
            emptyHint="Type a name to add someone new"
            data-testid="kids-together-name-search"
            inputProps={{ 'aria-label': kind === 'pet' ? 'Child or pet name' : 'Child name' }}
            inputClassName="h-10 bg-black/55 border-white/12 text-white rounded-xl"
          />
          {kind === 'pet' && (
            <input
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="Species (optional) — dog, cat, …"
              className="h-10 w-full rounded-xl border border-white/12 bg-black/55 px-3 text-sm text-white placeholder:text-white/30"
              data-testid="kids-together-species"
            />
          )}
          <Button
            type="button"
            size="sm"
            className="w-full h-9"
            disabled={busy || (!selectedId && !name.trim())}
            onClick={() => void submitAdd()}
            data-testid="kids-together-add-submit"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${kind === 'pet' ? 'pet' : 'child'}`}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-300" role="alert" data-testid="kids-together-error">
          {error}
        </p>
      )}

      {isEmpty && (
        <div className="text-center py-8 text-white/40 px-4" data-testid="kids-together-empty">
          <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No kids or pets linked to this relationship yet.</p>
          <p className="text-xs text-white/30 mt-1">
            Mention a child or pet you share with {partnerName} in chat, add them to your Family Tree,
            or add them here.
          </p>
        </div>
      )}

      {together.length > 0 && (
        <Section title={`Kids together (${together.length})`}>
          {together.map((kid) => (
            <KidCard
              key={kid.id}
              kid={kid}
              partnerName={partnerName}
              onOpenCharacter={openCharacter}
              confirmUnlink={confirmUnlink}
              busy={busy}
              onAskUnlink={onRemoveDependent ? (id) => setConfirmUnlink({ id, kind: 'child' }) : undefined}
              onCancelUnlink={() => setConfirmUnlink(null)}
              onConfirmUnlink={
                onRemoveDependent
                  ? async (id) => {
                      await onRemoveDependent(id, 'child');
                      setConfirmUnlink(null);
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      )}

      {step.length > 0 && (
        <Section title={`Step-kids (${step.length})`}>
          {step.map((kid) => (
            <KidCard
              key={kid.id}
              kid={kid}
              partnerName={partnerName}
              onOpenCharacter={openCharacter}
              confirmUnlink={confirmUnlink}
              busy={busy}
              onAskUnlink={onRemoveDependent ? (id) => setConfirmUnlink({ id, kind: 'child' }) : undefined}
              onCancelUnlink={() => setConfirmUnlink(null)}
              onConfirmUnlink={
                onRemoveDependent
                  ? async (id) => {
                      await onRemoveDependent(id, 'child');
                      setConfirmUnlink(null);
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      )}

      {petsTogether.length > 0 && (
        <Section title={`Pets together (${petsTogether.length})`}>
          {petsTogether.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              partnerName={partnerName}
              onOpenCharacter={openCharacter}
              confirmUnlink={confirmUnlink}
              busy={busy}
              onAskUnlink={onRemoveDependent ? (id) => setConfirmUnlink({ id, kind: 'pet' }) : undefined}
              onCancelUnlink={() => setConfirmUnlink(null)}
              onConfirmUnlink={
                onRemoveDependent
                  ? async (id) => {
                      await onRemoveDependent(id, 'pet');
                      setConfirmUnlink(null);
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      )}

      {petsOneSided.length > 0 && (
        <Section title={`Their & your pets (${petsOneSided.length})`}>
          {petsOneSided.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              partnerName={partnerName}
              onOpenCharacter={openCharacter}
              confirmUnlink={confirmUnlink}
              busy={busy}
              onAskUnlink={onRemoveDependent ? (id) => setConfirmUnlink({ id, kind: 'pet' }) : undefined}
              onCancelUnlink={() => setConfirmUnlink(null)}
              onConfirmUnlink={
                onRemoveDependent
                  ? async (id) => {
                      await onRemoveDependent(id, 'pet');
                      setConfirmUnlink(null);
                    }
                  : undefined
              }
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function KindToggle({
  value,
  onChange,
}: {
  value: DependentKind;
  onChange: (kind: DependentKind) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Kind</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 p-1">
        <button
          type="button"
          className={`h-8 rounded-md text-xs ${value === 'child' ? 'bg-pink-500/25 text-pink-100' : 'text-white/55'}`}
          onClick={() => onChange('child')}
          data-testid="kids-together-kind-child"
        >
          Child
        </button>
        <button
          type="button"
          className={`h-8 rounded-md text-xs ${value === 'pet' ? 'bg-amber-500/25 text-amber-100' : 'text-white/55'}`}
          onClick={() => onChange('pet')}
          data-testid="kids-together-kind-pet"
        >
          Pet
        </button>
      </div>
    </div>
  );
}

function BelongsToggle({
  value,
  onChange,
  partnerName,
}: {
  value: DependentBelongsTo;
  onChange: (belongsTo: DependentBelongsTo) => void;
  partnerName: string;
}) {
  const options: Array<{ id: DependentBelongsTo; label: string; testId: string }> = [
    { id: 'both', label: 'Both of you', testId: 'kids-together-belongs-both' },
    { id: 'self', label: 'Yours', testId: 'kids-together-belongs-self' },
    { id: 'partner', label: `${partnerName}'s`, testId: 'kids-together-belongs-partner' },
  ];
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-white/40">Belongs to</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`h-8 rounded-md text-[10px] px-1 truncate ${
              value === option.id ? 'bg-white/15 text-white' : 'text-white/55'
            }`}
            onClick={() => onChange(option.id)}
            data-testid={option.testId}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-white/40 px-0.5">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function UnlinkControls({
  name,
  characterId,
  kind,
  confirmUnlink,
  busy,
  onAskUnlink,
  onCancelUnlink,
  onConfirmUnlink,
}: {
  name: string;
  characterId: string;
  kind: DependentKind;
  confirmUnlink: { id: string; kind: DependentKind } | null;
  busy: boolean;
  onAskUnlink?: (id: string) => void;
  onCancelUnlink?: () => void;
  onConfirmUnlink?: (id: string) => void | Promise<void>;
}) {
  if (!onAskUnlink || !onConfirmUnlink) return null;
  const confirming = confirmUnlink?.id === characterId && confirmUnlink.kind === kind;
  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0" data-testid="kids-together-unlink-confirm">
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-rose-400/40 text-rose-200 hover:bg-rose-500/15"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void onConfirmUnlink(characterId);
          }}
          data-testid="kids-together-unlink-confirm-yes"
        >
          Unlink
        </button>
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/55 hover:bg-white/10"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onCancelUnlink?.();
          }}
        >
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Unlink ${name} from this relationship`}
      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-white/25 hover:bg-red-500/15 hover:text-red-400"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onAskUnlink(characterId);
      }}
      data-testid="kids-together-unlink"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function KidCard({
  kid,
  partnerName,
  onOpenCharacter,
  confirmUnlink,
  busy,
  onAskUnlink,
  onCancelUnlink,
  onConfirmUnlink,
}: {
  kid: KidTogether;
  partnerName: string;
  onOpenCharacter: (characterId: string) => void;
  confirmUnlink: { id: string; kind: DependentKind } | null;
  busy: boolean;
  onAskUnlink?: (id: string) => void;
  onCancelUnlink?: () => void;
  onConfirmUnlink?: (id: string) => void | Promise<void>;
}) {
  const isStep = kid.relation === 'step';
  const belongsToLabel =
    kid.belongsTo === 'self' ? 'Your child — now step-child to ' + partnerName
      : kid.belongsTo === 'partner' ? `${partnerName}'s child — now your step-child`
      : null;

  return (
    <div
      className="rounded-lg border border-pink-500/20 bg-black/40 px-3 py-2.5 sm:p-4"
      data-testid="kids-together-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Baby className="h-4 w-4 shrink-0 text-pink-300/80" />
          <button
            type="button"
            onClick={() => onOpenCharacter(kid.id)}
            className="text-sm font-medium text-white truncate hover:text-pink-200 hover:underline underline-offset-2 transition-colors text-left"
            data-testid="kids-together-open-kid"
          >
            {kid.name}
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              isStep
                ? 'bg-purple-500/10 text-purple-200 border-purple-500/25'
                : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/25'
            }`}
          >
            {isStep ? 'Step-child' : 'Together'}
          </span>
          <UnlinkControls
            name={kid.name}
            characterId={kid.id}
            kind="child"
            confirmUnlink={confirmUnlink}
            busy={busy}
            onAskUnlink={onAskUnlink}
            onCancelUnlink={onCancelUnlink}
            onConfirmUnlink={onConfirmUnlink}
          />
        </div>
      </div>

      {belongsToLabel && <p className="mt-1 text-xs text-white/45">{belongsToLabel}</p>}

      {kid.coParents && kid.coParents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-1.5">
          <Users className="h-3 w-3 mt-0.5 shrink-0 text-white/35" />
          <p className="text-xs text-white/50">
            Also co-parented by{' '}
            {kid.coParents.map((cp, i) => (
              <span key={cp.id ?? cp.name}>
                {cp.id ? (
                  <button
                    type="button"
                    onClick={() => onOpenCharacter(cp.id!)}
                    className="text-white/70 hover:text-pink-200 hover:underline underline-offset-2 transition-colors"
                    data-testid="kids-together-open-coparent"
                  >
                    {cp.name}
                  </button>
                ) : (
                  <span className="text-white/70">{cp.name}</span>
                )}
                {cp.relation_label ? ` (${cp.relation_label})` : ''}
                {i < kid.coParents!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}

function PetCard({
  pet,
  partnerName,
  onOpenCharacter,
  confirmUnlink,
  busy,
  onAskUnlink,
  onCancelUnlink,
  onConfirmUnlink,
}: {
  pet: PetTogether;
  partnerName: string;
  onOpenCharacter: (characterId: string) => void;
  confirmUnlink: { id: string; kind: DependentKind } | null;
  busy: boolean;
  onAskUnlink?: (id: string) => void;
  onCancelUnlink?: () => void;
  onConfirmUnlink?: (id: string) => void | Promise<void>;
}) {
  const shared = pet.relation === 'together';
  const belongsToLabel =
    pet.belongsTo === 'self'
      ? 'Yours — lives with you both'
      : pet.belongsTo === 'partner'
        ? `${partnerName}'s pet`
        : null;

  return (
    <div
      className="rounded-lg border border-amber-500/20 bg-black/40 px-3 py-2.5 sm:p-4"
      data-testid="pets-together-card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PawPrint className="h-4 w-4 shrink-0 text-amber-300/80" />
          <button
            type="button"
            onClick={() => onOpenCharacter(pet.id)}
            className="text-sm font-medium text-white truncate hover:text-amber-200 hover:underline underline-offset-2 transition-colors text-left"
            data-testid="pets-together-open-pet"
          >
            {pet.name}
          </button>
          {pet.species && (
            <span className="shrink-0 text-xs text-white/35 capitalize">{pet.species}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
              shared
                ? 'bg-amber-500/10 text-amber-200 border-amber-500/25'
                : 'bg-white/5 text-white/55 border-white/15'
            }`}
          >
            {shared ? 'Together' : 'One household'}
          </span>
          <UnlinkControls
            name={pet.name}
            characterId={pet.id}
            kind="pet"
            confirmUnlink={confirmUnlink}
            busy={busy}
            onAskUnlink={onAskUnlink}
            onCancelUnlink={onCancelUnlink}
            onConfirmUnlink={onConfirmUnlink}
          />
        </div>
      </div>

      {belongsToLabel && <p className="mt-1 text-xs text-white/45">{belongsToLabel}</p>}
    </div>
  );
}
