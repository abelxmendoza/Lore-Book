import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';
import { inferNamedSkills } from './namedSkillInference';

const MARTIAL_ART_RE =
  /\b(Muay Thai|Boxing|Kickboxing|BJJ|Brazilian Jiu-Jitsu|Wrestling|MMA|Judo)\b/gi;

const DURATION_RE = /\bfor\s+(\d+)\s+(months?|years?)\b/i;
const FIGHT_RECORD_RE = /\b(\d+-\d+)\s+in\s+(Muay Thai|Boxing|BJJ|MMA)\b/i;
const TEACHING_RE = /\b(?:used to teach|taught|teaching)\s+(Muay Thai|Boxing|Kickboxing|BJJ|MMA|Judo)\b/gi;

export function inferMartialArtSkills(text: string): SkillCandidate[] {
  const named = inferNamedSkills(text).filter((s) => s.skillType === 'martial_art');
  const out: SkillCandidate[] = [];

  for (const skill of named) {
    const duration = text.match(DURATION_RE)?.[0];
    const fightRecord = text.match(FIGHT_RECORD_RE);
    const teaching = TEACHING_RE.test(text);

    out.push({
      ...skill,
      context: buildSkillContext(text, skill.displayName, {
        ...skill.context,
        frequencyHint: duration,
        hobbyOrPaid: teaching ? 'paid' : skill.context.hobbyOrPaid,
        currentOrFormer: /\bused to\b/i.test(text) ? 'former' : 'current',
        proficiencyHint: fightRecord
          ? `record ${fightRecord[1]}`
          : duration
            ? 'beginner'
            : skill.context.proficiencyHint,
        activity: fightRecord?.[0] ?? skill.context.activity,
      }),
      confidence: teaching ? 0.92 : skill.confidence,
      requiresReview: teaching,
    });
  }

  return out.length > 0 ? out : named;
}

export function isMartialArtName(name: string): boolean {
  return new RegExp(MARTIAL_ART_RE.source, 'i').test(name);
}
