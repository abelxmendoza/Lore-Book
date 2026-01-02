import { parseISO, isBefore, isAfter, isEqual } from 'date-fns';
import type { Event, TemporalEdge, TemporalRelation } from '../types';
import { timeEngine } from '../../timeEngine';

/**
 * Allen's Interval Algebra - 13 possible relationships between two intervals
 * 
 * For events with timestamps, we determine the temporal relationship.
 * For events without endTimestamp, we treat them as point events.
 */
export function applyIntervalAlgebra(
  event1: Event,
  event2: Event
): TemporalEdge | null {
  // Skip if either event has no timestamp
  if (!event1.timestamp || !event2.timestamp) {
    return null;
  }

  try {
    const start1 = parseISO(event1.timestamp);
    const end1 = event1.endTimestamp ? parseISO(event1.endTimestamp) : start1;
    const start2 = parseISO(event2.timestamp);
    const end2 = event2.endTimestamp ? parseISO(event2.endTimestamp) : start2;

    // Normalize timestamps using Time Engine for precision handling
    const ref1 = timeEngine.parseTimestamp(event1.timestamp);
    const ref2 = timeEngine.parseTimestamp(event2.timestamp);
    const normStart1 = timeEngine.normalizeTimestamp(ref1.timestamp, ref1.precision);
    const normEnd1 = event1.endTimestamp
      ? timeEngine.normalizeTimestamp(parseISO(event1.endTimestamp), ref1.precision)
      : normStart1;
    const normStart2 = timeEngine.normalizeTimestamp(ref2.timestamp, ref2.precision);
    const normEnd2 = event2.endTimestamp
      ? timeEngine.normalizeTimestamp(parseISO(event2.endTimestamp), ref2.precision)
      : normStart2;

    // Calculate confidence based on precision
    const precisionConfidence = Math.min(ref1.confidence, ref2.confidence);

    // Determine relationship
    let relation: TemporalRelation | null = null;
    let confidence = precisionConfidence;

    // Point events (no duration)
    const isPoint1 = isEqual(normStart1, normEnd1);
  const isPoint2 = isEqual(normStart2, normEnd2);

    if (isPoint1 && isPoint2) {
      // Both are point events
      if (isEqual(normStart1, normStart2)) {
        relation = 'equals';
        confidence = precisionConfidence;
      } else if (isBefore(normStart1, normStart2)) {
        relation = 'before';
        confidence = precisionConfidence;
      } else {
        relation = 'after';
        confidence = precisionConfidence;
      }
    } else if (isPoint1) {
      // Event1 is a point, Event2 is an interval
      if (isBefore(normStart1, normStart2)) {
        relation = 'before';
      } else if (isAfter(normStart1, normEnd2)) {
        relation = 'after';
      } else if (isEqual(normStart1, normStart2)) {
        relation = 'starts';
      } else if (isEqual(normStart1, normEnd2)) {
        relation = 'meets';
      } else {
        relation = 'during';
      }
      confidence = precisionConfidence;
    } else if (isPoint2) {
      // Event2 is a point, Event1 is an interval
      if (isBefore(normEnd1, normStart2)) {
        relation = 'before';
      } else if (isAfter(normStart1, normStart2)) {
        relation = 'after';
      } else if (isEqual(normEnd1, normStart2)) {
        relation = 'meets';
      } else if (isEqual(normStart1, normStart2)) {
        relation = 'starts';
      } else {
        relation = 'contains';
      }
      confidence = precisionConfidence;
    } else {
      // Both are intervals - full Allen's algebra
      if (isEqual(normStart1, normStart2) && isEqual(normEnd1, normEnd2)) {
        relation = 'equals';
      } else if (isBefore(normEnd1, normStart2)) {
        relation = 'before';
      } else if (isAfter(normStart1, normEnd2)) {
        relation = 'after';
      } else if (isEqual(normEnd1, normStart2)) {
        relation = 'meets';
      } else if (isBefore(normStart1, normStart2) && isBefore(normEnd1, normEnd2) && isAfter(normEnd1, normStart2)) {
        relation = 'overlaps';
      } else if (isEqual(normStart1, normStart2) && isBefore(normEnd1, normEnd2)) {
        relation = 'starts';
      } else if (isAfter(normStart1, normStart2) && isEqual(normEnd1, normEnd2)) {
        relation = 'finishes';
      } else if (isBefore(normStart1, normStart2) && isAfter(normEnd1, normEnd2)) {
        relation = 'contains';
      } else if (isAfter(normStart1, normStart2) && isBefore(normEnd1, normEnd2)) {
        relation = 'during';
      } else {
        // Default to temporal proximity (overlaps variant)
        relation = 'overlaps';
        confidence = precisionConfidence * 0.7; // Lower confidence for ambiguous cases
      }
    }

    if (!relation) {
      return null;
    }

    // Adjust confidence based on semantic similarity if embeddings exist
    if (event1.embedding && event2.embedding && event1.embedding.length === event2.embedding.length) {
      const semanticSimilarity = cosineSimilarity(event1.embedding, event2.embedding);
      // Boost confidence if events are semantically similar
      if (semanticSimilarity > 0.7) {
        confidence = Math.min(1.0, confidence * 1.1);
      }
    }

    return {
      source: event1.id,
      target: event2.id,
      relation,
      confidence: Math.max(0, Math.min(1, confidence)),
      metadata: {
        precision1: ref1.precision,
        precision2: ref2.precision,
        isPoint1,
        isPoint2,
      },
    };
  } catch (error) {
    // Handle parsing errors gracefully
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

