/**
 * NarrativeSegmentationService
 * Splits narrative into segments. Does NOT infer time — only detects structure and temporal markers.
 * Order here is narrative order (order user told it).
 */

import { v4 as uuid } from 'uuid';

import { logger } from '../../logger';

import type { NarrativeSegment } from './types';

const TEMPORAL_MARKER_PATTERNS = [
  /\b(before|after|then|later|earlier|previously|subsequently)\b/gi,
  /\b(that\s+same\s+year|that\s+year|during\s+that\s+time)\b/gi,
  /\b(over\s+the\s+summer|in\s+the\s+summer|that\s+summer)\b/gi,
  /\b(right\s+before|just\s+before|right\s+after|just\s+after)\b/gi,
  /\b(when\s+i\s+started|when\s+i\s+finished|after\s+graduation|before\s+re-enrolling)\b/gi,
  /\b(for\s+a\s+year|for\s+(\d+)\s+months?|for\s+(\d+)\s+weeks?)\b/gi,
  /\b(during|while|meanwhile|throughout)\b/gi,
  /\b(re-enrolled|re-enrolling|graduation|graduated)\b/gi,
  /\b(took\s+a\s+break|then\s+i\s+took)\b/gi,
];

function extractTemporalMarkers(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const pattern of TEMPORAL_MARKER_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      match.forEach(m => found.add(m.trim()));
    }
  }
  return Array.from(found);
}

/**
 * Split text into semantic units (sentences / independent clauses).
 * Prefer sentence boundaries; avoid splitting mid-thought.
 */
function splitIntoSemanticUnits(inputText: string): string[] {
  const trimmed = inputText.replace(/\s+/g, ' ').trim();
  if (!trimmed) return [];

  // Split on sentence boundaries (. ! ?) but keep units that are at least a few words
  const raw = trimmed.split(/(?<=[.!?])\s+/);
  const units: string[] = [];

  for (const part of raw) {
    const s = part.trim();
    if (s.length < 3) continue;
    // If it looks like a list fragment (e.g. "I did X. Then I did Y."), keep as separate units
    units.push(s);
  }

  // If we got no sentence splits, try newlines or "then" / "and then"
  if (units.length <= 1 && trimmed.includes('\n')) {
    const byNewline = trimmed.split(/\n+/).map(s => s.trim()).filter(s => s.length > 5);
    if (byNewline.length > 1) return byNewline;
  }

  if (units.length <= 1 && /\.\s+(then|and\s+then|after\s+that|before\s+that)\s+/i.test(trimmed)) {
    const byConnector = trimmed.split(/\s+(?=then|and then|after that|before that)\s+/i).map(s => s.trim()).filter(s => s.length > 5);
    if (byConnector.length > 1) return byConnector;
  }

  return units.length > 0 ? units : [trimmed];
}

/**
 * Segment narrative: structure only, no time inference.
 */
export function segmentNarrative(inputText: string): NarrativeSegment[] {
  const sentences = splitIntoSemanticUnits(inputText);
  const segments: NarrativeSegment[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const text = sentences[i];
    segments.push({
      segment_id: uuid(),
      text,
      narrative_order: i + 1,
      temporal_markers: extractTemporalMarkers(text),
    });
  }

  logger.debug({ inputLength: inputText.length, segmentCount: segments.length }, 'Narrative segmented');
  return segments;
}
