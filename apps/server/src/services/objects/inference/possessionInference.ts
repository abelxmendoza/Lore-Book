import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

const POSSESSIVE_RE =
  /\b(my|his|her|their|our)\s+(phone|vape|bike|camera|laptop|wallet|keys|car|doorbell)\b/gi;

const NAMED_POSSESSIVE_RE =
  /\b((?:mom|mother|dad|father|abuela|tio|tía|tia)'?s?)\s+(phone|vape|bike|car|doorbell|camera|laptop|wallet|keys)\b/gi;

const OBJECT_TYPE_MAP: Record<string, ObjectCandidate['objectType']> = {
  phone: 'personal_item',
  vape: 'substance_or_consumable',
  bike: 'personal_item',
  camera: 'device',
  laptop: 'device',
  wallet: 'personal_item',
  keys: 'personal_item',
  car: 'vehicle',
  doorbell: 'consumer_product',
};

export function inferPossessions(text: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<string>();

  const patterns = [POSSESSIVE_RE, NAMED_POSSESSIVE_RE];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.source, 'gi');
    while ((match = re.exec(text)) !== null) {
      const ownerRaw = match[1]?.trim();
      const item = match[2]?.trim() ?? match[1]?.trim();
      const objectName = match[2] ? item : ownerRaw;
      if (!objectName) continue;

      const displayName = titleCase(objectName);
      const key = normalizeNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      const owner = match[2] && /mom|dad|mother|father|abuela|tio|tia/i.test(ownerRaw)
        ? titleCase(ownerRaw.replace(/'s$/i, ''))
        : ownerRaw && /^(my|his|her|their|our)$/i.test(ownerRaw)
          ? undefined
          : titleCase(ownerRaw ?? '');

      const sensitive = objectName.toLowerCase() === 'vape';

      out.push({
        displayName,
        objectType: OBJECT_TYPE_MAP[objectName.toLowerCase()] ?? 'personal_item',
        context: buildObjectContext(text, displayName, {
          owner,
          userRelationship: /^(my|our)$/i.test(ownerRaw ?? '') ? 'owns' : undefined,
          privacySensitive: sensitive,
        }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: sensitive,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
