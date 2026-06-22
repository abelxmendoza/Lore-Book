import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';
import { linkQuestItemToProject } from './questProjectLinker';

const FEATURE_NAMES = [
  'Lexical Analyzer',
  'LoreBook Parser',
  'Response Compiler',
  'Entity Gravity',
  'Character Audit Panel',
];

const FEATURE_RE =
  /\b(?:Build|Implement|Add|Ship)\s+((?:Lexical Analyzer|LoreBook Parser|Response Compiler|Entity Gravity|Character Audit Panel))\b/gi;

function collectMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

export function inferFeatureQuestItems(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const name of FEATURE_NAMES) {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, 'i');
    if (!re.test(text)) continue;
    const key = normalizeNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const linked = linkQuestItemToProject(name, text);
    out.push({
      displayName: linked.displayName,
      itemType: 'feature',
      context: buildQuestLogContext(text, name, {
        projectContext: linked.parentProjectName,
        lifeArea: 'product',
      }),
      evidencePhrases: [name],
      sourceMessageIds: [],
      confidence: 0.88,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  for (const match of collectMatches(text, FEATURE_RE)) {
    const featureName = match[1].trim();
    const displayName = featureName;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const linked = linkQuestItemToProject(featureName, text);
    out.push({
      displayName,
      itemType: 'feature',
      context: buildQuestLogContext(text, displayName, {
        projectContext: linked.parentProjectName,
        lifeArea: 'product',
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
