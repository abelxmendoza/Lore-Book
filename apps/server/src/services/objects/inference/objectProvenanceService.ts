import type { ObjectInferenceContext } from './objectInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildObjectContext(
  text: string,
  span: string,
  partial: ObjectInferenceContext = {},
): ObjectInferenceContext {
  return {
    ...partial,
    placeContext: partial.placeContext ?? extractPlaceHint(text),
    eventContext: partial.eventContext ?? extractEventHint(text, span),
    workContext: partial.workContext ?? extractWorkHint(text),
  };
}

function extractPlaceHint(text: string): string | undefined {
  const m = text.match(/\b(?:in|at|inside|from)\s+(?:my\s+)?(?:mom'?s?|dad'?s?|the)\s+([a-z][a-z\s]{2,30})/i);
  return m?.[0]?.trim();
}

function extractEventHint(text: string, span: string): string | undefined {
  if (/\b(?:forgot|lost|found|misplaced)\b/i.test(text) && text.toLowerCase().includes(span.toLowerCase())) {
    return text.match(/\b(?:forgot|lost|found|misplaced)\b[^.!?]*/i)?.[0]?.slice(0, 120);
  }
  return undefined;
}

function extractWorkHint(text: string): string | undefined {
  const m = text.match(/\b(?:at work|on the job|production line|shift)\b[^.!?]*/i);
  return m?.[0]?.trim();
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: ObjectInferenceContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.owner ||
        candidate.context.userRelationship ||
        candidate.context.placeContext ||
        candidate.context.eventContext ||
        candidate.context.workContext ||
        candidate.context.projectContext,
    )
  );
}
