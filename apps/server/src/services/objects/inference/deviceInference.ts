import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { ObjectCandidate } from './objectInferenceTypes';
import { buildObjectContext } from './objectProvenanceService';
import { classifyConsumerProduct } from './productReferenceGuard';

const DEVICES: Array<{ pattern: RegExp; displayName: string; objectType: ObjectCandidate['objectType'] }> = [
  { pattern: /\bamazon\s+ring\s+doorbell\b/i, displayName: 'Amazon Ring Doorbell', objectType: 'consumer_product' },
  { pattern: /\bring\s+doorbells?\b/i, displayName: 'Ring Doorbell', objectType: 'consumer_product' },
  { pattern: /\braspberry\s+pi\b/i, displayName: 'Raspberry Pi', objectType: 'device' },
  { pattern: /\bjetson\s+nano\b/i, displayName: 'Jetson Nano', objectType: 'device' },
  { pattern: /\bfreenove\s+robot\b/i, displayName: 'Freenove Robot', objectType: 'robot' },
  { pattern: /\bomega-?1\b/i, displayName: 'Omega-1', objectType: 'robot' },
];

export function inferDevices(text: string): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, objectType } of DEVICES) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence = text.match(pattern)?.[0] ?? displayName;
    const isUserBuilt = /\b(?:built|building|assembled|customized)\b/i.test(text);
    const finalType =
      objectType === 'robot' && /doorbell/i.test(displayName)
        ? classifyConsumerProduct(displayName)
        : objectType;

    out.push({
      displayName,
      objectType: finalType,
      context: buildObjectContext(text, displayName, {
        workContext: /\b(?:worked on|installed|configured)\b/i.test(text) ? evidence : undefined,
        projectContext: isUserBuilt ? displayName : undefined,
      }),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: 0.88,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
      linkedProjectName: isUserBuilt && objectType === 'robot' ? displayName : undefined,
    });
  }

  return out;
}
