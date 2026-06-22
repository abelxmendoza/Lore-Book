import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';

const GOAL_PATTERNS: Array<{ re: RegExp; displayName: (m: RegExpExecArray) => string; lifeArea?: QuestLogCandidate['context']['lifeArea'] }> = [
  {
    re: /\b(?:goal is to|want to|hoping to)\s+([^.!?,]{4,80})/gi,
    displayName: (m) => titleCase(m[1]),
  },
  { re: /\bWork at SpaceX\b/i, displayName: () => 'Work at SpaceX', lifeArea: 'career' },
  { re: /\bImprove ROS2\b/i, displayName: () => 'Improve ROS2', lifeArea: 'product' },
  { re: /\bHave LoreBook remember everything\b/i, displayName: () => 'Have LoreBook remember everything', lifeArea: 'product' },
  { re: /\bPay (?:off|down) debt\b/i, displayName: () => 'Pay down debt', lifeArea: 'finance' },
];

function collectMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

function titleCase(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function inferGoals(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const { re, displayName, lifeArea } of GOAL_PATTERNS) {
    for (const match of collectMatches(text, re)) {
      const name = displayName(match).trim();
      const key = normalizeNameKey(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({
        displayName: name,
        itemType: 'goal',
        context: buildQuestLogContext(text, name, { lifeArea }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.86,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}
