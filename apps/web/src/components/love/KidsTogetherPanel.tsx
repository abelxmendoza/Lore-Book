// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { Baby, PawPrint, Users } from 'lucide-react';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';

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

type KidsAndPetsTogetherPanelProps = {
  kids: KidTogether[];
  pets?: PetTogether[];
  loading: boolean;
  partnerName: string;
  /** Prefer in-place Character modal (Love surface) over navigating to Character Book. */
  onOpenPeripheralCharacter?: (characterId: string) => void;
  onCloseModal?: () => void;
};

/** Dating & Romance — offspring, step-kids, shared pets, and other co-parents. */
export function KidsTogetherPanel({
  kids,
  pets = [],
  loading,
  partnerName,
  onOpenPeripheralCharacter,
  onCloseModal,
}: KidsAndPetsTogetherPanelProps) {
  const openCharacter = (characterId: string) => {
    if (onOpenPeripheralCharacter) {
      onOpenPeripheralCharacter(characterId);
      return;
    }
    onCloseModal?.();
    openCharacterBookModal({ characterId, tab: 'info' });
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Baby className="h-6 w-6 text-pink-400/50 animate-pulse" />
      </div>
    );
  }

  if (kids.length === 0 && pets.length === 0) {
    return (
      <div className="text-center py-12 text-white/40 px-4" data-testid="kids-together-empty">
        <Baby className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No kids or pets linked to this relationship yet.</p>
        <p className="text-xs text-white/30 mt-1">
          Mention a child or pet you share with {partnerName} in chat, or add them to your Family Tree.
        </p>
      </div>
    );
  }

  const together = kids.filter((k) => k.relation === 'together');
  const step = kids.filter((k) => k.relation === 'step');
  const petsTogether = pets.filter((p) => p.relation === 'together');
  const petsOneSided = pets.filter((p) => p.relation !== 'together');

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0" data-testid="kids-together-panel">
      {together.length > 0 && (
        <Section title={`Kids together (${together.length})`}>
          {together.map((kid) => (
            <KidCard key={kid.id} kid={kid} partnerName={partnerName} onOpenCharacter={openCharacter} />
          ))}
        </Section>
      )}

      {step.length > 0 && (
        <Section title={`Step-kids (${step.length})`}>
          {step.map((kid) => (
            <KidCard key={kid.id} kid={kid} partnerName={partnerName} onOpenCharacter={openCharacter} />
          ))}
        </Section>
      )}

      {petsTogether.length > 0 && (
        <Section title={`Pets together (${petsTogether.length})`}>
          {petsTogether.map((pet) => (
            <PetCard key={pet.id} pet={pet} partnerName={partnerName} onOpenCharacter={openCharacter} />
          ))}
        </Section>
      )}

      {petsOneSided.length > 0 && (
        <Section title={`Their & your pets (${petsOneSided.length})`}>
          {petsOneSided.map((pet) => (
            <PetCard key={pet.id} pet={pet} partnerName={partnerName} onOpenCharacter={openCharacter} />
          ))}
        </Section>
      )}
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

function KidCard({
  kid,
  partnerName,
  onOpenCharacter,
}: {
  kid: KidTogether;
  partnerName: string;
  onOpenCharacter: (characterId: string) => void;
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
        <span
          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
            isStep
              ? 'bg-purple-500/10 text-purple-200 border-purple-500/25'
              : 'bg-cyan-500/10 text-cyan-200 border-cyan-500/25'
          }`}
        >
          {isStep ? 'Step-child' : 'Together'}
        </span>
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
}: {
  pet: PetTogether;
  partnerName: string;
  onOpenCharacter: (characterId: string) => void;
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
        <span
          className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
            shared
              ? 'bg-amber-500/10 text-amber-200 border-amber-500/25'
              : 'bg-white/5 text-white/55 border-white/15'
          }`}
        >
          {shared ? 'Together' : 'One household'}
        </span>
      </div>

      {belongsToLabel && <p className="mt-1 text-xs text-white/45">{belongsToLabel}</p>}
    </div>
  );
}
