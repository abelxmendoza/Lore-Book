/**
 * Pure questions should be saved as conversation, but they must not become new
 * autobiographical memories. Mixed turns that contain a new user disclosure
 * remain ingestible.
 */

import { isPureInterrogative } from '../meaning/factualityResolutionService';

const AUTOBIOGRAPHICAL_DISCLOSURE_RE =
  /\bi\s+(?:am|was|have|had|started|stopped|met|went|did|feel|felt|think|thought|believe|want|need|work|worked|live|lived|made|built|released|got|left|joined|quit)\b/i;

export function isPureReadOnlyKnowledgeQuery(message: string): boolean {
  const text = message.trim();
  if (!text || !isPureInterrogative(text)) return false;
  return !AUTOBIOGRAPHICAL_DISCLOSURE_RE.test(text);
}
