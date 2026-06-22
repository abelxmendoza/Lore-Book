import type { CharacterInferenceContext } from './characterInferenceTypes';

const LINKED_PERSON_PATTERN = /\b(?:with|and)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)?)\b/g;
const TIME_PATTERN =
  /\b(?:last|this|next)\s+(?:week|month|year|summer|semester|quarter|night|weekend)\b/gi;

type CharacterCandidateContextLike = {
  displayName: string;
  context: CharacterInferenceContext;
  sourceMessageIds: string[];
  aliases: string[];
};

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildInferenceContext(
  text: string,
  span: string,
  linkedPeople: string[] = [],
): CharacterInferenceContext {
  const ctx: CharacterInferenceContext = {
    storyContext: extractEvidencePhrases(text, span)[0]?.slice(0, 280),
  };

  const orgMatch = text.match(/\bfrom\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)\b/);
  if (orgMatch?.[1]) ctx.organizationContext = orgMatch[1].trim();

  const eventMatch = text.match(/\b(?:Ska Prom|ska prom|the prom|festival|concert)\b/i);
  if (eventMatch?.[0]) ctx.eventContext = eventMatch[0].trim();

  const schoolMatch = text.match(/\b(CSUF|UCLA|USC|NYU|[A-Z]{2,6}U)\b/);
  if (schoolMatch?.[0]) ctx.placeContext = schoolMatch[0].trim();

  if (linkedPeople.length > 0) {
    ctx.relationshipHint = `Linked: ${linkedPeople.join(', ')}`;
  }

  const timeMatch = text.match(TIME_PATTERN);
  if (timeMatch?.[0]) ctx.timeContext = timeMatch[0].trim();

  return ctx;
}

export function provenanceOverlap(
  a: CharacterCandidateContextLike,
  b: CharacterCandidateContextLike,
): boolean {
  const anchors = [
    a.context.organizationContext,
    a.context.eventContext,
    a.context.placeContext,
    a.context.groupContext,
  ].filter(Boolean);
  const bAnchors = [
    b.context.organizationContext,
    b.context.eventContext,
    b.context.placeContext,
    b.context.groupContext,
  ].filter(Boolean);

  if (anchors.length === 0 || bAnchors.length === 0) return false;
  return anchors.some((x) => bAnchors.some((y) => x!.toLowerCase() === y!.toLowerCase()));
}

export function collectLinkedPeople(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LINKED_PERSON_PATTERN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const name = m[1]?.trim();
    if (name && name.length > 1) out.add(name);
  }
  return [...out];
}
