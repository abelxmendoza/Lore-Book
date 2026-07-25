/**
 * Milestone scoring — first-time / identity / public commitment signals.
 * Pure function; feeds event proposals and turning-point significance.
 */

export type MilestoneAssessment = {
  firstTime: number;
  identityCommitment: number;
  publicCommitment: number;
  careerProgression: number;
  projectProgression: number;
  emotionalImportance: number;
  futureConsequence: number;
  explicitPride: number;
  finalScore: number;
  isMilestone: boolean;
};

const FIRST_TIME_RE =
  /\b(?:first time(?: ever)?|for the first time|my first|created my first|never (?:done|tried) (?:this|that) before)\b/i;
const PRIDE_RE = /\b(?:proud of|i(?:'|’)m proud|really proud)\b/i;
const DISTRIBUTION_RE =
  /\b(?:distrokid|distribute|distribution|upload(?:ed|ing)? (?:my )?(?:song|track|release)|spotify|apple music|streaming)\b/i;
const ARTIST_RE = /\b(?:artist(?: name| identity)?|stage name|under (?:the name )?|as [A-ZÀ-Ý])\b/i;
const INTERVIEW_RE =
  /\b(?:interview(?:ed|ing)?|phone call|video call|recruiter|recruiting|agency)\b/i;
const EMPLOYER_HINT_RE = /\b(?:rivian|opportunity|contract|role|position)\b/i;
const PROJECT_WORK_RE = /\b(?:working on|building|coding|shipping|lorebook|memovault)\b/i;

export function assessMilestone(text: string): MilestoneAssessment {
  const t = text ?? '';
  const firstTime = FIRST_TIME_RE.test(t) ? 1 : 0;
  const identityCommitment = ARTIST_RE.test(t) && DISTRIBUTION_RE.test(t) ? 0.9 : ARTIST_RE.test(t) ? 0.5 : 0;
  const publicCommitment = DISTRIBUTION_RE.test(t) ? 0.85 : 0;
  const careerProgression = INTERVIEW_RE.test(t) && EMPLOYER_HINT_RE.test(t) ? 0.8 : INTERVIEW_RE.test(t) ? 0.55 : 0;
  const projectProgression = PROJECT_WORK_RE.test(t) ? 0.45 : 0;
  const emotionalImportance = PRIDE_RE.test(t) ? 0.9 : 0.2;
  const futureConsequence = DISTRIBUTION_RE.test(t) || careerProgression > 0.5 ? 0.7 : 0.2;
  const explicitPride = PRIDE_RE.test(t) ? 1 : 0;

  const finalScore =
    firstTime * 0.22 +
    identityCommitment * 0.14 +
    publicCommitment * 0.14 +
    careerProgression * 0.12 +
    projectProgression * 0.08 +
    emotionalImportance * 0.12 +
    futureConsequence * 0.1 +
    explicitPride * 0.08;

  return {
    firstTime,
    identityCommitment,
    publicCommitment,
    careerProgression,
    projectProgression,
    emotionalImportance,
    futureConsequence,
    explicitPride,
    finalScore: Math.round(finalScore * 100) / 100,
    isMilestone: finalScore >= 0.45 || (firstTime === 1 && (publicCommitment > 0 || careerProgression > 0)),
  };
}
