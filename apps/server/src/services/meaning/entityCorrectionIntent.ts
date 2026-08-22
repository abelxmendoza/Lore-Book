export type ExplicitEntityCorrection = {
  sourceName: string;
  targetName: string;
  relation: 'same_entity';
  confidence: number;
  evidence: string;
};

function cleanEntityName(value: string): string {
  return value
    .replace(/^\s*(?:correction|actually|to clarify)\s*[:,-]?\s*/i, '')
    .replace(/^["“”']+|["“”'.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validEntityName(value: string): boolean {
  if (value.length < 2 || value.length > 80) return false;
  if (/^(?:he|him|his|she|her|they|them|it|this|that|those|these)$/i.test(value)) return false;
  return /[\p{L}\p{N}]/u.test(value);
}

/**
 * Detect a user's explicit identity correction without deciding or applying it.
 * The output is routed to Entity Authority as a pending, reviewable proposal.
 */
export function detectExplicitEntityCorrection(text: string): ExplicitEntityCorrection | null {
  const normalized = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:^|[.!?]\s+)(?:correction\s*[:,-]?\s*)?(.{1,80}?)\s+(?:and|&)\s+(.{1,80}?)\s+(?:are|refer to)\s+(?:the\s+)?same\s+(?:entity|person|organization|org|group)\b/i,
    /(?:^|[.!?]\s+)(?:correction\s*[:,-]?\s*)?(.{1,80}?)\s+is\s+(?:the\s+)?same\s+(?:entity\s+)?as\s+(.{1,80}?)(?:[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const sourceName = cleanEntityName(match?.[1] ?? '');
    const targetName = cleanEntityName(match?.[2] ?? '');
    if (!validEntityName(sourceName) || !validEntityName(targetName)) continue;
    if (sourceName.toLocaleLowerCase() === targetName.toLocaleLowerCase()) continue;
    return {
      sourceName,
      targetName,
      relation: 'same_entity',
      confidence: 0.98,
      evidence: match?.[0]?.trim() ?? normalized,
    };
  }
  return null;
}

