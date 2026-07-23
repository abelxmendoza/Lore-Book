import { evidenceLooksGenerated } from './placeSourcePolicy';
import type { PlaceEvidence, PlaceSourceType } from './placeTypes';

export function buildPlaceEvidence(input: {
  text?: string;
  sourceType?: PlaceSourceType;
  sourceMessageId?: string;
}): PlaceEvidence[] {
  const text = (input.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  if (evidenceLooksGenerated(text)) return [];

  // Cap evidence snippets — never store whole conversations.
  const clipped = text.length > 240 ? `${text.slice(0, 239).trim()}…` : text;
  return [
    {
      text: clipped,
      sourceType: input.sourceType ?? 'chat',
      sourceMessageId: input.sourceMessageId,
    },
  ];
}
