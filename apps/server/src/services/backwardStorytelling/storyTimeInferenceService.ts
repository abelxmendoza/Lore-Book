/**
 * StoryTimeInferenceService
 * Infers when each segment happened in real life. Never uses narrative order as time.
 * Uses LLM + temporal markers and explicit relations (before/after/during).
 */

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type {
  NarrativeSegment,
  StoryTimeContext,
  StoryTimeInference,
  StoryTimeRelation,
  TemporalRelation,
} from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

function buildTemporalInferencePrompt(
  segments: NarrativeSegment[],
  ctx: StoryTimeContext
): string {
  const segmentLines = segments
    .map(
      (s, i) =>
        `${i + 1}. [${s.segment_id}] "${s.text}" ${s.temporal_markers.length ? `(markers: ${s.temporal_markers.join(', ')})` : ''}`
    )
    .join('\n');

  const anchorLines =
    ctx.knownAnchors?.anchors?.length ?
      `Known life anchors (use to resolve relative dates):\n${ctx.knownAnchors.anchors.map(a => `- ${a.label}: ${a.date}`).join('\n')}`
    : '';

  const prevLines =
    ctx.previousEntries?.length ?
      `Recent entries (for context only; do not assume order = story order):\n${ctx.previousEntries.slice(0, 5).map(e => `- ${e.date}: ${(e.summary || e.content).slice(0, 80)}...`).join('\n')}`
    : '';

  return `You are assigning when events happened in a person's life based on narrative text.

CRITICAL: The user may tell events OUT OF ORDER. DO NOT assume earlier sentences happened earlier in time.
Use explicit phrases like "before", "after graduation", "that same year", "right before re-enrolling" to order events in real time.

For each segment, output:
- start_date, end_date: ISO dates if you can infer (even roughly, e.g. 2024-06-01 for "summer after graduation")
- OR relative_to: segment_id of another segment, and relation: "before" | "after" | "during"
- confidence: 0–1
- reasoning: brief explanation

Segments (narrative order = order user told it; do NOT use this as story order):
${segmentLines}
${anchorLines ? '\n' + anchorLines : ''}
${prevLines ? '\n' + prevLines : ''}

Optionally, for recurring themes / parallel life streams, you may add per segment:
- threads: string[] — theme names (e.g. ["Omega1","Robotics","Love life"]) that this segment belongs to
- relations: { type: "paused_by"|"parallel_to", target_segment_id: string }[] — e.g. "this arc was paused by that one" or "happened in parallel to that segment"

Return JSON with a single key "inferences" whose value is an array. Each element: { "segment_id": string, "start_date"?: "YYYY-MM-DD", "end_date"?: "YYYY-MM-DD", "relative_to"?: string, "relation"?: "before"|"after"|"during", "confidence": number, "reasoning": string, "threads"?: string[], "relations"?: { "type": "paused_by"|"parallel_to", "target_segment_id": string }[] }
If unsure, use relative_to + relation instead of dates. Never guess exact dates without evidence.`;
}

function normalizeRelation(r: unknown, segmentIds: Set<string>): StoryTimeRelation | null {
  if (!r || typeof r !== 'object') return null;
  const type = (r as Record<string, unknown>).type as string | undefined;
  const target = (r as Record<string, unknown>).target_segment_id as string | undefined;
  if (type !== 'paused_by' && type !== 'parallel_to') return null;
  if (typeof target !== 'string' || !segmentIds.has(target)) return null;
  return { type, target_segment_id: target };
}

function validateAndNormalize(raw: unknown, segmentIds: Set<string>): StoryTimeInference[] {
  if (!Array.isArray(raw)) return [];
  const result: StoryTimeInference[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !segmentIds.has(String(item.segment_id))) continue;
    const rel = item.relation as string | undefined;
    const validRelation = ['before', 'after', 'during'].includes(rel) ? (rel as TemporalRelation) : undefined;
    const threads =
      Array.isArray((item as Record<string, unknown>).threads) &&
      (item as Record<string, unknown>).threads.every((t): t is string => typeof t === 'string')
        ? ((item as Record<string, unknown>).threads as string[])
        : undefined;
    const rawRelations = (item as Record<string, unknown>).relations;
    const relations: StoryTimeRelation[] | undefined = Array.isArray(rawRelations)
      ? rawRelations.map((r) => normalizeRelation(r, segmentIds)).filter((r): r is StoryTimeRelation => r != null)
      : undefined;
    const hasRelations = relations && relations.length > 0 ? relations : undefined;
    result.push({
      segment_id: String(item.segment_id),
      start_date: typeof item.start_date === 'string' ? item.start_date : undefined,
      end_date: typeof item.end_date === 'string' ? item.end_date : undefined,
      relative_to: typeof item.relative_to === 'string' ? item.relative_to : undefined,
      relation: validRelation,
      confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.3,
      reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
      threads,
      relations: hasRelations,
    });
  }
  return result;
}

export async function inferStoryTime(
  segments: NarrativeSegment[],
  context: StoryTimeContext = {}
): Promise<StoryTimeInference[]> {
  if (segments.length === 0) return [];

  try {
    const prompt = buildTemporalInferencePrompt(segments, context);
    const completion = await openai.chat.completions.create({
      model: config.defaultModel || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You output only valid JSON. No markdown, no explanation outside the JSON.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      logger.warn('StoryTimeInference: empty LLM response');
      return segments.map(s => ({
        segment_id: s.segment_id,
        confidence: 0.2,
        reasoning: 'No model output',
      }));
    }

    const parsed = JSON.parse(content) as { inferences?: unknown[]; segments?: unknown[] };
    const arr = Array.isArray(parsed.inferences) ? parsed.inferences : Array.isArray(parsed.segments) ? parsed.segments : Array.isArray(parsed) ? parsed : [];
    const segmentIds = new Set(segments.map(s => s.segment_id));
    const inferences = validateAndNormalize(arr, segmentIds);

    // Ensure we have one inference per segment; fill missing with low-confidence
    for (const s of segments) {
      if (!inferences.some(i => i.segment_id === s.segment_id)) {
        inferences.push({
          segment_id: s.segment_id,
          confidence: 0.2,
          reasoning: 'Missing from model output',
        });
      }
    }

    logger.debug({ segmentCount: segments.length, inferenceCount: inferences.length }, 'Story-time inference completed');
    return inferences;
  } catch (error) {
    logger.error({ error, segmentCount: segments.length }, 'StoryTimeInference failed');
    return segments.map(s => ({
      segment_id: s.segment_id,
      confidence: 0.1,
      reasoning: `Error: ${error instanceof Error ? error.message : 'inference failed'}`,
    }));
  }
}
