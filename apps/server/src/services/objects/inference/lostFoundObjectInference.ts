import type { LostFoundEventHint, ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';

const LOST_RE =
  /\b(?:forgot|lost|misplaced|left)\s+(?:my\s+)?(phone|vape|wallet|keys|bike|laptop|camera)\b[^.!?]*/gi;

const FOUND_RE =
  /\b(?:found|recovered|located)\s+(?:my\s+)?(phone|vape|wallet|keys|bike|laptop|camera)\b/gi;

const FIND_MY_RE = /\bfind\s+my\s+app\s+located\b/gi;

export function inferLostFoundObjects(text: string): {
  objects: ObjectCandidate[];
  hints: LostFoundEventHint[];
} {
  const objects: ObjectCandidate[] = [];
  const hints: LostFoundEventHint[] = [];

  let match: RegExpExecArray | null;

  const lostRe = new RegExp(LOST_RE.source, 'gi');
  while ((match = lostRe.exec(text)) !== null) {
    const item = match[1].trim();
    const displayName = titleCase(item);
    const place = text.match(/\b(?:in|at|inside)\s+[^.!?]+/i)?.[0];

    objects.push({
      displayName,
      objectType: classifyItem(item),
      context: buildObjectContext(text, displayName, {
        userRelationship: /\bforgot\b/i.test(match[0]) ? 'lost' : 'lost',
        placeContext: place,
        eventContext: match[0].trim(),
        privacySensitive: item.toLowerCase() === 'vape',
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: item.toLowerCase() === 'vape',
      promotionStatus: 'candidate',
    });

    hints.push({
      objectDisplayName: displayName,
      eventType: 'lost_item',
      placeContext: place,
      evidence: match[0].trim(),
    });
  }

  const foundRe = new RegExp(FOUND_RE.source, 'gi');
  while ((match = foundRe.exec(text)) !== null) {
    const item = match[1].trim();
    const displayName = titleCase(item);
    hints.push({
      objectDisplayName: displayName,
      eventType: 'recovered_item',
      evidence: match[0].trim(),
    });
  }

  if (FIND_MY_RE.test(text)) {
    hints.push({
      objectDisplayName: 'Phone',
      eventType: 'recovered_item',
      evidence: text.match(FIND_MY_RE)?.[0] ?? 'Find My app located it',
    });
  }

  return { objects, hints };
}

function classifyItem(item: string): ObjectCandidate['objectType'] {
  const key = item.toLowerCase();
  if (key === 'vape') return 'substance_or_consumable';
  if (['phone', 'wallet', 'keys', 'bike'].includes(key)) return 'personal_item';
  return 'device';
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
