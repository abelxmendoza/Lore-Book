import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const LEARNING_RE =
  /\b(?:learning|getting better at|studying|training in)\s+(kickboxing|muay thai|boxing|bjj|ros2?|python|c\+\+|japanese|spanish)\b[^.!?]*(?:for\s+\d+\s+months?)?/gi;

const TEACHING_PAID_RE =
  /\bused\s+to\s+teach\s+(boxing|muay thai|kickboxing|bjj|judo)\s+for\s+money\b/gi;

const USED_TO_RE =
  /\bused\s+to\s+(?:teach|train|practice)\s+([A-Za-z][\w\s+#.-]{2,30})\b/gi;

export function inferSkillProgression(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];

  let match: RegExpExecArray | null;

  const learningRe = new RegExp(LEARNING_RE.source, 'gi');
  while ((match = learningRe.exec(text)) !== null) {
    const skillName = titleCase(match[1].trim());
    const duration = text.match(/\bfor\s+\d+\s+months?\b/i)?.[0];

    out.push({
      displayName: skillName,
      skillType: classifyProgressionSkill(skillName),
      context: buildSkillContext(text, skillName, {
        activity: match[0],
        proficiencyHint: 'beginner',
        currentOrFormer: 'current',
        frequencyHint: duration,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.86,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  const paidRe = new RegExp(TEACHING_PAID_RE.source, 'gi');
  while ((match = paidRe.exec(text)) !== null) {
    const skillName = titleCase(match[1].trim());
    out.push({
      displayName: skillName,
      skillType: 'martial_art',
      context: buildSkillContext(text, skillName, {
        activity: match[0],
        proficiencyHint: 'taught/paid',
        currentOrFormer: 'former',
        hobbyOrPaid: 'paid',
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.92,
      inferredNotConfirmed: true,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  const usedToRe = new RegExp(USED_TO_RE.source, 'gi');
  while ((match = usedToRe.exec(text)) !== null) {
    const skillName = titleCase(match[1].trim());
    if (/\bmoney\b/i.test(text)) {
      out.push({
        displayName: skillName,
        skillType: classifyProgressionSkill(skillName),
        context: buildSkillContext(text, skillName, {
          activity: match[0],
          proficiencyHint: 'taught/paid',
          currentOrFormer: 'former',
          hobbyOrPaid: 'paid',
        }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function classifyProgressionSkill(name: string): SkillCandidate['skillType'] {
  if (/kickboxing|muay thai|boxing|bjj|judo|mma/i.test(name)) return 'martial_art';
  if (/japanese|spanish|korean|italian|portuguese/i.test(name)) return 'language';
  if (/ros|python|c\+\+/i.test(name)) return 'technical';
  return 'unknown_skill';
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
