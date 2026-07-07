/**
 * Map LoreBook Parse Engine operations → composer entity chips.
 */

import type { LoreBookParseOperation, LoreBookParseResponse } from '../api/loreBookParse';
import type { CertifiedEntity, CertifiedEntityType } from '../types/certifiedEntity';

import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { isIndividualPersonName } from './personNameValidation';

const DOMAIN_LABELS: Record<string, string> = {
  characters: 'Characters',
  locations: 'Places',
  skills: 'Skills',
  projects: 'Projects',
  quests: 'Quests',
  organizations: 'Organizations',
  groups: 'Groups',
  schools: 'Schools',
  work: 'Work',
  family: 'Family',
  events: 'Events',
  relationships: 'Relationships',
  timeline: 'Timeline',
};

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

function domainToEntityType(domain: string): CertifiedEntityType | null {
  if (domain === 'characters') return 'character';
  if (domain === 'locations' || domain === 'schools') return 'location';
  if (domain === 'organizations' || domain === 'groups') return 'organization';
  if (domain === 'skills' || domain === 'work') return 'skill';
  if (domain === 'projects') return 'project';
  if (domain === 'quests' || domain === 'events' || domain === 'timeline') {
    return 'event';
  }
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

function pushMatch(
  out: CertifiedEntityMatch[],
  seen: Set<string>,
  covered: Set<string>,
  match: CertifiedEntityMatch
): void {
  const key = `${match.type}:${normalizeNameKey(match.name)}`;
  const slotKey = match.composerChipKind ? `${match.composerChipKind}:${key}` : key;
  if (seen.has(slotKey)) return;
  if (match.composerChipKind !== 'needs_clarification' && covered.has(normalizeNameKey(match.name))) {
    return;
  }
  seen.add(slotKey);
  out.push(match);
}

function opsFromParse(parse: LoreBookParseResponse): LoreBookParseOperation[] {
  return [...parse.operations, ...parse.redirects];
}

/** Convert LoreBook parse operations into composer draft / redirect chips. */
export function loreBookParseToComposerMatches(
  parse: LoreBookParseResponse,
  index: CertifiedEntity[],
  existingMatches: CertifiedEntityMatch[]
): CertifiedEntityMatch[] {
  const covered = collectCoveredKeys(index, existingMatches);
  const seen = new Set<string>();
  const matches: CertifiedEntityMatch[] = [];

  for (const op of opsFromParse(parse)) {
    if (op.kind === 'suppress') continue;

    // Redirect ops ("Add as Places/Project/…") are book-routing signals for the
    // ingestion pipeline, not composer decisions — the user asked for no
    // "Add as …" chips in the composer. Ingestion still applies the redirect.
    if (op.kind === 'redirect') continue;

    if (op.kind === 'suggest_merge') {
      const name = titleCase(op.name.trim());
      const key = normalizeNameKey(name);
      if (!key) continue;
      pushMatch(matches, seen, covered, {
        id: `lorebook:merge:${op.domain}:${key}`,
        name,
        type: domainToEntityType(op.domain) ?? 'event',
        aliases: [],
        mentionKeys: [key],
        status: 'suggestion',
        matchedLabel: name,
        matchKind: 'full',
        composerChipKind: 'needs_clarification',
        actionLabel: `Merge with ${op.targetName}`,
      });
      continue;
    }

    if (op.kind === 'suggest_add') {
      if (op.gate === 'block') continue;
      const type = domainToEntityType(op.domain);
      if (!type) continue;

      const name = titleCase(op.name.trim());
      if (name.length < 2) continue;
      if (type === 'character' && !isIndividualPersonName(name)) continue;

      const key = normalizeNameKey(name);
      pushMatch(matches, seen, covered, {
        id: `draft:lorebook:${type}:${key}`,
        name,
        type,
        aliases: [],
        mentionKeys: [key],
        status: op.gate === 'review' ? 'suggestion' : 'draft',
        matchedLabel: name,
        matchKind: 'full',
        composerChipKind: 'entity',
        actionLabel:
          op.gate === 'review'
            ? `Review ${DOMAIN_LABELS[op.domain] ?? op.domain} suggestion`
            : undefined,
      });
    }
  }

  return matches;
}
