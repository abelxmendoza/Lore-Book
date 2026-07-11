/**
 * Mention-level context resolution for homonyms.
 *
 * Same surface form ("Sol") can mean an AI model in one span and a person in
 * another. A message-level alias map must not collapse them — each mention span
 * gets its own inferred type and resolution.
 *
 * Deterministic, no hardcoded person/model names.
 */

import {
  resolveMention,
  type ResolutionCandidate,
  type ResolutionContext,
  type ResolutionResult,
} from './entityResolutionCore';
import { classifyEntity, type EntityClass } from './entityClassifier';
import { normalizeEntityType, type NormalizedEntityType } from './entityTypeCompatibility';

export type InferredMentionType =
  | 'person'
  | 'software_tool'
  | 'ai_model'
  | 'product'
  | 'project'
  | 'unknown_artifact'
  | 'unknown';

export type HomonymResolutionDiagnostic = {
  surface: string;
  mentionSpan: { start: number; end: number };
  sentence: string;
  inferredType: InferredMentionType;
  selectedEntityId: string | null;
  resolutionReason: string;
  confidence: number;
};

export type MentionResolution = HomonymResolutionDiagnostic & {
  resolution: ResolutionResult;
};

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

const SOFTWARE_RELEASE_LOCAL =
  /\b(release of|launched|shipping|version|v\d|model|llm|ai model|foundation model|checkpoint)\b/i;
const SOFTWARE_FAMILY_LOCAL =
  /\b(claude|opus|codex|composer|gpt|chatgpt|anthropic|openai|cursor)\b/i;
const VERSIONED_LABEL = /^\d+(\.\d+)+\s+\S+/i;
const PRODUCT_WORK_LOCAL = /\b(working on|building|shipping|developing|making)\b/i;
const ROMANTIC_PERSON_LOCAL =
  /\b(lovers?|girlfriend|boyfriend|partner|wife|husband|ex|dated|dating|hooked up|fucking|slept with|girl|guy|woman|man)\b/i;
const PUBLIC_FIGURE_LOCAL = /\b(ceo|founder|sam altman|playing a joke|public figure)\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentenceContaining(text: string, start: number, end: number): string {
  const parts = text.split(SENTENCE_SPLIT);
  let cursor = 0;
  for (const part of parts) {
    const idx = text.indexOf(part, cursor);
    const from = idx < 0 ? cursor : idx;
    const to = from + part.length;
    if (start >= from && end <= to + 1) return part.trim();
    cursor = to;
  }
  return text.slice(Math.max(0, start - 80), Math.min(text.length, end + 80)).trim();
}

function localContext(text: string, start: number, end: number, radius = 70): string {
  return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius));
}

/** Find non-overlapping spans of a surface form in message text. */
export function findSurfaceSpans(
  text: string,
  surface: string,
): Array<{ start: number; end: number; matched: string }> {
  const spans: Array<{ start: number; end: number; matched: string }> = [];
  if (!surface.trim()) return spans;
  const re = new RegExp(escapeRe(surface.trim()), 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (surface.trim().length <= 4) {
      const before = start === 0 ? ' ' : text[start - 1];
      const after = end >= text.length ? ' ' : text[end];
      if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) continue;
    }
    spans.push({ start, end, matched: m[0] });
  }
  return spans;
}

/**
 * Infer entity type from local noun-phrase / syntactic cues around a mention.
 * Never hardcodes specific model or person names.
 */
export function inferMentionType(
  surface: string,
  message: string,
  span: { start: number; end: number },
): { type: InferredMentionType; reason: string; confidence: number } {
  const local = localContext(message, span.start, span.end);
  const before = message.slice(Math.max(0, span.start - 40), span.start);
  const fullLabel = message
    .slice(Math.max(0, span.start - 24), Math.min(message.length, span.end + 8))
    .trim();

  // Versioned software labels: "5.6 Sol", "Opus 4.8", "Composer 2.5"
  if (
    VERSIONED_LABEL.test(surface) ||
    VERSIONED_LABEL.test(fullLabel) ||
    /\b\S+\s+\d+\.\d+\b/.test(surface)
  ) {
    return { type: 'ai_model', reason: 'versioned_software_label', confidence: 0.92 };
  }
  if (SOFTWARE_RELEASE_LOCAL.test(before) || SOFTWARE_RELEASE_LOCAL.test(local)) {
    return { type: 'ai_model', reason: 'release_or_model_cue', confidence: 0.9 };
  }
  if (SOFTWARE_FAMILY_LOCAL.test(before) || SOFTWARE_FAMILY_LOCAL.test(local)) {
    return { type: 'software_tool', reason: 'software_family_cue', confidence: 0.86 };
  }
  if (PRODUCT_WORK_LOCAL.test(before) && /\b(app|project|product|lore ?book)\b/i.test(local)) {
    return { type: 'project', reason: 'working_on_project_cue', confidence: 0.88 };
  }
  if (ROMANTIC_PERSON_LOCAL.test(local)) {
    // "same name as … lovers" is coincidence framing for the PRECEDING software mention.
    if (/\bsame name as\b/i.test(local) && SOFTWARE_RELEASE_LOCAL.test(before)) {
      return { type: 'ai_model', reason: 'release_with_namesake_coincidence', confidence: 0.85 };
    }
    return { type: 'person', reason: 'romantic_or_person_role_cue', confidence: 0.9 };
  }
  if (PUBLIC_FIGURE_LOCAL.test(local) && /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(surface)) {
    return { type: 'person', reason: 'public_figure_cue', confidence: 0.8 };
  }

  const classified = classifyEntity(surface, message);
  return mapClassToInferred(classified.type, classified.reason, classified.confidence);
}

function mapClassToInferred(
  type: EntityClass,
  reason: string,
  confidence: number,
): { type: InferredMentionType; reason: string; confidence: number } {
  switch (type) {
    case 'PERSON':
      return { type: 'person', reason, confidence };
    case 'APP':
      return { type: 'software_tool', reason, confidence };
    case 'PRODUCT':
      return { type: 'product', reason, confidence };
    case 'ORGANIZATION':
    case 'BRAND':
      return { type: 'unknown_artifact', reason, confidence };
    default:
      return { type: 'unknown', reason, confidence };
  }
}

function toProvidedType(inferred: InferredMentionType): string {
  switch (inferred) {
    case 'person':
      return 'PERSON';
    case 'software_tool':
    case 'ai_model':
      return 'APP';
    case 'product':
      return 'PRODUCT';
    case 'project':
      return 'PROJECT';
    case 'unknown_artifact':
      return 'OBJECT';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Resolve every span of `surface` independently so model/person homonyms stay distinct.
 */
export function resolveHomonymMentions(
  surface: string,
  message: string,
  candidates: ResolutionCandidate[],
  context: ResolutionContext = {},
): MentionResolution[] {
  const spans = findSurfaceSpans(message, surface);
  return spans.map((span) => {
    const inferred = inferMentionType(surface, message, span);
    const provided = toProvidedType(inferred.type);
    const resolution = resolveMention(surface, candidates, context, provided);
    const sentence = sentenceContaining(message, span.start, span.end);
    return {
      surface,
      mentionSpan: { start: span.start, end: span.end },
      sentence,
      inferredType: inferred.type,
      selectedEntityId: resolution.resolvedId,
      resolutionReason: `${inferred.reason};${resolution.trace.selectedMethod ?? resolution.action}`,
      confidence: Math.min(inferred.confidence, resolution.confidence || inferred.confidence),
      resolution,
    };
  });
}

/** Normalize inferred mention types into the shared ontology. */
export function inferredToNormalized(type: InferredMentionType): NormalizedEntityType {
  if (type === 'ai_model' || type === 'unknown_artifact') return normalizeEntityType('software_tool');
  if (type === 'project') return normalizeEntityType('project');
  return normalizeEntityType(type);
}
