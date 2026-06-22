import type { StatusSignal } from './statusInferenceTypes';

function makeSkillSignal(
  title: string,
  status: StatusSignal['status'],
  evidence: string,
  confidence: number,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'skill',
    inferredTitle: title,
    status,
    transition,
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}

export function inferSkillStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];

  if (/\b(?:learning|getting into)\s+kickboxing\b/i.test(text) || /\bkickboxing\b[^.!?]{0,40}\b(?:learning|beginner)\b/i.test(text)) {
    out.push(makeSkillSignal('Kickboxing', 'current', 'learning kickboxing', 0.88, 'started'));
  }

  if (/\b(?:used to teach|taught)\s+boxing\b/i.test(text)) {
    out.push(makeSkillSignal('Boxing teaching', 'former', 'used to teach boxing', 0.9, 'ended'));
  }

  if (/\bMuay Thai\b[^.!?]{0,40}\b(?:main thing|still my main thing)\b/i.test(text)) {
    out.push(makeSkillSignal('Muay Thai', 'current', 'still my main thing', 0.9));
  }

  if (/\b(?:getting better at|improving)\b/i.test(text)) {
    const skill = /\bkickboxing\b/i.test(text) ? 'Kickboxing' : 'skill';
    out.push(makeSkillSignal(skill, 'current', 'getting better', 0.82));
  }

  if (/\bhaven'?t trained\b/i.test(text)) {
    const skill = /\b(?:Muay Thai|kickboxing|boxing)\b/i.exec(text)?.[0] ?? 'training';
    out.push(makeSkillSignal(skill, 'paused', "haven't trained", 0.8, 'paused'));
  }

  return out;
}
