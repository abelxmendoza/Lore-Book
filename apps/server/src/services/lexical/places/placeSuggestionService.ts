/**
 * Place suggestion pipeline — candidate detection through taxonomy + history linking.
 *
 * Raw text → candidates → boundary resolver → span splitter → type guard
 * → taxonomy classifier → known/new linker → PlaceSuggestion output.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { formatPossessivePlace } from '../../../utils/namedPlaceExtractor';
import { resolvePlaceBoundary } from './placeBoundaryResolver';
import { guardPlaceCandidate } from './placeTypeGuard';
import { splitMixedSpan } from './placeSpanSplitter';
import { classifyPlaceTaxonomy } from './placeTaxonomyClassifier';
import { analyzePrivateResidence, isOrphanPossessiveResidence } from './privateResidenceGuard';
import {
  BRAND_STORES,
  KNOWN_CITIES,
  PLACE_PREPOSITIONS,
  SCHOOL_ABBREVS,
  type PlaceSuggestion,
  type PlaceSuggestionOptions,
  type PlaceSuggestionStatus,
  type RawPlaceCandidate,
} from './placeSuggestionTypes';

const BRAND_PATTERN =
  /\b(walmart|costco|target|cvs|walgreens|whole foods|trader joe'?s?|starbucks|mcdonald'?s?|home depot|lowe'?s?|safeway|kroger|aldi|denny'?s?(?:\s+hollywood)?)\b/gi;

const POSSESSIVE_PATTERN =
  /\b((?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2}?'s)\s+(house|home|apartment|condo|casa|place)\b/gi;

const PREP_PHRASE_PATTERN =
  /\b(?:at|in|from|near|around|outside|inside|next to|drove to|went to|take (?:her|him|them|me) to)\s+(?:the\s+)?([A-Z][A-Za-zÀ-ÿ0-9.'\s-]{1,60}?)(?=\s+(?:last|yesterday|today|tonight|a\s+(?:few|couple)|in\s+(?:a\s+)?(?:few|couple)|weren|wasn't|that|who|and|is|are|was|were|\.|,|$))/gi;

const SCHOOL_PATTERN = /\b(CSUF|UCI|UCLA|USC|Cal Poly)\b/g;

const CITY_PATTERN = /\b(LA|Los Angeles|Moreno Valley|Riverside|Anaheim|San Diego|Long Beach|Irvine|Orange)\b/g;

const COMPOUND_VENUE_PATTERN =
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Compound|Warehouse|Grounds|Arena|Stadium|Center|Centre))\b/g;

const DESTINATION_PATTERN =
  /\b(?:go to|went to)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)(?=\s+(?:last|yesterday|today|tonight|a\s+(?:few|couple)|\.|,|$))/gi;

function findLineForIndex(text: string, index: number): string {
  const before = text.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', index);
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
}

function addCandidate(
  candidates: RawPlaceCandidate[],
  seen: Set<string>,
  text: string,
  start: number,
  end: number,
  evidenceLine: string,
  prepositionCue?: string
) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2 || isOrphanPossessiveResidence(trimmed)) return;
  const key = `${start}:${normalizeNameKey(trimmed)}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ text: trimmed, start, end, evidenceLine, prepositionCue });
}

export function detectPlaceCandidates(text: string): RawPlaceCandidate[] {
  const candidates: RawPlaceCandidate[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(POSSESSIVE_PATTERN)) {
    if (match.index === undefined) continue;
    const owner = match[1];
    const placeType = match[2];
    const display = formatPossessivePlace(owner, placeType);
    addCandidate(
      candidates,
      seen,
      display,
      match.index,
      match.index + match[0].length,
      findLineForIndex(text, match.index)
    );
  }

  for (const match of text.matchAll(BRAND_PATTERN)) {
    if (match.index === undefined) continue;
    addCandidate(
      candidates,
      seen,
      match[1],
      match.index,
      match.index + match[0].length,
      findLineForIndex(text, match.index)
    );
  }

  for (const match of text.matchAll(PREP_PHRASE_PATTERN)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(
      candidates,
      seen,
      match[1],
      phraseStart,
      phraseStart + match[1].length,
      findLineForIndex(text, match.index),
      match[0].split(/\s+/)[0]
    );
  }

  for (const match of text.matchAll(SCHOOL_PATTERN)) {
    if (match.index === undefined) continue;
    addCandidate(
      candidates,
      seen,
      match[1],
      match.index,
      match.index + match[0].length,
      findLineForIndex(text, match.index)
    );
  }

  for (const match of text.matchAll(CITY_PATTERN)) {
    if (match.index === undefined) continue;
    addCandidate(
      candidates,
      seen,
      match[1],
      match.index,
      match.index + match[0].length,
      findLineForIndex(text, match.index)
    );
  }

  for (const match of text.matchAll(COMPOUND_VENUE_PATTERN)) {
    if (match.index === undefined) continue;
    addCandidate(
      candidates,
      seen,
      match[1],
      match.index,
      match.index + match[0].length,
      findLineForIndex(text, match.index),
      'at'
    );
  }

  for (const match of text.matchAll(DESTINATION_PATTERN)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(
      candidates,
      seen,
      match[1],
      phraseStart,
      phraseStart + match[1].length,
      findLineForIndex(text, match.index),
      'went to'
    );
  }

  return candidates;
}

function linkStatus(span: string, options?: PlaceSuggestionOptions): PlaceSuggestionStatus {
  const key = normalizeNameKey(span);
  if (!options?.knownPlaces?.size) return 'new';
  for (const known of options.knownPlaces) {
    if (normalizeNameKey(known) === key) return 'known';
  }
  return 'new';
}

function processCandidate(
  raw: RawPlaceCandidate,
  options?: PlaceSuggestionOptions
): PlaceSuggestion[] {
  const originalCandidate = raw.text;
  const boundary = resolvePlaceBoundary(raw.text);
  const splitPieces = splitMixedSpan(boundary.text);
  const outputs: PlaceSuggestion[] = [];

  for (const piece of splitPieces) {
    const residence = analyzePrivateResidence(piece.text);
    const spanText = residence?.displayName ?? piece.text.trim();
    if (!spanText || isOrphanPossessiveResidence(spanText)) continue;

    const guard = guardPlaceCandidate(spanText, raw.evidenceLine, options);
    const taxonomy = classifyPlaceTaxonomy(spanText, raw.evidenceLine);
    const rulesFired = [
      ...(boundary.fixes.length ? [`boundary:${boundary.fixes.join(',')}`] : []),
      `split:${piece.splitReason}`,
      ...guard.rulesFired,
      ...taxonomy.rulesFired,
      ...(residence?.rulesFired ?? []),
    ];

    if (!guard.allowed) {
      outputs.push({
        text: spanText,
        normalizedText: normalizeNameKey(spanText),
        start: raw.start,
        end: raw.end,
        placeType: taxonomy.placeType,
        confidence: Math.min(taxonomy.confidence, 0.4),
        status: 'rejected',
        rejectionReason: guard.rejectedAs,
        rejectedAs: guard.rejectedAs,
        splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
        evidencePhrases: [raw.evidenceLine],
        originalCandidate,
        finalSpan: spanText,
        boundaryFixes: boundary.fixes,
        splitChildren: splitPieces.map(p => p.text),
        rulesFired,
      });
      continue;
    }

    let confidence = Math.min(0.98, taxonomy.confidence + guard.confidenceBoost);
    let status: PlaceSuggestionStatus = linkStatus(spanText, options);
    if (residence?.requiresReview || guard.needsReview) status = 'needs_review';
    if (PLACE_PREPOSITIONS.test(raw.evidenceLine)) confidence = Math.min(0.98, confidence + 0.05);

    outputs.push({
      text: spanText,
      normalizedText: normalizeNameKey(spanText),
      start: raw.start,
      end: raw.end,
      placeType: residence?.placeType ?? taxonomy.placeType,
      confidence,
      status,
      ownerDisplayName: residence?.ownerDisplayName,
      privacySensitive: residence?.privacySensitive,
      splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
      evidencePhrases: [raw.evidenceLine],
      originalCandidate,
      finalSpan: spanText,
      boundaryFixes: boundary.fixes,
      splitChildren: splitPieces.map(p => p.text),
      rulesFired,
    });
  }

  return outputs;
}

/** Process full text and return all place suggestions (including rejected for debug). */
export function processPlaceSuggestions(
  text: string,
  options?: PlaceSuggestionOptions
): PlaceSuggestion[] {
  const candidates = detectPlaceCandidates(text);
  const all: PlaceSuggestion[] = [];

  for (const candidate of candidates) {
    all.push(...processCandidate(candidate, options));
  }

  return dedupeSuggestions(all);
}

/** Return only place-compatible suggestions for UI / API output. */
export function processPlaceSuggestionsForOutput(
  text: string,
  options?: PlaceSuggestionOptions
): PlaceSuggestion[] {
  return processPlaceSuggestions(text, options).filter(
    s => s.status === 'known' || s.status === 'new' || s.status === 'needs_review'
  );
}

function dedupeSuggestions(items: PlaceSuggestion[]): PlaceSuggestion[] {
  const byKey = new Map<string, PlaceSuggestion>();
  for (const item of items) {
    const key = `${item.normalizedText}:${item.status}`;
    const existing = byKey.get(key);
    if (!existing || item.confidence > existing.confidence) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Aggregate suggestions across multiple lines of corpus text. */
export function processPlaceSuggestionsFromCorpus(
  lines: string[],
  options?: PlaceSuggestionOptions
): PlaceSuggestion[] {
  const merged: PlaceSuggestion[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    merged.push(...processPlaceSuggestionsForOutput(line, options));
  }
  return dedupeSuggestions(merged);
}

export const placeSuggestionPipeline = {
  detectPlaceCandidates,
  processPlaceSuggestions,
  processPlaceSuggestionsForOutput,
  processPlaceSuggestionsFromCorpus,
};
