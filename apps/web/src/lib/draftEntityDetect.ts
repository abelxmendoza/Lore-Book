/**
 * Detect likely new entity mentions in composer text that are not yet in the certified index.
 */

import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { isIndividualPersonName } from './personNameValidation';
import { detectLexicalDraftEntities } from './lexicalEntityDetect';

const COMMON_TOKENS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'hey', 'hi', 'how', 'i', 'if', 'in', 'is', 'it', 'just',
  'me', 'my', 'no', 'not', 'ok', 'on', 'or', 'our', 'she', 'so', 'tell', 'that', 'the', 'their',
  'them', 'then', 'there', 'they', 'this', 'to', 'too', 'up', 'us', 'was', 'we', 'what', 'when',
  'where', 'who', 'why', 'will', 'with', 'yes', 'you', 'your', 'about', 'also', 'been', 'being',
  'could', 'would', 'should', 'into', 'like', 'more', 'some', 'than', 'them', 'very', 'well',
  'were', 'want', 'know', 'think', 'said', 'talk', 'talked', 'chat', 'message', 'lore', 'book',
  'today', 'yesterday', 'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);

const LOCATION_SUFFIX =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Park|Beach|City|Plaza|Mall|Cafe|Coffee|Hospital|Airport|Station|University|College|Library|Museum|Gym|Studio|Bar|Club|Hotel|Inn|Diner|Grill|Kitchen|Bakery|Market|Center|Centre)\b/gi;

/** Names after employment verbs — prefer organization over generic "at X" location drafts. */
const EMPLOYMENT_ORG_AT =
  /\b(?:worked|works?|working|employed|interned|joined|started)(?:\s+\w+){0,3}\s+at\s+([A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,3})/gi;

function extractEmploymentOrgNameKeys(text: string): Set<string> {
  const keys = new Set<string>();
  EMPLOYMENT_ORG_AT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMPLOYMENT_ORG_AT.exec(text)) !== null) {
    const name = match[1].trim().replace(/[,.]$/, '').replace(/\s+and\b[\s\S]*$/i, '').trim();
    const key = normalizeNameKey(name);
    if (key) keys.add(key);
  }
  return keys;
}

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function collectCoveredKeys(
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[]
): Set<string> {
  const covered = new Set<string>();
  for (const entity of index) {
    covered.add(normalizeNameKey(entity.name));
    for (const alias of entity.aliases) covered.add(normalizeNameKey(alias));
    for (const key of entity.mentionKeys) covered.add(key);
  }
  for (const match of existingMatches) {
    covered.add(normalizeNameKey(match.name));
    covered.add(normalizeNameKey(match.matchedLabel));
  }
  return covered;
}

function isBlockedToken(token: string): boolean {
  const key = normalizeNameKey(token);
  return !key || key.length < 2 || COMMON_TOKENS.has(key);
}

/** Extract draft entity mentions not already covered by the certified index. */
export function detectDraftEntitiesInText(
  text: string,
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[]
): CertifiedEntityMatch[] {
  if (!text.trim()) return [];

  const covered = collectCoveredKeys(index, existingMatches);
  const seen = new Set<string>();
  const drafts: CertifiedEntityMatch[] = [];

  const addDraft = (rawName: string, type: CertifiedEntityType) => {
    const name = titleCaseName(rawName.trim().replace(/\s+/g, ' '));
    if (name.length < 2) return;
    if (type === 'character' && !isIndividualPersonName(name)) return;
    const key = normalizeNameKey(name);
    if (!key || covered.has(key) || seen.has(`${type}:${key}`)) return;
    if (COMMON_TOKENS.has(key)) return;

    seen.add(`${type}:${key}`);
    drafts.push({
      id: `draft:${type}:${key}`,
      name,
      type,
      aliases: [],
      mentionKeys: [key],
      status: 'draft',
      matchedLabel: name,
      matchKind: 'full',
    });
  };

  const characterPatterns = [
    /\b(?:my|our|with|from|met|saw|called|named|and|to|about|for)\s+([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)?)\b/g,
    /\b([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+)\b/g,
  ];

  const employmentOrgKeys = extractEmploymentOrgNameKeys(text);

  for (const pattern of characterPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const parts = match[1].trim().split(/\s+/);
      if (parts.length >= 2 && COMMON_TOKENS.has(normalizeNameKey(parts[0]))) continue;
      const candidateKey = normalizeNameKey(match[1]);
      if (employmentOrgKeys.has(candidateKey)) continue;
      if (/\b(?:Staffing|Robotics|Labs|Technologies|Technology|Services|Solutions|Industries|Group|Agency|Partners|Consulting)\b/i.test(match[1])) {
        continue;
      }
      addDraft(match[1], 'character');
    }
  }

  const locationPatterns = [
    /\b(?:at|in|to|from|near|by|inside|outside)\s+([A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ0-9'’.-]+){0,2})\b/g,
  ];

  for (const pattern of locationPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (employmentOrgKeys.has(normalizeNameKey(candidate))) continue;
      if (isIndividualPersonName(candidate) && !/\b(?:Street|Park|City|Beach|Avenue|Road)\b/i.test(text)) {
        continue;
      }
      addDraft(candidate, 'location');
    }
  }

  let locMatch: RegExpExecArray | null;
  while ((locMatch = LOCATION_SUFFIX.exec(text)) !== null) {
    addDraft(locMatch[0].trim(), 'location');
  }

  const tokens = text.trim().split(/\s+/);
  const lastToken = tokens[tokens.length - 1] ?? '';
  if (lastToken.length >= 3 && /^[A-Z][a-z'’.-]{2,}$/.test(lastToken) && !isBlockedToken(lastToken)) {
    addDraft(lastToken, 'character');
  }

  const lexicalDrafts = detectLexicalDraftEntities(text, index, [...existingMatches, ...drafts]);
  for (const draft of lexicalDrafts) {
    const key = normalizeNameKey(draft.name);
    if (seen.has(`${draft.type}:${key}`)) continue;
    seen.add(`${draft.type}:${key}`);
    drafts.push(draft);
  }

  return drafts.sort((a, b) => a.name.localeCompare(b.name));
}
