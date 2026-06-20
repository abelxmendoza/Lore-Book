import type { CorrectedPreviewSpan, GlossaryCandidate } from './correctionTypes';

export function mapCorrectionsToGlossaryCandidates(
  corrections: CorrectedPreviewSpan[]
): GlossaryCandidate[] {
  const out: GlossaryCandidate[] = [];

  for (const c of corrections) {
    if (c.correctionAction === 'detected' && !c.userConfirmed) continue;

    const term = c.displayNameOverride ?? c.text;
    const type = c.correctedType ?? c.originalType;

    if (c.correctionAction === 'rename' || c.correctionAction === 'confirm') {
      out.push({
        term,
        category: type.toLowerCase(),
        aliases: c.text !== term ? [c.text] : [],
        confidence: c.confidenceOverride ?? c.confidence ?? 0.85,
        sourceCorrectionId: c.id,
        requiresConfirmation: true,
      });
    }

    if (c.correctionAction === 'mark_skill' || c.correctionAction === 'mark_role') {
      out.push({
        term,
        category: type.toLowerCase(),
        aliases: [],
        confidence: 0.82,
        sourceCorrectionId: c.id,
        requiresConfirmation: true,
      });
    }
  }

  return dedupeGlossary(out);
}

function dedupeGlossary(items: GlossaryCandidate[]): GlossaryCandidate[] {
  const seen = new Set<string>();
  return items.filter((g) => {
    const key = `${g.term}:${g.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function lowerPatternConfidenceHints(
  corrections: CorrectedPreviewSpan[]
): Array<{ phrase: string; delta: number }> {
  return corrections
    .filter((c) => c.correctionAction === 'mark_wrong')
    .map((c) => ({ phrase: c.text.toLowerCase(), delta: -0.15 }));
}
