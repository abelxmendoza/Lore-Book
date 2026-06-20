import type {
  ApplyPreviewCorrectionsInput,
  ApplyPreviewCorrectionsResult,
  CorrectedPreviewSpan,
} from './correctionTypes';
import type { LexicalAnalysisResult, LexicalEntityType } from '../lexical/lexicalTypes';
import { recordCorrectionAudit } from './correctionAuditService';
import { mapCorrectionsToGlossaryCandidates } from './correctionToGlossaryMapper';
import {
  mapCorrectionsToOntologyAliases,
  parentEntityOverrides,
} from './correctionToOntologyAliasMapper';
import {
  validateEntityOwnership,
} from '../search/entitySearchService';
import type { EntitySearchType } from '../search/entitySearchTypes';

function effectiveType(c: CorrectedPreviewSpan): string {
  return c.correctedType ?? c.originalType;
}

/** Apply message-scoped preview corrections — no durable ontology writes. */
export async function applyPreviewCorrections(
  input: ApplyPreviewCorrectionsInput
): Promise<ApplyPreviewCorrectionsResult> {
  const { corrections } = input;

  const sanitized: CorrectedPreviewSpan[] = [];
  for (const c of corrections) {
    if (c.linkedEntityId && c.linkedEntityType) {
      const owned = await validateEntityOwnership(
        input.userId,
        c.linkedEntityId,
        c.linkedEntityType as EntitySearchType
      );
      if (!owned) continue;
    }
    sanitized.push(c);
  }

  const correctedSpans = sanitized
    .filter((c) => c.entityStatus !== 'ignored' && c.entityStatus !== 'wrong')
    .map((c) => ({
      ...c,
      requiresReview: c.requiresReview || c.sensitive || c.correctionAction === 'review_later',
    }));

  const audit = recordCorrectionAudit({
    userId: input.userId,
    messageId: input.messageId,
    threadId: input.threadId,
    corrections: sanitized,
  });

  const glossaryCandidates = mapCorrectionsToGlossaryCandidates(sanitized);
  const ontologyAliasCandidates = mapCorrectionsToOntologyAliases(sanitized);

  const requiresReview =
    correctedSpans.some((c) => c.requiresReview || c.sensitive) ||
    sanitized.some((c) => c.correctionAction === 'review_later' || c.correctionAction === 'mark_sensitive');

  return {
    correctedSpans,
    glossaryCandidates,
    ontologyAliasCandidates,
    auditId: audit.auditId,
    requiresReview,
  };
}

/** Build inference hints from corrections for subgroup / parent linking. */
export function buildCorrectionInferenceHints(corrections: CorrectedPreviewSpan[]) {
  const parents = parentEntityOverrides(corrections);
  const employerMarks = corrections.filter((c) => c.correctionAction === 'mark_employer');
  const worksiteMarks = corrections.filter((c) => c.correctionAction === 'mark_worksite');
  const coworkerMarks = corrections.filter((c) =>
    ['mark_coworker', 'mark_manager'].includes(c.correctionAction)
  );
  const skillMarks = corrections.filter((c) => c.correctionAction === 'mark_skill');

  return {
    parentOverrides: [...parents.entries()].map(([phrase, p]) => ({
      phrase,
      parentName: p.parentName,
      parentType: p.parentType,
    })),
    employers: employerMarks.map((c) => c.displayNameOverride ?? c.text),
    worksites: worksiteMarks.map((c) => c.displayNameOverride ?? c.text),
    coworkers: coworkerMarks.map((c) => ({
      name: c.displayNameOverride ?? c.text,
      role: c.correctionAction === 'mark_manager' ? 'manager' : 'coworker',
    })),
    skills: skillMarks.map((c) => c.displayNameOverride ?? c.text),
    ignoredPhrases: corrections
      .filter((c) => c.correctionAction === 'ignore_phrase' || c.entityStatus === 'ignored')
      .map((c) => c.text.toLowerCase()),
    typeOverrides: corrections
      .filter((c) => c.correctedType)
      .map((c) => ({
        text: c.text,
        start: c.start,
        end: c.end,
        type: effectiveType(c),
        subtype: c.correctedSubtype ?? c.originalSubtype,
      })),
  };
}

export function mergeCorrectionsIntoPreviewSpans<T extends { text: string; start: number; end: number; type: string; subtype?: string; needsReview?: boolean }>(
  spans: T[],
  corrections: CorrectedPreviewSpan[]
): T[] {
  if (!corrections.length) return spans;

  const byRange = new Map(
    corrections.map((c) => [`${c.start}:${c.end}`, c])
  );

  const ignored = new Set(
    corrections
      .filter((c) => c.entityStatus === 'ignored' || c.entityStatus === 'wrong')
      .map((c) => `${c.start}:${c.end}`)
  );

  return spans
    .filter((s) => !ignored.has(`${s.start}:${s.end}`))
    .map((s) => {
      const c = byRange.get(`${s.start}:${s.end}`);
      if (!c) return s;
      return {
        ...s,
        type: effectiveType(c),
        subtype: c.correctedSubtype ?? c.originalSubtype ?? s.subtype,
        needsReview: c.requiresReview ?? c.sensitive ?? s.needsReview,
      };
    });
}

function entityRangeKey(
  rawText: string,
  surface: string,
  startOffset?: number,
  endOffset?: number
): string {
  const start = startOffset ?? rawText.indexOf(surface);
  const end = endOffset ?? (start >= 0 ? start + surface.length : -1);
  return `${start}:${end}`;
}

function asLexicalEntityType(type: string): LexicalEntityType {
  const map: Record<string, LexicalEntityType> = {
    GROUP: 'ORGANIZATION',
    TIME_PERIOD: 'TIME',
    DEPLOYMENT_SITE: 'PLACE',
    INTEREST: 'PREFERENCE',
    COMMUNITY: 'ORGANIZATION',
    TASK: 'GOAL',
    UNKNOWN: 'OBJECT',
  };
  if (map[type]) return map[type];
  const allowed: LexicalEntityType[] = [
    'PERSON', 'ORGANIZATION', 'PLACE', 'PROJECT', 'SKILL', 'ROLE',
    'RELATIONSHIP', 'EVENT', 'DATE', 'TIME', 'PREFERENCE', 'EMOTION', 'OBJECT',
  ];
  return (allowed.includes(type as LexicalEntityType) ? type : 'OBJECT') as LexicalEntityType;
}

/** Apply user preview corrections onto a lexical analysis result (message-scoped). */
export function applyCorrectionsToLexical(
  lexical: LexicalAnalysisResult,
  corrections: CorrectedPreviewSpan[]
): LexicalAnalysisResult {
  if (!corrections.length) return lexical;

  const ignored = new Set(
    corrections
      .filter((c) => c.entityStatus === 'ignored' || c.entityStatus === 'wrong')
      .flatMap((c) => [`${c.start}:${c.end}`, c.text.toLowerCase()])
  );

  const byRange = new Map(corrections.map((c) => [`${c.start}:${c.end}`, c]));
  const byText = new Map(corrections.map((c) => [c.text.toLowerCase(), c]));

  const entities = lexical.entities
    .filter((e) => {
      const key = entityRangeKey(lexical.rawText, e.surface, e.startOffset, e.endOffset);
      if (ignored.has(key)) return false;
      if (ignored.has(e.surface.toLowerCase())) return false;
      return true;
    })
    .map((e) => {
      const key = entityRangeKey(lexical.rawText, e.surface, e.startOffset, e.endOffset);
      const c = byRange.get(key) ?? byText.get(e.surface.toLowerCase());
      if (!c) return e;

      const type = asLexicalEntityType(effectiveType(c));
      const surface = c.displayNameOverride ?? e.surface;
      return {
        ...e,
        surface,
        normalized: surface.toLowerCase(),
        type,
        subcategory: c.correctedSubtype ?? c.originalSubtype ?? e.subcategory,
        confidence: c.confidenceOverride ?? e.confidence,
        ...(c.linkedEntityId
          ? {
              linkedEntityId: c.linkedEntityId,
              linkedEntityType: c.linkedEntityType,
              source: `linked:${c.linkedEntityId}`,
            }
          : {}),
      };
    });

  const requiresReview =
    corrections.some((c) => c.requiresReview || c.sensitive || c.correctionAction === 'review_later');

  return {
    ...lexical,
    entities,
    needsClarification: lexical.needsClarification || requiresReview,
  };
}
