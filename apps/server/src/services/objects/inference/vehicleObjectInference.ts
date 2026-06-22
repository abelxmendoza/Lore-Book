import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

const POSSESSIVE_VEHICLE_RE =
  /\b((?:my|his|her|their|our)\s+)?((?:mom|mother|dad|father|abuela|tio|tía|tia)'?s?)\s+(car|truck|van|suv)\b/gi;

const VEHICLE_RE = /\b(car|truck|van|suv)\b/gi;

export function inferVehicleObjects(text: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const possRe = new RegExp(POSSESSIVE_VEHICLE_RE.source, 'gi');
  while ((match = possRe.exec(text)) !== null) {
    const owner = (match[2] ?? '').trim();
    const vehicle = match[3].trim();
    const displayName = owner ? `${titleCase(owner)}'s ${titleCase(vehicle)}` : titleCase(vehicle);
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      objectType: 'vehicle',
      context: buildObjectContext(text, displayName, {
        owner: titleCase(owner),
        userRelationship: /\bmy\b/i.test(match[0]) ? 'owns' : undefined,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  if (/\b(?:mom'?s?|mother'?s?)\s+car\b/i.test(text) && !seen.has(normalizeNameKey("Mom's Car"))) {
    out.push({
      displayName: "Mom's Car",
      objectType: 'vehicle',
      context: buildObjectContext(text, "Mom's Car", {
        owner: 'Mom',
        userRelationship: /\bforgot|left|in\b/i.test(text) ? 'used' : undefined,
      }),
      evidencePhrases: [text.match(/\bmom'?s?\s+car\b/i)?.[0] ?? "mom's car"],
      sourceMessageIds: [],
      confidence: 0.92,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
