/**
 * Narrative Anchor Cognition Engine v1
 *
 * Pipeline:
 * Entity boundary repair → nickname/honorific resolution → community routing
 * → user centrality → narrative/temporal coherence → impact
 * → eligibility → title synthesis → decision
 */

import { repairPeopleNames } from './narrativeAnchorEntityBoundaryRepair';
import { familySignalFromPersonNames } from './narrativeAnchorNicknameResolver';
import { routeNarrativeCluster } from './narrativeAnchorCommunityRouter';
import { scoreUserCentrality } from './narrativeAnchorUserCentrality';
import { scoreNarrativeCoherence } from './narrativeAnchorNarrativeCoherence';
import { scoreTemporalCoherence } from './narrativeAnchorTemporalCoherence';
import { scoreNarrativeImpact } from './narrativeAnchorImpactScorer';
import { evaluateAnchorEligibility } from './narrativeAnchorEligibilityGate';
import {
  isPlaceholderTitle,
  scoreTitleQuality,
  synthesizeAnchorTitle,
} from './narrativeAnchorTitleGenerator';
import type {
  NarrativeAnchorCognitionInput,
  NarrativeAnchorCognitionResult,
  NarrativeAnchorDecision,
  NarrativeClusterType,
  NarrativeAnchorChapterType,
} from './narrativeAnchorCognitionTypes';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mapChapterType(title: string, proposedType?: string): NarrativeAnchorChapterType | undefined {
  const t = `${title} ${proposedType ?? ''}`.toLowerCase();
  if (/lorebook|project|build|coding/.test(t)) return 'PROJECT_CHAPTER';
  if (/work|job|amazon|career/.test(t)) return 'WORK_CHAPTER';
  if (/family|tio|tia|abuela|graduation/.test(t)) return 'FAMILY_CHAPTER';
  if (/goth|ska|club|nightlife|social|circle/.test(t)) return 'SOCIAL_CHAPTER';
  if (/relationship|dating|friend/.test(t)) return 'RELATIONSHIP_CHAPTER';
  if (/conflict|collapse|pushed/.test(t)) return 'CONFLICT_CHAPTER';
  if (/start|return|transition|moved/.test(t)) return 'TRANSITION_CHAPTER';
  if (/house|home|place|at\s/.test(t)) return 'PLACE_BASED_CHAPTER';
  return 'LIFE_PERIOD';
}

export class NarrativeAnchorEngine {
  evaluate(input: NarrativeAnchorCognitionInput): NarrativeAnchorCognitionResult {
    const rulesFired: string[] = [];
    const reasonsAccepted: string[] = [];
    const reasonsRejected: string[] = [];

    // 1. Boundary repair
    const repaired = repairPeopleNames(input.peopleNames ?? []);
    rulesFired.push(...repaired.repairs.filter((r) => r.repaired).flatMap((r) => r.reasons.map((x) => `boundary:${x}`)));

    const peopleNames = repaired.people;
    const placeNames = [...new Set([...(input.placeNames ?? []), ...repaired.places])];
    const eventTitles = input.eventTitles ?? [];
    const eventCount = input.eventCount ?? eventTitles.length;
    const membershipOnly = Boolean(
      input.membershipOnly
      || (
        eventCount === 0
        && (input.evidenceLabels ?? []).some((l) => /members?\s+share/i.test(l))
      ),
    );

    // 2. Nickname / kinship
    const familySignals = familySignalFromPersonNames(peopleNames);
    rulesFired.push(...familySignals.details.flatMap((d) => d.reasons.map((r) => `honorific:${r}`)));

    // 3. Community routing
    const routed = routeNarrativeCluster({
      title: input.title,
      proposedType: input.proposedType,
      membershipOnly,
      memberCount: input.memberCount ?? peopleNames.length,
      eventCount,
      peopleNames,
      groupNames: input.groupNames,
      signals: input.signals,
    });
    rulesFired.push(...routed.reasons.map((r) => `route:${r}`));

    // 4. Scores
    const userCentrality = scoreUserCentrality({
      peopleNames,
      evidenceLabels: input.evidenceLabels,
      evidenceText: input.evidenceText,
      eventTitles,
      userNames: input.userNames,
      membershipOnly,
    });
    const narrativeCoherence = scoreNarrativeCoherence({
      title: input.title,
      peopleNames,
      eventTitles,
      placeNames,
      groupNames: input.groupNames,
      signals: input.signals,
      evidenceLabels: input.evidenceLabels,
    });
    const temporalCoherence = scoreTemporalCoherence({
      dates: input.dates,
      eventCount,
    });
    const impact = scoreNarrativeImpact({
      evidenceText: input.evidenceText,
      eventTitles,
      evidenceLabels: input.evidenceLabels,
      significanceScore: input.significanceScore,
      membershipOnly,
      memberCount: input.memberCount ?? peopleNames.length,
    });

    const distinctTimepoints = new Set(
      (input.dates ?? []).map((d) => d.slice(0, 10)),
    ).size;

    const recurrenceStrength =
      eventCount >= 3 ? 0.7 : eventCount >= 2 ? 0.55 : membershipOnly ? 0.15 : 0.3;

    // 5. Eligibility
    const eligibility = evaluateAnchorEligibility({
      eventCount,
      distinctTimepoints: Math.max(distinctTimepoints, eventCount > 0 ? 1 : 0),
      distinctPeopleCount: peopleNames.length,
      userCentrality: userCentrality.finalScore,
      narrativeCoherence: narrativeCoherence.finalScore,
      temporalCoherence: temporalCoherence.finalScore,
      emotionalGravity: impact.emotionalIntensity,
      identityImpact: impact.identityChange,
      recurrenceStrength,
      explicitUserImportance: impact.explicitImportance,
      membershipOnly,
    });
    rulesFired.push(...eligibility.blockers.map((b) => `block:${b}`));
    rulesFired.push(...eligibility.reasons.map((r) => `elig:${r}`));

    // 6. Title synthesis
    const synthesized = synthesizeAnchorTitle({
      currentTitle: input.title,
      eventTitles,
      placeNames,
      groupNames: input.groupNames,
      peopleNames,
      evidenceText: input.evidenceText,
    });
    rulesFired.push(...synthesized.reasons.map((r) => `title:${r}`));

    let title = synthesized.title;
    // If family period wrongly mixed nickname + goth nightlife, prefer split signals
    if (
      familySignals.hasNicknameFalsePositive
      && /family/i.test(input.title)
      && eventTitles.some((e) => /club|metro|goth/i.test(e))
    ) {
      const socialEv = eventTitles.find((e) => /club|metro|goth/i.test(e));
      if (socialEv) {
        title = socialEv;
        rulesFired.push('split_family_goth_collision_prefer_event');
      }
    }

    const titleQuality = scoreTitleQuality({
      title,
      eventTitles,
      peopleNames,
      userCentrality: userCentrality.finalScore,
    });
    rulesFired.push(...titleQuality.reasons.map((r) => `tq:${r}`));

    // 7. Decision
    let decision: NarrativeAnchorDecision = 'REJECT';
    let status: NarrativeAnchorCognitionResult['status'] = 'rejected';
    let clusterType: NarrativeClusterType = routed.clusterType;
    let routeTarget: NarrativeClusterType | undefined;
    let rejectionReason: string | undefined;
    let chapterType: NarrativeAnchorChapterType | undefined;
    let confidence = 0.3;

    const routeMap: Partial<Record<NarrativeClusterType, NarrativeAnchorDecision>> = {
      COMMUNITY: 'ROUTE_COMMUNITY',
      HOUSEHOLD: 'ROUTE_HOUSEHOLD',
      FAMILY_GROUP: 'ROUTE_FAMILY_GROUP',
      ORGANIZATION: 'ROUTE_ORGANIZATION',
      SOCIAL_CIRCLE: 'ROUTE_SOCIAL_CIRCLE',
    };

    if (
      clusterType !== 'NARRATIVE_ANCHOR'
      && clusterType !== 'EVENT_CLUSTER'
      && clusterType !== 'UNKNOWN'
      && clusterType !== 'EVENT_ONLY'
    ) {
      decision = routeMap[clusterType] ?? 'ROUTE_COMMUNITY';
      status = 'routed';
      routeTarget = clusterType;
      rejectionReason = `route_${clusterType.toLowerCase()}`;
      reasonsRejected.push(rejectionReason);
      confidence = 0.75;
    } else if (!eligibility.eligible && !input.userConfirmed) {
      if (eventCount === 1 && impact.explicitImportance < 0.85) {
        decision = 'KEEP_EVENT_ONLY';
        status = 'event_only';
        clusterType = 'EVENT_ONLY';
        rejectionReason = 'single_routine_or_weak_event';
        reasonsRejected.push(...eligibility.blockers);
      } else if (membershipOnly || eligibility.blockers.includes('membership_only')) {
        decision = 'ROUTE_COMMUNITY';
        status = 'routed';
        clusterType = 'COMMUNITY';
        routeTarget = 'COMMUNITY';
        rejectionReason = 'membership_not_anchor';
        reasonsRejected.push(rejectionReason);
      } else {
        decision = 'REJECT';
        status = 'rejected';
        rejectionReason = eligibility.blockers.join(',') || 'not_eligible';
        reasonsRejected.push(...eligibility.blockers);
      }
      confidence = 0.4;
    } else if (isPlaceholderTitle(title) || titleQuality.finalScore < 0.45) {
      // Try once more with event title
      if (eventTitles[0] && !isPlaceholderTitle(eventTitles[0])) {
        title = eventTitles[0];
        rulesFired.push('fallback_to_event_title');
      }
      const tq2 = scoreTitleQuality({
        title,
        eventTitles,
        peopleNames,
        userCentrality: userCentrality.finalScore,
      });
      if (tq2.finalScore < 0.45) {
        decision = 'NEEDS_REVIEW';
        status = 'needs_review';
        rejectionReason = 'weak_or_placeholder_title';
        reasonsRejected.push(rejectionReason);
        confidence = 0.45;
      } else {
        decision = 'PUBLISH_ANCHOR';
        status = 'published';
        clusterType = 'NARRATIVE_ANCHOR';
        chapterType = mapChapterType(title, input.proposedType);
        confidence = clamp01(
          0.55
            + eligibility.userCentrality * 0.15
            + eligibility.narrativeCoherence * 0.15
            + impact.finalScore * 0.15,
        );
        reasonsAccepted.push('publish_after_title_repair');
      }
    } else {
      decision = 'PUBLISH_ANCHOR';
      status = 'published';
      clusterType = 'NARRATIVE_ANCHOR';
      chapterType = mapChapterType(title, input.proposedType);
      confidence = clamp01(
        0.55
          + eligibility.userCentrality * 0.15
          + eligibility.narrativeCoherence * 0.15
          + impact.finalScore * 0.15,
      );
      reasonsAccepted.push('publish_anchor');
    }

    // Nickname family false positive with family period title → never publish as family
    if (
      status === 'published'
      && familySignals.hasNicknameFalsePositive
      && /family/i.test(input.title)
      && !familySignals.hasLiteralFamily
    ) {
      decision = 'SPLIT';
      status = 'needs_review';
      rejectionReason = 'nickname_family_collision';
      reasonsRejected.push(rejectionReason);
      confidence = 0.35;
    }

    return {
      decision,
      clusterType,
      chapterType,
      title,
      theme: synthesized.theme,
      status,
      confidence,
      eligibility,
      userCentrality,
      narrativeCoherence,
      temporalCoherence,
      impact,
      titleQuality,
      peopleNames,
      placeNames,
      boundaryRepairs: repaired.repairs,
      honorifics: familySignals.details,
      rulesFired,
      reasonsAccepted,
      reasonsRejected,
      rejectionReason,
      routeTarget,
    };
  }
}

export const narrativeAnchorEngine = new NarrativeAnchorEngine();
