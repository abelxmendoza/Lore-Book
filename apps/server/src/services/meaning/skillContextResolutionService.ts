/**
 * Skill context resolution — hobby/paid, current/former, proficiency, enjoyment.
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { ResolvedSkill, TemporalContext } from './meaningResolutionTypes';
import { padForScan } from '../lexical/lexicalNormalizer';
import { inferSkillTemporal } from './temporalResolutionService';

function inferHobbyOrPaid(text: string, skillName: string): ResolvedSkill['hobbyOrPaid'] {
  const t = padForScan(text);
  const n = skillName.toLowerCase();
  if (/\bteach(?:es|ing)?\b/.test(t) && t.includes(n)) return 'paid';
  if (/\bfor\s+money\b/.test(t) && t.includes(n)) return 'paid';
  if (/\b(?:train|practice|do)\b/.test(t) && t.includes(n)) return 'hobby';
  if (/\b(?:worked as|job as)\b/.test(t)) return 'paid';
  return 'unknown';
}

export function resolveSkills(
  text: string,
  lexical: LexicalAnalysisResult,
  temporal: TemporalContext
): ResolvedSkill[] {
  const skills: ResolvedSkill[] = [];
  const seen = new Set<string>();

  for (const s of lexical.skills) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const currentOrFormer = inferSkillTemporal(text, s.name);
    const hobbyOrPaid = s.hobby_or_paid === 'unknown'
      ? inferHobbyOrPaid(text, s.name)
      : s.hobby_or_paid;

    skills.push({
      name: s.name,
      category: s.category,
      hobbyOrPaid,
      currentOrFormer,
      proficiencyHint: s.proficiency_hint,
      usageFrequencyHint: s.usage_frequency_hint,
      enjoymentHint: s.enjoyment_hint,
      loreContext: s.lore_context,
      confidence: s.confidence,
      resolutionReason: `lexical:${s.lore_context || 'skill_cue'}`,
      requiresConfirmation: hobbyOrPaid === 'paid' || currentOrFormer === 'former',
    });
  }

  // "I'm learning ROS2" pattern if not caught by lexical
  const learningRe = /\b(?:learning|studying|picking up|getting better at)\s+([A-Za-z0-9+#.][\w+#. -]{1,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = learningRe.exec(text)) !== null) {
    const name = m[1].trim().replace(/[,.]$/, '');
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({
      name,
      category: 'technical',
      hobbyOrPaid: 'unknown',
      currentOrFormer: 'current',
      proficiencyHint: 'improving',
      usageFrequencyHint: 'unknown',
      enjoymentHint: 'unknown',
      loreContext: m[0],
      confidence: 0.78,
      resolutionReason: 'learning_cue',
      requiresConfirmation: false,
    });
  }

  return skills;
}
