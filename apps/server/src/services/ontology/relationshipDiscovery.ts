/**
 * Relationship discovery — extract entity-to-entity links and group co-occurring inputs.
 */
import { discoverRelationshipHints } from './lexicalIntelligence';
import type { RelationshipHint } from './glossary';
import type { LexicalEntity, LexicalRelationshipSignal } from '../lexical/lexicalTypes';
import {
  type DiscoveredEntityLink,
  type RelationshipInputGroup,
  hintToDefaultRole,
  hintToScope,
  roleToCanonicalType,
  roleToRelationshipHint,
  roleToScope,
} from './canonical/relationshipKnowledge';
import type { RelationshipRole } from '../lexical/lexicalTypes';

const NORM = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Bare role words — not valid link endpoints when no named target exists. */
const ROLE_TOKENS = new Set([
  'self', 'me', 'user', 'friend', 'cousin', 'coworker', 'colleague', 'mentor', 'boss', 'coach',
  'partner', 'rival', 'acquaintance', 'sibling', 'mother', 'father', 'uncle', 'aunt',
  'romantic_partner', 'ex_partner', 'close_friend', 'teammate', 'promoter', 'vendor',
  'community_member', 'student', 'estranged', 'neutral',
]);

/** Trim trailing clauses and punctuation from captured names. */
export function sanitizeRelationshipName(raw: string): string {
  let name = raw.trim().replace(/^["']|["']$/g, '');
  name = name.replace(/[.!?;:].*$/s, '');
  name = name.replace(/\s+(?:on|with|and|who|that|too|we|i)\b[\s\S]*$/i, '');
  name = name.replace(/[.,!?;:]+$/g, '');
  return name.trim();
}

export function isValidRelationshipEndpoint(name: string): boolean {
  const cleaned = sanitizeRelationshipName(name);
  if (cleaned.length < 2 || cleaned.length > 80) return false;
  const lower = cleaned.toLowerCase();
  if (ROLE_TOKENS.has(lower)) return false;
  if (/\b(?:we|hung|out|the|my|and|with|who|that|too)\b/i.test(cleaned)) return false;
  return true;
}

function pushEntityName(group: RelationshipInputGroup, raw: string): void {
  const name = sanitizeRelationshipName(raw);
  if (isValidRelationshipEndpoint(name)) group.entityNames.push(name);
}

const MY_RELATION_NAME = /\b(?:my|My)\s+(?:estranged\s+)?(?:friend|cousin|brother|sister|mom|mother|dad|father|uncle|aunt|t[íi]o|t[íi]a|boss|manager|coworker|colleague|mentor|coach|girlfriend|boyfriend|partner|wife|husband|ex|rival|best\s+friend|close\s+friend)\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)\b/gu;

const WENT_WITH = /\b(?:went|go|going|hung\s+out|kicked\s+it|linked\s+up|met|saw|chilled)\s+with\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})(?=[.,!?;:\s]|$|\s+(?:too|and|on)\b)/gi;

const WORKS_AT = /\b([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})\s+works?\s+(?:at|for)\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})(?=[.,!?;:\s]|$|\s+(?:on|and|with|who)\b)/gi;

const USER_WORKS_AT = /\b(?:i|we)\s+(?:work|worked|working)\s+(?:at|for|with)\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})(?=[.,!?;:\s]|$|\s+(?:on|and|with|who)\b)/gi;

const AND_WITH = /\b(?:with|and)\s+([A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*){0,2})\b/g;

function entityNamesFromLexical(entities: LexicalEntity[]): string[] {
  return entities
    .filter((e) => ['PERSON', 'ORGANIZATION', 'PLACE', 'OBJECT'].includes(e.type) && e.subcategory !== 'PROPER_NOUN')
    .map((e) => sanitizeRelationshipName(e.surface))
    .filter(isValidRelationshipEndpoint);
}

function pushLink(
  out: DiscoveredEntityLink[],
  seen: Set<string>,
  link: DiscoveredEntityLink
): void {
  const key = `${link.subject}|${link.relationshipType}|${link.object}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(link);
}

/** Discover typed links between entities (and self) in a message. */
export function discoverEntityLinks(
  text: string,
  entities: LexicalEntity[],
  relationships: LexicalRelationshipSignal[] = []
): DiscoveredEntityLink[] {
  const out: DiscoveredEntityLink[] = [];
  const seen = new Set<string>();

  for (const rel of relationships) {
    const target = rel.target?.trim();
    if (!target || !isValidRelationshipEndpoint(target)) continue;
    pushLink(out, seen, {
      subject: 'self',
      object: sanitizeRelationshipName(target),
      relationshipType: roleToCanonicalType(rel.role),
      scope: roleToScope(rel.role),
      role: rel.role,
      hint: roleToRelationshipHint(rel.role),
      cue: rel.cue,
      confidence: rel.confidence,
    });
  }

  for (const _h of discoverRelationshipHints(text)) {
    // Glossary hints drive grouping via groupInputsByRelationshipScope — not entity links.
  }

  let m: RegExpExecArray | null;

  MY_RELATION_NAME.lastIndex = 0;
  while ((m = MY_RELATION_NAME.exec(text)) !== null) {
    const fullCue = m[0];
    const name = sanitizeRelationshipName(m[1]);
    if (!isValidRelationshipEndpoint(name)) continue;
    const role = inferRoleFromCue(fullCue);
    pushLink(out, seen, {
      subject: 'self',
      object: name,
      relationshipType: roleToCanonicalType(role),
      scope: roleToScope(role),
      role,
      hint: roleToRelationshipHint(role),
      cue: fullCue,
      confidence: 0.88,
    });
  }

  WENT_WITH.lastIndex = 0;
  while ((m = WENT_WITH.exec(text)) !== null) {
    const name = sanitizeRelationshipName(m[1]);
    if (!isValidRelationshipEndpoint(name)) continue;
    pushLink(out, seen, {
      subject: 'self',
      object: name,
      relationshipType: 'CO_MENTIONED_WITH',
      scope: 'SOCIAL',
      role: 'friend',
      hint: 'SOCIAL_RELATIONSHIP',
      cue: m[0],
      confidence: 0.8,
    });
  }

  USER_WORKS_AT.lastIndex = 0;
  while ((m = USER_WORKS_AT.exec(text)) !== null) {
    const org = sanitizeRelationshipName(m[1]);
    if (!isValidRelationshipEndpoint(org)) continue;
    pushLink(out, seen, {
      subject: 'self',
      object: org,
      relationshipType: 'WORKS_FOR',
      scope: 'PROFESSIONAL',
      role: 'coworker',
      hint: 'WORK_RELATIONSHIP',
      cue: m[0],
      confidence: 0.85,
    });
  }

  WORKS_AT.lastIndex = 0;
  while ((m = WORKS_AT.exec(text)) !== null) {
    const person = sanitizeRelationshipName(m[1]);
    const org = sanitizeRelationshipName(m[2]);
    if (!isValidRelationshipEndpoint(person) || !isValidRelationshipEndpoint(org)) continue;
    pushLink(out, seen, {
      subject: person,
      object: org,
      relationshipType: 'WORKS_FOR',
      scope: 'PROFESSIONAL',
      role: 'coworker',
      hint: 'WORK_RELATIONSHIP',
      cue: m[0],
      confidence: 0.82,
    });
  }

  // Co-mention: all person/org entities in same message get weak CO_MENTIONED_WITH from self
  const names = entityNamesFromLexical(entities);
  if (names.length >= 2) {
    for (const name of names) {
      pushLink(out, seen, {
        subject: 'self',
        object: name,
        relationshipType: 'MENTIONED_IN',
        scope: 'CIRCUMSTANTIAL',
        cue: 'co-mentioned entities',
        confidence: 0.55,
      });
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        pushLink(out, seen, {
          subject: names[i],
          object: names[j],
          relationshipType: 'CO_MENTIONED_WITH',
          scope: 'CIRCUMSTANTIAL',
          cue: 'same-message co-mention',
          confidence: 0.5,
        });
      }
    }
  }

  return out;
}

/** Group message inputs by relationship scope for retrieval and planner context. */
export function groupInputsByRelationshipScope(
  text: string,
  links: DiscoveredEntityLink[],
  entities: LexicalEntity[],
  relationships: LexicalRelationshipSignal[] = []
): RelationshipInputGroup[] {
  const groups = new Map<string, RelationshipInputGroup>();

  const ensure = (scope: RelationshipInputGroup['scope'], hint: RelationshipHint): RelationshipInputGroup => {
    const key = `${scope}:${hint}`;
    let g = groups.get(key);
    if (!g) {
      g = { scope, hint, entityNames: [], roles: [], cues: [], confidence: 0 };
      groups.set(key, g);
    }
    return g;
  };

  for (const link of links) {
    const hint = link.hint ?? roleToRelationshipHint(link.role ?? 'friend') ?? 'SOCIAL_RELATIONSHIP';
    const g = ensure(link.scope, hint);
    if (link.object && link.object !== 'self') pushEntityName(g, link.object);
    if (link.subject && link.subject !== 'self') pushEntityName(g, link.subject);
    if (link.role) g.roles.push(link.role);
    g.cues.push(link.cue);
    g.confidence = Math.max(g.confidence, link.confidence);
  }

  for (const rel of relationships) {
    const hint = roleToRelationshipHint(rel.role) ?? 'SOCIAL_RELATIONSHIP';
    const g = ensure(roleToScope(rel.role), hint);
    if (rel.target) pushEntityName(g, rel.target);
    g.roles.push(rel.role);
    g.cues.push(rel.cue);
    g.confidence = Math.max(g.confidence, rel.confidence);
  }

  for (const h of discoverRelationshipHints(text)) {
    const g = ensure(hintToScope(h.hint), h.hint);
    g.cues.push(h.cue);
    g.confidence = Math.max(g.confidence, h.confidence);
  }

  // Attach org/place entities to professional or circumstantial groups
  for (const e of entities) {
    if (e.type === 'ORGANIZATION') {
      const g = ensure('PROFESSIONAL', 'WORK_RELATIONSHIP');
      pushEntityName(g, e.surface);
      g.confidence = Math.max(g.confidence, e.confidence);
    }
  }

  return [...groups.values()].map((g) => ({
    ...g,
    entityNames: [...new Set(g.entityNames.map((n) => sanitizeRelationshipName(n)).filter(isValidRelationshipEndpoint))],
    roles: [...new Set(g.roles)],
    cues: [...new Set(g.cues)],
  })).filter((g) => g.entityNames.length > 0 || g.cues.length > 0);
}

function inferRoleFromCue(cue: string): RelationshipRole {
  const c = NORM(cue);
  if (/\bestranged\b/.test(c) && /\bfather\b/.test(c)) return 'father';
  if (/\bestranged\b/.test(c) && /\bmother\b/.test(c)) return 'mother';
  if (/\bbest friend\b|\bclose friend\b/.test(c)) return 'close_friend';
  if (/\bfriend\b/.test(c)) return 'friend';
  if (/\bcousin\b/.test(c)) return 'cousin';
  if (/\bbrother\b|\bsister\b|\bsibling\b/.test(c)) return 'sibling';
  if (/\bmother\b|\bmom\b/.test(c)) return 'mother';
  if (/\bfather\b|\bdad\b/.test(c)) return 'father';
  if (/\buncle\b|\bt[íi]o\b/.test(c)) return 'uncle';
  if (/\baunt\b|\bt[íi]a\b/.test(c)) return 'aunt';
  if (/\bboss\b|\bmanager\b/.test(c)) return 'boss';
  if (/\bcoworker\b|\bcolleague\b/.test(c)) return 'coworker';
  if (/\bmentor\b/.test(c)) return 'mentor';
  if (/\bcoach\b/.test(c)) return 'coach';
  if (/\bgirlfriend\b|\bboyfriend\b|\bpartner\b|\bwife\b|\bhusband\b/.test(c)) return 'romantic_partner';
  if (/\bex\b/.test(c)) return 'ex_partner';
  if (/\brival\b/.test(c)) return 'rival';
  return 'acquaintance';
}

export { inferRoleFromCue };
