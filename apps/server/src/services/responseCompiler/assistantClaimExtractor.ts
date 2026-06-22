import { randomUUID } from 'crypto';

import type { AssistantClaim, AssistantClaimType } from './responseCompilerTypes';
import { classifyStatementKind } from './inferenceClassifier';
import { detectCertainty } from './uncertaintyDetector';

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

type ClaimPattern = {
  type: AssistantClaimType;
  pattern: RegExp;
  build: (match: RegExpMatchArray, sentence: string) => string | null;
};

const PATTERNS: ClaimPattern[] = [
  {
    type: 'relationship_claim',
    pattern:
      /\b((?:one of (?:your|the user's) )?(?:closest|best|good|old|childhood|middle school|high school|college)?\s*(?:friends?|friendship))\b[^.!?]*/i,
    build: (_m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
  {
    type: 'relationship_claim',
    pattern: /\b(was|is|were|are)\s+(?:one of\s+)?(?:your|the user's)\s+([^,.!?]+?)\s+(?:friend|friends)\b/i,
    build: (m, sentence) => {
      const role = m[2]?.trim();
      return role ? `${role} was/is a friend of the user` : sentence;
    },
  },
  {
    type: 'school_claim',
    pattern:
      /\b(attended|went to|studied at|graduated from)\s+([A-Z][A-Za-z0-9\s'-]{2,}(?:School|College|University|Academy|Institute)?)\b/i,
    build: (m, sentence) => {
      const who = extractSubjectName(sentence) ?? 'Subject';
      return `${who} attended ${m[2].trim()}`;
    },
  },
  {
    type: 'school_claim',
    pattern: /\b([A-Z][A-Za-z0-9\s'-]+(?:School|College|University|Middle School|High School))\b/i,
    build: (m, sentence) => {
      if (!/\b(school|attended|went|together|class|band)\b/i.test(sentence)) return null;
      const who = extractSubjectName(sentence) ?? 'Subject';
      return `${who} attended ${m[1].trim()}`;
    },
  },
  {
    type: 'group_claim',
    pattern: /\b(participated in|played in|member of|in the)\s+(?:the\s+)?([a-z\s]+(?:band|team|club|group|crew|ensemble))\b/i,
    build: (m, sentence) => {
      const who = extractSubjectName(sentence) ?? 'Subject';
      return `${who} participated in ${m[2].trim()}`;
    },
  },
  {
    type: 'work_claim',
    pattern: /\b(works? at|worked at|employed (?:at|by)|job at)\s+([A-Z][A-Za-z0-9\s&'.-]{2,})\b/i,
    build: (m) => `User works at ${m[2].trim()}`,
  },
  {
    type: 'work_claim',
    pattern: /\b(you currently work at|you work at)\s+([A-Z][A-Za-z0-9\s&'.-]{2,})\b/i,
    build: (m) => `User currently works at ${m[2].trim()}`,
  },
  {
    type: 'event_claim',
    pattern: /\b(went to|attended|happened at|took place at)\s+([A-Z][A-Za-z0-9\s'-]{2,})\b/i,
    build: (m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
  {
    type: 'timeline_claim',
    pattern: /\b(in|during|back in)\s+(?:the\s+)?(\d{4}|middle school|high school|college|childhood)\b/i,
    build: (_m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
  {
    type: 'emotional_claim',
    pattern: /\b(felt|feels|feeling|misses|missed|loved|hated|was close to|meant a lot)\b[^.!?]*/i,
    build: (_m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
  {
    type: 'recommendation_claim',
    pattern: /\b(I'd suggest|I recommend|you might consider|it could help to)\b[^.!?]*/i,
    build: (_m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
  {
    type: 'inference_claim',
    pattern: /\b(appears to have|seems to have|likely|probably|may have|might have)\b[^.!?]*/i,
    build: (_m, sentence) => sentence.replace(/\.$/, '').trim(),
  },
];

function extractSubjectName(sentence: string): string | null {
  const named = sentence.match(/\b([A-Z][a-z]{2,})\b/);
  return named?.[1] ?? null;
}

function inferClaimType(sentence: string): AssistantClaimType {
  if (/\b(friend|relationship|partner|brother|sister|mom|dad)\b/i.test(sentence)) {
    return 'relationship_claim';
  }
  if (/\b(school|college|university|class|graduated)\b/i.test(sentence)) return 'school_claim';
  if (/\b(work|job|employer|company|robotics)\b/i.test(sentence)) return 'work_claim';
  if (/\?\s*$/.test(sentence)) return 'action_claim';
  return 'inference_claim';
}

export function extractAssistantClaims(rawResponse: string): AssistantClaim[] {
  const claims: AssistantClaim[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(rawResponse)) {
    let matched = false;

    for (const rule of PATTERNS) {
      const match = sentence.match(rule.pattern);
      if (!match) continue;
      const claimText = rule.build(match, sentence);
      if (!claimText) continue;
      const key = `${rule.type}:${claimText.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      claims.push({
        id: randomUUID(),
        type: rule.type,
        claim: claimText,
        sourceSentence: sentence,
        statementKind: classifyStatementKind(sentence),
        certainty: detectCertainty(sentence),
      });
      matched = true;
      break;
    }

    if (!matched && sentence.length > 20) {
      const type = inferClaimType(sentence);
      const key = `${type}:${sentence.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        claims.push({
          id: randomUUID(),
          type,
          claim: sentence.replace(/\.$/, '').trim(),
          sourceSentence: sentence,
          statementKind: classifyStatementKind(sentence),
          certainty: detectCertainty(sentence),
        });
      }
    }
  }

  return claims;
}
