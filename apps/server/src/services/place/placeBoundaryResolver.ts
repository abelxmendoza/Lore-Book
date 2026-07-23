/**
 * Place Cognition boundary layer — wraps lexical boundary cleanup and adds
 * hard rejects for discourse fragments that must never become titles.
 */

import { resolvePlaceBoundary as lexicalResolvePlaceBoundary } from '../lexical/places/placeBoundaryResolver';

const DISCOURSE_FRAGMENT_ONLY =
  /^(?:because|when|after|while|and\s+then|so|where|if|although|before|until|unless|since|that|which|who|i|we|they|he|she|it)(?:\s+i)?$/i;

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
