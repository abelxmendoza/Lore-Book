import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { QuestLogCandidate } from './questLogInferenceTypes';
import { buildQuestLogContext } from './questLogProvenanceService';

const TASK_VERB_RE =
  /\b(run|add|fix|apply|verify|test|deploy|update|clean up|restart|migrate|configure|set up|implement)\s+([^.!?,]{4,90})/gi;

const NAMED_TASKS: Array<{ pattern: RegExp; displayName: string }> = [
  { pattern: /\bRun MVP diagnostic\b/i, displayName: 'Run MVP diagnostic' },
  { pattern: /\bAdd DATABASE_URL to GitHub secrets\b/i, displayName: 'Add DATABASE_URL to GitHub secrets' },
  { pattern: /\bApply HNSW migration\b/i, displayName: 'Apply HNSW migration' },
  { pattern: /\bFix Project suggestion guard\b/i, displayName: 'Fix Project suggestion guard' },
  { pattern: /\bRestart dev server\b/i, displayName: 'Restart dev server' },
];

function collectMatches(text: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

export function inferTasks(text: string): QuestLogCandidate[] {
  const out: QuestLogCandidate[] = [];
  const seen = new Set<string>();

  for (const { pattern, displayName } of NAMED_TASKS) {
    if (!pattern.test(text)) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeTask(displayName, text, pattern.source));
  }

  for (const match of collectMatches(text, TASK_VERB_RE)) {
    const verb = match[1];
    const object = match[2].trim().replace(/\s+/g, ' ');
    const displayName = `${titleCase(verb)} ${object}`.slice(0, 90).trim();
    const key = normalizeNameKey(displayName);
    if (!object || seen.has(key) || object.split(/\s+/).length < 2) continue;
    seen.add(key);
    out.push(makeTask(displayName, text, match[0]));
  }

  return out;
}

function makeTask(displayName: string, text: string, evidence: string): QuestLogCandidate {
  return {
    displayName,
    itemType: 'task',
    context: buildQuestLogContext(text, displayName, { statusHint: 'planned' }),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.87,
    inferredNotConfirmed: true,
    requiresReview: false,
    promotionStatus: 'candidate',
  };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isBareTaskLabel(name: string): boolean {
  return normalizeNameKey(name) === 'task';
}
