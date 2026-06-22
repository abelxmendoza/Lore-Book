import type { ConfirmationChip, ConfirmationChipAction, TruthClaim } from './truthStateTypes';
import { isDurableTruthState, isReviewOnlyState } from './truthStateTypes';

const CHIP_DEFS: Array<{
  action: ConfirmationChipAction;
  label: string;
  priority: number;
  when: (claim: TruthClaim) => boolean;
  reason?: string;
}> = [
  {
    action: 'confirm',
    label: 'Confirm',
    priority: 10,
    when: (c) => isReviewOnlyState(c.truthState) && c.origin !== 'assistant_generated',
    reason: 'Promote to durable canon',
  },
  {
    action: 'edit',
    label: 'Edit',
    priority: 9,
    when: (c) => c.truthState !== 'rejected' && c.truthState !== 'archived',
    reason: 'Correct claim text or attachment',
  },
  {
    action: 'merge',
    label: 'Merge',
    priority: 8,
    when: (c) => c.claimType === 'entity' || c.claimType === 'identity',
    reason: 'Merge with existing entity',
  },
  {
    action: 'keep_separate',
    label: 'Keep separate',
    priority: 7,
    when: (c) => c.truthState === 'contradicted' || c.claimType === 'relationship',
    reason: 'Resolve as distinct facts',
  },
  {
    action: 'reject',
    label: 'Reject',
    priority: 6,
    when: (c) => c.truthState !== 'rejected',
    reason: 'Dismiss and stop resurfacing',
  },
  {
    action: 'move_to_other_book',
    label: 'Move to other book',
    priority: 5,
    when: (c) => c.claimType === 'entity' || c.claimType === 'relationship',
    reason: 'Re-home to another book domain',
  },
  {
    action: 'mark_sensitive',
    label: 'Mark sensitive',
    priority: 4,
    when: (c) => c.sensitiveCategories.length > 0,
    reason: 'Flag for careful handling',
  },
  {
    action: 'need_more_context',
    label: 'Need more context',
    priority: 3,
    when: (c) =>
      c.origin === 'assistant_generated' ||
      c.origin === 'system_inferred' ||
      c.confidence < 0.65,
    reason: 'Insufficient evidence for canon',
  },
];

export function buildConfirmationChips(claim: TruthClaim): ConfirmationChip[] {
  return CHIP_DEFS.filter(({ when }) => when(claim)).map(({ action, label, priority, reason }) => ({
    id: crypto.randomUUID(),
    claimId: claim.id,
    label,
    action,
    priority,
    reason,
  }));
}

export function buildChipsForClaims(claims: TruthClaim[]): ConfirmationChip[] {
  const chips: ConfirmationChip[] = [];
  for (const claim of claims) {
    if (isDurableTruthState(claim.truthState)) continue;
    if (claim.truthState === 'rejected' || claim.truthState === 'archived') continue;
    chips.push(...buildConfirmationChips(claim));
  }
  return chips.sort((a, b) => b.priority - a.priority);
}

export function hasConfirmChip(chips: ConfirmationChip[]): boolean {
  return chips.some((c) => c.action === 'confirm');
}

export function hasRejectChip(chips: ConfirmationChip[]): boolean {
  return chips.some((c) => c.action === 'reject');
}
