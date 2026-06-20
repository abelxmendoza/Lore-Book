import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import {
  classifyLifeEventText,
  computeEventSignificance,
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCategory,
  type RelationshipEventSubtype,
} from './lifeEventTaxonomy';

export type ClassifiedLifeEvent = {
  id: string;
  title: string;
  summary: string | null;
  startTime: string;
  endTime: string | null;
  legacyType: string | null;
  category: LifeEventCategory;
  relationshipSubtype: RelationshipEventSubtype | null;
  significance: number;
  confidence: number;
  peopleCount: number;
  evidenceCount: number;
};

type ResolvedEventRow = {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[] | null;
  metadata: Record<string, unknown> | null;
};

function emotionalIntensityFromMetadata(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.emotional_intensity;
  return typeof value === 'number' ? value : null;
}

export function classifyResolvedEventRow(
  row: ResolvedEventRow,
  evidenceCount = 0,
): ClassifiedLifeEvent {
  const classification = classifyLifeEventText(row.title, row.summary, row.type);
  const peopleCount = row.people?.length ?? 0;
  const significance = computeEventSignificance({
    confidence: row.confidence ?? classification.confidence,
    category: classification.category,
    relationshipSubtype: classification.relationshipSubtype,
    peopleCount,
    evidenceCount,
    emotionalIntensity: emotionalIntensityFromMetadata(row.metadata),
  });

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    startTime: row.start_time,
    endTime: row.end_time,
    legacyType: row.type,
    category: classification.category,
    relationshipSubtype: classification.relationshipSubtype,
    significance,
    confidence: row.confidence ?? classification.confidence,
    peopleCount,
    evidenceCount,
  };
}

/** Persist taxonomy fields onto resolved_events.metadata (non-destructive merge). */
export async function enrichResolvedEventClassification(
  userId: string,
  eventId: string,
): Promise<ClassifiedLifeEvent | null> {
  const { data: row, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, type, start_time, end_time, confidence, people, metadata')
    .eq('user_id', userId)
    .eq('id', eventId)
    .maybeSingle();

  if (error || !row) return null;

  const { count: evidenceCount } = await supabaseAdmin
    .from('event_mentions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  const classified = classifyResolvedEventRow(row as ResolvedEventRow, evidenceCount ?? 0);
  const metadata = {
    ...(row.metadata as Record<string, unknown> ?? {}),
    life_event_category: classified.category,
    life_event_category_label: LIFE_EVENT_CATEGORY_LABELS[classified.category],
    relationship_subtype: classified.relationshipSubtype,
    significance: classified.significance,
    classified_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabaseAdmin
    .from('resolved_events')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('user_id', userId);

  if (updateError) {
    logger.warn({ updateError, userId, eventId }, 'enrichResolvedEventClassification: metadata update failed');
  }

  return classified;
}

export async function loadClassifiedLifeEvents(
  userId: string,
  limit = 500,
): Promise<ClassifiedLifeEvent[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, type, start_time, end_time, confidence, people, metadata')
    .eq('user_id', userId)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error || !rows?.length) return [];

  const eventIds = rows.map((r) => r.id);
  const { data: mentionRows } = await supabaseAdmin
    .from('event_mentions')
    .select('event_id')
    .in('event_id', eventIds);

  const mentionCounts = new Map<string, number>();
  for (const mention of mentionRows ?? []) {
    mentionCounts.set(mention.event_id, (mentionCounts.get(mention.event_id) ?? 0) + 1);
  }

  return rows.map((row) =>
    classifyResolvedEventRow(row as ResolvedEventRow, mentionCounts.get(row.id) ?? 0),
  );
}
