import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { SkillCandidate } from './skillInferenceTypes';
import { buildSkillContext } from './skillProvenanceService';

const MARTIAL_ARTS = [
  'Muay Thai',
  'Boxing',
  'Kickboxing',
  'BJJ',
  'Brazilian Jiu-Jitsu',
  'Wrestling',
  'MMA',
  'Judo',
  'Karate',
];

const PROGRAMMING = ['C++', 'Python', 'TypeScript', 'JavaScript', 'Rust', 'Java', 'Go'];

const TOOLS = ['ROS2', 'ROS', 'OpenCV', 'Docker', 'Kubernetes', 'React'];

const CREATIVE_HOBBIES = [
  'Photography',
  'Gardening',
  'Beer Brewing',
  'Front End Development',
  'Bike Repair',
];

const MARTIAL_RE =
  /\b(Muay Thai|Boxing|Kickboxing|BJJ|Brazilian Jiu-Jitsu|Wrestling|MMA|Judo|Karate)\b/gi;

const TECH_RE = /\b(ROS2|ROS|C\+\+|Python|OpenCV|TypeScript|JavaScript)\b/gi;

const HOBBY_RE = /\b(Photography|Gardening|Beer Brewing|Front End Development)\b/gi;

export const BARE_GENERIC_SKILL_WORDS = new Set([
  'doing',
  'working',
  'fixing',
  'learning',
  'practicing',
  'helped',
  'talked',
  'went',
  'saw',
  'good',
  'better',
  'project',
  'app',
]);

export function isBareGenericSkillWord(name: string): boolean {
  return BARE_GENERIC_SKILL_WORDS.has(normalizeNameKey(name));
}

export function isProjectOrAppWord(name: string): boolean {
  const key = normalizeNameKey(name);
  return key === 'project' || key === 'app' || key === 'application';
}

export function inferNamedSkills(text: string): SkillCandidate[] {
  const out: SkillCandidate[] = [];
  const seen = new Set<string>();

  const allPatterns: Array<{
    re: RegExp;
    type: SkillCandidate['skillType'] | ((name: string) => SkillCandidate['skillType']);
    confidence: number;
  }> = [
    { re: new RegExp(MARTIAL_RE.source, 'gi'), type: 'martial_art', confidence: 0.92 },
    { re: new RegExp(TECH_RE.source, 'gi'), type: classifyTechSkill, confidence: 0.9 },
    { re: new RegExp(HOBBY_RE.source, 'gi'), type: 'creative', confidence: 0.86 },
  ];

  for (const { re, type, confidence } of allPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const displayName = normalizeSkillName(match[1]);
      const key = normalizeNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      const skillType = typeof type === 'function' ? type(displayName) : type;
      out.push({
        displayName,
        skillType,
        context: buildSkillContext(text, displayName),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  for (const name of [...MARTIAL_ARTS, ...PROGRAMMING, ...TOOLS, ...CREATIVE_HOBBIES]) {
    if (!new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(text)) continue;
    const key = normalizeNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName: name,
      skillType: classifyNamedSkill(name),
      context: buildSkillContext(text, name),
      evidencePhrases: [name],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function classifyTechSkill(name: string): SkillCandidate['skillType'] {
  if (/^(c\+\+|python|typescript|javascript|rust|java|go)$/i.test(name)) return 'programming_language';
  if (/^ros2?$/i.test(name)) return 'robotics';
  return 'software_tool';
}

function classifyNamedSkill(name: string): SkillCandidate['skillType'] {
  if (MARTIAL_ARTS.some((m) => normalizeNameKey(m) === normalizeNameKey(name))) return 'martial_art';
  if (PROGRAMMING.some((p) => normalizeNameKey(p) === normalizeNameKey(name))) return 'programming_language';
  if (/^ros2?$/i.test(name)) return 'robotics';
  if (/opencv|docker|kubernetes|react/i.test(name)) return 'software_tool';
  if (/photography|gardening|brewing|front end/i.test(name)) return 'creative';
  if (/bike repair/i.test(name)) return 'maintenance';
  return 'technical';
}

function normalizeSkillName(raw: string): string {
  if (/^c\+\+$/i.test(raw.trim())) return 'C++';
  if (/^ros2?$/i.test(raw.trim())) return raw.toUpperCase().startsWith('ROS') ? raw.toUpperCase() : raw;
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
