import { describe, it, expect } from 'vitest';
import {
  findInstructionalExampleRanges,
  maskInstructionalExamples,
  rangeInsideInstructionalExample,
} from './maskInstructionalExamples';
import { buildEntityMatchIndex, matchCertifiedEntitiesWithIndex } from './certifiedEntityMatch';
import type { CertifiedEntity } from '../types/certifiedEntity';

const CORRECTION_HINT =
  'If anything in their profile is wrong, say it plainly (e.g. "actually her name is Maya" or "they are my coworker, not my friend").';

describe('maskInstructionalExamples', () => {
  it('masks e.g. quoted examples while preserving length', () => {
    const masked = maskInstructionalExamples(CORRECTION_HINT);
    expect(masked.length).toBe(CORRECTION_HINT.length);
    expect(masked).not.toContain('Maya');
    expect(masked).toContain('If anything in their profile is wrong');
  });

  it('keeps real mentions outside instructional examples', () => {
    const text = `What groups is Jerry part of?\n\n${CORRECTION_HINT}`;
    const masked = maskInstructionalExamples(text);
    expect(masked).toContain('Jerry');
    expect(masked).not.toContain('Maya');
  });

  it('prevents example names from matching certified entities', () => {
    const text = `What groups is Jerry part of?\n\n${CORRECTION_HINT}`;
    const entities: CertifiedEntity[] = [
      {
        id: 'c-jerry',
        name: 'Jerry',
        type: 'character',
        aliases: [],
        mentionKeys: ['jerry'],
        status: 'confirmed',
      },
      {
        id: 'c-maya',
        name: 'Maya',
        type: 'character',
        aliases: [],
        mentionKeys: ['maya'],
        status: 'confirmed',
      },
    ];
    const idx = buildEntityMatchIndex(entities);
    const raw = matchCertifiedEntitiesWithIndex(text, idx).map((m) => m.name);
    expect(raw).toEqual(expect.arrayContaining(['Jerry', 'Maya']));

    const masked = maskInstructionalExamples(text);
    const filtered = matchCertifiedEntitiesWithIndex(masked, idx).map((m) => m.name);
    expect(filtered).toEqual(['Jerry']);
  });

  it('detects ranges for span filtering', () => {
    const text = `Hello (e.g. "actually her name is Maya").`;
    const ranges = findInstructionalExampleRanges(text);
    expect(ranges).toHaveLength(1);
    const mayaStart = text.indexOf('Maya');
    expect(rangeInsideInstructionalExample(mayaStart, mayaStart + 4, ranges)).toBe(true);
    expect(rangeInsideInstructionalExample(0, 5, ranges)).toBe(false);
  });
});
