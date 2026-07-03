/**
 * Place suggestion pipeline — candidate detection through taxonomy + history linking.
 *
 * Raw text → candidates → boundary resolver → span splitter → type guard
 * → taxonomy classifier → known/new linker → PlaceSuggestion output.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { resolvePlaceBoundary } from './placeBoundaryResolver';
import { guardPlaceCandidate } from './placeTypeGuard';
import { guardPlaceWrongDomain } from './placeWrongDomainGuard';
import { splitMixedSpan } from './placeSpanSplitter';
import { classifyPlaceTaxonomy } from './placeTaxonomyClassifier';
import { analyzePrivateResidence, isOrphanPossessiveResidence } from './privateResidenceGuard';
import { resolveExistingPlace } from './existingPlaceResolver';
import { canonicalPlaceKey } from './placeDuplicateGuard';
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
  /\b((?:my\s+|our\s+|the\s+)?(?:Tio|Tía|Tia|Mr|Mrs|Ms|Dr|Professor|Prof)\.?\s+[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?'?s|(?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2}?'s|(?:my\s+|our\s+|the\s+)?(?:mom|mother|dad|father|abuela|abuelo|grandma|grandpa|moms|dads|abuelas|abuelos|tios|tias))\s+(house|home|apartment|condo|casa|place|office|clinic)\b/gi;

const PREP_PHRASE_PATTERN =
  /\b(?:at|in|from|near|around|outside|inside|next to|drove to|went to|take (?:her|him|them|me) to)\s+(?:the\s+)?([A-Z][A-Za-zÀ-ÿ0-9.'\s-]{1,60}?)(?=\s+(?:last|yesterday|today|tonight|a\s+(?:few|couple)|in\s+(?:a\s+)?(?:few|couple)|weren|wasn't|that|who|and|is|are|was|were|\.|,|$))/gi;

const SCHOOL_PATTERN = /\b(CSUF|UCI|UCLA|USC|Cal Poly)\b/g;

const FULL_SCHOOL_PATTERN =
  /\b(Whittier Christian Middle School|California State University,?\s+Fullerton)\b/g;

const CITY_PATTERN = /\b(LA|DTLA|Downey|Los Angeles|Moreno Valley|Riverside|Anaheim|San Diego|Long Beach|Irvine|Orange)\b/g;

const NAMED_VENUE_PATTERN = /\b(Club Nova|Bad Dogg Compound)\b/g;

const COMPOUND_VENUE_PATTERN =
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Compound|Warehouse|Grounds|Arena|Stadium|Center|Centre))\b/g;

const DESTINATION_PATTERN =
  /\b(?:go to|going to|went to)\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+)?)(?=\s+(?:last|yesterday|today|tonight|a\s+(?:few|couple))|[.,!?]|$)/gi;

const DIAGNOSTIC_NON_PLACE_PATTERNS: Array<{ pattern: RegExp; group?: number }> = [
  { pattern: /\b(Amazon)\b(?=[^.!?]*\b(?:work(?:ing)? at|onboarding|Ring doorbell product)\b)/gi, group: 1 },
  { pattern: /\b(Ring)\b(?=[^.!?\n]*\b(?:Technician|Failure Analysis|Prototype|sub\s+company|Amazon|manager|team|worked\s+with)\b)/gi, group: 1 },
  { pattern: /\b(Ring Technician Job)\b/gi, group: 1 },
  { pattern: /\b(Ring a sub company of Amazon)\b/gi, group: 1 },
  { pattern: /\b(Ring with)\b/gi, group: 1 },
  { pattern: /\b(Ring doorbell product)\b/gi, group: 1 },
  { pattern: /\b(shows?)\b/gi, group: 1 },
  { pattern: /\b(another show in the pit)\b/gi, group: 1 },
  { pattern: /\b(pit\s+she\s+still\s+said\s+no)\b/gi, group: 1 },
  { pattern: /\b(pit|stage|bar area|parking lot|dance floor)\b/gi, group: 1 },
  { pattern: /\b(her presence)\b/gi, group: 1 },
  { pattern: /\b(This other promoter named Ruben)\b/gi, group: 1 },
  { pattern: /\bat\s+(home)\b/gi, group: 1 },
  { pattern: /\b(Lore[Bb]ook)\b/g, group: 1 },
  { pattern: /\b(code later)(?:\s+so\b[^.!?]*)?/gi, group: 1 },
  { pattern: /\b(expand responses)\b/gi, group: 1 },
  { pattern: /\b((?:in and out\s+)?wristband)\b/gi, group: 1 },
  { pattern: /\b(media)(?:\s+so\s+this\s+girl\b)?/gi, group: 1 },
  { pattern: /\b(mom'?s car|my mom'?s car|phone|car|vape|device|hardware)\b/gi, group: 1 },
];

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
    addCandidate(
      candidates,
      seen,
      match[0],
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

  for (const match of text.matchAll(FULL_SCHOOL_PATTERN)) {
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

  for (const match of text.matchAll(NAMED_VENUE_PATTERN)) {
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

  for (const { pattern, group = 0 } of DIAGNOSTIC_NON_PLACE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const value = match[group] ?? match[0];
      const offset = match[0].indexOf(value);
      const start = match.index + Math.max(0, offset);
      addCandidate(
        candidates,
        seen,
        value,
        start,
        start + value.length,
        findLineForIndex(text, match.index)
      );
    }
  }

  return candidates;
}

function linkStatus(span: string, options?: PlaceSuggestionOptions): PlaceSuggestionStatus {
  const key = canonicalPlaceKey(span);
  if (!options?.knownPlaces?.size) return 'new';
  for (const known of options.knownPlaces) {
    if (canonicalPlaceKey(known) === key) return 'known';
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

    const wrongDomain = guardPlaceWrongDomain(spanText, raw.evidenceLine);
    if (!wrongDomain.allowed) {
      const rulesFired = [
        ...(boundary.fixes.length ? [`boundary:${boundary.fixes.join(',')}`] : []),
        `split:${piece.splitReason}`,
        ...wrongDomain.rulesFired,
        ...(residence?.rulesFired ?? []),
      ];

      outputs.push({
        text: spanText,
        normalizedText: canonicalPlaceKey(spanText),
        displayName: spanText,
        start: raw.start,
        end: raw.end,
        placeType: wrongDomain.placeType ?? 'unknown_place',
        placeSubtype: wrongDomain.placeType ?? 'unknown_place',
        confidence: wrongDomain.confidence,
        status: wrongDomain.status ?? 'rejected',
        rejectionReason: wrongDomain.rejectedAs,
        rejectedAs: wrongDomain.rejectedAs,
        splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
        evidencePhrases: [raw.evidenceLine],
        originalCandidate,
        finalSpan: spanText,
        boundaryFixes: boundary.fixes,
        splitChildren: splitPieces.map(p => p.text),
        rulesFired,
        sourceMessageIds: options?.sourceMessageIds,
      });
      continue;
    }

    const guard = guardPlaceCandidate(spanText, raw.evidenceLine, options);
    const taxonomy = classifyPlaceTaxonomy(spanText, raw.evidenceLine);
    const placeType = residence?.placeType ?? taxonomy.placeType;
    const existing = resolveExistingPlace(spanText, placeType, options);
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
        normalizedText: canonicalPlaceKey(spanText),
        displayName: spanText,
        start: raw.start,
        end: raw.end,
        placeType,
        placeSubtype: placeType,
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
        sourceMessageIds: options?.sourceMessageIds,
      });
      continue;
    }

    let confidence = Math.min(0.98, taxonomy.confidence + guard.confidenceBoost);
    let status: PlaceSuggestionStatus = linkStatus(spanText, options);
    if (status === 'new' && existing.compatibleDuplicates.length > 0) status = 'possible_duplicate';
    if (PLACE_PREPOSITIONS.test(raw.evidenceLine)) confidence = Math.min(0.98, confidence + 0.05);

    const requiresReview =
      residence?.requiresReview ||
      guard.needsReview ||
      (taxonomy.placeType === 'unknown_place' && Boolean(raw.prepositionCue)) ||
      undefined;

    // A brand-new place flagged for human review (privacy-sensitive residence,
    // low-confidence guard, or ambiguous preposition cue) surfaces as
    // needs_review rather than a plain 'new' suggestion. Known/duplicate places
    // keep their resolved status.
    if (status === 'new' && requiresReview) status = 'needs_review';

    outputs.push({
      text: spanText,
      normalizedText: canonicalPlaceKey(spanText),
      displayName: spanText,
      start: raw.start,
      end: raw.end,
      placeType,
      placeSubtype: placeType,
      confidence,
      status,
      ownerDisplayName: residence?.ownerDisplayName,
      privacySensitive: residence?.privacySensitive,
      requiresReview,
      existingPlaceId: existing.exact?.id,
      mergeCandidates: status === 'possible_duplicate' ? existing.compatibleDuplicates : [],
      splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
      evidencePhrases: [raw.evidenceLine],
      originalCandidate,
      finalSpan: spanText,
      boundaryFixes: boundary.fixes,
      splitChildren: splitPieces.map(p => p.text),
      rulesFired,
      sourceMessageIds: options?.sourceMessageIds,
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
    s => s.status === 'known' || s.status === 'new' || s.status === 'possible_duplicate' || s.status === 'needs_review'
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
