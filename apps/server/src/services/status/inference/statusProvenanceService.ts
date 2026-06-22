import type { StatusSignal } from './statusInferenceTypes';

const UNCERTAINTY_PATTERNS = /\b(?:maybe|might|probably|I think|not sure|possibly|uncertain)\b/i;

export function extractEvidencePhrases(text: string, span?: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (!span) return sentences.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function hasUncertaintyLanguage(text: string): boolean {
  return UNCERTAINTY_PATTERNS.test(text);
}

export function hasProvenance(signal: StatusSignal): boolean {
  return (
    signal.sourceMessageIds.length > 0 &&
    signal.evidencePhrases.length > 0 &&
    Boolean(signal.inferredTitle?.trim())
  );
}

export function shouldCreateStatusCard(_signal: StatusSignal): boolean {
  return false;
}

export function extractTimeHint(text: string): string | undefined {
  const m = text.match(
    /\b(?:since|before|after|during|in)\s+([A-Za-z0-9\s'-]{3,40})/i,
  );
  return m?.[0]?.trim();
}
