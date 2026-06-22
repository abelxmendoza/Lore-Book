import type {
  ContradictionConflictType,
  ContradictionRecord,
  EvidenceBundle,
} from './provenanceInferenceTypes';

function normalizeClaim(text: string): string {
  return text.toLowerCase().replace(/[^\w\s']/g, '').replace(/\s+/g, ' ').trim();
}

function sharedSubject(a: EvidenceBundle, b: EvidenceBundle): boolean {
  const aWords = normalizeClaim(a.claimText).split(' ').filter((w) => w.length > 3);
  const bWords = normalizeClaim(b.claimText).split(' ').filter((w) => w.length > 3);
  return aWords.some((w) => bWords.includes(w));
}

function classifyConflict(
  oldBundle: EvidenceBundle,
  newBundle: EvidenceBundle,
): ContradictionConflictType {
  if (oldBundle.claimType === 'identity' || newBundle.claimType === 'identity') {
    return 'name_mismatch';
  }
  if (oldBundle.claimType === 'relationship' || newBundle.claimType === 'relationship') {
    return 'relationship_conflict';
  }
  if (oldBundle.claimType === 'status' || newBundle.claimType === 'status') {
    return 'status_conflict';
  }
  if (oldBundle.claimType === 'timeline' || newBundle.claimType === 'timeline') {
    return 'timeline_conflict';
  }
  if (oldBundle.claimType === 'preference' || newBundle.claimType === 'preference') {
    return 'preference_conflict';
  }
  return 'generic_conflict';
}

export function claimsContradict(a: EvidenceBundle, b: EvidenceBundle): boolean {
  if (a.claimType !== b.claimType) return false;
  if (!sharedSubject(a, b)) return false;

  const na = normalizeClaim(a.claimText);
  const nb = normalizeClaim(b.claimText);
  if (na === nb) return false;

  if (a.claimType === 'identity') {
    const aName = na.replace(/^person name is\s+/, '');
    const bName = nb.replace(/^person name is\s+/, '');
    return aName !== bName && (aName.includes(bName.split(' ')[0] ?? '') || bName.includes(aName.split(' ')[0] ?? ''));
  }

  if (a.claimType === 'relationship') {
    return na.includes('best friend') !== nb.includes('best friend') || na !== nb;
  }

  return na !== nb;
}

export function detectContradiction(
  newBundle: EvidenceBundle,
  priorBundles: EvidenceBundle[],
): { record: ContradictionRecord; oldBundle: EvidenceBundle } | null {
  for (const old of priorBundles) {
    if (old.truthState === 'archived' || old.truthState === 'rejected') continue;
    if (old.id === newBundle.id) continue;
    if (!claimsContradict(old, newBundle)) continue;

    return {
      oldBundle: old,
      record: {
        id: crypto.randomUUID(),
        oldEvidenceId: old.id,
        newEvidenceId: newBundle.id,
        oldClaimText: old.claimText,
        newClaimText: newBundle.claimText,
        conflictType: classifyConflict(old, newBundle),
        requiresReview: true,
        createdAt: newBundle.createdAt,
      },
    };
  }
  return null;
}

export function markContradicted(bundle: EvidenceBundle): EvidenceBundle {
  return { ...bundle, truthState: 'contradicted' };
}

export function preserveBothSides(
  oldBundle: EvidenceBundle,
  newBundle: EvidenceBundle,
): EvidenceBundle[] {
  return [markContradicted(oldBundle), { ...newBundle, truthState: 'review' }];
}
