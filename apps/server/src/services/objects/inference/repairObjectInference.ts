import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

const REPAIR_RE =
  /\b(?:fixing|fixed|repaired|repairing)\s+(?:his|her|their|my|the)\s+(bike|robot|doorbell|gripper|phone|laptop)\b/gi;

const SWAP_RE =
  /\b(?:(?:swapped|swap|replaced)\s+(?:the\s+)?(gripper|battery|motor)|gripper\s+swaps?)\b/gi;

const WORKED_ON_RE =
  /\bworked\s+on\s+(ring\s+doorbells?|robots?|grippers?)\b/gi;

export function inferRepairObjects(text: string): {
  objects: ObjectCandidate[];
  skillHints: string[];
} {
  const objects: ObjectCandidate[] = [];
  const skillHints: string[] = [];

  let match: RegExpExecArray | null;

  const repairRe = new RegExp(REPAIR_RE.source, 'gi');
  while ((match = repairRe.exec(text)) !== null) {
    const item = match[1].trim();
    const displayName = titleCase(item);

    objects.push({
      displayName,
      objectType: classifyRepairItem(item),
      context: buildObjectContext(text, displayName, {
        userRelationship: 'fixed',
        skillContext: item.toLowerCase() === 'bike' ? 'Bike Repair' : undefined,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });

    if (item.toLowerCase() === 'bike') skillHints.push('Bike Repair');
  }

  const swapRe = new RegExp(SWAP_RE.source, 'gi');
  while ((match = swapRe.exec(text)) !== null) {
    const item = (match[1] ?? 'gripper').trim();
    const displayName = titleCase(item);
    objects.push({
      displayName,
      objectType: item.toLowerCase() === 'gripper' ? 'robot_part' : 'tool',
      context: buildObjectContext(text, displayName, {
        userRelationship: 'worked_on',
        skillContext: 'Robot Maintenance',
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
    if (item.toLowerCase() === 'gripper') skillHints.push('Gripper Maintenance');
  }

  const workedRe = new RegExp(WORKED_ON_RE.source, 'gi');
  while ((match = workedRe.exec(text)) !== null) {
    const item = match[1].trim();
    const displayName = /doorbell/i.test(item) ? 'Ring Doorbell' : titleCase(item);
    objects.push({
      displayName,
      objectType: /doorbell/i.test(item) ? 'consumer_product' : 'robot',
      context: buildObjectContext(text, displayName, {
        userRelationship: 'worked_on',
        workContext: match[0],
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.87,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return { objects, skillHints };
}

function classifyRepairItem(item: string): ObjectCandidate['objectType'] {
  const key = item.toLowerCase();
  if (key === 'bike') return 'personal_item';
  if (key === 'gripper') return 'robot_part';
  if (key === 'robot') return 'robot';
  if (key === 'doorbell') return 'consumer_product';
  return 'device';
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
