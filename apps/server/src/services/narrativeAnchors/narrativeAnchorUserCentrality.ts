/**
 * User-centrality — anchors must be about the user's experience.
 */

import type { UserCentralityScore } from './narrativeAnchorCognitionTypes';

const USER_FIRST =
  /\b(?:i|i'm|i’ve|i've|me|my|myself)\b/i;

const PARTICIPATION =
  /\b(?:i)\s+(?:went|attended|built|worked|lived|stayed|met|joined|started|left|lost|graduated|celebrated|drove|helped)\b/i;

export function scoreUserCentrality(input: {
  peopleNames?: string[];
  evidenceLabels?: string[];
  evidenceText?: string;
  eventTitles?: string[];
  userNames?: string[];
  membershipOnly?: boolean;
}): UserCentralityScore {
  const reasons: string[] = [];
  const text = [
    input.evidenceText ?? '',
    ...(input.evidenceLabels ?? []),
    ...(input.eventTitles ?? []),
  ].join(' ');

  const people = input.peopleNames ?? [];
  const userNames = (input.userNames ?? []).map((n) => n.toLowerCase());
  const hasSelfInPeople = people.some((p) => {
    const k = p.toLowerCase();
    return userNames.some((u) => k === u || k.includes(u)) || /\b(self|me|narrator)\b/i.test(p);
  });

  let directParticipation = 0.2;
  if (PARTICIPATION.test(text) || USER_FIRST.test(text)) {
    directParticipation = 0.85;
    reasons.push('first_person_participation');
  } else if (hasSelfInPeople) {
    directParticipation = 0.55;
    reasons.push('self_listed_in_people');
  }

  const labels = input.evidenceLabels ?? [];
  const firstPersonHits = labels.filter((l) => USER_FIRST.test(l)).length;
  let firstPersonEvidenceRatio =
    labels.length === 0 ? (USER_FIRST.test(text) ? 0.7 : 0.2) : firstPersonHits / labels.length;

  let decisionInvolvement = 0.3;
  if (/\b(?:decided|chose|quit|started|built|left|moved)\b/i.test(text)) {
    decisionInvolvement = 0.75;
    reasons.push('decision_language');
  }

  let emotionalInvolvement = 0.3;
  if (/\b(?:felt|hurt|proud|scared|love|miss|important|life-changing|collapse|pushed out)\b/i.test(text)) {
    emotionalInvolvement = 0.8;
    reasons.push('emotional_language');
  }

  let consequenceToUser = 0.25;
  if (/\b(?:my\s+(?:job|life|home|career|relationship)|changed\s+my|impacted\s+me)\b/i.test(text)) {
    consequenceToUser = 0.8;
    reasons.push('user_consequence');
  }

  // Membership-only clusters with only "N members share X" → low centrality
  if (input.membershipOnly) {
    directParticipation = Math.min(directParticipation, 0.35);
    firstPersonEvidenceRatio = Math.min(firstPersonEvidenceRatio, 0.25);
    reasons.push('membership_only_penalty');
  }

  // Adjacent-only: many people, no first person
  if (people.length >= 3 && !USER_FIRST.test(text) && !hasSelfInPeople) {
    directParticipation = Math.min(directParticipation, 0.25);
    reasons.push('user_adjacent_only');
  }

  const finalScore = clamp01(
    directParticipation * 0.35
      + firstPersonEvidenceRatio * 0.2
      + decisionInvolvement * 0.15
      + emotionalInvolvement * 0.15
      + consequenceToUser * 0.15,
  );

  return {
    directParticipation,
    firstPersonEvidenceRatio,
    decisionInvolvement,
    emotionalInvolvement,
    consequenceToUser,
    finalScore,
    reasons,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
