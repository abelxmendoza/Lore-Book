/**
 * Skill graph inference — maps work activities to professional skills.
 * Activities become skill candidates; repeated mentions elevate confidence.
 */
import type { HistoryContext, InferredSkillAssociation } from '../inferenceAssociationTypes';
import { inferenceBase } from '../inferenceAssociationTypes';
import {
  SKILL_ESTABLISHED_THRESHOLD,
  SKILL_EXPERT_THRESHOLD,
  type SkillProgressionRecord,
  type SkillProficiencyTrend,
} from './workplaceTypes';

export interface WorkActivityCandidate {
  surface: string;
  kind: 'SKILL' | 'TASK' | 'WORK_ACTIVITY';
  confidence: number;
  evidencePhrase: string;
}

const ACTIVITY_PATTERNS: Array<{
  re: RegExp;
  kind: WorkActivityCandidate['kind'];
  skillTags: string[];
  category: string;
}> = [
  {
    re: /\bArUco\s+calibration\b/gi,
    kind: 'SKILL',
    skillTags: ['ArUco calibration', 'computer vision', 'robotics calibration'],
    category: 'robotics',
  },
  {
    re: /\bgripper\s+swaps?\b/gi,
    kind: 'TASK',
    skillTags: ['gripper maintenance', 'robot maintenance'],
    category: 'robotics',
  },
  {
    re: /\blive\s+robot\s+support\b/gi,
    kind: 'WORK_ACTIVITY',
    skillTags: ['live robot support', 'robot operations', 'field support'],
    category: 'operations',
  },
];

const DOING_LIST_RE = /\b(?:was\s+)?doing\s+(.+?)(?:\s+at\s+[A-Z]|\.\s*$)/i;

function normSkill(s: string): string {
  return s.toLowerCase().trim();
}

export function extractWorkActivities(text: string): WorkActivityCandidate[] {
  const found: WorkActivityCandidate[] = [];

  for (const pattern of ACTIVITY_PATTERNS) {
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(text)) !== null) {
      found.push({
        surface: m[0],
        kind: pattern.kind,
        confidence: pattern.kind === 'SKILL' ? 0.88 : 0.8,
        evidencePhrase: m[0],
      });
    }
  }

  const doingMatch = DOING_LIST_RE.exec(text);
  if (doingMatch?.[1]) {
    const parts = doingMatch[1]
      .split(/,|\band\b/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2);
    for (const part of parts) {
      if (found.some((f) => f.surface.toLowerCase() === part.toLowerCase())) continue;
      found.push({
        surface: part,
        kind: /calibration|programming|design/i.test(part) ? 'SKILL' : 'TASK',
        confidence: 0.72,
        evidencePhrase: doingMatch[0],
      });
    }
  }

  return found;
}

function proficiencyFromFrequency(frequency: number): SkillProficiencyTrend {
  if (frequency >= SKILL_EXPERT_THRESHOLD) return 'expert_candidate';
  if (frequency >= SKILL_ESTABLISHED_THRESHOLD) return 'established';
  return 'emerging';
}

export function buildSkillGraphInferences(input: {
  text: string;
  messageId: string;
  history: HistoryContext;
  userLabel?: string;
  /** Simulated or tracked mention counts for confidence growth. */
  skillMentionCounts?: Map<string, number>;
}): {
  skills: InferredSkillAssociation[];
  skillProgressions: SkillProgressionRecord[];
  skillGraph: { root: string; children: string[] };
} {
  const { text, messageId, history } = input;
  const userLabel = input.userLabel ?? 'User';
  const mentionCounts = input.skillMentionCounts ?? new Map<string, number>();
  const activities = extractWorkActivities(text);
  const skills: InferredSkillAssociation[] = [];
  const skillProgressions: SkillProgressionRecord[] = [];
  const graphChildren = new Set<string>();

  const broadSkills = [
    'robotics',
    'field operations',
    'troubleshooting',
    'robot deployment',
    'customer-facing support',
  ];

  if (activities.length > 0 || /\bworked\s+at\b/i.test(text)) {
    for (const broad of broadSkills) {
      const freq = (mentionCounts.get(normSkill(broad)) ?? 0) + 1;
      const known = history.skills.has(normSkill(broad));
      const confidence = known ? Math.min(0.95, 0.78 + freq * 0.02) : 0.72 + Math.min(freq * 0.03, 0.15);
      skills.push({
        ...inferenceBase(messageId, [text.slice(0, 80)], confidence, 'workplace_broad_skill'),
        subjectName: userLabel,
        skill: broad,
        category: 'professional',
        subjectKind: 'user',
      });
      graphChildren.add(broad);
    }
  }

  for (const pattern of ACTIVITY_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (!pattern.re.test(text)) continue;
    pattern.re.lastIndex = 0;
    const m = pattern.re.exec(text);
    const evidence = m?.[0] ?? pattern.re.source;

    for (const tag of pattern.skillTags) {
      const key = normSkill(tag);
      const prev = mentionCounts.get(key) ?? 0;
      const frequency = prev + 1;
      const known = history.skills.has(key);
      let confidence = pattern.kind === 'SKILL' ? 0.85 : 0.78;
      if (known) confidence = Math.min(0.96, confidence + 0.08);
      if (frequency >= SKILL_ESTABLISHED_THRESHOLD) confidence = Math.min(0.94, confidence + 0.06);
      if (frequency >= SKILL_EXPERT_THRESHOLD) confidence = Math.min(0.97, confidence + 0.04);

      skills.push({
        ...inferenceBase(
          messageId,
          [evidence],
          confidence,
          frequency >= SKILL_ESTABLISHED_THRESHOLD ? 'established_skill' : 'activity_skill_candidate'
        ),
        subjectName: userLabel,
        skill: tag,
        category: pattern.category,
        subjectKind: 'user',
      });

      skillProgressions.push({
        skill: tag,
        category: pattern.category,
        confidence,
        frequency,
        proficiencyTrend: proficiencyFromFrequency(frequency),
        inferredNotConfirmed: true,
      });
      graphChildren.add(tag);
    }
  }

  return {
    skills,
    skillProgressions,
    skillGraph: { root: 'Robotics', children: [...graphChildren] },
  };
}

export function applySkillFrequencyBoost(
  skills: InferredSkillAssociation[],
  mentionCount: number
): InferredSkillAssociation[] {
  if (mentionCount < SKILL_ESTABLISHED_THRESHOLD) return skills;
  return skills.map((s) => ({
    ...s,
    confidence: Math.min(0.97, s.confidence + 0.05),
    inferenceReason: 'established_skill_frequency',
    requiresReview: mentionCount < SKILL_EXPERT_THRESHOLD,
  }));
}
