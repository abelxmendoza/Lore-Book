import type { EmotionSignal } from './emotionInferenceTypes';

const SENSITIVE_PATTERNS = [
  /\b(?:self[- ]?harm|suicid|kill myself|cut myself)\b/i,
  /\b(?:rape|sexual assault|molest)\b/i,
  /\b(?:minor|underage|child porn)\b/i,
  /\b(?:stalk(?:ing|ed)|doxx)\b/i,
  /\b(?:blacked out|blackout drunk|too drunk)\b/i,
  /\b(?:wanted to jump me|jump me|stab|shoot|weapon|gun)\b/i,
  /\b(?:threat(?:en|ened)|violence|assault)\b/i,
];

export function extractEvidencePhrases(text: string, span?: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (!span) {
    return sentences.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  }
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function requiresSensitiveReview(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

export function hasProvenance(signal: EmotionSignal): boolean {
  return (
    signal.sourceMessageIds.length > 0 &&
    signal.evidencePhrases.length > 0 &&
    Boolean(signal.attachedTo.inferredTitle || signal.attachedTo.entityId)
  );
}

export function shouldCreateEmotionBookCard(_signal: EmotionSignal): boolean {
  return false;
}
