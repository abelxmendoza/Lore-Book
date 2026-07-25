/**
 * Strip retired character-modal chat prefills that used example names (e.g. Maya).
 * Also clears those stuck drafts so they cannot reappear after a soft reload.
 */

const LEGACY_CORRECTION_PARAGRAPH =
  /\n*\s*If anything in their profile is wrong,\s*say it plainly[\s\S]*$/i;

const LEGACY_GROUPS_QUESTION =
  /^What teams,\s*companies,\s*or groups is .+? part of\?\s*/i;

/** True when the composer text is (or contains) the retired Maya/correction prefill. */
export function isLegacyCharacterChatPrefill(text: string): boolean {
  if (!text.trim()) return false;
  return (
    LEGACY_CORRECTION_PARAGRAPH.test(text) ||
    /\bactually her name is Maya\b/i.test(text) ||
    (LEGACY_GROUPS_QUESTION.test(text.trim()) && /coworker,\s*not my friend/i.test(text))
  );
}

/**
 * Remove retired prefill boilerplate. Returns '' when the whole draft was only
 * that boilerplate (so the composer stays empty with the focus chip).
 */
export function scrubLegacyComposerPrefill(text: string): string {
  if (!text) return text;
  let next = text.replace(LEGACY_CORRECTION_PARAGRAPH, '');
  next = next.replace(LEGACY_GROUPS_QUESTION, '');
  next = next.replace(/\bactually her name is Maya\b/gi, '');
  return next.replace(/\n{3,}/g, '\n\n').trim();
}
