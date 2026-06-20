/**
 * Shared episode scanner — runs lexical intelligence over chat/journal text
 * for suggestion rescans and entity discovery pipelines.
 */

import { runLexicalIntelligence } from './lexicalIntelligenceService';
import type { EntityType, LexicalIntelligenceSpan } from './lexicalIntelligenceTypes';

const PERSON_TYPES = new Set<EntityType>(['PERSON']);
const PLACE_TYPES = new Set<EntityType>([
  'PLACE',
  'VENUE',
  'TRAVEL_DESTINATION',
  'DEPLOYMENT_SITE',
  'WORKSITE',
  'SCHOOL',
]);
const ORG_TYPES = new Set<EntityType>(['ORGANIZATION', 'GROUP', 'COMMUNITY']);
const SKILL_TYPES = new Set<EntityType>(['SKILL', 'ACTIVITY', 'WORK_ACTIVITY']);

export function scanEpisodeWithLexicalIntelligence(
  text: string,
  userId?: string
): LexicalIntelligenceSpan[] {
  if (!text.trim()) return [];
  return runLexicalIntelligence({
    text,
    userId,
    analyzerMode: 'lite',
    includeAnalyzerEntities: true,
  }).spans;
}

function uniqueSpanTexts(spans: LexicalIntelligenceSpan[], types: Set<EntityType>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const span of spans) {
    if (!types.has(span.type)) continue;
    const name = span.text.trim().replace(/\s+/g, ' ');
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export function collectPersonNamesFromIntelligence(text: string, userId?: string): string[] {
  return uniqueSpanTexts(scanEpisodeWithLexicalIntelligence(text, userId), PERSON_TYPES);
}

export function collectPlaceNamesFromIntelligence(text: string, userId?: string): string[] {
  return uniqueSpanTexts(scanEpisodeWithLexicalIntelligence(text, userId), PLACE_TYPES);
}

export function collectOrganizationNamesFromIntelligence(text: string, userId?: string): string[] {
  return uniqueSpanTexts(scanEpisodeWithLexicalIntelligence(text, userId), ORG_TYPES);
}

export function collectSkillHintsFromIntelligence(text: string, userId?: string): string[] {
  return uniqueSpanTexts(scanEpisodeWithLexicalIntelligence(text, userId), SKILL_TYPES);
}
