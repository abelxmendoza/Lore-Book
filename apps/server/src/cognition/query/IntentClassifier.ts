/**
 * IntentClassifier — wraps the existing deterministic regex routing
 * (recallIntentPatterns) behind the formal QueryType taxonomy.
 *
 * The regexes are an implementation detail here: replace this file's guts
 * with an ML/embedding classifier later and nothing downstream changes,
 * because consumers only see QueryClassification.
 */

import {
  detectSyncRecallIntent,
  isFoundationPrimaryIntent,
  TEMPORAL_RE,
  LOCATION_RE,
  ENTITY_PREFIX_RE,
} from '../../services/chat/recallIntentPatterns';

import { QueryType, type QueryClassification } from './QueryTypes';

/** Legacy sync-recall intent → formal taxonomy. */
const LEGACY_TO_QUERY_TYPE: Record<string, QueryType> = {
  character_list: QueryType.AGGREGATE,
  character_roster: QueryType.AGGREGATE,
  family: QueryType.RELATIONSHIP,
  biography: QueryType.IDENTITY,
  entity: QueryType.IDENTITY,
  location: QueryType.LOCATION,
  work: QueryType.ORGANIZATION,
  temporal: QueryType.TIMELINE,
  thread: QueryType.WORKING_MEMORY,
  conversation: QueryType.WORKING_MEMORY,
};

// Future-facing patterns the legacy router has no concept of. Deliberately
// conservative: they refine the taxonomy but never override a legacy match,
// so current routing behavior is preserved exactly.
const COMPARISON_RE = /\b(compare|versus|vs\.?|difference between|how has .{1,40} changed|changed since)\b/i;
const CAUSAL_RE = /\bwhy (?:did|do|was|am|is|were)\b/i;
const NARRATIVE_RE = /\b(tell me the story|story of|walk me through|narrate)\b/i;
const AGGREGATE_RE = /\b(most|least|how many|how often|count of|top \d+)\b/i;
const GRAPH_RE = /\b(who introduced|how do i know|connected to|in common|know each other|through whom)\b/i;

function extractDates(message: string): string[] {
  const m = message.match(TEMPORAL_RE);
  return m ? [m[0]] : [];
}

function extractLocations(message: string): string[] {
  const m = message.match(LOCATION_RE);
  return m ? [m[0]] : [];
}

function extractEntities(message: string): string[] {
  // Mirrors matchesEntityQuery's extraction: the prefix regex locates the
  // question stem; the proper-noun name follows it.
  const m = message.trim().match(ENTITY_PREFIX_RE);
  if (!m || m.index === undefined) return [];
  const rest = message.slice(m.index + m[0].length).trim();
  const nameMatch = rest.match(
    /^([A-ZÁÉÍÓÚÑ][\w.'-]{1,40}(?:\s+(?:de|del|la|los|las|y|van|von|di|da|le|el|the|a|an|T[ií]o|T[ií]a)?\s*[A-ZÁÉÍÓÚÑ][\w.'-]{1,40}){0,8})/,
  );
  const name = nameMatch?.[1]?.replace(/[?!.,]{1,8}$/, '').trim();
  return name ? [name] : [];
}

export function classifyQuery(message: string): QueryClassification {
  const legacyIntent = detectSyncRecallIntent(message);

  let intent: QueryType;
  let confidence: number;

  if (legacyIntent) {
    intent = LEGACY_TO_QUERY_TYPE[legacyIntent] ?? QueryType.UNKNOWN;
    confidence = 0.9; // deterministic pattern match
    // Refinements that don't change execution, only taxonomy precision.
    if (legacyIntent === 'entity' && GRAPH_RE.test(message)) intent = QueryType.RELATIONSHIP;
  } else if (GRAPH_RE.test(message)) {
    intent = QueryType.GRAPH;
    confidence = 0.7;
  } else if (COMPARISON_RE.test(message)) {
    intent = QueryType.COMPARISON;
    confidence = 0.7;
  } else if (CAUSAL_RE.test(message)) {
    intent = QueryType.CAUSAL;
    confidence = 0.65;
  } else if (NARRATIVE_RE.test(message)) {
    intent = QueryType.NARRATIVE;
    confidence = 0.7;
  } else if (AGGREGATE_RE.test(message)) {
    intent = QueryType.AGGREGATE;
    confidence = 0.6;
  } else {
    intent = QueryType.SEMANTIC;
    confidence = 0.4; // fall through to semantic retrieval
  }

  return {
    intent,
    legacyIntent,
    confidence,
    matchedEntities: extractEntities(message),
    matchedDates: extractDates(message),
    matchedLocations: extractLocations(message),
    foundationPrimary: legacyIntent ? isFoundationPrimaryIntent(legacyIntent) : false,
  };
}
