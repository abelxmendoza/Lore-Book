import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const WORK_SKILL_RE =
  /\b((?:ArUco\s+Calibration|Gripper\s+Swaps?|Live\s+Robot\s+Support|doing\s+ArUco\s+calibration|gripper\s+swaps?|live\s+robot\s+support))\b/gi;

const WORK_ACTIVITY_MAP: Array<{ pattern: RegExp; displayName: string; skillType: SkillCandidate['skillType'] }> = [
  { pattern: /aruco\s+calibration/i, displayName: 'ArUco Calibration', skillType: 'robotics' },
  { pattern: /gripper\s+swaps?/i, displayName: 'Gripper Maintenance', skillType: 'maintenance' },
  { pattern: /live\s+robot\s+support/i, displayName: 'Robot Field Support', skillType: 'field_operations' },
];

export function inferWorkSkills(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, skillType } of WORK_ACTIVITY_MAP) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence = text.match(pattern)?.[0] ?? displayName;
    out.push({
      displayName,
      skillType,
      context: buildSkillContext(text, displayName, {
        activity: evidence,
        hobbyOrPaid: 'paid',
      }),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  let match: RegExpExecArray | null;
  const workRe = new RegExp(WORK_SKILL_RE.source, 'gi');
  while ((match = workRe.exec(text)) !== null) {
    const raw = match[1].trim();
    const mapped = WORK_ACTIVITY_MAP.find((m) => m.pattern.test(raw));
    if (!mapped) continue;
    const key = normalizeNameKey(mapped.displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName: mapped.displayName,
      skillType: mapped.skillType,
      context: buildSkillContext(text, mapped.displayName, {
        activity: match[0],
        hobbyOrPaid: 'paid',
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}
