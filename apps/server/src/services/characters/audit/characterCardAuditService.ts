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
  scanProvenance,
} from './contextualReferenceRepairService';
import {
  evaluateSentenceBleed,
  arbitrateDomainStrong,
  arbitrateDomainWeak,
  hasPersonNameShape,
  hasPersonProvenanceEvidence,
  type DomainArbitrationResult,
} from './characterIdentityGate';
import {
  pipelineDomain,
  llmClassifyDomains,
  cachedDomain,
  type AutoDomain,
  type AutoDomainResult,
  type LlmClassificationCard,
} from './characterDomainAutoClassifier';
import {
  extractProvenanceText,
  summarizeProvenance,
} from './characterProvenanceAuditService';
import { findMergeCandidatesForCharacter } from './characterMergeCandidateService';
import { isWrongDomainStatus } from './characterCardAuditTypes';
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
    contextual_character_needs_context: 0,
    needs_context: 0,
    wrong_domain: 0,
    wrong_domain_tool: 0,
    wrong_domain_media: 0,
    wrong_domain_band: 0,
    wrong_domain_role: 0,
    wrong_domain_event: 0,
    wrong_domain_process: 0,
    sentence_bleed: 0,
    pronoun_fragment: 0,
    broken_span: 0,
    duplicate_or_merge_candidate: 0,
    junk_test_data: 0,
    bare_title_invalid: 0,
    needs_identity_resolution: 0,
  };
}

/** Relational placeholders ("friend of Shyla") — real people, unusable titles. */
const RELATIONAL_PLACEHOLDER_PATTERN =
  /^(friend|homie|buddy|bestie|cousin|coworker|colleague|neighbor|roommate|girlfriend|boyfriend|partner|ex)s?\s+of\s+(\S.*)$/i;

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

type DomainRouting = {
  status: CharacterAuditStatus;
  action: CharacterCardAuditResult['recommendedAction'];
  target: NonNullable<CharacterCardAuditResult['wrongDomainTarget']>;
};

/** Shared routing for every non-person domain, whichever tier detected it. */
const DOMAIN_ROUTING: Record<
  Exclude<AutoDomain, 'person' | 'contextual_person' | 'unknown'>,
  DomainRouting
> = {
  tool: { status: 'wrong_domain_tool', action: 'move_to_book', target: 'tool' },
  media: { status: 'wrong_domain_media', action: 'move_to_interest', target: 'media' },
  band: { status: 'wrong_domain_band', action: 'move_to_group', target: 'band' },
  group: { status: 'wrong_domain', action: 'move_to_group', target: 'group' },
  role: { status: 'wrong_domain_role', action: 'move_to_group', target: 'role' },
  event: { status: 'wrong_domain_event', action: 'move_to_book', target: 'event' },
  process: { status: 'wrong_domain_process', action: 'move_to_book', target: 'process' },
  skill: { status: 'wrong_domain', action: 'move_to_book', target: 'skill' },
  place: { status: 'wrong_domain', action: 'move_to_book', target: 'place' },
};

function arbitrationResult(
  input: CharacterCardAuditInput,
  arbitration: DomainArbitrationResult,
  provenanceSummary: string,
): CharacterCardAuditResult {
  const domain = arbitration.domain!;
  const mapping = DOMAIN_ROUTING[domain];
  return {
    characterId: input.id,
    currentTitle: input.name,
    status: mapping.status,
    reason: arbitration.reason ?? `Belongs to the ${domain} domain, not Characters`,
    // Provenance-only (weak) matches never auto-fix — a human reviews them.
    recommendedAction: arbitration.strength === 'strong' ? mapping.action : 'needs_review',
    wrongDomainTarget: mapping.target,
    provenanceSummary,
  };
}

/** Statuses re-checked by the auto classifier (pipeline + LLM tiers). */
const AUTO_RECHECK_STATUSES = new Set<CharacterAuditStatus>([
  'valid_identity',
  'needs_context',
  'needs_identity_resolution',
]);

/**
 * Uncertain results the auto tiers should (re-)decide: everything still held
 * in Characters on weak evidence, plus weak (needs_review) wrong-domain calls
 * that an LLM confirmation can upgrade to an automatic move.
 */
function needsAutoRecheck(result: CharacterCardAuditResult): boolean {
  if (AUTO_RECHECK_STATUSES.has(result.status)) return true;
  return isWrongDomainStatus(result.status) && result.recommendedAction === 'needs_review';
}

/**
 * Build the overriding result for an auto-detected domain. Auto moves are
 * only recommended at high confidence; everything else lands as review.
 */
export function autoDomainOverride(
  result: CharacterCardAuditResult,
  auto: AutoDomainResult,
): CharacterCardAuditResult | null {
  if (auto.domain === 'unknown') return null;
  if (auto.domain === 'person') {
    if (result.status === 'valid_identity' || auto.confidence < 0.75) return null;
    return {
      ...result,
      status: 'valid_identity',
      reason: `Confirmed person — ${auto.reason}`,
      recommendedAction: 'keep',
    };
  }
  if (auto.domain === 'contextual_person') {
    if (auto.confidence < 0.7) return null;
    return {
      ...result,
      status: 'contextual_character_needs_context',
      reason: `Contextual person — ${auto.reason}`,
      recommendedAction: 'rename_with_context',
    };
  }
  if (auto.confidence < 0.7) return null;
  const mapping = DOMAIN_ROUTING[auto.domain];
  return {
    ...result,
    status: mapping.status,
    reason: auto.reason,
    recommendedAction: auto.confidence >= 0.85 ? mapping.action : 'needs_review',
    wrongDomainTarget: mapping.target,
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

  // 1.5 Sentence bleed / pronoun fragments ("Also You", "You") — extraction
  // noise, never characters.
  const bleed = evaluateSentenceBleed(input.name);
  if (bleed.rejected) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: bleed.kind,
      reason: bleed.reason,
      recommendedAction: 'delete',
      provenanceSummary,
    };
  }

  // 1.6 Domain arbitration — if the name itself identifies a tool, band,
  // media title, event, process, or role, Character loses before any
  // "named identity" reasoning happens.
  const strongArbitration = arbitrateDomainStrong(input.name, provenance);
  if (strongArbitration.domain) {
    return arbitrationResult(input, strongArbitration, provenanceSummary);
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

  // 6. Ambiguous role — contextual person, valid ONLY once renamed with
  // context ("potential investor" → "Potential Investor from Antler").
  if (isAmbiguousRoleLabel(input.name)) {
    const repair = suggestContextualTitle(input.name, provenance);
    if (repair) {
      return {
        characterId: input.id,
        currentTitle: input.name,
        status: 'contextual_character_needs_context',
        reason: 'Contextual person — valid only under a contextual title',
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

  // 6.5 Relational placeholders ("friend of Shyla") — a real person, but the
  // title is unusable until renamed with anchor context.
  const relational = input.name.trim().match(RELATIONAL_PLACEHOLDER_PATTERN);
  if (relational) {
    const role = titleCase(relational[1]);
    const anchor = titleCase(relational[2].trim());
    const scan = scanProvenance(provenance);
    const contextTail = scan.linkedEvents[0] ?? scan.environments[0];
    const suggestedTitle = contextTail
      ? `${anchor}'s ${role} from ${contextTail}`
      : `${anchor}'s ${role}`;
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'contextual_character_needs_context',
      reason: 'Relational placeholder — valid only when renamed with person/event context',
      recommendedAction: 'rename_with_context',
      suggestedTitle,
      provenanceSummary,
      ambiguousContext: buildAmbiguousContext(input.name, suggestedTitle, provenance),
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

  // 9. Remaining names must pass the human-likeness gate. Provenance alone is
  // NOT enough — provenance proves the phrase was mentioned, not that it is a
  // human. Valid requires a positive person signal.
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

  // 9a. The phrase itself is name-shaped ("Bill Skasby") — a person.
  if (hasPersonNameShape(input.name)) {
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
      reason: 'Person-shaped name with provenance',
      recommendedAction: 'keep',
      provenanceSummary,
    };
  }

  // 9b. Not name-shaped — if the story context reads as another domain,
  // Character loses ("One Piece" mentioned as anime, "Self Made" as a show).
  const weakArbitration = arbitrateDomainWeak(input.name, provenance);
  if (weakArbitration.domain) {
    return arbitrationResult(input, weakArbitration, provenanceSummary);
  }

  // 9c. Title-shaped phrase, but provenance talks about it as a human.
  if (hasPersonProvenanceEvidence(provenance)) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'valid_identity',
      reason: 'Person evidence in story context',
      recommendedAction: 'keep',
      provenanceSummary,
    };
  }

  if (!provenance.trim()) {
    return {
      characterId: input.id,
      currentTitle: input.name,
      status: 'needs_context',
      reason: 'Unverified label with no captured story context yet',
      recommendedAction: 'needs_review',
      provenanceSummary,
    };
  }

  return {
    characterId: input.id,
    currentTitle: input.name,
    status: 'needs_identity_resolution',
    reason: 'Provenance proves the phrase was mentioned, not that it is a person — no human signal found',
    recommendedAction: 'needs_review',
    provenanceSummary,
  };
}

class CharacterCardAuditService {
  /**
   * Auto domain pass over results the deterministic audit left in Characters:
   * tier 1 = ingestion pipeline classifier, tier 2 = batched LLM (result
   * cached on card metadata so each card is classified at most once).
   */
  private async applyAutoDomainPass(
    roster: CharacterCardAuditInput[],
    results: CharacterCardAuditResult[],
  ): Promise<CharacterCardAuditResult[]> {
    const rosterById = new Map(roster.map((row) => [row.id, row]));
    const llmPending: LlmClassificationCard[] = [];
    const decided = new Map<string, AutoDomainResult>();

    for (const result of results) {
      if (!needsAutoRecheck(result)) continue;
      const row = rosterById.get(result.characterId);
      if (!row) continue;
      const provenance = extractProvenanceText(row);
      const auto = pipelineDomain(row.name, provenance) ?? cachedDomain(row.metadata);
      if (auto) {
        decided.set(result.characterId, auto);
      } else {
        llmPending.push({ id: row.id, name: row.name, provenance });
      }
    }

    if (llmPending.length > 0) {
      const llmResults = await llmClassifyDomains(llmPending);
      for (const [id, auto] of llmResults) {
        decided.set(id, auto);
        // Cache best-effort so re-audits don't re-bill this card.
        const row = rosterById.get(id);
        if (!row) continue;
        const metadata = {
          ...row.metadata,
          domain_classification: {
            domain: auto.domain,
            confidence: auto.confidence,
            reason: auto.reason,
            source: auto.source,
            classifiedAt: new Date().toISOString(),
          },
        };
        void supabaseAdmin
          .from('characters')
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq('id', id)
          .then(({ error: cacheError }) => {
            if (cacheError) {
              logger.warn({ error: cacheError, id }, 'card audit: classification cache skipped');
            }
          });
      }
    }

    return results.map((result) => {
      const auto = decided.get(result.characterId);
      if (!auto) return result;
      return autoDomainOverride(result, auto) ?? result;
    });
  }

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
      // Reclassified cards live in another book now (see reclassifyCharacterService)
      .neq('status', 'reclassified')
      .order('name');

    if (error) throw error;

    const roster: CharacterCardAuditInput[] = (data ?? []).map((row) => ({
      id: row.id,
      name: String(row.name ?? '').trim(),
      alias: (row.alias ?? []) as string[],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      contextOfMention: row.context_of_mention as string | null | undefined,
    }));

    let results = this.auditRoster(roster).filter((result) => {
      const meta = roster.find((row) => row.id === result.characterId)?.metadata ?? {};
      return !isCharacterCardUserReviewed(meta);
    });
    results = await this.applyAutoDomainPass(roster, results);
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
