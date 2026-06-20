/**
 * Title stability rules — avoid churn; user lock wins; preserve old titles as aliases.
 */

import type {
  CharacterDisplayTitle,
  MergeWithNamedPersonProposal,
  TitleStability,
  TitleUpdateProposal,
} from './personDisplayTitleTypes';
import { mergeAliasIntoList } from './aliasProminenceService';
import { inferTitleType, parseTitlePartsFromName } from './dynamicCharacterTitleService';

export type ApplyTitleUpdateInput = {
  current: CharacterDisplayTitle;
  proposal: TitleUpdateProposal;
  userConfirmed?: boolean;
  force?: boolean;
};

export type ApplyTitleUpdateResult = {
  applied: boolean;
  displayTitle: CharacterDisplayTitle;
  reason: string;
};

const STABILITY_RANK: Record<TitleStability, number> = {
  locked: 5,
  stable: 4,
  suggested_update: 3,
  temporary: 2,
  needs_resolution: 1,
};

function rank(stability: TitleStability): number {
  return STABILITY_RANK[stability] ?? 0;
}

export function canAutoApplyTitleUpdate(
  current: CharacterDisplayTitle,
  proposal: TitleUpdateProposal,
  userConfirmed = false
): boolean {
  if (current.stability === 'locked') return userConfirmed;
  if (userConfirmed) return true;
  if (proposal.stability === 'suggested_update') return false;
  if (rank(current.stability) >= rank('stable') && proposal.stability !== 'locked') return false;
  if (current.titleType === 'legal_or_full_name' && proposal.proposedTitleType === 'role_contextual') {
    return false;
  }
  return proposal.stability === 'temporary' || current.stability === 'needs_resolution';
}

export function applyTitleUpdate(input: ApplyTitleUpdateInput): ApplyTitleUpdateResult {
  const { current, proposal, userConfirmed = false, force = false } = input;

  if (current.stability === 'locked' && !userConfirmed && !force) {
    return { applied: false, displayTitle: current, reason: 'title_locked' };
  }

  if (!force && !canAutoApplyTitleUpdate(current, proposal, userConfirmed)) {
    return {
      applied: false,
      displayTitle: { ...current, stability: 'suggested_update' },
      reason: 'requires_user_confirmation',
    };
  }

  let aliases = current.aliases;
  if (
    proposal.preservePreviousAsAlias &&
    current.primaryTitle.trim().toLowerCase() !== proposal.proposedPrimaryTitle.trim().toLowerCase()
  ) {
    aliases = mergeAliasIntoList(aliases, current.primaryTitle, 'old_display_title');
  }

  return {
    applied: true,
    reason: userConfirmed ? 'user_confirmed' : 'auto_applied',
    displayTitle: {
      ...current,
      primaryTitle: proposal.proposedPrimaryTitle,
      titleParts: proposal.proposedParts,
      titleType: proposal.proposedTitleType,
      aliases,
      stability: userConfirmed ? 'stable' : proposal.stability,
      evidencePhrases: [...new Set([...current.evidencePhrases, proposal.reason])],
    },
  };
}

export function lockCharacterTitle(displayTitle: CharacterDisplayTitle): CharacterDisplayTitle {
  return { ...displayTitle, stability: 'locked' };
}

export function proposeMergeContextualWithNamedPerson(
  contextualTitle: CharacterDisplayTitle,
  namedPerson: string,
  options: { preferContextualPrimary?: boolean; subtitle?: string } = {}
): MergeWithNamedPersonProposal {
  const namedParts = parseTitlePartsFromName(namedPerson);
  const namedPrimary = namedPerson.trim();

  if (options.preferContextualPrimary) {
    return {
      namedPersonTitle: namedPrimary,
      contextualTitle: contextualTitle.primaryTitle,
      suggestedPrimary: contextualTitle.primaryTitle,
      suggestedAliases: [namedPrimary, ...contextualTitle.aliases.map((a) => a.value)],
      suggestedSubtitle: options.subtitle,
    };
  }

  return {
    namedPersonTitle: namedPrimary,
    contextualTitle: contextualTitle.primaryTitle,
    suggestedPrimary: namedPrimary,
    suggestedAliases: [contextualTitle.primaryTitle, ...contextualTitle.aliases.map((a) => a.value)],
    suggestedSubtitle: options.subtitle ?? contextualTitle.primaryTitle,
  };
}

export function applyNamedPersonMergeProposal(
  current: CharacterDisplayTitle,
  proposal: MergeWithNamedPersonProposal,
  userConfirmed: boolean
): ApplyTitleUpdateResult {
  if (!userConfirmed) {
    return {
      applied: false,
      displayTitle: { ...current, stability: 'suggested_update' },
      reason: 'merge_requires_confirmation',
    };
  }

  const parts = parseTitlePartsFromName(proposal.suggestedPrimary);
  const update: TitleUpdateProposal = {
    proposedPrimaryTitle: proposal.suggestedPrimary,
    proposedTitleType: inferTitleType(proposal.suggestedPrimary, parts),
    proposedParts: parts,
    reason: 'merged_contextual_with_named_person',
    stability: 'stable',
    preservePreviousAsAlias: true,
  };

  let aliases = current.aliases;
  for (const alias of proposal.suggestedAliases) {
    if (alias.toLowerCase() === proposal.suggestedPrimary.toLowerCase()) continue;
    aliases = mergeAliasIntoList(aliases, alias, 'role_reference');
  }

  const merged = applyTitleUpdate({
    current: { ...current, aliases },
    proposal: update,
    userConfirmed: true,
  });

  return merged;
}

export function buildSuggestedUpdateFromInference(
  current: CharacterDisplayTitle,
  inferredPrimary: string
): TitleUpdateProposal | null {
  if (current.stability === 'locked') return null;
  if (current.primaryTitle.trim().toLowerCase() === inferredPrimary.trim().toLowerCase()) return null;

  const parts = parseTitlePartsFromName(inferredPrimary);
  return {
    proposedPrimaryTitle: inferredPrimary,
    proposedTitleType: inferTitleType(inferredPrimary, parts),
    proposedParts: parts,
    reason: 'inferred_better_title',
    stability: 'suggested_update',
    preservePreviousAsAlias: true,
  };
}
