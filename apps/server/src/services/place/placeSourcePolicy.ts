import type { PlaceCognitionInput, PlaceSourceType } from './placeTypes';

const ALLOWED: ReadonlySet<PlaceSourceType> = new Set([
  'chat',
  'journal',
  'user_import',
  'metadata',
  'test',
]);

export function isPlaceSourceAllowed(input: Pick<PlaceCognitionInput, 'sourceType' | 'userConfirmed'>): boolean {
  if (input.userConfirmed) return true;
  const source = input.sourceType ?? 'chat';
  return ALLOWED.has(source);
}

export function isSyntheticNarrationSpan(span: string): boolean {
  const n = (span ?? '').trim().toLowerCase();
  return /^(?:user\s+mentioned|the\s+user\s+said|user\s+stated|the\s+assistant\s+noted|the\s+conversation\s+discussed|it\s+was\s+mentioned)\b/.test(
    n,
  );
}

export function evidenceLooksGenerated(text: string): boolean {
  const n = (text ?? '').trim().toLowerCase();
  if (!n) return false;
  return /^(?:user\s+mentioned|the\s+user\s+(?:said|stated)|assistant\s+noted|in\s+summary|as\s+discussed)\b/.test(n);
}
