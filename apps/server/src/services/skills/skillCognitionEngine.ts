/**
 * Skill Cognition & Consolidation Engine v1
 *
 * Pipeline:
 * Source Evidence
 * → Agent Resolution
 * → Reality Context Classification
 * → Ontology Routing
 * → Eligibility Gate
 * → Canonical + Similarity
 * → Hierarchy / Project / Responsibility linking
 * → Evidence Aggregation
 * → Proficiency / Usage / Trajectory / Monetization
 * → Decision + Audit Trace
 */

import { resolveSkillAgent, isUserOwnedSkill } from './skillAgentResolver';
import { classifyEvidenceRealityContext, realityBlocksSkillCreation } from './skillContextClassifier';
import { routeCapabilityOntology } from './capabilityOntologyRouter';
import { evaluateSkillEligibility, classifyEvidenceStrength } from './skillEligibilityGate';
import { resolveSkillCanonical, isLoreBookProjectLabel } from './skillCanonicalResolver';
import { findSimilarExistingSkill } from './skillSimilarityResolver';
import { resolveSkillHierarchy } from './skillHierarchyResolver';
import { aggregateSkillEvidence } from './skillEvidenceAggregator';
import { estimateSkillProficiency } from './skillProficiencyEstimator';
import { estimateSkillUsageFrequency } from './skillUsageEstimator';
import { estimateSkillTrajectory } from './skillTrajectoryEstimator';
import { classifySkillMonetization } from './skillMonetizationClassifier';
import { linkSkillToProjects } from './skillProjectLinker';
import { linkSkillResponsibility } from './skillResponsibilityLinker';
import { buildSkillDiagnostics } from './skillDiagnostics';
import type {
  SkillCandidateDecision,
  SkillCognitionInput,
  SkillCognitionResult,
  CapabilityEntityType,
} from './skillCognitionTypes';

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.max(0.05, Math.min(0.98, value));
}

export class SkillCognitionEngine {
  evaluate(input: SkillCognitionInput): SkillCognitionResult {
    const rulesFired: string[] = [];
    const reasonsAccepted: string[] = [];
    const reasonsRejected: string[] = [];
    const originalSpan = (input.span ?? '').trim();
    const evidenceText = (input.evidenceText ?? '').trim();

    // 1. Canonical
    const canonical = resolveSkillCanonical(originalSpan);
    rulesFired.push(...canonical.rulesFired.map((r) => `canonical:${r}`));

    // 2. Agent ownership (registry names + first-person priority)
    const subject = resolveSkillAgent(originalSpan, evidenceText, {
      userNames: input.userNames,
      knownPersonNames: input.knownPersonNames,
      preferUserWhenAmbiguous: input.preferUserWhenAmbiguous,
    });
    rulesFired.push(`subject:${subject.subjectType}`);

    // 3. Reality context
    const reality = classifyEvidenceRealityContext(originalSpan, evidenceText);
    rulesFired.push(`reality:${reality.context}`);

    // 4. Ontology routing
    const routed = routeCapabilityOntology(canonical.canonicalTitle, evidenceText);
    let entityType: CapabilityEntityType = routed.entityType;
    rulesFired.push(...routed.reasons.map((r) => `ontology:${r}`));

    // Project label hard route
    if (isLoreBookProjectLabel(originalSpan) || isLoreBookProjectLabel(canonical.canonicalTitle)) {
      entityType = 'PROJECT';
      rulesFired.push('force_project_lorebook');
    }

    // Responsibility cluster
    const responsibility = linkSkillResponsibility(canonical.canonicalTitle, entityType);
    rulesFired.push(...responsibility.rulesFired);
    if (responsibility.shouldRouteToResponsibility) {
      entityType = 'RESPONSIBILITY';
      rulesFired.push('routed_responsibility');
    }

    // 5. Evidence aggregation (before strength, for practice count)
    const aggregated = aggregateSkillEvidence({
      evidenceText,
      sourceMessageId: input.sourceMessageId,
      practiceEventAts: input.practiceEventAts,
    });
    rulesFired.push(...aggregated.reasons.map((r) => `evidence:${r}`));

    // 6. Evidence strength
    const evidenceStrength = classifyEvidenceStrength(
      originalSpan,
      evidenceText,
      aggregated.uniquePracticeCount,
    );
    rulesFired.push(`strength:${evidenceStrength}`);

    // 7. Eligibility
    const eligibility = evaluateSkillEligibility({
      entityType,
      subject,
      realityContext: reality.context,
      evidenceStrength,
      userConfirmed: input.userConfirmed,
    });
    rulesFired.push(...eligibility.reasons.map((r) => `eligibility:${r}`));

    // 8. Similarity / merge
    const similar = findSimilarExistingSkill(canonical.canonicalTitle, input.knownSkills);
    rulesFired.push(...similar.reasons.map((r) => `similar:${r}`));

    // 9. Hierarchy + projects
    const hierarchy = resolveSkillHierarchy(canonical.canonicalTitle, evidenceText);
    rulesFired.push(...hierarchy.rulesFired);
    const projects = linkSkillToProjects(canonical.canonicalTitle, evidenceText, entityType);
    rulesFired.push(...projects.rulesFired);

    const relationships = [
      ...hierarchy.relationships,
      ...projects.relationships,
      ...responsibility.relationships,
    ];

    // 10. Calibrated fields
    const userOwned = isUserOwnedSkill(subject) || Boolean(input.userConfirmed);
    const proficiency = estimateSkillProficiency({
      evidenceStrength,
      practiceCount: aggregated.uniquePracticeCount,
      proposedScore: input.proposedProficiency,
      evidenceText,
      userOwned,
    });
    const usage = estimateSkillUsageFrequency({
      practiceEventAts: aggregated.practiceEventAts.length
        ? aggregated.practiceEventAts
        : input.practiceEventAts,
      practiceCount: aggregated.uniquePracticeCount,
      proposed: input.proposedUsageFrequency,
    });
    const trajectory = estimateSkillTrajectory({
      practiceEventAts: aggregated.practiceEventAts.length
        ? aggregated.practiceEventAts
        : input.practiceEventAts,
      practiceCount: aggregated.uniquePracticeCount,
      evidenceText,
    });
    const monetization = classifySkillMonetization({
      evidenceText,
      entityType,
      proposed: input.proposedMonetization,
    });

    // 11. Decision
    let decision: SkillCandidateDecision = 'CREATE';
    let status: SkillCognitionResult['status'] = 'accepted';
    let rejectionReason: string | undefined;
    let routeTarget: CapabilityEntityType | undefined;
    let matchExistingName: string | undefined;
    let existenceConfidence = clampConfidence(
      eligibility.existenceConfidence * (input.proposedConfidence ?? 0.7) ** 0.5,
    );

    // Hard rejects
    if (subject.subjectType === 'OTHER_PERSON' || reality.context === 'OTHER_PERSON') {
      decision = 'REJECT';
      status = 'rejected';
      rejectionReason = 'other_person_ownership';
      reasonsRejected.push('other_person_ownership');
      existenceConfidence = Math.min(existenceConfidence, 0.15);
    } else if (realityBlocksSkillCreation(reality.context)) {
      decision = 'REJECT';
      status = 'rejected';
      rejectionReason = `reality_${reality.context.toLowerCase()}`;
      reasonsRejected.push(rejectionReason);
      existenceConfidence = Math.min(existenceConfidence, 0.2);
    } else if (entityType === 'PROJECT') {
      decision = 'ROUTE_TO_OTHER_ONTOLOGY';
      status = 'routed';
      routeTarget = 'PROJECT';
      rejectionReason = 'project_not_skill';
      reasonsRejected.push('project_not_skill');
      reasonsAccepted.push('routed_to_project');
    } else if (
      entityType !== 'SKILL'
      && entityType !== 'PROJECT_APPLICATION'
    ) {
      decision = 'ROUTE_TO_OTHER_ONTOLOGY';
      status = 'routed';
      routeTarget = entityType;
      rejectionReason = `route_${entityType.toLowerCase()}`;
      reasonsRejected.push(rejectionReason);
    } else if (!eligibility.eligible && !input.userConfirmed) {
      if (evidenceStrength === 'BARE_MENTION' || evidenceStrength === 'INDIRECT_INFERENCE') {
        decision = 'REJECT';
        status = 'rejected';
        rejectionReason = 'weak_evidence';
        reasonsRejected.push('weak_evidence');
      } else {
        decision = 'NEEDS_REVIEW';
        status = 'needs_review';
        rejectionReason = eligibility.reasons.join(',') || 'not_eligible';
        reasonsRejected.push(...eligibility.reasons);
      }
    } else if (similar.match && similar.score >= 0.9) {
      decision = similar.score >= 0.95 ? 'AUTO_MERGE' : 'SUGGEST_MERGE';
      status = 'merged';
      matchExistingName = similar.match.name;
      reasonsAccepted.push(`merge_${similar.method}`);
    } else if (similar.match && similar.score >= 0.72) {
      decision = 'SUGGEST_MERGE';
      status = 'needs_review';
      matchExistingName = similar.match.name;
      reasonsAccepted.push('suggest_merge_fuzzy');
    } else if (entityType === 'PROJECT_APPLICATION') {
      decision = 'LINK_AS_PROJECT_APPLICATION';
      status = 'accepted';
      reasonsAccepted.push('project_application');
    } else if (hierarchy.parentSkillName && evidenceStrength === 'SELF_REPORT' && aggregated.uniquePracticeCount <= 1) {
      decision = 'ADD_AS_CHILD_SKILL';
      status = 'accepted';
      reasonsAccepted.push('child_under_parent');
    } else {
      decision = 'CREATE';
      status = 'accepted';
      reasonsAccepted.push('create_new_skill');
    }

    // Project application for lorebook development variants that slipped through as skill
    if (
      status === 'accepted'
      && /lorebook/i.test(canonical.canonicalTitle)
      && /develop/i.test(canonical.canonicalTitle)
    ) {
      decision = 'LINK_AS_PROJECT_APPLICATION';
      entityType = 'PROJECT_APPLICATION';
      rulesFired.push('rewrite_lorebook_dev_to_project_application');
      reasonsAccepted.push('project_application_not_standalone');
    }

    if (status === 'accepted' || status === 'merged') {
      reasonsAccepted.push('user_owned_eligible');
    }

    const partial = {
      decision,
      canonicalTitle: canonical.canonicalTitle,
      aliases: canonical.aliases,
      entityType,
      subject,
      realityContext: reality.context,
      evidenceStrength,
      existenceConfidence,
      proficiency,
      usageFrequency: usage.frequency,
      trajectory: trajectory.trajectory,
      monetization: monetization.monetization,
      matchExistingName,
      parentSkillName: hierarchy.parentSkillName,
      projectLinks: projects.projectLinks,
      relationships,
      status,
      rejectionReason,
      routeTarget,
      rulesFired,
      reasonsAccepted,
      reasonsRejected,
    };

    const diagnostics = buildSkillDiagnostics(partial);
    diagnostics.originalSpan = originalSpan;

    return {
      ...partial,
      diagnostics,
    };
  }
}

export const skillCognitionEngine = new SkillCognitionEngine();
