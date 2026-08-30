export const DOCUMENT_SUBTYPES = [
  'passport',
  'drivers_license',
  'diploma',
  'certificate',
  'other_id',
] as const;

export type DocumentSubtype = (typeof DOCUMENT_SUBTYPES)[number];

export function isDocumentSubtype(value: unknown): value is DocumentSubtype {
  return typeof value === 'string' && DOCUMENT_SUBTYPES.includes(value as DocumentSubtype);
}

export function subtypeForMetadata(metadata: Record<string, unknown> | null | undefined): DocumentSubtype | null {
  const value = metadata?.document_subtype;
  return isDocumentSubtype(value) ? value : null;
}
