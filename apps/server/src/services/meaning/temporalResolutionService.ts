/**
 * Temporal resolution — past / present / future / desired status for statements.
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { TemporalContext, TemporalStatus } from './meaningResolutionTypes';
import { padForScan } from '../lexical/lexicalNormalizer';

type TemporalPattern = { re: RegExp; status: TemporalStatus };

const PATTERNS: TemporalPattern[] = [
  { re: /\b(?:will|going\s+to|gonna)\s+(?:work|move|start)\b/i, status: 'future' },
  { re: /\b(?:i\s+)?will\s+work\s+(?:at|for)\b/i, status: 'future' },
  { re: /\b(?:want\s+to|wish\s+(?:i|to)|hope\s+to|would\s+like\s+to)\s+(?:work|be|move|become)\b/i, status: 'desired' },
  { re: /\b(?:i\s+)?worked\s+(?:at|for|with)\b/i, status: 'past' },
  { re: /\b(?:i\s+)?used\s+to\s+(?:work|teach|train)\b/i, status: 'former' },
  { re: /\b(?:i\s+)?(?:work|working)\s+(?:at|for|with)\b/i, status: 'present' },
  { re: /\b(?:i\s+)?(?:am|i'm)\s+(?:a|an)\s+\w+/i, status: 'present' },
];

const WORK_EXTRACT = [
  { re: /\b(?:i\s+)?work(?:ed|ing)?\s+(?:at|for|with)\s+([A-Z][\w&'. -]{2,60})/gi, predicate: 'works_at' },
  { re: /\b(?:will|going\s+to)\s+work\s+(?:at|for)\s+([A-Z][\w&'. -]{2,60})/gi, predicate: 'will_work_at' },
  { re: /\bwant\s+to\s+work\s+(?:at|for)\s+([A-Z][\w&'. -]{2,60})/gi, predicate: 'wants_to_work_at' },
];

export function resolveTemporalContext(text: string, lexical: LexicalAnalysisResult): TemporalContext {
  const padded = padForScan(text);
  let defaultStatus: TemporalStatus = 'present';

  for (const { re, status } of PATTERNS) {
    if (re.test(text)) {
      defaultStatus = status;
      break;
    }
  }

  const statements: TemporalContext['statements'] = [];

  for (const { re, predicate } of WORK_EXTRACT) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const object = m[1].trim().replace(/[,.]$/, '');
      let status: TemporalStatus = defaultStatus;
      if (predicate === 'will_work_at') status = 'future';
      if (predicate === 'wants_to_work_at') status = 'desired';
      if (/\bworked\b/i.test(m[0])) status = 'past';
      statements.push({
        subject: 'user',
        predicate,
        object,
        status,
        cue: m[0],
      });
    }
  }

  for (const skill of lexical.skills) {
    if (/\bused\s+to\s+teach\b/i.test(text) && text.toLowerCase().includes(skill.name.toLowerCase())) {
      statements.push({
        subject: 'user',
        predicate: 'teaches',
        object: skill.name,
        status: 'past',
        cue: 'used to teach',
      });
    }
    if (/\bteach(?:es|ing)?\b/i.test(text) && text.toLowerCase().includes(skill.name.toLowerCase())) {
      statements.push({
        subject: 'user',
        predicate: 'teaches',
        object: skill.name,
        status: 'present',
        cue: 'teach',
      });
    }
  }

  if (padded.includes(' used to ') && defaultStatus === 'present') {
    defaultStatus = 'past';
  }

  return { defaultStatus, statements };
}

export function inferSkillTemporal(text: string, skillName: string): 'current' | 'former' | 'unknown' {
  const n = skillName.toLowerCase();
  const t = text.toLowerCase();
  if (new RegExp(`used\\s+to\\s+(?:teach|do|practice|train)\\s+${escapeRe(n)}`).test(t)) return 'former';
  if (new RegExp(`used\\s+to\\s+${escapeRe(n)}`).test(t)) return 'former';
  if (new RegExp(`(?:teach|do|practice|train|learning)\\s+${escapeRe(n)}`).test(t)) return 'current';
  return 'unknown';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
