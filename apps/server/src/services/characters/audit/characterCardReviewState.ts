/** Shared helpers for user decisions on character card audit (manual panel + rescan queue). */

export function isCharacterCardUserReviewed(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  const audit = metadata.card_audit_review as Record<string, unknown> | undefined;
  if (audit?.action) return true;
  return metadata.card_audit_locked === true;
}
