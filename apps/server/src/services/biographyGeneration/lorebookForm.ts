/**
 * LoreBook form tiers — document shape constraints for compile + generation.
 */

import type { BiographyDepth, BiographyForm } from './types';

export const BIOGRAPHY_FORMS: BiographyForm[] = [
  'vignette',
  'chapter',
  'short_book',
  'book',
  'epic',
];

export type LorebookFormConstraints = {
  form: BiographyForm;
  defaultDepth: BiographyDepth;
  maxChapters: number | null;
  /** Minimum narrative atoms to treat as ready for this form */
  minAtoms: number;
  /** Soft-gate progress threshold (below full readiness) */
  softProgress: number;
  /** Skip void chapters for short forms */
  includeVoidChapters: boolean;
};

export const FORM_CONSTRAINTS: Record<BiographyForm, LorebookFormConstraints> = {
  vignette: {
    form: 'vignette',
    defaultDepth: 'summary',
    maxChapters: 1,
    minAtoms: 2,
    softProgress: 0.12,
    includeVoidChapters: false,
  },
  chapter: {
    form: 'chapter',
    defaultDepth: 'summary',
    maxChapters: 1,
    minAtoms: 3,
    softProgress: 0.2,
    includeVoidChapters: false,
  },
  short_book: {
    form: 'short_book',
    defaultDepth: 'summary',
    maxChapters: 4,
    minAtoms: 8,
    softProgress: 0.35,
    includeVoidChapters: true,
  },
  book: {
    form: 'book',
    defaultDepth: 'detailed',
    maxChapters: null,
    minAtoms: 20,
    softProgress: 0.45,
    includeVoidChapters: true,
  },
  epic: {
    form: 'epic',
    defaultDepth: 'epic',
    maxChapters: null,
    minAtoms: 40,
    softProgress: 0.55,
    includeVoidChapters: true,
  },
};

export function isBiographyForm(value: unknown): value is BiographyForm {
  return typeof value === 'string' && (BIOGRAPHY_FORMS as string[]).includes(value);
}

export function constraintsForForm(form?: BiographyForm | null): LorebookFormConstraints {
  return FORM_CONSTRAINTS[form ?? 'book'];
}

export function defaultDepthForForm(form?: BiographyForm | null): BiographyDepth {
  return constraintsForForm(form).defaultDepth;
}

export function maxChaptersForForm(form?: BiographyForm | null): number | null {
  return constraintsForForm(form).maxChapters;
}

/** Prompt hint injected into chapter narrative generation for short forms. */
export function formNarrativeHint(form?: BiographyForm | null): string {
  switch (form) {
    case 'vignette':
      return (
        'FORM: Vignette. Write a single short, self-contained piece (roughly 300–600 words). ' +
        'Do not structure as multiple chapters. Focus on one clear moment or thread.'
      );
    case 'chapter':
      return (
        'FORM: Single chapter. Write one cohesive named chapter with a clear arc. ' +
        'Do not split into multiple chapters.'
      );
    case 'short_book':
      return (
        'FORM: Short LoreBook. Keep prose concise; prefer 2–4 short chapters total. ' +
        'Short-story length overall.'
      );
    case 'epic':
      return 'FORM: Epic LoreBook. Allow richer detail and longer chapter prose when evidence supports it.';
    default:
      return 'FORM: Standard LoreBook. Multi-chapter narrative grounded in source evidence.';
  }
}
