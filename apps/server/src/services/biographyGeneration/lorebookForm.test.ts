import { describe, expect, it } from 'vitest';
import {
  constraintsForForm,
  defaultDepthForForm,
  formNarrativeHint,
  maxChaptersForForm,
} from './lorebookForm';

describe('lorebookForm constraints', () => {
  it('uses low atom floors for vignette and chapter', () => {
    expect(constraintsForForm('vignette').minAtoms).toBe(2);
    expect(constraintsForForm('chapter').minAtoms).toBe(3);
    expect(constraintsForForm('short_book').minAtoms).toBe(8);
    expect(constraintsForForm('book').minAtoms).toBe(20);
    expect(constraintsForForm('epic').minAtoms).toBe(40);
  });

  it('caps chapters for short forms', () => {
    expect(maxChaptersForForm('vignette')).toBe(1);
    expect(maxChaptersForForm('chapter')).toBe(1);
    expect(maxChaptersForForm('short_book')).toBe(4);
    expect(maxChaptersForForm('book')).toBeNull();
  });

  it('maps default depth and narrative hints', () => {
    expect(defaultDepthForForm('vignette')).toBe('summary');
    expect(defaultDepthForForm('book')).toBe('detailed');
    expect(defaultDepthForForm('epic')).toBe('epic');
    expect(formNarrativeHint('vignette')).toMatch(/Vignette/i);
    expect(formNarrativeHint('chapter')).toMatch(/Single chapter/i);
  });

  it('defaults missing form to book constraints', () => {
    expect(constraintsForForm(undefined).form).toBe('book');
    expect(constraintsForForm(null).minAtoms).toBe(20);
  });
});
