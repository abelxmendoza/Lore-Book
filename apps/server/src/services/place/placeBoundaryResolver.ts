/**
 * Place Cognition boundary layer — wraps lexical boundary cleanup and adds
 * hard rejects for discourse fragments that must never become titles.
 */

import { resolvePlaceBoundary as lexicalResolvePlaceBoundary } from '../lexical/places/placeBoundaryResolver';

const DISCOURSE_FRAGMENT_ONLY =
  /^(?:because|when|after|while|and\s+then|so|where|if|although|before|until|unless|since|that|which|who|i|we|they|he|she|it)(?:\s+i)?$/i;

// Multi-word spans that still contain a bare narrative pronoun or a common
// finite narration verb are sentence fragments the upstream regex/lexical
// extractors over-captured (e.g. "Marcus and Jamie saw", "Marcus she freaked out"),
// not place names — real place names essentially never contain these as a
// standalone token. Scoped to 3+ words so short legitimate names aren't at risk.
const NARRATIVE_PRONOUN = /\b(?:she|he|they|we|i)\b/i;
const NARRATIVE_VERB =
  /\b(?:saw|said|heard|freaked|yelled|told|asked|felt|knew|thought|started|stopped|cried|laughed|screamed|ran|walked|looked|found|got|gave|did|happened|realized|noticed|remembered|forgot)\b/i;

function isNarrativeFragment(text: string): boolean {
  if (text.split(/\s+/).filter(Boolean).length < 3) return false;
  return NARRATIVE_PRONOUN.test(text) || NARRATIVE_VERB.test(text);
}

export type PlaceBoundaryResult = {
  text: string;
  original: string;
  fixes: string[];
  clearBoundary: boolean;
  rejectionReason?: string;
};

export function resolveCognitionPlaceBoundary(span: string): PlaceBoundaryResult {
  const original = (span ?? '').trim();
  if (!original) {
    return { text: '', original, fixes: ['empty'], clearBoundary: false, rejectionReason: 'empty_span' };
  }

  const lexical = lexicalResolvePlaceBoundary(original);
  let text = lexical.text.trim();
  const fixes = [...lexical.fixes];

  if (DISCOURSE_FRAGMENT_ONLY.test(text)) {
    return {
      text,
      original,
      fixes: [...fixes, 'discourse_fragment_only'],
      clearBoundary: false,
      rejectionReason: 'fragment',
    };
  }

  if (isNarrativeFragment(text)) {
    return {
      text,
      original,
      fixes: [...fixes, 'narrative_fragment'],
      clearBoundary: false,
      rejectionReason: 'fragment',
    };
  }

  // Titles must not end in discourse glue even if a partial trim left residue.
  if (/\b(?:because|when|after|while|and\s+then|so\s+i|where\s+we|after\s+that)\s*$/i.test(text)) {
    const cut = text.replace(
      /\s+(?:because|when|after|while|and\s+then|so|where|if|although)\b.*$/i,
      '',
    ).trim();
    if (cut && cut !== text) {
      fixes.push('trim_residual_discourse_glue');
      text = cut;
    }
  }

  if (!text || text.length < 2) {
    return {
      text,
      original,
      fixes,
      clearBoundary: false,
      rejectionReason: 'fragment',
    };
  }

  return {
    text,
    original,
    fixes,
    clearBoundary: text.length >= 2 && !DISCOURSE_FRAGMENT_ONLY.test(text),
  };
}
