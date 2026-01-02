/**
 * ContentFilter
 * 
 * Text-level filtering (atoms already filtered by applyContentFilters)
 * This is for cleaning prose text after generation.
 */

import type { NarrativeAtom } from './types';

export interface FilterOptions {
  filterSensitive: boolean;
  audience: 'self' | 'public' | 'professional';
  includeIntrospection: boolean;
}

/**
 * Filter sensitive content from atoms
 * NOTE: This is now handled in biographyGenerationEngine.applyContentFilters()
 * using the sensitivity field. This function is kept for backward compatibility
 * but should use atom.sensitivity instead of re-checking.
 */
export function filterSensitiveAtoms(
  atoms: NarrativeAtom[],
  options: FilterOptions
): NarrativeAtom[] {
  // This is now handled by applyContentFilters in the engine
  // using the sensitivity field on atoms
  return atoms;
}

/**
 * Clean summary text for public audience
 */
function cleanSummaryForPublic(summary: string): string {
  // Remove explicit language
  let cleaned = summary
    .replace(/\b(fuck|shit|damn|hell)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Replace sensitive phrases with neutral alternatives
  const replacements: [RegExp, string][] = [
    [/struggled with (depression|anxiety|mental health)/gi, 'faced challenges'],
    [/was addicted to/gi, 'had experience with'],
    [/hated/gi, 'disliked'],
    [/despised/gi, 'strongly disliked']
  ];

  replacements.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern, replacement);
  });

  return cleaned;
}

/**
 * Filter biography text content
 */
export function filterBiographyText(
  text: string,
  options: FilterOptions
): string {
  if (!options.filterSensitive) {
    return text;
  }

  let filtered = text;

  // Remove explicit language
  if (options.audience === 'public') {
    filtered = filtered
      .replace(/\b(fuck|shit|damn|hell|asshole|bitch)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Replace sensitive topics with neutral language
  const sensitivePatterns: [RegExp, string][] = [
    [/struggled with (depression|anxiety|mental illness)/gi, 'faced personal challenges'],
    [/was addicted to/gi, 'had challenges with'],
    [/suicide|self-harm/gi, 'personal struggles'],
    [/abuse|abused/gi, 'difficult experiences'],
    [/divorce|divorced/gi, 'relationship changes'],
    [/affair|cheated/gi, 'relationship complications']
  ];

  if (options.audience === 'public') {
    sensitivePatterns.forEach(([pattern, replacement]) => {
      filtered = filtered.replace(pattern, replacement);
    });
  }

  return filtered;
}
