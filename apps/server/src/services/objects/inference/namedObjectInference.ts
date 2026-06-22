import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

export const BARE_GENERIC_OBJECTS = new Set([
  'thing',
  'stuff',
  'it',
  'this',
  'that',
  'project',
  'app',
  'system',
  'feature',
  'place',
  'person',
  'idea',
  'concept',
]);

const CONCRETE_OBJECTS: Array<{
  pattern: RegExp;
  displayName: string;
  objectType: ObjectCandidate['objectType'];
  sensitive?: boolean;
}> = [
  { pattern: /\bphone\b/i, displayName: 'Phone', objectType: 'personal_item' },
  { pattern: /\bvape\b/i, displayName: 'Vape', objectType: 'substance_or_consumable', sensitive: true },
  { pattern: /\bbike\b/i, displayName: 'Bike', objectType: 'personal_item' },
  { pattern: /\bcamera\b/i, displayName: 'Camera', objectType: 'device' },
  { pattern: /\blaptop\b/i, displayName: 'Laptop', objectType: 'device' },
  { pattern: /\bwallet\b/i, displayName: 'Wallet', objectType: 'personal_item' },
  { pattern: /\bkeys\b/i, displayName: 'Keys', objectType: 'personal_item' },
  { pattern: /\bgi\b/i, displayName: 'Gi', objectType: 'sports_gear' },
  { pattern: /\bboxing\s+gloves\b/i, displayName: 'Boxing Gloves', objectType: 'sports_gear' },
  { pattern: /\bguitar\b/i, displayName: 'Guitar', objectType: 'music_gear' },
];

export function isBareGenericObject(name: string): boolean {
  return BARE_GENERIC_OBJECTS.has(normalizeNameKey(name));
}

export function inferNamedObjects(text: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, objectType, sensitive } of CONCRETE_OBJECTS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence = text.match(pattern)?.[0] ?? displayName;
    out.push({
      displayName,
      objectType,
      context: buildObjectContext(text, displayName),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: 0.82,
      inferredNotConfirmed: true,
      requiresReview: Boolean(sensitive),
      promotionStatus: 'candidate',
    });
  }

  return out;
}
