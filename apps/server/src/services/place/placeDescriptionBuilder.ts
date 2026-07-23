/**
 * Concise place descriptions — never dump whole conversation paragraphs.
 */

const MAX_CHARS = 180;

export function buildPlaceDescription(input: {
  canonicalTitle: string;
  subtype?: string;
  evidenceText?: string;
  mentionContext?: string;
}): string | undefined {
  const evidence = (input.evidenceText ?? '').replace(/\s+/g, ' ').trim();
  if (!evidence) {
    if (input.subtype) {
      return `${input.canonicalTitle} (${formatSubtype(input.subtype)}).`;
    }
    return undefined;
  }

  // Reject generated-summary dumps and long paragraphs.
  if (/^(?:user\s+mentioned|the\s+user\s+said)/i.test(evidence)) {
    return input.subtype
      ? `${input.canonicalTitle} (${formatSubtype(input.subtype)}).`
      : undefined;
  }

  if (evidence.length > 400 || evidence.split(/[.!?]/).length > 4) {
    return summarizeFromEvidence(input.canonicalTitle, input.subtype, evidence);
  }

  const clipped = evidence.length > MAX_CHARS ? `${evidence.slice(0, MAX_CHARS - 1).trim()}…` : evidence;
  return clipped;
}

function formatSubtype(subtype: string): string {
  return subtype.replace(/_/g, ' ');
}

function summarizeFromEvidence(title: string, subtype: string | undefined, evidence: string): string {
  const firstSentence = evidence.split(/(?<=[.!?])\s+/)[0]?.trim() ?? evidence;
  const short = firstSentence.length > MAX_CHARS
    ? `${firstSentence.slice(0, MAX_CHARS - 1).trim()}…`
    : firstSentence;
  if (short.toLowerCase().includes(title.toLowerCase())) return short;
  const typeBit = subtype ? ` ${formatSubtype(subtype)}` : ' place';
  return `${title} —${typeBit} referenced in your story.`;
}
