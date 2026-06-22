import type { ResponseActionCandidate } from './responseCompilerTypes';

type ActionPattern = {
  type: string;
  pattern: RegExp;
  build: (match: RegExpMatchArray) => ResponseActionCandidate | null;
};

const ACTION_PATTERNS: ActionPattern[] = [
  {
    type: 'add_relationship',
    pattern: /\b(?:would you like to|should I|want me to)\s+add\s+([A-Z][a-zA-Z'’.-]+)\s+as\s+(?:a\s+|your\s+)?([^?.!]+)/i,
    build: (m) => ({
      type: 'add_relationship',
      label: `Add ${m[1].trim()} as ${m[2].trim()}`,
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { characterName: m[1].trim(), relationship: m[2].trim() },
    }),
  },
  {
    type: 'add_relationship',
    pattern: /\badd\s+([A-Z][a-zA-Z'’.-]+)\s+as\s+(?:a\s+|your\s+)?(best friend|close friend|friend|character)/i,
    build: (m) => ({
      type: 'add_relationship',
      label: `Add ${m[1].trim()} as ${m[2].trim()}`,
      confidence: 0.85,
      requiresConfirmation: true,
      payload: { characterName: m[1].trim(), relationship: m[2].trim() },
    }),
  },
  {
    type: 'create_group',
    pattern: /\b(?:should I|would you like me to|shall I)\s+create\s+(?:a\s+)?([^?.!]+?\s+(?:group|band|team|club))/i,
    build: (m) => ({
      type: 'create_group',
      label: `Create ${m[1].trim()}`,
      confidence: 0.88,
      requiresConfirmation: true,
      payload: { groupName: m[1].trim() },
    }),
  },
  {
    type: 'create_group',
    pattern: /\bcreate\s+(?:a\s+)?([A-Z][A-Za-z0-9\s]+(?:Band|Group|Team|Club))\b/i,
    build: (m) => ({
      type: 'create_group',
      label: `Create ${m[1].trim()}`,
      confidence: 0.82,
      requiresConfirmation: true,
      payload: { groupName: m[1].trim() },
    }),
  },
  {
    type: 'add_character',
    pattern: /\b(?:would you like to|should I)\s+add\s+([A-Z][a-zA-Z'’.-]+)\s+(?:to your character book|as a character)/i,
    build: (m) => ({
      type: 'add_character',
      label: `Add ${m[1].trim()} as a character`,
      confidence: 0.9,
      requiresConfirmation: true,
      payload: { characterName: m[1].trim() },
    }),
  },
  {
    type: 'confirm_fact',
    pattern: /\b(?:is it correct that|can you confirm|did you mean)\b[^?.!]*\?/i,
    build: (m) => ({
      type: 'confirm_fact',
      label: m[0].replace(/\?$/, '').trim(),
      confidence: 0.75,
      requiresConfirmation: true,
    }),
  },
];

export function extractResponseActions(rawResponse: string): ResponseActionCandidate[] {
  const actions: ResponseActionCandidate[] = [];
  const seen = new Set<string>();

  for (const rule of ACTION_PATTERNS) {
    const match = rawResponse.match(rule.pattern);
    if (!match) continue;
    const action = rule.build(match);
    if (!action) continue;
    const key = `${action.type}:${action.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
  }

  return actions;
}
