/**
 * Map server lexical preview spans → composer draft entity matches.
 */

import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { isIndividualPersonName } from './personNameValidation';

const PERSON_TYPES = new Set(['PERSON', 'CHARACTER', 'IDENTITY_CLAIM']);
const PLACE_TYPES = new Set([
  'PLACE',
  'VENUE',
  'TRAVEL_DESTINATION',
  'DEPLOYMENT_SITE',
  'WORKSITE',
  'SCHOOL',
  'SCHOOL_CLUB',
  'SCHOOL_TEAM',
]);
const ORG_TYPES = new Set(['ORGANIZATION', 'GROUP', 'COMMUNITY', 'FRIEND_GROUP']);
const SKILL_TYPES = new Set(['SKILL', 'ACTIVITY', 'WORK_ACTIVITY']);
const EVENT_TYPES = new Set(['EVENT', 'RELATIONSHIP', 'TIME_PERIOD']);

function normalizeNameKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function spanTypeToCertified(type: string): CertifiedEntityType | null {
  if (PERSON_TYPES.has(type)) return 'character';
  if (PLACE_TYPES.has(type)) return 'location';
  if (ORG_TYPES.has(type)) return 'organization';
  if (SKILL_TYPES.has(type)) return 'skill';
  if (EVENT_TYPES.has(type)) return 'event';
  return null;
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

/** Convert lexical intelligence preview spans into draft composer matches. */
export function lexicalPreviewSpansToDraftMatches(
  spans: LexicalPreviewSpan[],
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[]
): CertifiedEntityMatch[] {
  const covered = collectCoveredKeys(index, existingMatches);
  const seen = new Set<string>();
  const drafts: CertifiedEntityMatch[] = [];

  for (const span of spans) {
    if (span.entityStatus === 'known' && span.matchedEntityId) continue;
    const type = spanTypeToCertified(span.type);
    if (!type) continue;

    const containedByOther = spans.some(
      (other) =>
        other !== span &&
        other.start <= span.start &&
        other.end >= span.end &&
        (other.start < span.start || other.end > span.end) &&
        spanTypeToCertified(other.type) === type
    );
    if (containedByOther) continue;

    const name = titleCase(span.text.trim().replace(/\s+/g, ' '));
    if (name.length < 2) continue;
    if (type === 'character' && !isIndividualPersonName(name)) continue;

    const key = normalizeNameKey(name);
    const slot = `${type}:${key}`;
    if (!key || covered.has(key) || seen.has(slot)) continue;
    seen.add(slot);

    drafts.push({
      id: `draft:lexical:${type}:${key}`,
      name,
      type,
      aliases: [],
      mentionKeys: [key],
      status: 'draft',
      matchedLabel: name,
      matchKind: 'full',
      composerChipKind: 'entity',
    });
  }

  return drafts;
}
