import type { LocationInferenceContext } from './locationInferenceTypes';

const TIME_PATTERN =
  /\b(?:last|this|next)\s+(?:night|week|month|year|summer|semester|quarter|weekend)\b/gi;
const EVENT_PATTERN =
  /\b(?:show|concert|festival|prom|party|gig|meetup|wedding|reunion)\b/gi;
const PERSON_PATTERN = /\b(?:with|and)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+)?)\b/g;

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildLocationContext(text: string, span: string): LocationInferenceContext {
  const ctx: LocationInferenceContext = {};

  const eventMatch = text.match(EVENT_PATTERN);
  if (eventMatch?.[0]) ctx.eventContext = eventMatch[0].trim();

  const orgMatch = text.match(/\b(?:from|at)\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)\b/);
  if (orgMatch?.[1] && !orgMatch[1].toLowerCase().includes(span.toLowerCase())) {
    ctx.organizationContext = orgMatch[1].trim();
  }

  const people: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PERSON_PATTERN.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const name = m[1]?.trim();
    if (name) people.push(name);
  }
  if (people.length > 0) ctx.personContext = people.join(', ');

  const timeMatch = text.match(TIME_PATTERN);
  if (timeMatch?.[0]) ctx.timeContext = timeMatch[0].trim();

  return ctx;
}

export function provenanceOverlap(
  a: { context: LocationInferenceContext; sourceMessageIds: string[] },
  b: { context: LocationInferenceContext; sourceMessageIds: string[] },
): boolean {
  if (a.sourceMessageIds.some((id) => b.sourceMessageIds.includes(id))) return true;

  const anchors = [
    a.context.organizationContext,
    a.context.eventContext,
    a.context.personContext,
  ].filter(Boolean);
  const bAnchors = [
    b.context.organizationContext,
    b.context.eventContext,
    b.context.personContext,
  ].filter(Boolean);

  if (anchors.length === 0 || bAnchors.length === 0) return false;
  return anchors.some((x) => bAnchors.some((y) => x!.toLowerCase() === y!.toLowerCase()));
}
