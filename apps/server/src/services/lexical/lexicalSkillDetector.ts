/**
 * Skill signal extraction — hobbies, paid work, proficiency, enjoyment cues.
 */
import type { LexicalSkillSignal } from './lexicalTypes';
import { normalizeLexicalText, padForScan } from './lexicalNormalizer';

const SKILL_PATTERNS: Array<{
  re: RegExp;
  map: (match: RegExpExecArray, text: string) => Partial<LexicalSkillSignal> | null;
}> = [
  {
    re: /\b(?:getting better at|improving (?:at|in)|better at)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      proficiency_hint: 'improving',
      hobby_or_paid: 'unknown',
      lore_context: m[0],
      confidence: 0.8,
    }),
  },
  {
    re: /\b(?:learning|studying|picking up)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      proficiency_hint: 'beginner',
      hobby_or_paid: 'unknown',
      lore_context: m[0],
      confidence: 0.78,
    }),
  },
  {
    re: /\b([A-Za-z][\w+#. -]{1,30})\s+is\s+still\s+my\s+main\s+thing\b/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      hobby_or_paid: 'hobby',
      enjoyment_hint: 'high',
      proficiency_hint: 'advanced',
      lore_context: 'main thing',
      confidence: 0.9,
    }),
  },
  {
    re: /\b(?:train(?:ing)?|practice|practicing)\s+([A-Za-z][\w+#. -]{1,40})/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      hobby_or_paid: 'hobby',
      usage_frequency_hint: 'weekly',
      lore_context: m[0],
      confidence: 0.72,
    }),
  },
  {
    re: /\b(?:worked as|job as|role as)\s+(?:a\s+)?([a-z][\w\s-]{2,40})/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      hobby_or_paid: 'paid',
      category: 'professional',
      lore_context: m[0],
      confidence: 0.75,
    }),
  },
  {
    re: /\b(?:love|obsessed with|passionate about)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi,
    map: (m) => ({
      name: cleanSkillName(m[1]),
      enjoyment_hint: 'high',
      hobby_or_paid: 'hobby',
      lore_context: m[0],
      confidence: 0.7,
    }),
  },
];

const CATEGORY_HINTS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(ros2?|python|typescript|react|kubernetes|docker|sql|c\+\+|rust)\b/i, category: 'technical' },
  { re: /\b(muay thai|bjj|jiu[-\s]?jitsu|boxing|wrestling|karate|judo)\b/i, category: 'physical' },
  { re: /\b(cooking|painting|music|writing|photography)\b/i, category: 'creative' },
];

function cleanSkillName(raw: string): string {
  return raw.trim().replace(/[,.]$/, '');
}

function inferCategory(name: string): string {
  const n = normalizeLexicalText(name);
  for (const { re, category } of CATEGORY_HINTS) {
    if (re.test(n)) return category;
  }
  return 'other';
}

function inferHobbyOrPaid(text: string, skillName: string): LexicalSkillSignal['hobby_or_paid'] {
  const padded = padForScan(text);
  const n = normalizeLexicalText(skillName);
  if (/\b(worked at|employed|job|salary|paid)\b/.test(padded) && padded.includes(n)) return 'both';
  if (/\b(main thing|hobby|train|practice|love)\b/.test(padded) && padded.includes(n)) return 'hobby';
  return 'unknown';
}

export function detectLexicalSkills(text: string): LexicalSkillSignal[] {
  const skills: LexicalSkillSignal[] = [];
  const seen = new Set<string>();

  for (const { re, map } of SKILL_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const partial = map(m, text);
      if (!partial?.name) continue;
      const key = normalizeLexicalText(partial.name);
      if (seen.has(key)) continue;
      seen.add(key);

      skills.push({
        name: partial.name,
        category: partial.category ?? inferCategory(partial.name),
        hobby_or_paid: partial.hobby_or_paid ?? inferHobbyOrPaid(text, partial.name),
        proficiency_hint: partial.proficiency_hint ?? 'unknown',
        usage_frequency_hint: partial.usage_frequency_hint ?? 'unknown',
        enjoyment_hint: partial.enjoyment_hint ?? 'unknown',
        lore_context: partial.lore_context ?? '',
        confidence: partial.confidence ?? 0.6,
      });
    }
  }

  return skills;
}
