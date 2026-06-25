import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';

import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import {
  evaluateEntityPromotion,
  type EntityPromotionCandidate,
  type PromotionDomain,
} from './entityPromotionPolicy';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'all', 'and', 'any', 'are', 'because', 'been', 'before', 'but',
  'can', 'day', 'did', 'does', 'doing', 'everything', 'for', 'from', 'had', 'has', 'have',
  'her', 'him', 'his', 'how', 'into', 'just', 'know', 'like', 'me', 'more', 'much', 'now',
  'our', 'out', 'really', 'said', 'she', 'some', 'that', 'the', 'their', 'them', 'then',
  'there', 'thing', 'things', 'this', 'time', 'today', 'too', 'was', 'way', 'were', 'what',
  'when', 'where', 'with', 'you', 'your',
]);

const GENERIC_OBJECT_WORDS = new Set([
  'stuff', 'thing', 'things', 'something', 'anything', 'everything', 'work', 'life', 'time',
  'day', 'week', 'month', 'year', 'idea', 'ideas', 'conversation', 'chat', 'message',
]);

const THING_HEAD_WORDS = new Set([
  'album', 'app', 'bag', 'bike', 'book', 'camera', 'car', 'computer', 'desk', 'guitar',
  'hoodie', 'journal', 'key', 'keys', 'laptop', 'letter', 'mic', 'microphone', 'necklace',
  'notebook', 'phone', 'photo', 'ring', 'song', 'tool', 'truck', 'watch',
]);

const PET_KIND_WORDS = new Set(['cat', 'dog', 'bird', 'bunny', 'rabbit', 'hamster', 'horse', 'pet', 'puppy', 'kitten']);

function normalizeNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function collectCoveredKeys(index: CertifiedEntity[], existingMatches: CertifiedEntityMatch[]): Set<string> {
  const covered = new Set<string>();
  for (const entity of index) {
    covered.add(normalizeNameKey(entity.name));
    for (const alias of entity.aliases) covered.add(normalizeNameKey(alias));
    for (const key of entity.mentionKeys) covered.add(normalizeNameKey(key));
  }
  for (const match of existingMatches) {
    covered.add(normalizeNameKey(match.name));
    covered.add(normalizeNameKey(match.matchedLabel));
  }
  return covered;
}

function countPhrase(textKey: string, phraseKey: string): number {
  if (!phraseKey) return 0;
  const escaped = phraseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...textKey.matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))].length;
}

function isGenericCandidate(name: string): boolean {
  const key = normalizeNameKey(name);
  if (!key || GENERIC_OBJECT_WORDS.has(key)) return true;
  const tokens = key.split(' ');
  if (tokens.length > 5) return true;
  if (tokens.every((token) => STOP_WORDS.has(token))) return true;
  return GENERIC_OBJECT_WORDS.has(tokens[tokens.length - 1] ?? '');
}

function pushCandidate(
  candidates: EntityPromotionCandidate[],
  seen: Set<string>,
  rawName: string,
  domain: PromotionDomain,
  textKey: string,
  opts: Partial<EntityPromotionCandidate> = {},
): void {
  const key = normalizeNameKey(rawName);
  if (!key || seen.has(`${domain}:${key}`)) return;
  seen.add(`${domain}:${key}`);
  candidates.push({
    name: titleCase(key),
    domain,
    mentionCount: Math.max(1, countPhrase(textKey, key)),
    documentCount: 1,
    confidence: 0.62,
    isGeneric: isGenericCandidate(key),
    ...opts,
  });
}

function extractPetCandidates(text: string, textKey: string): EntityPromotionCandidate[] {
  const candidates: EntityPromotionCandidate[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:my|our)\s+(dog|cat|bird|bunny|rabbit|hamster|horse|pet|puppy|kitten)\s+([A-ZÀ-Ý][\wÀ-ÿ'’-]{1,30})\b/gi,
    /\b([A-ZÀ-Ý][\wÀ-ÿ'’-]{1,30})\s+(?:is|was)\s+(?:my|our)\s+(dog|cat|bird|bunny|rabbit|hamster|horse|pet|puppy|kitten)\b/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const maybeName = PET_KIND_WORDS.has(normalizeNameKey(match[1])) ? match[2] : match[1];
      pushCandidate(candidates, seen, maybeName, 'pet', textKey, {
        confidence: 0.86,
        hasConfirmedEntityConnection: true,
      });
    }
  }
  return candidates;
}

function extractProjectCandidates(text: string, textKey: string): EntityPromotionCandidate[] {
  const candidates: EntityPromotionCandidate[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:working on|building|shipping|launched|starting|started|finishing)\s+(?:my|the|a|an)?\s*([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3}|[a-z][\w'’-]+(?:\s+[a-z][\w'’-]+){1,4})\b/g,
    /\b(?:project|app|album|book|startup|repo|site)\s+(?:called|named)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})\b/g,
    /\bmy\s+([a-z][\w'’-]+(?:\s+[a-z][\w'’-]+){0,3})\s+(?:project|app|album|book|startup|site)\b/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      pushCandidate(candidates, seen, match[1], 'project', textKey, {
        confidence: 0.78,
        hasProjectCue: true,
        hasConfirmedEntityConnection: true,
      });
    }
  }
  return candidates;
}

function extractThingCandidates(text: string, textKey: string): EntityPromotionCandidate[] {
  const candidates: EntityPromotionCandidate[] = [];
  const seen = new Set<string>();
  const possessiveThing = /\b(?:my|our|the)\s+((?:old|new|blue|red|black|white|favorite|main|first|last)\s+)?([a-z][\w'’-]{2,})(?:\s+([a-z][\w'’-]{2,}))?\b/g;
  let match: RegExpExecArray | null;
  while ((match = possessiveThing.exec(text)) !== null) {
    const words = [match[1]?.trim(), match[2], match[3]].filter(Boolean).join(' ');
    const tokens = normalizeNameKey(words).split(' ');
    const head = tokens[tokens.length - 1] ?? '';
    if (!THING_HEAD_WORDS.has(head)) continue;
    pushCandidate(candidates, seen, words, 'thing', textKey, {
      confidence: 0.72,
      hasPossessiveCue: true,
      hasConfirmedEntityConnection: true,
    });
  }

  for (const head of THING_HEAD_WORDS) {
    const count = countPhrase(textKey, head);
    if (count < 2) continue;
    pushCandidate(candidates, seen, head, 'thing', textKey, {
      mentionCount: count,
      confidence: 0.58,
    });
  }

  return candidates;
}

function candidateType(domain: PromotionDomain): CertifiedEntityType {
  if (domain === 'person' || domain === 'pet') return 'character';
  if (domain === 'place') return 'location';
  if (domain === 'organization' || domain === 'group') return 'organization';
  if (domain === 'project') return 'project';
  return 'thing';
}

export function significantComposerCandidatesToMatches(
  text: string,
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[],
): CertifiedEntityMatch[] {
  if (!text.trim()) return [];

  const textKey = normalizeNameKey(text);
  const covered = collectCoveredKeys(index, existingMatches);
  const candidates = [
    ...extractPetCandidates(text, textKey),
    ...extractProjectCandidates(text, textKey),
    ...extractThingCandidates(text, textKey),
  ];

  const seen = new Set<string>();
  const matches: CertifiedEntityMatch[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.name);
    const type = candidateType(candidate.domain);
    if (!key || covered.has(key) || seen.has(`${type}:${key}`)) continue;

    const result = evaluateEntityPromotion(candidate);
    if (result.stage !== 'growing' && result.stage !== 'suggest') continue;

    seen.add(`${type}:${key}`);
    matches.push({
      id: `${result.stage}:${type}:${key}`,
      name: candidate.name,
      type,
      aliases: [],
      mentionKeys: [key],
      status: result.stage === 'suggest' && type !== 'thing' ? 'draft' : 'suggestion',
      matchedLabel: candidate.name,
      matchKind: 'full',
      composerChipKind: type === 'thing' ? 'growing_entity' : 'entity',
      loreKind: candidate.domain === 'pet' ? 'pet' : candidate.domain,
      promotionStage: result.stage,
      significanceScore: result.score,
      mentionCount: candidate.mentionCount,
    });
  }

  return matches.sort((a, b) => {
    const scoreA = a.significanceScore ?? 0;
    const scoreB = b.significanceScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.name.localeCompare(b.name);
  });
}
