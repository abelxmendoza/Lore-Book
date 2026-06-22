import type { StatusSignal } from './statusInferenceTypes';
import { extractTimeHint } from './statusProvenanceService';

function makeRelationshipSignal(
  title: string,
  status: StatusSignal['status'],
  text: string,
  evidence: string,
  confidence: number,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'relationship',
    inferredTitle: title,
    status,
    transition,
    timeHint: extractTimeHint(text),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}

const RELATIONSHIP_PATTERNS: Array<{
  re: RegExp;
  title: string;
  status: StatusSignal['status'];
  transition?: StatusSignal['transition'];
  confidence: number;
}> = [
  {
    re: /\bOscar\b[^.!?]{0,80}\b(?:dormant|haven'?t talked|before covid|since before covid)\b/i,
    title: 'Oscar friendship',
    status: 'dormant',
    confidence: 0.86,
  },
  {
    re: /\b(?:haven'?t talked (?:to )?(?:\w+ )?in weeks|not talked in weeks)\b/i,
    title: 'relationship',
    status: 'dormant',
    confidence: 0.8,
  },
  {
    re: /\bSol\b[^.!?]{0,80}\b(?:ghosted|blocked)\b/i,
    title: 'Sol relationship',
    status: 'blocked',
    transition: 'blocked',
    confidence: 0.88,
  },
  {
    re: /\bSol\b[^.!?]{0,80}\b(?:came back|reappeared|texted again)\b/i,
    title: 'Sol relationship',
    status: 'active',
    transition: 'revived',
    confidence: 0.84,
  },
  {
    re: /\b(?:still friends|we'?re friends)\b/i,
    title: 'friendship',
    status: 'current',
    confidence: 0.82,
  },
  {
    re: /\b(?:used to be best friend|former best friend|ex(?: girlfriend| boyfriend)?)\b/i,
    title: 'relationship',
    status: 'former',
    transition: 'ended',
    confidence: 0.84,
  },
];

export function inferRelationshipStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];

  for (const { re, title, status, transition, confidence } of RELATIONSHIP_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const resolvedTitle = title === 'relationship' && /\bOscar\b/i.test(text) ? 'Oscar friendship' : title;
    const resolvedTitle2 =
      title === 'relationship' && /\bSol\b/i.test(text) ? 'Sol relationship' : resolvedTitle;
    out.push(makeRelationshipSignal(resolvedTitle2, status, text, match[0], confidence, transition));
  }

  if (/\bOscar\b/i.test(text) && /\b(?:before covid|dormant|haven'?t talked)\b/i.test(text)) {
    if (!out.some((s) => /Oscar/i.test(s.inferredTitle ?? ''))) {
      out.push(makeRelationshipSignal('Oscar friendship', 'dormant', text, text.slice(0, 80), 0.88));
    }
  }

  if (/\bSol\b/i.test(text) && /\bblocked\b/i.test(text)) {
    if (!out.some((s) => /Sol/i.test(s.inferredTitle ?? ''))) {
      out.push(makeRelationshipSignal('Sol relationship', 'blocked', text, 'blocked', 0.88, 'blocked'));
    }
  }

  if (/\bSol\b/i.test(text) && /\b(?:reappeared|came back)\b/i.test(text)) {
    out.push(makeRelationshipSignal('Sol relationship', 'active', text, 'reappeared', 0.84, 'revived'));
  }

  return out;
}
