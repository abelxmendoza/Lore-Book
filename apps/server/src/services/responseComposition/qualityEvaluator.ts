import type { CompositionPlan } from './types';

export const COMPOSITION_QUALITY_VERSION = 'composition-quality-v1' as const;

export type CompositionQualityScores = {
  answered: number;
  topicAdherence: number;
  selectedDomainAdherence: number;
  chronology: number;
  redundancy: number;
  databaseLeakage: number;
  followUpDiscipline: number;
};

export type CompositionQualityResult = {
  version: typeof COMPOSITION_QUALITY_VERSION;
  passed: boolean;
  score: number;
  scores: CompositionQualityScores;
  reasons: string[];
  followUpCount: number;
  leakedTokens: string[];
  recompositionRecommended: boolean;
};

const LEAKAGE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:source|entity|message|assistant)[ _-]?id\b/i, 'internal identifier'],
  [/\b(?:relevance|retrieval|RAG|working memory)\b/i, 'retrieval implementation detail'],
  [/\b(?:composition plan|response focus|prompt block)\b/i, 'internal composition instruction'],
  [/\b(?:database|diagnostic|cognitive observatory)\b/i, 'internal system detail'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i, 'UUID'],
];

function questionCount(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

function dateTokens(text: string): string[] {
  return text.match(/\b(?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?\b/g) ?? [];
}

const PROFILE_TOPIC_CUES: Record<CompositionPlan['profile'], string[]> = {
  recall: ['work', 'job', 'history', 'remember', 'summary', 'career', 'school', 'education', 'timeline', 'story', 'experience', 'record'],
  character: ['person', 'character', 'relationship', 'someone', 'friend', 'name', 'they', 'them'],
  timeline: ['year', 'date', 'month', 'period', 'career', 'timeline', 'before', 'after', 'from', 'to'],
  reflection: ['change', 'shift', 'pattern', 'suggest', 'consistent', 'remain', 'growth', 'because'],
  planning: ['step', 'goal', 'next', 'option', 'start', 'review', 'plan', 'move'],
  debug: ['diagnostic', 'trace', 'evidence', 'selected', 'excluded', 'decision'],
  general: [],
};

function hasTopicSignal(userMessage: string, response: string, plan: CompositionPlan): boolean {
  if (plan.profile === 'general') return response.trim().length > 0;
  const responseWords = new Set(response.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []);
  const messageWords = (userMessage.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 2 && !['what', 'have', 'been', 'about', 'tell', 'does', 'this', 'that'].includes(word));
  const overlap = messageWords.some((word) =>
    [...responseWords].some((responseWord) => responseWord === word || responseWord.startsWith(word) || word.startsWith(responseWord)),
  );
  const cue = PROFILE_TOPIC_CUES[plan.profile].some((word) =>
    [...responseWords].some((responseWord) => responseWord === word || responseWord.startsWith(word)),
  );
  return overlap || cue;
}

function chronologyScore(text: string, plan: CompositionPlan): number {
  if (!plan.ordering.includes('chronology')) return 1;
  const dates = dateTokens(text);
  if (dates.length < 2) return 1;
  const normalized = dates.map((date) => date.replace(/-/g, ''));
  const ascending = normalized.every((date, index) => index === 0 || normalized[index - 1] <= date);
  const descending = normalized.every((date, index) => index === 0 || normalized[index - 1] >= date);
  return ascending || descending ? 1 : 0;
}

function leakageTokens(text: string, plan: CompositionPlan): string[] {
  if (plan.profile === 'debug') return [];
  return LEAKAGE_PATTERNS
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
}

/**
 * Cheap post-generation checks. This is intentionally a gate, not a semantic
 * judge: it catches visible composition failures without inventing facts or
 * adding another model call.
 */
export function evaluateComposition(input: {
  userMessage: string;
  response: string;
  plan: CompositionPlan;
}): CompositionQualityResult {
  const response = input.response.trim();
  const followUpCount = questionCount(response);
  const leakedTokens = leakageTokens(response, input.plan);
  const lines = response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const duplicateLines = lines.length - new Set(lines.map((line) => line.toLocaleLowerCase())).size;

  const scores: CompositionQualityScores = {
    answered: response.length > 0 && !/^I understand\.? Tell me more\.?$/i.test(response) ? 1 : 0,
    topicAdherence: input.userMessage.trim().length > 0 && response.length > 0 && hasTopicSignal(input.userMessage, response, input.plan) ? 1 : 0,
    selectedDomainAdherence: hasTopicSignal(input.userMessage, response, input.plan) ? 1 : 0,
    chronology: chronologyScore(response, input.plan),
    redundancy: lines.length === 0 ? 1 : duplicateLines === 0 ? 1 : 0,
    databaseLeakage: leakedTokens.length === 0 ? 1 : 0,
    followUpDiscipline: followUpCount <= 1 ? 1 : 0,
  };
  const score = Number(
    (Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length).toFixed(3),
  );
  const reasons: string[] = [];
  if (!scores.answered) reasons.push('empty_or_placeholder_answer');
  if (!scores.topicAdherence) reasons.push('topic_adherence_failed');
  if (!scores.selectedDomainAdherence) reasons.push('selected_domain_adherence_failed');
  if (!scores.chronology) reasons.push('chronology_order_unclear');
  if (!scores.redundancy) reasons.push('repeated_content');
  if (!scores.databaseLeakage) reasons.push(...leakedTokens);
  if (!scores.followUpDiscipline) reasons.push('more_than_one_follow_up_question');

  return {
    version: COMPOSITION_QUALITY_VERSION,
    passed: score >= 0.8,
    score,
    scores,
    reasons,
    followUpCount,
    leakedTokens,
    recompositionRecommended: score < 0.8,
  };
}
