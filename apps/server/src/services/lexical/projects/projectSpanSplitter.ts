/**
 * Split mixed project spans ("LoreBook and Omega-1", "my app and my robot").
 */

import { resolveProjectBoundary } from './projectBoundaryResolver';
import { GENERIC_PROJECT_WORDS } from './projectSuggestionTypes';

export type ProjectSplitPiece = {
  text: string;
  splitReason: string;
};

export function splitMixedProjectSpan(span: string): ProjectSplitPiece[] {
  const trimmed = span.trim();
  if (!trimmed) return [];

  if (/\s+and\s+/i.test(trimmed)) {
    const parts = trimmed
      .split(/\s+and\s+/i)
      .map(p => resolveProjectBoundary(p).text.trim())
      .filter(Boolean);
    if (parts.length > 1 && parts.every(p => !GENERIC_PROJECT_WORDS.has(p.toLowerCase()) || p.split(/\s+/).length > 1)) {
      return parts.map(text => ({ text, splitReason: 'coordination_and' }));
    }
    if (parts.length > 1) {
      return parts
        .filter(p => p.split(/\s+/).length > 1 || /^[A-Z]/.test(p))
        .map(text => ({ text, splitReason: 'coordination_and_partial' }));
    }
  }

  const resolved = resolveProjectBoundary(trimmed);
  if (resolved.text !== trimmed) {
    const pieces: ProjectSplitPiece[] = [{ text: resolved.text, splitReason: 'boundary_trim' }];
    if (resolved.trimmedSuffix) {
      pieces.push({ text: resolved.trimmedSuffix, splitReason: 'trimmed_suffix' });
    }
    return pieces.filter(p => p.text.length > 0);
  }

  return [{ text: trimmed, splitReason: 'unsplit' }];
}
