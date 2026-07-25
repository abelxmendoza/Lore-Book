import type { CorrectionTargetResolution, SpeechAct } from './beliefTypes';

export function resolveBeliefCorrectionTarget(input: {
  speechAct: SpeechAct;
  claimText: string;
  existingClaimIds?: string[];
  existingClaimTexts?: Array<{ id: string; text: string }>;
}): CorrectionTargetResolution {
  if (input.speechAct !== 'CORRECTION' && input.speechAct !== 'RETRACTION') {
    return {
      candidateBeliefIds: [],
      matchMethod: 'UNRESOLVED',
      confidence: 0,
    };
  }

  const negatedObject = extractNegatedObject(input.claimText);
  const candidates = (input.existingClaimTexts ?? []).filter((row) => {
    if (!negatedObject) return false;
    const hay = row.text.toLowerCase();
    return negatedObject.split(/\s+/).every((token) => hay.includes(token));
  });

  if (candidates.length > 0) {
    return {
      candidateBeliefIds: candidates.map((c) => c.id),
      selectedBeliefId: candidates[0].id,
      matchMethod: 'NEGATION_MATCH',
      confidence: 0.8,
    };
  }

  if (input.existingClaimIds?.length) {
    return {
      candidateBeliefIds: input.existingClaimIds,
      selectedBeliefId: input.existingClaimIds[0],
      matchMethod: 'CONVERSATION_CONTEXT',
      confidence: 0.4,
    };
  }

  return {
    candidateBeliefIds: [],
    matchMethod: 'UNRESOLVED',
    confidence: 0,
  };
}

function extractNegatedObject(text: string): string | null {
  const m = text.match(/\b(?:not|never)\s+(?:a\s+|an\s+|the\s+)?(.+)$/i)
    || text.match(/\b(?:isn'?t|aren'?t|wasn'?t)\s+(?:a\s+|an\s+)?(.+)$/i);
  if (!m?.[1]) return null;
  return m[1]
    .toLowerCase()
    .replace(/\b(?:actually|anymore|either)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
