export const DOCUMENT_CATEGORIES = [
  'photos_images',
  'resumes',
  'journals',
  'autobiographies',
  'biographies',
  'personal_identity',
  'letters_correspondence',
  'family_history',
  'creative_works',
  'records_research',
  'other',
  'unfiled',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === 'string' && DOCUMENT_CATEGORIES.includes(value as DocumentCategory);
}

export function categoryForMetadata(metadata: Record<string, unknown> | null | undefined): DocumentCategory {
  const value = metadata?.document_category;
  return isDocumentCategory(value) ? value : 'unfiled';
}
