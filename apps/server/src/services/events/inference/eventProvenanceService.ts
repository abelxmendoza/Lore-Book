import type { EventInferenceContext } from './eventInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildEventContext(
  text: string,
  span: string,
  partial: EventInferenceContext = {},
): EventInferenceContext {
  return {
    ...partial,
    timeHint: partial.timeHint ?? extractTimeHint(text),
    emotionalWeight: partial.emotionalWeight ?? extractEmotionalHint(text),
    storyArc: partial.storyArc ?? extractStoryArc(text, span),
  };
}

function extractTimeHint(text: string): string | undefined {
  const m = text.match(
    /\b(?:yesterday|last\s+night|last\s+summer|last\s+week|last\s+year|before\s+covid|every\s+\w+day|after\s+school|lunch\s+break|around\s+noon|a\s+couple\s+weeks?\s+ago)\b/i,
  );
  return m?.[0]?.trim();
}

function extractEmotionalHint(text: string): string | undefined {
  const m = text.match(
    /\b(?:ghosted|blocked|betrayed|best\s+friend|crush|fight|kicked\s+out|jump\s+me|detention|blacked\s+out|drunk|intoxicated)\b/i,
  );
  return m?.[0]?.trim();
}

function extractStoryArc(text: string, span: string): string | undefined {
  const sentences = extractEvidencePhrases(text, span);
  return sentences[0]?.slice(0, 280);
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: EventInferenceContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.storyArc ||
        candidate.context.timeHint ||
        candidate.context.place ||
        candidate.context.people?.length ||
        candidate.context.organization,
    )
  );
}
