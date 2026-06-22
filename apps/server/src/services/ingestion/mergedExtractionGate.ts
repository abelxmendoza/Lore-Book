import { evaluateEntityCandidates } from '../ontology/entityCandidateGate';
import { hasRomanticSignals } from '../ontology/romanticIntelligence';
import { hasAnyExtractionSignal } from '../conversationCentered/extractionSignals';

/** Cheap pre-check before the single merged LLM call. */
export function shouldRunMergedExtraction(rawText: string): boolean {
  const text = (rawText ?? '').trim();
  if (text.length < 8) return false;
  if (hasAnyExtractionSignal(text)) return true;
  if (hasRomanticSignals(text)) return true;
  if (evaluateEntityCandidates(text).hasCandidates) return true;
  return text.length >= 48;
}
