import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const LANGUAGES = ['Japanese', 'Spanish', 'Italian', 'Korean', 'Portuguese', 'French', 'German'];

const LANGUAGE_SKILL_RE =
  /\b(Japanese|Spanish|Italian|Korean|Portuguese|French|German)\s+(?:language|class(?:es)?\s+language)\b/gi;

const LANGUAGE_ALONE_RE = /\b(?:learning|studying|speak(?:ing)?|fluent in)\s+(Japanese|Spanish|Italian|Korean|Portuguese)\b/gi;

/** "Japanese Class" is a group — not a language skill by itself. */
const LANGUAGE_CLASS_RE = /\b(Japanese|Spanish|Italian|Korean|Portuguese)\s+Class\b/i;

export function isLanguageClassNotSkill(text: string): boolean {
  if (!LANGUAGE_CLASS_RE.test(text)) return false;
  if (LANGUAGE_SKILL_RE.test(text)) return false;
  if (LANGUAGE_ALONE_RE.test(text)) return false;
  return true;
}

export function inferLanguageSkills(text: string): SkillCandidate[] {
  if (/\b(?:Japan\s+trip|went\s+to\s+Japan|visited\s+Japan)\b/i.test(text) && !/\b(?:learning|studying)\s+Japanese\b/i.test(text)) {
    return [];
  }

  if (isLanguageClassNotSkill(text)) return [];

  const out: SkillCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const skillRe = new RegExp(LANGUAGE_SKILL_RE.source, 'gi');
  while ((match = skillRe.exec(text)) !== null) {
    const lang = match[1].trim();
    addLanguage(out, seen, lang, text, match[0]);
  }

  const aloneRe = new RegExp(LANGUAGE_ALONE_RE.source, 'gi');
  while ((match = aloneRe.exec(text)) !== null) {
    const lang = match[1].trim();
    addLanguage(out, seen, lang, text, match[0]);
  }

  for (const lang of LANGUAGES) {
    if (!new RegExp(`\\b${lang}\\b`, 'i').test(text)) continue;
    if (/\b${lang}\s+Class\b/i.test(text) && !/\b(?:learning|studying|language)\b/i.test(text)) continue;
    if (/\b(?:Japan\s+trip|went\s+to\s+${lang})\b/i.test(text) && lang === 'Japanese') continue;
    addLanguage(out, seen, lang, text, lang);
  }

  return out;
}

function addLanguage(
  out: SkillCandidate[],
  seen: Set<string>,
  lang: string,
  text: string,
  evidence: string,
): void {
  const key = normalizeNameKey(lang);
  if (seen.has(key)) return;
  seen.add(key);

  out.push({
    displayName: lang,
    skillType: 'language',
    context: buildSkillContext(text, lang, { activity: evidence }),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.88,
    inferredNotConfirmed: true,
    requiresReview: false,
    promotionStatus: 'candidate',
  });
}
