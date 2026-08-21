/**
 * Converge the streamed draft, verified compiler artifact, and persisted
 * assistant message onto one visible reply.
 *
 * Does not generate a new answer. Uses the existing response compiler's
 * summary_discipline layer. Inspector footnotes on verifiedResponse stay
 * off the chat surface so the user sees the disciplined prose, not a
 * second commentary track.
 */
import {
  summarizeDisciplineRewrites,
  type SummaryDisciplineRewriteCounts,
} from './summaryDiscipline';
import type { CompiledAssistantResponse } from '../responseCompiler/responseCompilerTypes';

export type VisibleResponseFinalization = SummaryDisciplineRewriteCounts & {
  draftContent: string;
  finalContent: string;
  verified: boolean;
  rewritten: boolean;
  verificationDegraded: boolean;
  unsupportedCount: number;
  groundedCount: number;
  inferredCount: number;
  contradictionCount: number;
  memoryCandidatesBlocked: number;
  certaintyScore?: number;
  summaryDiscipline: boolean;
  actionCandidates: CompiledAssistantResponse['actionCandidates'];
};

function normalizeVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function emptyCounts(): SummaryDisciplineRewriteCounts {
  return {
    causalRewriteCount: 0,
    embellishmentRewriteCount: 0,
    epistemicRewriteCount: 0,
  };
}

function keepDraft(
  draftContent: string,
  extras: Partial<VisibleResponseFinalization> = {},
): VisibleResponseFinalization {
  return {
    draftContent,
    finalContent: draftContent,
    verified: false,
    rewritten: false,
    verificationDegraded: false,
    unsupportedCount: 0,
    groundedCount: 0,
    inferredCount: 0,
    contradictionCount: 0,
    memoryCandidatesBlocked: 0,
    summaryDiscipline: false,
    actionCandidates: [],
    ...emptyCounts(),
    ...extras,
  };
}

/**
 * Pick the visible/persisted assistant text from a compiled draft.
 * Operational compiler failure keeps the streamed draft and marks degraded.
 */
export function finalizeVisibleAssistantResponse(opts: {
  draftContent: string;
  compiled?: CompiledAssistantResponse | null;
  verificationFailed?: boolean;
}): VisibleResponseFinalization {
  const draftContent = opts.draftContent ?? '';

  if (opts.verificationFailed || !opts.compiled) {
    return keepDraft(draftContent, {
      verificationDegraded: Boolean(opts.verificationFailed),
    });
  }

  const compiled = opts.compiled;
  const disciplinedText = compiled.discipline?.text?.trim()
    ? compiled.discipline.text
    : draftContent;
  const rewritten =
    Boolean(disciplinedText.trim()) &&
    normalizeVisibleText(disciplinedText) !== normalizeVisibleText(draftContent);
  const counts = summarizeDisciplineRewrites(compiled.discipline?.warnings ?? []);

  return {
    draftContent,
    finalContent: rewritten ? disciplinedText : draftContent,
    verified: true,
    rewritten,
    verificationDegraded: false,
    unsupportedCount: compiled.unsupportedClaims.length,
    groundedCount: compiled.groundedClaims.length,
    inferredCount: compiled.inferredClaims.length,
    contradictionCount: compiled.contradictions.length,
    memoryCandidatesBlocked: compiled.memoryCandidatesBlocked.length,
    certaintyScore: compiled.certaintyScore,
    summaryDiscipline: compiled.rulesFired.includes('summary_discipline') || rewritten,
    actionCandidates: compiled.actionCandidates,
    ...counts,
  };
}

export function toChatStreamDoneFields(finalization: VisibleResponseFinalization): {
  verified: boolean;
  rewritten: boolean;
  unsupportedCount: number;
  causalRewriteCount: number;
  embellishmentRewriteCount: number;
  epistemicRewriteCount: number;
  verificationDegraded?: boolean;
  content?: string;
} {
  return {
    verified: finalization.verified,
    rewritten: finalization.rewritten,
    unsupportedCount: finalization.unsupportedCount,
    causalRewriteCount: finalization.causalRewriteCount,
    embellishmentRewriteCount: finalization.embellishmentRewriteCount,
    epistemicRewriteCount: finalization.epistemicRewriteCount,
    ...(finalization.verificationDegraded ? { verificationDegraded: true } : {}),
    ...(finalization.rewritten ? { content: finalization.finalContent } : {}),
  };
}
