/**
 * Narrative coherence — related words ≠ shared story chapter.
 */

import type { NarrativeCoherenceScore } from './narrativeAnchorCognitionTypes';
import { isNicknameFamilyFalsePositive } from './narrativeAnchorNicknameResolver';

export function scoreNarrativeCoherence(input: {
  title: string;
  peopleNames?: string[];
  eventTitles?: string[];
  placeNames?: string[];
  groupNames?: string[];
  signals?: string[];
  evidenceLabels?: string[];
}): NarrativeCoherenceScore {
  const reasons: string[] = [];
  const events = input.eventTitles ?? [];
  const people = input.peopleNames ?? [];
  const places = input.placeNames ?? [];
  const groups = input.groupNames ?? [];
  const signals = (input.signals ?? []).map((s) => s.toLowerCase());

  // Lexical family signals with nickname people → semantic inconsistency
  const familySignals = signals.some((s) => /^(tio|tia|uncle|aunt|family)$/i.test(s));
  const nicknamePeople = people.filter(isNicknameFamilyFalsePositive);
  let semanticConsistency = 0.7;
  if (familySignals && nicknamePeople.length > 0 && !people.some((p) => /t[ií]o\s+[A-Za-z]/i.test(p) || /t[ií]a\s+[A-Za-z]/i.test(p))) {
    semanticConsistency = 0.2;
    reasons.push('family_signals_with_nickname_collision');
  }

  // Shared theme from events
  let sharedTheme = 0.3;
  if (events.length >= 2) {
    sharedTheme = 0.65;
    reasons.push('multiple_events');
  }
  if (events.length === 1 && events[0] && events[0].length > 12) {
    sharedTheme = 0.7;
    reasons.push('specific_event_title');
  }

  // Unrelated domains forced together (project + nightlife + family)
  const blob = [input.title, ...events, ...places, ...groups].join(' ').toLowerCase();
  const domains = [
    /lorebook|coding|build/.test(blob),
    /club|goth|ska|metro|nightlife/.test(blob),
    /family|abuela|t[ií]o|graduation|household/.test(blob),
    /amazon|work|job|office/.test(blob),
  ].filter(Boolean).length;
  if (domains >= 3) {
    semanticConsistency = Math.min(semanticConsistency, 0.25);
    sharedTheme = Math.min(sharedTheme, 0.3);
    reasons.push('mixed_unrelated_domains');
  } else if (domains === 2 && events.length <= 1) {
    semanticConsistency = Math.min(semanticConsistency, 0.45);
    reasons.push('two_domains_weak_bridge');
  }

  const recurringEntities = people.length >= 2 ? Math.min(0.8, 0.3 + people.length * 0.1) : 0.2;
  const recurringPlaces = places.length >= 1 ? 0.55 : 0.2;
  const recurringConflictOrGoal =
    /\b(build|collapse|conflict|quit|start|graduate|push(?:ed)?\s+out|unemployment)\b/i.test(blob)
      ? 0.7
      : 0.25;

  let causalContinuity = events.length >= 2 ? 0.55 : events.length === 1 ? 0.45 : 0.15;
  const temporalContinuity = events.length >= 2 ? 0.5 : 0.35;

  // Membership evidence alone
  if ((input.evidenceLabels ?? []).every((l) => /members?\s+share/i.test(l)) && events.length === 0) {
    sharedTheme = 0.15;
    causalContinuity = 0.1;
    reasons.push('membership_labels_only');
  }

  const finalScore = clamp01(
    sharedTheme * 0.25
      + causalContinuity * 0.15
      + temporalContinuity * 0.1
      + recurringEntities * 0.1
      + recurringPlaces * 0.1
      + recurringConflictOrGoal * 0.15
      + semanticConsistency * 0.15,
  );

  return {
    sharedTheme,
    causalContinuity,
    temporalContinuity,
    recurringEntities,
    recurringPlaces,
    recurringConflictOrGoal,
    semanticConsistency,
    finalScore,
    reasons,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
