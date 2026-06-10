/**
 * Memory Claim Guard (advisory)
 *
 * The blueprint's hard rule: claiming continuity that isn't traceable is
 * worse than missing continuity. This guard runs AFTER a response streams
 * (never blocks or delays the user) and checks one specific failure:
 *
 *   the response claims memory ("you told me…", "I remember…") about a
 *   person whose name does not exist anywhere in the user's entity graph.
 *
 * Findings are logged as structured warnings (hallucination_guard) so
 * fabricated-recall regressions are visible in ops instead of silent.
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

const MEMORY_CLAIM_PATTERNS = [
  /\byou (told|mentioned|said to|shared with)\b/i,
  /\bi remember\b/i,
  /\blast time (we|you)\b/i,
  /\bas you('ve| have)? (said|shared|mentioned)\b/i,
  /\bwe('ve| have)? talked about\b/i,
  /\byou('ve| have) (told|mentioned|shared)\b/i,
];

// Capitalized tokens that are never person names in this context
const STOPWORDS = new Set([
  'I', 'The', 'A', 'An', 'And', 'But', 'Or', 'So', 'If', 'When', 'While',
  'That', 'This', 'These', 'Those', 'It', 'They', 'We', 'You', 'He', 'She',
  'My', 'Your', 'His', 'Her', 'Their', 'Our', 'What', 'Which', 'Who', 'How',
  'Yes', 'No', 'Not', 'Also', 'Just', 'Maybe', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March',
  'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December', 'LoreBook', 'Lorekeeper', 'OK', 'Okay', 'Oh', 'Hey', 'Hi',
  'Here', 'There', 'Then', 'Now', 'Today', 'Tomorrow', 'Yesterday', 'Let',
  'Sounds', 'Got', 'Thanks', 'Thank', 'Sure', 'Right', 'Well', 'First',
  'Second', 'Third', 'Finally', 'However', 'Although', 'Because', 'Since',
]);

function extractCandidateNames(text: string): string[] {
  // Multi-word capitalized sequences first ("Sarah Chen"), then single tokens
  const tokens = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) ?? [];
  const names = new Set<string>();
  for (const t of tokens) {
    const head = t.split(/\s+/)[0];
    if (STOPWORDS.has(head)) continue;
    names.add(t);
  }
  return [...names];
}

export interface GuardResult {
  flagged: boolean;
  memoryClaimDetected: boolean;
  unknownNames: string[];
}

export async function verifyMemoryClaims(
  userId: string,
  responseText: string
): Promise<GuardResult> {
  const memoryClaimDetected = MEMORY_CLAIM_PATTERNS.some(p => p.test(responseText));
  if (!memoryClaimDetected) {
    return { flagged: false, memoryClaimDetected: false, unknownNames: [] };
  }

  const candidates = extractCandidateNames(responseText);
  if (candidates.length === 0) {
    return { flagged: false, memoryClaimDetected: true, unknownNames: [] };
  }

  // Known names across the entity graph (characters + people_places + aliases)
  const [{ data: chars }, { data: places }] = await Promise.all([
    supabaseAdmin.from('characters').select('name, alias').eq('user_id', userId),
    supabaseAdmin.from('people_places').select('name').eq('user_id', userId),
  ]);

  const known = new Set<string>();
  for (const c of (chars ?? []) as Array<{ name: string; alias: string[] | null }>) {
    known.add(c.name.toLowerCase());
    for (const a of c.alias ?? []) known.add(a.toLowerCase());
  }
  for (const p of (places ?? []) as Array<{ name: string }>) {
    known.add(p.name.toLowerCase());
  }

  const isKnown = (candidate: string): boolean => {
    const lower = candidate.toLowerCase();
    if (known.has(lower)) return true;
    // First-name match against multi-word known names and vice versa
    for (const k of known) {
      if (k.startsWith(lower + ' ') || lower.startsWith(k + ' ') || k.split(' ')[0] === lower) {
        return true;
      }
    }
    return false;
  };

  const unknownNames = candidates.filter(c => !isKnown(c));
  const flagged = unknownNames.length > 0;

  if (flagged) {
    logger.warn(
      { userId, unknownNames, event: 'hallucination_guard' },
      'Response claims memory about names not present in the entity graph'
    );
  }

  return { flagged, memoryClaimDetected, unknownNames };
}
