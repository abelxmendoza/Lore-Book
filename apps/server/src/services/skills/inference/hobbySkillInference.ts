import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const HOBBY_PATTERNS: Array<{
  pattern: RegExp;
  displayName: string;
  skillType: SkillCandidate['skillType'];
}> = [
  { pattern: /\bgardening\b/i, displayName: 'Gardening', skillType: 'hobby' },
  { pattern: /\bphotography\b/i, displayName: 'Photography', skillType: 'creative' },
  { pattern: /\bbeer\s+brewing\b/i, displayName: 'Beer Brewing', skillType: 'cooking' },
  { pattern: /\bbike\s+repair\b/i, displayName: 'Bike Repair', skillType: 'maintenance' },
  { pattern: /\bfront\s+end\s+development\b/i, displayName: 'Front End Development', skillType: 'technical' },
];

export function inferHobbySkills(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];

  for (const { pattern, displayName, skillType } of HOBBY_PATTERNS) {
    if (!pattern.test(text)) continue;
    const evidence = text.match(pattern)?.[0] ?? displayName;

    out.push({
      displayName,
      skillType,
      context: buildSkillContext(text, displayName, {
        activity: evidence,
        hobbyOrPaid: /\bfor fun|hobby|main thing\b/i.test(text) ? 'hobby' : 'unknown',
      }),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: 0.85,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}
