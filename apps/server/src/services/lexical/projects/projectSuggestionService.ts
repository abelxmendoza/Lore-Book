/**
 * Project suggestion pipeline — candidate detection through taxonomy + history linking.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { resolveProjectBoundary } from './projectBoundaryResolver';
import { guardProjectCandidate } from './projectTypeGuard';
import { splitMixedProjectSpan } from './projectSpanSplitter';
import { classifyProjectTaxonomy } from './projectTaxonomyClassifier';
import { guardCrossBookEntity } from './projectCrossBookGuard';
import { guardConsumerAppReference } from './projectConsumerAppGuard';
import { guardObjectReference } from './projectObjectGuard';
import { canonicalProjectKey, dedupeProjectSuggestions } from './projectDeduplicationService';
import {
  KNOWN_PROJECT_ALIASES,
  type ProjectSuggestion,
  type ProjectSuggestionOptions,
  type ProjectSuggestionStatus,
  type RawProjectCandidate,
} from './projectSuggestionTypes';

const BUILD_CUE =
  /\b(?:working on|building|developing|creating|launching|shipping|designing|prototyping|writing|recording|producing|added (?:the )?)\s+(?:the\s+|my\s+|our\s+|a\s+|an\s+)?([A-Z][\w'&.-]{1,48}(?:\s+[\w'&.-]{1,24}){0,4})(?=\s+(?:and|to|for|with|that|which|who|\.|,|$))/g;

const MODIFIER_NOUN =
  /\b(?:my|our|the|an|a)\s+([a-z][\w\s-]{2,48}(?:\s+(?:app|website|build|portfolio|series|demo|archive|robot|feature)))\b/gi;

const NAMED_BEFORE_PROJECT =
  /\b(?:the\s+)?([A-Z][\w'&.-]{1,48}(?:\s+[A-Z][\w'&.-]{1,24}){0,2})\s+project\b/g;

const ROBOT_BUILD =
  /\b([A-Z][\w-]*(?:\s+[A-Za-z]+){0,4}\s+robot\s+build)\b/gi;

const FEATURE_TO_PROJECT =
  /\b(?:added (?:the )?)?([A-Z][\w\s-]{2,40}\s+feature)\s+to\s+([A-Z][\w'&.-]+)/g;

const PROPER_NOUN_TAIL =
  /\b(?:website|portfolio|project)\s+([A-Z][\w'&.-]{2,40})\b/g;

const QUOTED_NAME = /["']([^"']{2,60})["']/g;

const CALLED_PATTERN =
  /\b([A-Za-z][\w\s-]{2,48})\s+called\s+([A-Z][\w'&.-]+)/g;

const QUICK_PROJECT_SIGNAL =
  /\b(project|app|startup|building|working on|developing|creating|launching|shipping|robot build|portfolio|lorebook|omega-?\d|abeliciousness|feature)\b/i;

function findLineForIndex(text: string, index: number): string {
  const before = text.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = text.indexOf('\n', index);
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
}

function addCandidate(
  candidates: RawProjectCandidate[],
  seen: Set<string>,
  text: string,
  start: number,
  end: number,
  evidenceLine: string,
  source: RawProjectCandidate['source'],
  confidence: number
) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return;
  const key = `${start}:${normalizeNameKey(trimmed)}`;
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ text: trimmed, start, end, evidenceLine, source, confidence });
}

function canonicalizeAlias(text: string): string {
  const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return KNOWN_PROJECT_ALIASES.get(key) ?? text.trim();
}

export function detectProjectCandidates(text: string): RawProjectCandidate[] {
  const candidates: RawProjectCandidate[] = [];
  const seen = new Set<string>();
  const trimmed = text.trim();
  if (trimmed.length < 4 || !QUICK_PROJECT_SIGNAL.test(trimmed)) return candidates;

  for (const match of trimmed.matchAll(BUILD_CUE)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(candidates, seen, match[1], phraseStart, phraseStart + match[1].length, findLineForIndex(trimmed, match.index), 'cue', 0.84);
  }

  for (const match of trimmed.matchAll(MODIFIER_NOUN)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(candidates, seen, match[1], phraseStart, phraseStart + match[1].length, findLineForIndex(trimmed, match.index), 'cue', 0.8);
  }

  for (const match of trimmed.matchAll(NAMED_BEFORE_PROJECT)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(candidates, seen, match[1], phraseStart, phraseStart + match[1].length, findLineForIndex(trimmed, match.index), 'cue', 0.9);
  }

  for (const match of trimmed.matchAll(ROBOT_BUILD)) {
    if (match.index === undefined) continue;
    addCandidate(candidates, seen, match[1], match.index, match.index + match[0].length, findLineForIndex(trimmed, match.index), 'cue', 0.86);
  }

  for (const match of trimmed.matchAll(FEATURE_TO_PROJECT)) {
    if (match.index === undefined) continue;
    const feature = match[1].trim();
    const project = match[2].trim();
    const featureStart = match.index + match[0].indexOf(feature);
    const projectStart = match.index + match[0].indexOf(project);
    addCandidate(candidates, seen, feature, featureStart, featureStart + feature.length, findLineForIndex(trimmed, match.index), 'cue', 0.78);
    addCandidate(candidates, seen, project, projectStart, projectStart + project.length, findLineForIndex(trimmed, match.index), 'cue', 0.88);
  }

  for (const match of trimmed.matchAll(PROPER_NOUN_TAIL)) {
    if (match.index === undefined) continue;
    const phraseStart = match.index + match[0].indexOf(match[1]);
    addCandidate(candidates, seen, match[1], phraseStart, phraseStart + match[1].length, findLineForIndex(trimmed, match.index), 'cue', 0.82);
  }

  for (const match of trimmed.matchAll(QUOTED_NAME)) {
    if (match.index === undefined) continue;
    addCandidate(candidates, seen, match[1], match.index + 1, match.index + match[0].length - 1, findLineForIndex(trimmed, match.index), 'quoted', 0.85);
  }

  for (const match of trimmed.matchAll(CALLED_PATTERN)) {
    if (match.index === undefined) continue;
    const descriptor = match[1].trim();
    const named = match[2].trim();
    const descStart = match.index + match[0].indexOf(descriptor);
    const nameStart = match.index + match[0].indexOf(named);
    addCandidate(candidates, seen, descriptor, descStart, descStart + descriptor.length, findLineForIndex(trimmed, match.index), 'cue', 0.8);
    addCandidate(candidates, seen, named, nameStart, nameStart + named.length, findLineForIndex(trimmed, match.index), 'cue', 0.9);
  }

  for (const [aliasKey, aliasValue] of KNOWN_PROJECT_ALIASES.entries()) {
    const re = new RegExp(`\\b${aliasKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const match of trimmed.matchAll(re)) {
      if (match.index === undefined) continue;
      addCandidate(candidates, seen, aliasValue, match.index, match.index + match[0].length, findLineForIndex(trimmed, match.index), 'known_alias', 0.92);
    }
  }

  return candidates;
}

/** Weak glossary/lexical candidates enter as low-confidence inputs. */
export function weakProjectCandidate(
  text: string,
  evidenceLine: string,
  confidence = 0.55
): RawProjectCandidate {
  return {
    text: text.trim(),
    start: 0,
    end: text.length,
    evidenceLine,
    source: 'glossary',
    confidence,
  };
}

function linkStatus(span: string, guardStatus: ProjectSuggestionStatus | undefined, options?: ProjectSuggestionOptions): ProjectSuggestionStatus {
  if (guardStatus) return guardStatus;
  const key = normalizeNameKey(span);
  if (!options?.knownProjects?.size) return 'new';
  for (const known of options.knownProjects) {
    if (normalizeNameKey(known) === key) return 'known';
  }
  return 'new';
}

function runSecondaryGuards(
  spanText: string,
  evidenceLine: string,
  options?: ProjectSuggestionOptions
): { allowed: boolean; rejectedAs?: string; rejectionReason?: string; rulesFired: string[] } {
  const crossBook = guardCrossBookEntity(spanText, evidenceLine, options?.crossBook, options);
  if (!crossBook.allowed) {
    return {
      allowed: false,
      rejectedAs: crossBook.rejectedAs,
      rejectionReason: crossBook.rejectionReason,
      rulesFired: crossBook.rulesFired,
    };
  }

  const consumer = guardConsumerAppReference(spanText, evidenceLine);
  if (!consumer.allowed) {
    return {
      allowed: false,
      rejectedAs: consumer.rejectedAs,
      rejectionReason: consumer.rejectionReason,
      rulesFired: consumer.rulesFired,
    };
  }

  const object = guardObjectReference(spanText, evidenceLine);
  if (!object.allowed) {
    return {
      allowed: false,
      rejectedAs: object.rejectedAs,
      rejectionReason: object.rejectionReason,
      rulesFired: object.rulesFired,
    };
  }

  return { allowed: true, rulesFired: ['secondary_guards_clear'] };
}

function buildSuggestion(
  base: Omit<ProjectSuggestion, 'canonicalKey' | 'normalizedText'>,
  spanText: string
): ProjectSuggestion {
  return {
    ...base,
    text: spanText,
    normalizedText: normalizeNameKey(spanText),
    canonicalKey: canonicalProjectKey(spanText),
  };
}

function processCandidate(raw: RawProjectCandidate, options?: ProjectSuggestionOptions): ProjectSuggestion[] {
  const originalCandidate = raw.text;

  const referenceGuard = guardProjectCandidate(
    originalCandidate,
    raw.evidenceLine,
    options,
    raw.confidence
  );
  if (referenceGuard.status === 'reference') {
    return [
      buildSuggestion(
        {
          start: raw.start,
          end: raw.end,
          projectType: 'unknown_project',
          confidence: 0.2,
          status: 'reference',
          matchedProjectId: referenceGuard.matchedProjectId,
          rejectionReason: referenceGuard.rejectionReason,
          boundaryFixes: [],
          evidencePhrases: [raw.evidenceLine],
          rulesFired: referenceGuard.rulesFired,
          originalCandidate,
          finalSpan: originalCandidate.trim(),
        },
        originalCandidate.trim()
      ),
    ];
  }

  const boundary = resolveProjectBoundary(raw.text);
  const splitPieces = splitMixedProjectSpan(boundary.text);
  const outputs: ProjectSuggestion[] = [];

  for (const piece of splitPieces) {
    const spanText = canonicalizeAlias(piece.text);
    if (!spanText) continue;

    const guard = guardProjectCandidate(spanText, raw.evidenceLine, options, raw.confidence);
    const taxonomy = classifyProjectTaxonomy(spanText, raw.evidenceLine);
    const rulesFired = [
      ...(boundary.fixes.length ? [`boundary:${boundary.fixes.join(',')}`] : []),
      `split:${piece.splitReason}`,
      `source:${raw.source}`,
      ...guard.rulesFired,
      ...taxonomy.rulesFired,
    ];

    if (!guard.allowed || guard.status === 'rejected' || guard.status === 'reference') {
      outputs.push(
        buildSuggestion(
          {
            start: raw.start,
            end: raw.end,
            projectType: taxonomy.projectType,
            confidence: Math.min(taxonomy.confidence, 0.35),
            status: guard.status ?? 'rejected',
            matchedProjectId: guard.matchedProjectId,
            rejectionReason: guard.rejectionReason ?? guard.rejectedAs,
            rejectedAs: guard.rejectedAs,
            splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
            boundaryFixes: boundary.fixes,
            evidencePhrases: [raw.evidenceLine],
            rulesFired,
            originalCandidate,
            finalSpan: spanText,
            splitChildren: splitPieces.map(p => p.text),
          },
          spanText
        )
      );
      continue;
    }

    const secondary = runSecondaryGuards(spanText, raw.evidenceLine, options);
    rulesFired.push(...secondary.rulesFired);
    if (!secondary.allowed) {
      outputs.push(
        buildSuggestion(
          {
            start: raw.start,
            end: raw.end,
            projectType: taxonomy.projectType,
            confidence: Math.min(taxonomy.confidence, 0.35),
            status: 'rejected',
            rejectionReason: secondary.rejectionReason,
            rejectedAs: secondary.rejectedAs,
            splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
            boundaryFixes: boundary.fixes,
            evidencePhrases: [raw.evidenceLine],
            rulesFired,
            originalCandidate,
            finalSpan: spanText,
            splitChildren: splitPieces.map(p => p.text),
          },
          spanText
        )
      );
      continue;
    }

    let confidence = Math.min(0.98, taxonomy.confidence + guard.confidenceBoost + (raw.confidence - 0.5) * 0.1);
    const status = linkStatus(spanText, guard.status, options);
    if (status === 'needs_review') confidence = Math.min(confidence, 0.62);

    outputs.push(
      buildSuggestion(
        {
          start: raw.start,
          end: raw.end,
          projectType: taxonomy.projectType,
          confidence,
          status,
          matchedProjectId: guard.matchedProjectId,
          splitFrom: originalCandidate !== spanText ? originalCandidate : undefined,
          boundaryFixes: boundary.fixes,
          evidencePhrases: [raw.evidenceLine],
          rulesFired,
          originalCandidate,
          finalSpan: spanText,
          splitChildren: splitPieces.map(p => p.text),
        },
        spanText
      )
    );
  }

  return outputs;
}

export function processProjectSuggestions(
  text: string,
  options?: ProjectSuggestionOptions,
  weakCandidates: RawProjectCandidate[] = []
): ProjectSuggestion[] {
  const candidates = [...detectProjectCandidates(text), ...weakCandidates];
  const all: ProjectSuggestion[] = [];
  for (const candidate of candidates) {
    all.push(...processCandidate(candidate, options));
  }
  return dedupeProjectSuggestions(all, options);
}

export function processProjectSuggestionsForOutput(
  text: string,
  options?: ProjectSuggestionOptions,
  weakCandidates: RawProjectCandidate[] = []
): ProjectSuggestion[] {
  return processProjectSuggestions(text, options, weakCandidates).filter(
    s =>
      s.status === 'known' ||
      s.status === 'new' ||
      s.status === 'needs_review' ||
      s.status === 'possible_duplicate'
  );
}

export function projectSuggestionsToExtracted(
  suggestions: ProjectSuggestion[]
): Array<{
  name: string;
  type?: string;
  confidence: number;
  reasoning?: string;
  evidence?: string[];
}> {
  return suggestions
    .filter(s => s.status === 'known' || s.status === 'new' || s.status === 'needs_review' || s.status === 'possible_duplicate')
    .map(s => ({
      name: s.text,
      type: mapTaxonomyToLegacyType(s.projectType),
      confidence: s.confidence,
      reasoning: s.rulesFired.join(' · '),
      evidence: s.evidencePhrases,
    }));
}

function mapTaxonomyToLegacyType(projectType: string): string {
  const map: Record<string, string> = {
    software_app: 'software',
    robot_build: 'hardware',
    hardware_project: 'hardware',
    website: 'creative',
    creative_project: 'creative',
    content_series: 'creative',
    startup: 'business',
    product: 'software',
    feature: 'software',
    repo: 'software',
    experiment: 'project',
    initiative: 'project',
    unknown_project: 'project',
  };
  return map[projectType] ?? 'project';
}

export const projectSuggestionPipeline = {
  detectProjectCandidates,
  processProjectSuggestions,
  processProjectSuggestionsForOutput,
  projectSuggestionsToExtracted,
};
