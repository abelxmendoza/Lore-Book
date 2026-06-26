import { supabaseAdmin } from '../../supabaseClient';
import { logger } from '../../../logger';
import {
  isAmbiguousRoleLabel,
  isGenericFamilyLabel,
  isValidFamilyTitleName,
  looksLikeStageOrNickname,
  isContextualTitle,
  isBareTitleInvalid,
} from './ambiguousCharacterGuard';
import { evaluateBrokenPossessive } from './brokenPossessiveNameGuard';
import { evaluateWrongDomain, isJunkTestData } from './wrongDomainCharacterGuard';
import {
  suggestContextualTitle,
  buildAmbiguousContext,
} from './contextualReferenceRepairService';
import {
  extractProvenanceText,
  summarizeProvenance,
} from './characterProvenanceAuditService';
import { findMergeCandidatesForCharacter } from './characterMergeCandidateService';
import type {
  CharacterAuditStatus,
  CharacterCardAuditInput,
  CharacterCardAuditReport,
  CharacterCardAuditResult,
} from './characterCardAuditTypes';
import { isCharacterCardUserReviewed } from './characterCardReviewState';

function emptySummary(): Record<CharacterAuditStatus, number> {
  return {
    valid_identity: 0,
    valid_contextual_reference: 0,
    needs_context: 0,
    wrong_domain: 0,
    broken_span: 0,
    duplicate_or_merge_candidate: 0,
    junk_test_data: 0,
    bare_title_invalid: 0,
    needs_identity_resolution: 0,
  };
}

function auditSingleCharacter(
  input: CharacterCardAuditInput,
  roster: CharacterCardAuditInput[],
  provenanceById: Map<string, string>,
): CharacterCardAuditResult {
  const provenance = provenanceById.get(input.id) ?? '';
  const provenanceSummary = summarizeProvenance(provenance);

  // 1. Junk / test data
  if (isJunkTestData(input.name, provenance)) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'junk_test_data',
      reason: 'Test or placeholder junk label',
      recommendedAction: 'delete',
      provenanceSummary,
    };
  }

  // 2. Wrong domain (group / interest / system)
  const domain = evaluateWrongDomain(input.name, provenance);
  if (domain.wrongDomain) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'wrong_domain',
      reason: domain.reason ?? 'Wrong domain for Characters book',
      recommendedAction:
        domain.target === 'group'
          ? 'move_to_group'
          : domain.target === 'interest'
            ? 'move_to_interest'
            : 'delete',
      wrongDomainTarget: domain.target,
      provenanceSummary,
    };
  }

  // 3. Broken possessive span
  const possessive = evaluateBrokenPossessive(
    input.name,
    roster.map((r) => ({ id: r.id, name: r.name })),
  );
  if (possessive.isBroken) {
    const mergeCandidates = findMergeCandidatesForCharacter(input, roster, provenanceById);
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'broken_span',
      reason: 'Broken possessive span — should be alias on base identity',
      recommendedAction: 'merge',
      suggestedTitle: possessive.baseName,
      aliasToAdd: possessive.aliasToAdd,
      mergeCandidates,
      provenanceSummary,
    };
  }

  // 4. Generic family label (Cousin without name) — before bare-title delete
  if (isGenericFamilyLabel(input.name)) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      reason: 'Generic family label — needs named cousin or contextual title',
      status: 'needs_context',
      recommendedAction: 'rename_with_context',
      provenanceSummary,
    };
  }

  // 5. Bare invalid title
  if (isBareTitleInvalid(input.name)) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'bare_title_invalid',
      reason: 'Bare title or generic label without story context',
      recommendedAction: 'delete',
      provenanceSummary,
    };
  }

  // 6. Ambiguous role — repair with provenance if possible
  if (isAmbiguousRoleLabel(input.name)) {
    const repair = suggestContextualTitle(input.name, provenance);
    if (repair) {
      return {
        characterId: input.id,
        currentTitle: input.name,
        status: 'valid_contextual_reference',
        reason: 'Ambiguous role with enough provenance for contextual title',
        recommendedAction: 'rename_with_context',
        suggestedTitle: repair.suggestedTitle,
        provenanceSummary,
        ambiguousContext: buildAmbiguousContext(
          input.name,
          repair.suggestedTitle,
          provenance,
        ),
      };
    }
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'needs_context',
      reason: 'Ambiguous role label needs story context before it can stay in Characters',
      recommendedAction: 'rename_with_context',
      provenanceSummary,
    };
  }

  // 7. Valid contextual reference already
  if (isContextualTitle(input.name)) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'valid_contextual_reference',
      reason: 'Contextual ambiguous reference with embedded story context',
      recommendedAction: 'keep',
      provenanceSummary,
      ambiguousContext: buildAmbiguousContext(input.name, input.name, provenance),
    };
  }

  // 8. Family title + name, stage names
  if (isValidFamilyTitleName(input.name) || looksLikeStageOrNickname(input.name)) {
    const mergeCandidates = findMergeCandidatesForCharacter(input, roster, provenanceById);
    if (mergeCandidates.some((m) => m.overlapScore >= 0.7)) {
      return {
        characterId: input.id,
        currentTitle: input.name,
        status: 'duplicate_or_merge_candidate',
        reason: 'Possible alias/duplicate with shared provenance',
        recommendedAction: 'needs_review',
        mergeCandidates,
        provenanceSummary,
      };
    }
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'valid_identity',
      reason: isValidFamilyTitleName(input.name)
        ? 'Valid family-title identity'
        : 'Valid stage/nickname identity',
      recommendedAction: 'keep',
      provenanceSummary,
    };
  }

  // 9. Full names — keep but flag sparse context
  const mergeCandidates = findMergeCandidatesForCharacter(input, roster, provenanceById);
  const hasDuplicate = mergeCandidates.some((m) => m.overlapScore >= 0.75);

  if (hasDuplicate) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'duplicate_or_merge_candidate',
      reason: 'Possible duplicate — review provenance before merge',
      recommendedAction: 'needs_review',
      mergeCandidates,
      provenanceSummary,
    };
  }

  if (!provenance.trim()) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'needs_context',
      reason: 'Named identity with no captured story context yet',
      recommendedAction: 'keep',
      provenanceSummary,
    };
  }

  return {
    characterId: input.id,
    currentTitle: input.name,
    status: 'valid_identity',
    reason: 'Named identity with provenance',
    recommendedAction: 'keep',
    provenanceSummary,
  };
}

class CharacterCardAuditService {
  auditRoster(roster: CharacterCardAuditInput[]): CharacterCardAuditResult[] {
    const provenanceById = new Map<string, string>();
    for (const row of roster) {
      provenanceById.set(row.id, extractProvenanceText(row));
    }
    return roster.map((row) => auditSingleCharacter(row, roster, provenanceById));
  }

  async audit(userId: string): Promise<CharacterCardAuditReport> {
    // Self-heal missing provenance before auditing: cards from recovery/un-merge
    // land without any captured story context, but the conversations that named
    // them are intact in chat history. Backfill reconnects them so the audit
    // reflects what the user actually said instead of "No provenance captured
    // yet". Best-effort — never let it block the audit.
    try {
      const { characterProvenanceBackfillService } = await import(
        './characterProvenanceBackfillService'
      );
      await characterProvenanceBackfillService.backfillUser(userId);
    } catch (backfillError) {
      logger.warn({ error: backfillError, userId }, 'character provenance backfill skipped');
    }

    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata, context_of_mention, status')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('name');

    if (error) throw error;

    const roster: CharacterCardAuditInput[] = (data ?? []).map((row) => ({
      id: row.id,
      name: String(row.name ?? '').trim(),
      alias: (row.alias ?? []) as string[],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      contextOfMention: row.context_of_mention as string | null | undefined,
    }));

    const results = this.auditRoster(roster).filter((result) => {
      const meta = roster.find((row) => row.id === result.characterId)?.metadata ?? {};
      return !isCharacterCardUserReviewed(meta);
    });
    const summary = emptySummary();
    for (const r of results) {
      summary[r.status] += 1;
    }

    return {
      userId,
      generatedAt: new Date().toISOString(),
      characterCount: roster.length,
      results,
      summary,
    };
  }
}

export const characterCardAuditService = new CharacterCardAuditService();
export { auditSingleCharacter };
