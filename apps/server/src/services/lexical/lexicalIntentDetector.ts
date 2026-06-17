/**
 * Intent detection — queries, actions, identity claims, navigation cues.
 */
import {
  classifyActionIntent,
  classifyQueryType,
  extractClaimedName,
} from '../ontology/lexicalIntelligence';
import type { LexicalIntent, LexicalIntentKind } from './lexicalTypes';
import { padForScan } from './lexicalNormalizer';

const CORRECT_CUES = ['actually', 'correction', 'i meant', 'not that', 'wrong about'];
const RECALL_CUES = ['remember when', 'what did i say', 'recall', 'remind me'];

export function detectLexicalIntents(text: string): LexicalIntent[] {
  const intents: LexicalIntent[] = [];
  const padded = padForScan(text);
  const { hits, queryType } = classifyActionIntent(text);

  for (const h of hits) {
    intents.push({
      kind: mapActionHint(h.actionHint),
      cue: h.cue,
      label: h.actionHint,
      confidence: h.confidence,
    });
  }

  if (queryType.queryHint) {
    intents.push({
      kind: 'QUERY',
      cue: queryType.cue ?? queryType.queryHint,
      label: queryType.queryHint,
      confidence: queryType.confidence,
    });
  }

  if (extractClaimedName(text)) {
    intents.push({
      kind: 'IDENTITY_CLAIM',
      cue: 'name_claim',
      label: 'identity_claim',
      confidence: 0.85,
      metadata: { claimedName: extractClaimedName(text) },
    });
  }

  for (const cue of CORRECT_CUES) {
    if (padded.includes(` ${cue} `)) {
      intents.push({ kind: 'CORRECT', cue, label: 'correction', confidence: 0.7 });
      break;
    }
  }

  for (const cue of RECALL_CUES) {
    if (padded.includes(` ${cue} `)) {
      intents.push({ kind: 'RECALL', cue, label: 'recall', confidence: 0.75 });
      break;
    }
  }

  if (!intents.length && text.trim().endsWith('?')) {
    intents.push({ kind: 'QUERY', cue: '?', label: 'question', confidence: 0.5 });
  }

  if (!intents.length) {
    intents.push({ kind: 'STATEMENT', cue: 'default', label: 'statement', confidence: 0.4 });
  }

  return dedupeIntents(intents);
}

function mapActionHint(hint: string): LexicalIntentKind {
  switch (hint) {
    case 'IDENTITY_CLAIM': return 'IDENTITY_CLAIM';
    case 'DISAMBIGUATE': return 'DISAMBIGUATE';
    case 'OPEN_SURFACE': return 'NAVIGATE';
    case 'RELATIONSHIP_CLAIM': return 'ACTION';
    default: return 'ACTION';
  }
}

function dedupeIntents(intents: LexicalIntent[]): LexicalIntent[] {
  const seen = new Set<string>();
  return intents.filter((i) => {
    const k = `${i.kind}:${i.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
