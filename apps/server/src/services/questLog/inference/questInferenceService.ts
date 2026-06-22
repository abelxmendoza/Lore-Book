import { normalizeNameKey } from '../../../utils/nameNormalization';
import { PROJECT_BOOK_ENTITIES } from './questLogInferenceTypes';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';

const QUEST_PATTERNS: Array<{ re: RegExp; label: (m: RegExpExecArray) => string; confidence: number }> = [
  {
    re: /\b(?:I want to|I need to|I'?m trying to|my goal is|I should focus on|I'?m building toward)\s+([^.!?,]{4,80})/gi,
    label: (m) => titleCaseQuest(m[1]),
    confidence: 0.88,
  },
  {
    re: /\b(?:Launch|Ship|Build|Get)\s+([A-Z][A-Za-z0-9\s/&'-]{2,60})\b/g,
    label: (m) => `${m[1].trim().split(/\s+/).slice(0, 6).join(' ')}`,
    confidence: 0.86,
  },
];

const NAMED_QUESTS: Array<{ pattern: RegExp; displayName: string; lifeArea?: QuestLogCandidate['context']['lifeArea'] }> = [
  { pattern: /\bLaunch LoreBook\b/i, displayName: 'Launch LoreBook', lifeArea: 'product' },
  { pattern: /\bget (?:a )?robotics\/?AI job\b/i, displayName: 'Get robotics/AI job', lifeArea: 'career' },
  { pattern: /\bmove out\b/i, displayName: 'Move out', lifeArea: 'family' },
  { pattern: /\bpay off debt\b/i, displayName: 'Pay off debt', lifeArea: 'finance' },
  { pattern: /\bbuild a life memory os\b/i, displayName: 'Build a life memory OS', lifeArea: 'product' },
];

function collectMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

function titleCaseQuest(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function inferQuests(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName, lifeArea } of NAMED_QUESTS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeQuest(displayName, text, lifeArea, pattern.source));
  }

  for (const { re, label, confidence } of QUEST_PATTERNS) {
    for (const match of collectMatches(text, re)) {
      const displayName = label(match).trim();
      const key = normalizeNameKey(displayName);
      if (!displayName || seen.has(key) || isProjectEntityOnly(displayName)) continue;
      seen.add(key);
      out.push({
        displayName,
        itemType: 'quest',
        context: buildQuestLogContext(text, displayName),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function makeQuest(
  displayName: string,
  text: string,
  lifeArea: QuestLogCandidate['context']['lifeArea'],
  evidence: string,
): QuestLogCandidate {
  return {
    displayName,
    itemType: 'quest',
    context: buildQuestLogContext(text, displayName, { lifeArea }),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.9,
    inferredNotConfirmed: true,
    requiresReview: false,
    promotionStatus: 'candidate',
  };
}

function isProjectEntityOnly(name: string): boolean {
  return PROJECT_BOOK_ENTITIES.has(normalizeNameKey(name));
}
