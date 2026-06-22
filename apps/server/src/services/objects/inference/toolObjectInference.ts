import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

const TOOLS: Array<{ pattern: RegExp; displayName: string; objectType: ObjectCandidate['objectType'] }> = [
  { pattern: /\boscilloscope\b/i, displayName: 'Oscilloscope', objectType: 'tool' },
  { pattern: /\bkikusui\s+load\b/i, displayName: 'Kikusui Load', objectType: 'work_equipment' },
  { pattern: /\bgripper\b/i, displayName: 'Gripper', objectType: 'robot_part' },
];

export function inferToolObjects(text: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, objectType } of TOOLS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence = text.match(pattern)?.[0] ?? displayName;
    const workedOn = /\b(?:swapped|swap|replaced|worked on|installed)\b/i.test(text);

    out.push({
      displayName,
      objectType,
      context: buildObjectContext(text, displayName, {
        userRelationship: workedOn ? 'worked_on' : 'used',
        workContext: workedOn ? evidence : undefined,
        skillContext: /gripper/i.test(displayName) ? 'Robot Maintenance' : undefined,
      }),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: workedOn ? 0.9 : 0.84,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}
