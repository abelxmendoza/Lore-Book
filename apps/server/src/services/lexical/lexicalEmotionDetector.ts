/**
 * Emotional tone detection from lexical cues (deterministic, pre-LLM).
 */
import type { LexicalEmotion } from './lexicalTypes';
import { padForScan } from './lexicalNormalizer';

type EmotionLexicon = {
  label: string;
  aliases: string[];
  valence: LexicalEmotion['valence'];
  intensity: LexicalEmotion['intensity'];
  weight: number;
};

const EMOTIONS: EmotionLexicon[] = [
  { label: 'joy', aliases: ['happy', 'excited', 'thrilled', 'grateful', 'proud', 'amazing'], valence: 'positive', intensity: 'high', weight: 0.85 },
  { label: 'contentment', aliases: ['content', 'peaceful', 'calm', 'relaxed', 'fine'], valence: 'positive', intensity: 'low', weight: 0.6 },
  { label: 'love', aliases: ['love', 'adore', 'cherish'], valence: 'positive', intensity: 'high', weight: 0.8 },
  { label: 'sadness', aliases: ['sad', 'depressed', 'down', 'heartbroken', 'miserable'], valence: 'negative', intensity: 'medium', weight: 0.8 },
  { label: 'anger', aliases: ['angry', 'furious', 'pissed', 'mad', 'rage'], valence: 'negative', intensity: 'high', weight: 0.85 },
  { label: 'anxiety', aliases: ['anxious', 'worried', 'nervous', 'stressed', 'overwhelmed'], valence: 'negative', intensity: 'medium', weight: 0.75 },
  { label: 'frustration', aliases: ['frustrated', 'annoyed', 'irritated'], valence: 'negative', intensity: 'medium', weight: 0.7 },
  { label: 'nostalgia', aliases: ['nostalgic', 'miss those days', 'remember when'], valence: 'mixed', intensity: 'medium', weight: 0.65 },
  { label: 'estrangement', aliases: ['estranged', 'cut off', 'no contact'], valence: 'negative', intensity: 'medium', weight: 0.8 },
  { label: 'hope', aliases: ['hopeful', 'optimistic', 'looking forward'], valence: 'positive', intensity: 'medium', weight: 0.7 },
];

const NEGATORS = /\b(not|never|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|hardly|barely)\b/;

export function detectLexicalEmotions(text: string): LexicalEmotion[] {
  const padded = padForScan(text);
  const hits: LexicalEmotion[] = [];

  for (const e of EMOTIONS) {
    for (const alias of e.aliases) {
      if (!padded.includes(` ${alias} `)) continue;
      const idx = padded.indexOf(` ${alias} `);
      const window = padded.slice(Math.max(0, idx - 30), idx + alias.length + 5);
      const negated = NEGATORS.test(window);
      hits.push({
        label: e.label,
        valence: negated ? flipValence(e.valence) : e.valence,
        intensity: e.intensity,
        cue: alias,
        confidence: negated ? e.weight * 0.6 : e.weight,
      });
      break;
    }
  }

  return dedupeEmotions(hits);
}

function flipValence(v: LexicalEmotion['valence']): LexicalEmotion['valence'] {
  if (v === 'positive') return 'negative';
  if (v === 'negative') return 'positive';
  return 'mixed';
}

function dedupeEmotions(emotions: LexicalEmotion[]): LexicalEmotion[] {
  const seen = new Set<string>();
  return emotions.filter((e) => {
    if (seen.has(e.label)) return false;
    seen.add(e.label);
    return true;
  });
}
