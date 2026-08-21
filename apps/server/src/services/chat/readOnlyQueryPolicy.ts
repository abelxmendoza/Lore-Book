/**
 * Pure questions should be saved as conversation, but they must not become new
 * autobiographical memories. Mixed turns that contain a new user disclosure
 * remain ingestible.
 */

const INTERROGATIVE_START =
  /^(?:what|who|when|where|why|how|which|whose|whom|am|is|are|was|were|do|does|did|have|has|had|can|could|would|should|will|may|might)\b/i;

const AUTOBIOGRAPHICAL_DISCLOSURE_RE =
  /\bi\s+(?:am|was|have|had|started|stopped|met|went|did|feel|felt|think|thought|believe|want|need|work|worked|live|lived|made|built|released|got|left|joined|quit)\b/i;

function isPureInterrogative(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    /[.!?]\s*i\s+(?:am|was|have|had|started|stopped|met|went|did|felt|worked|lived|made|built|released|got|left|joined|quit)\b/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  return INTERROGATIVE_START.test(trimmed) || trimmed.endsWith('?');
}

export function isPureReadOnlyKnowledgeQuery(message: string): boolean {
  const text = message.trim();
  if (!text || !isPureInterrogative(text)) return false;
  return !AUTOBIOGRAPHICAL_DISCLOSURE_RE.test(text);
}
