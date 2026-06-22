import type { SkillInferenceContext } from './skillInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildSkillContext(
  text: string,
  span: string,
  partial: SkillInferenceContext = {},
): SkillInferenceContext {
  return {
    ...partial,
    activity: partial.activity ?? extractActivityCue(text, span),
    proficiencyHint: partial.proficiencyHint ?? extractProficiencyHint(text),
    frequencyHint: partial.frequencyHint ?? extractFrequencyHint(text),
    currentOrFormer: partial.currentOrFormer ?? extractCurrentOrFormer(text),
    hobbyOrPaid: partial.hobbyOrPaid ?? extractHobbyOrPaid(text),
  };
}

function extractActivityCue(text: string, span: string): string | undefined {
  const sentences = extractEvidencePhrases(text, span);
  return sentences[0]?.slice(0, 200);
}

function extractProficiencyHint(text: string): string | undefined {
  if (/\b(?:beginner|just started|learning|getting better at)\b/i.test(text)) return 'beginner';
  if (/\b(?:improving|getting better|intermediate)\b/i.test(text)) return 'improving';
  if (/\b(?:experienced|advanced|expert|black belt|blue belt)\b/i.test(text)) return 'experienced';
  if (/\b(?:used to teach|taught for money|professional)\b/i.test(text)) return 'taught/paid';
  return undefined;
}

function extractFrequencyHint(text: string): string | undefined {
  const m = text.match(/\b(?:every\s+\w+day|weekly|daily|for\s+\d+\s+months?)\b/i);
  return m?.[0]?.trim();
}

function extractCurrentOrFormer(text: string): SkillInferenceContext['currentOrFormer'] {
  if (/\b(?:used to|formerly|back when|no longer)\b/i.test(text)) return 'former';
  if (/\b(?:learning|training|practicing|currently|still)\b/i.test(text)) return 'current';
  return 'unknown';
}

function extractHobbyOrPaid(text: string): SkillInferenceContext['hobbyOrPaid'] {
  if (/\b(?:taught for money|paid|freelance|contract|professional|client|job|work)\b/i.test(text)) {
    return 'paid';
  }
  if (/\b(?:for fun|hobby|main thing|after school|personal project|club)\b/i.test(text)) {
    return 'hobby';
  }
  return 'unknown';
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: SkillInferenceContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.activity ||
        candidate.context.tool ||
        candidate.context.object ||
        candidate.context.organization ||
        candidate.context.proficiencyHint,
    )
  );
}
