/**
 * Shared named-chat-subject helpers — imported by apps/server's
 * workingMemoryAssembler to detect when a question explicitly names a
 * different subject than the client-supplied focus (e.g. the user clicked
 * into a character's page, then typed "tell me about someone else").
 */

/**
 * Extract an explicitly named subject from a chat question, e.g.
 * "Who is Maria?" -> "Maria". Deliberately narrow — only "who is/who's X"
 * identification phrasing, NOT generic "about X"/"regarding X" wording:
 * those already carry their own, more specific intent (e.g. "what do you
 * remember about X" is a relationship question, "what do you know about X"
 * is a person question) via the caller's own intent rules, and this
 * function's whole purpose is to override intent to PERSON_QUERY — matching
 * "about X" broadly would silently collapse those distinctions. Returns
 * null rather than guessing when the phrasing is ambiguous.
 */
export function parseNamedChatSubject(question: string): string | null {
  const trimmed = question?.trim();
  if (!trimmed) return null;

  // "who"/"Who" case-insensitive (it's often sentence-initial), but the
  // captured name itself must still start with a capital letter — an `i`
  // flag on the whole pattern would defeat that proper-noun requirement.
  const match = trimmed.match(
    /\b[Ww]ho(?:'s| is)\s+([A-Z][a-zA-Z''-]*(?:\s+[A-Z][a-zA-Z''-]*){0,2})\b/,
  );
  if (!match) return null;

  const candidate = match[1].trim();
  // Guard against sentence-initial capitalization false positives
  // ("who's To blame", "who is The one").
  if (/^(?:To|The|My|Your|His|Her|Their|Our|This|That|It)$/i.test(candidate)) {
    return null;
  }
  return candidate;
}

/**
 * Loose equality between two subject-name strings — used to decide whether a
 * client-supplied focus still matches what the question is actually naming,
 * not full entity resolution (no aliases, no fuzzy typo tolerance). Matches
 * on exact normalized string, first-token (given name), or substring
 * containment in either direction.
 */
export function subjectNamesMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const firstA = na.split(/\s+/)[0];
  const firstB = nb.split(/\s+/)[0];
  if (firstA === firstB) return true;

  return na.includes(nb) || nb.includes(na);
}
