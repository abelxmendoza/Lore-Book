import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';
import { isBareGenericSkillWord } from './namedSkillInference';

const FIXING_OBJECT_RE =
  /\bfixing\s+(?:his|her|their|my|the)\s+([a-z][a-z\s]{2,30})/gi;

const WORKING_ON_RE =
  /\bworking\s+on\s+([A-Za-z0-9+#.][\w+#.\s-]{2,50})/gi;

const PRACTICED_BAND_RE = /\bpracticed?\s+(?:in\s+)?band\b/gi;

const OBJECT_TO_SKILL: Array<{ pattern: RegExp; displayName: string; skillType: SkillCandidate['skillType'] }> = [
  { pattern: /\bbike\b/i, displayName: 'Bike Repair', skillType: 'maintenance' },
  { pattern: /\bgarden(?:ing)?\b/i, displayName: 'Gardening', skillType: 'hobby' },
  { pattern: /\bband\b/i, displayName: 'Music / Band Practice', skillType: 'music' },
  { pattern: /\bnavigation\b/i, displayName: 'ROS2 Navigation', skillType: 'robotics' },
];

export function inferActivityToSkills(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const fixingRe = new RegExp(FIXING_OBJECT_RE.source, 'gi');
  while ((match = fixingRe.exec(text)) !== null) {
    const object = match[1].trim();
    const mapped = mapObjectToSkill(object, text);
    if (!mapped) continue;
    const key = normalizeNameKey(mapped.displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...mapped,
      context: buildSkillContext(text, mapped.displayName, {
        activity: match[0],
        object,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.82,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  const workingRe = new RegExp(WORKING_ON_RE.source, 'gi');
  while ((match = workingRe.exec(text)) !== null) {
    const domain = match[1].trim();
    if (isBareGenericSkillWord(domain)) continue;

    const displayName = domain.includes('ROS') ? 'ROS2' : domain;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName: normalizeDisplayName(displayName),
      skillType: /ros|robot|navigation/i.test(domain) ? 'robotics' : 'technical',
      context: buildSkillContext(text, displayName, {
        activity: match[0],
        object: domain,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.84,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  if (PRACTICED_BAND_RE.test(text)) {
    const displayName = 'Music / Band Practice';
    const key = normalizeNameKey(displayName);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        displayName,
        skillType: 'music',
        context: buildSkillContext(text, displayName, { activity: 'practiced in band' }),
        evidencePhrases: [text.match(PRACTICED_BAND_RE)?.[0] ?? 'practiced in band'],
        sourceMessageIds: [],
        confidence: 0.8,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function mapObjectToSkill(
  object: string,
  text: string,
): Pick<SkillCandidate, 'displayName' | 'skillType'> | null {
  for (const { pattern, displayName, skillType } of OBJECT_TO_SKILL) {
    if (pattern.test(object) || pattern.test(text)) {
      return { displayName, skillType };
    }
  }
  return null;
}

function normalizeDisplayName(name: string): string {
  if (/^ros2?$/i.test(name)) return name.toUpperCase();
  return name;
}

export function isBareVerbOnly(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return ['fixing', 'working', 'practicing', 'learning', 'doing'].includes(trimmed);
}
