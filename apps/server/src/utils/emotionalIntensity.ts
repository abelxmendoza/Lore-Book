/**
 * Heuristic emotional intensity derivation.
 *
 * Returns a 0.0–1.0 score representing how emotionally charged a journal entry is.
 * Used at ingestion time to seed emotional_intensity on journal_entries.
 * High-intensity entries decay slower (see migration 20260529000007).
 *
 * This is RETRIEVAL WEIGHTING ONLY — no psychological conclusions.
 * "More emotionally intense" means "harder to suppress over time," not
 * "user needs therapy" or "this was a bad day."
 */

const STRONG_EMOTION_MOODS = new Set([
  'angry', 'devastated', 'terrified', 'ecstatic', 'overwhelmed',
  'heartbroken', 'euphoric', 'furious', 'grief', 'elated', 'devastated',
]);

const MEDIUM_EMOTION_MOODS = new Set([
  'sad', 'excited', 'anxious', 'grateful', 'joyful', 'proud',
  'disappointed', 'hopeful', 'frustrated', 'relieved', 'moved', 'inspired',
]);

// Phrases that reliably signal high emotional intensity in journal writing
const HIGH_INTENSITY_PHRASES = [
  'never forget', 'changed everything', 'worst day', 'best day',
  'broke my heart', 'so proud', 'so scared', 'can\'t believe',
  'tearing up', 'crying', 'couldn\'t stop', 'life changing',
  'realized i', 'finally understood', 'hit me hard',
  'made me realize', 'i love', 'i hate', 'i miss',
];

export function deriveEmotionalIntensity(content: string, mood?: string | null): number {
  let score = 0.0;
  const lower = (content ?? '').toLowerCase();
  const moodLower = (mood ?? '').toLowerCase();

  // Mood field contributes up to 0.40
  if (STRONG_EMOTION_MOODS.has(moodLower)) score += 0.40;
  else if (MEDIUM_EMOTION_MOODS.has(moodLower)) score += 0.20;
  // Partial match (e.g. "really anxious")
  else if ([...MEDIUM_EMOTION_MOODS].some(m => moodLower.includes(m))) score += 0.10;

  // High-intensity phrases contribute up to 0.40
  const phraseMatches = HIGH_INTENSITY_PHRASES.filter(p => lower.includes(p)).length;
  score += Math.min(0.40, phraseMatches * 0.12);

  // Exclamation marks as a rough intensity proxy — contributes up to 0.20
  const exclamations = (content.match(/!/g) ?? []).length;
  score += Math.min(0.20, exclamations * 0.06);

  return Math.min(1.0, score);
}
