import { describe, expect, it } from 'vitest';

import {
  classifyDocument,
  hasManualDocumentCategory,
} from './documentClassification';

describe('documentClassification', () => {
  it('treats a linked parsed resume as authoritative even with an opaque filename', () => {
    expect(classifyDocument({
      filename: 'scan-003.pdf',
      mimeType: 'application/pdf',
      ingestKind: 'document',
      linkedResume: true,
    })).toMatchObject({ category: 'resumes', confidence: 1 });
  });

  it('recognizes resume wording extracted from an image', () => {
    expect(classifyDocument({
      filename: 'IMG_2042.jpg',
      mimeType: 'image/jpeg',
      ingestKind: 'photo',
      extractedText: 'Professional Experience\nVanguard Robotics\nEducation\nSkills',
    })).toMatchObject({ category: 'resumes', reason: 'resume wording' });
  });

  it('recognizes identity images before the general image fallback', () => {
    expect(classifyDocument({
      filename: 'scan.png',
      mimeType: 'image/png',
      ingestKind: 'photo',
      metadata: { document_subtype: 'passport' },
    }).category).toBe('personal_identity');
  });

  it('marks explicit user corrections as protected from automatic sorting', () => {
    expect(hasManualDocumentCategory({ document_category_source: 'manual' })).toBe(true);
    expect(hasManualDocumentCategory({ document_category_source: 'automatic' })).toBe(false);
  });
});
