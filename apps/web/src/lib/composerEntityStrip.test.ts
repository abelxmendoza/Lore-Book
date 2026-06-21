import { describe, it, expect } from 'vitest';
import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import {
  certifiedTypeToPreviewClassification,
  filterPreviewSpansForStrip,
} from './composerEntityStrip';

const alex: CertifiedEntityMatch = {
  id: 'c-alex',
  name: 'Alex',
  type: 'character',
  aliases: [],
  mentionKeys: ['alex'],
  status: 'confirmed',
  matchedLabel: 'Alex',
  matchKind: 'full',
};

describe('composerEntityStrip', () => {
  it('maps certified types to preview color keys', () => {
    expect(certifiedTypeToPreviewClassification({ type: 'character' }).colorKey).toBe('person');
    expect(certifiedTypeToPreviewClassification({ type: 'location' }).colorKey).toBe('place');
    expect(certifiedTypeToPreviewClassification({ type: 'organization' }).colorKey).toBe('organization');
    expect(
      certifiedTypeToPreviewClassification({ type: 'character', characterVariant: 'romantic' }).colorKey,
    ).toBe('relationship');
  });

  it('filters preview spans that duplicate certified matches', () => {
    const span: LexicalPreviewSpan = {
      text: 'Alex',
      start: 5,
      end: 9,
      type: 'PERSON',
      colorKey: 'person',
      confidence: 0.9,
      temporary: true,
    };
    const filtered = filterPreviewSpansForStrip('I saw Alex today', [alex], [span]);
    expect(filtered).toHaveLength(0);
  });

  it('keeps preview spans that do not overlap certified entities', () => {
    const span: LexicalPreviewSpan = {
      text: 'Summit Staffing',
      start: 10,
      end: 25,
      type: 'ORGANIZATION',
      colorKey: 'organization',
      confidence: 0.85,
      temporary: true,
    };
    const filtered = filterPreviewSpansForStrip('Working at Summit Staffing', [alex], [span]);
    expect(filtered).toHaveLength(1);
  });
});
