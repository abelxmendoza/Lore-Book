/**
 * Entity Authority — the deterministic decision layer.
 *
 * Detection (dedup, similarity, parent/child, household-room, event-venue,
 * possessive owner) already exists across the ontology + place/character
 * services. This service answers the *authority* question for a related pair:
 *
 *   MERGE        — same entity, fold into one canonical
 *   ALIAS        — same entity, one name is a surface alias of the other
 *   PARENT_CHILD — distinct but hierarchical (room⊂household, event⊂venue)
 *   LINK         — distinct, related by a non-identity relationship (owner/uses)
 *   IGNORE       — unrelated, or invalid (e.g. generic project name)
 *
 * Pure + deterministic. The review center surfaces these with confidence/reason/
 * evidence; nothing is applied without user confirmation.
 */
import { classifyPlace, canonicalVenueName, placeDuplicateScore, type PlaceClass } from './ontology/placeIntelligence';

export type AuthorityDecision = 'MERGE' | 'ALIAS' | 'PARENT_CHILD' | 'LINK' | 'IGNORE';

export type EntityKind =
  | 'PERSON' | 'FAMILY' | 'HOUSEHOLD' | 'ROOM' | 'PROPERTY' | 'VENUE' | 'EVENT'
  | 'BUSINESS' | 'CITY' | 'REGION' | 'ORGANIZATION' | 'COMMUNITY' | 'GROUP' | 'PROJECT'
  | 'SKILL' | 'GOAL' | 'LOCATION' | 'LANDMARK' | 'UNKNOWN';

export interface AuthorityEntity {
  id?: string;
  name: string;
  kind?: EntityKind;       // explicit domain; inferred for places when omitted
  context?: string;
  residents?: string[];    // for household merge reasoning
  city?: string;           // located-in city, for household reasoning
  aliases?: string[];
}

export interface AuthorityVerdict {
  decision: AuthorityDecision;
  confidence: number;
  reason: string;
  evidence: string[];
  /** For PARENT_CHILD / MERGE / ALIAS: which entity is the parent/canonical. */
  canonical?: 'a' | 'b';
  relationship?: string;   // e.g. HOSTED_AT, INSIDE, OWNS, VISITS, USES, HOME_OF
}

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ');

const PLACE_KINDS: ReadonlySet<EntityKind> = new Set(['HOUSEHOLD', 'ROOM', 'PROPERTY', 'VENUE', 'BUSINESS', 'CITY', 'REGION', 'LOCATION', 'LANDMARK', 'EVENT']);

/** Resolve an entity's effective kind, inferring place class from the name when needed. */
function effectiveKind(e: AuthorityEntity): { kind: EntityKind; placeClass?: PlaceClass } {
  if (e.kind && e.kind !== 'LOCATION' && e.kind !== 'UNKNOWN') return { kind: e.kind };
  if (!e.kind || e.kind === 'LOCATION' || e.kind === 'UNKNOWN') {
    const pc = classifyPlace(e.name, e.context);
    if (pc.category !== 'UNKNOWN') return { kind: (pc.rootType === 'EVENT' ? 'EVENT' : pc.category) as EntityKind, placeClass: pc.category };
  }
  return { kind: e.kind ?? 'UNKNOWN' };
}

/** Public: resolve an entity's effective kind (inferring place class from name). */
export function resolveEntityKind(e: AuthorityEntity): EntityKind {
  return effectiveKind(e).kind;
}

function nameSimilarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  return placeDuplicateScore(a, b); // token jaccard / containment / canonical-venue
}

// ── Phase 5: project authority ────────────────────────────────────────────────
const GENERIC_PROJECT = new Set(['building', 'project', 'software', 'platform', 'app', 'apps', 'startup', 'business', 'thing', 'stuff', 'work', 'code', 'idea', 'website', 'tool']);

/** A valid project needs a distinctive named initiative, not a bare generic word. */
export function isValidProjectName(name: string, evidenceCount = 1): boolean {
  const n = norm(name);
  if (!n) return false;
  if (GENERIC_PROJECT.has(n)) return false;
  const tokens = n.split(' ');
  const allGeneric = tokens.every((t) => GENERIC_PROJECT.has(t));
  if (allGeneric) return false;
  const hasProper = /[A-Z]/.test(name.replace(/^the\s+/i, '')) || tokens.length >= 2;
  // Distinctive single-token coinages (LoreBook, Abeliciousness) or repeated evidence pass.
  return hasProper || name.length >= 6 || evidenceCount >= 3;
}

/**
 * Decide the authority relationship between two related entities.
 */
export function decideAuthority(a: AuthorityEntity, b: AuthorityEntity): AuthorityVerdict {
  const ka = effectiveKind(a);
  const kb = effectiveKind(b);
  const ev: string[] = [`a=${a.name}[${ka.kind}]`, `b=${b.name}[${kb.kind}]`];
  const sim = nameSimilarity(a.name, b.name);
  const kinds = new Set([ka.kind, kb.kind]);
  const has = (x: EntityKind, y: EntityKind) => kinds.has(x) && kinds.has(y);
  const which = (k: EntityKind): 'a' | 'b' => (ka.kind === k ? 'a' : 'b');

  // 1. EVENT ↔ VENUE with same canonical venue → PARENT_CHILD (event hosted at venue).
  if (has('EVENT', 'VENUE')) {
    const eventName = ka.kind === 'EVENT' ? a.name : b.name;
    const venueName = ka.kind === 'VENUE' ? a.name : b.name;
    const cEvent = norm(canonicalVenueName(eventName));
    const cVenue = norm(canonicalVenueName(venueName));
    const sameVenue = cEvent.includes(cVenue) || cVenue.includes(cEvent) || cEvent === cVenue;
    if (sameVenue || sim >= 0.6) {
      return { decision: 'PARENT_CHILD', confidence: Math.max(0.85, sim), reason: 'event hosted at venue', evidence: [...ev, `canonical(event)=${canonicalVenueName(eventName)}`], canonical: which('VENUE'), relationship: 'HOSTED_AT' };
    }
  }

  // 2. ROOM ↔ HOUSEHOLD/PROPERTY → PARENT_CHILD (room inside household).
  if (kinds.has('ROOM') && (kinds.has('HOUSEHOLD') || kinds.has('PROPERTY'))) {
    return { decision: 'PARENT_CHILD', confidence: 0.85, reason: 'room belongs to a household', evidence: ev, canonical: ka.kind === 'ROOM' ? 'b' : 'a', relationship: 'INSIDE' };
  }

  // 3. FAMILY ↔ HOUSEHOLD → LINK (family lives at household). Never merge.
  if (has('FAMILY', 'HOUSEHOLD')) {
    return { decision: 'LINK', confidence: 0.8, reason: 'family ↔ household relationship (never merge a family into a household)', evidence: ev, relationship: 'HOME_OF' };
  }

  // 4. COMMUNITY/ORGANIZATION ↔ VENUE → LINK (community uses venue).
  if ((kinds.has('COMMUNITY') || kinds.has('ORGANIZATION')) && kinds.has('VENUE')) {
    return { decision: 'LINK', confidence: 0.78, reason: 'community/organization uses venue', evidence: ev, relationship: 'USES' };
  }

  // 5. Possessive BUSINESS ↔ base BUSINESS ("Abuela's Costco" ↔ "Costco") → LINK (owner visits).
  if (has('BUSINESS', 'BUSINESS') || (kinds.has('BUSINESS') && sim >= 0.5)) {
    const pcA = classifyPlace(a.name, a.context);
    const pcB = classifyPlace(b.name, b.context);
    const possessive = pcA.possessive || pcB.possessive;
    if (possessive) {
      return { decision: 'LINK', confidence: 0.82, reason: `owner relationship (${possessive.ownerName}) — link, not merge`, evidence: [...ev, `owner=${possessive.ownerName}`], relationship: possessive.ownerIsKin ? 'VISITS' : 'ASSOCIATED_WITH' };
    }
  }

  // 6. Two HOUSEHOLDs → MERGE candidate when residents/city overlap (semantic).
  if (has('HOUSEHOLD', 'HOUSEHOLD') || (ka.kind === 'HOUSEHOLD' && kb.kind === 'HOUSEHOLD')) {
    const sharedResidents = (a.residents ?? []).filter((r) => (b.residents ?? []).map(norm).includes(norm(r)));
    const sameCity = a.city && b.city && norm(a.city) === norm(b.city);
    const score = (sharedResidents.length > 0 ? 0.5 : 0) + (sameCity ? 0.25 : 0) + sim * 0.4;
    if (score >= 0.45) {
      return { decision: 'MERGE', confidence: Math.min(0.95, 0.5 + score), reason: sharedResidents.length ? `same residents (${sharedResidents.join(', ')})` : sameCity ? 'same city + household' : 'similar household names', evidence: [...ev, sharedResidents.length ? `shared=${sharedResidents.join(',')}` : '', sameCity ? `city=${a.city}` : ''].filter(Boolean), canonical: 'a' };
    }
    return { decision: 'LINK', confidence: 0.5, reason: 'two households — possibly related, insufficient overlap to merge', evidence: ev, relationship: 'RELATED' };
  }

  // 7. Same kind + name identity → MERGE / ALIAS.
  if (ka.kind === kb.kind && ka.kind !== 'UNKNOWN') {
    if (norm(a.name) === norm(b.name)) return { decision: 'MERGE', confidence: 0.97, reason: 'identical name, same kind', evidence: ev, canonical: 'a' };
    // alias check: one contained in the other / known alias
    const aliasHit = (a.aliases ?? []).map(norm).includes(norm(b.name)) || (b.aliases ?? []).map(norm).includes(norm(a.name));
    if (aliasHit) return { decision: 'ALIAS', confidence: 0.9, reason: 'declared alias', evidence: ev, canonical: 'a' };
    if (sim >= 0.85) return { decision: 'MERGE', confidence: sim, reason: 'near-identical name, same kind', evidence: [...ev, `sim=${sim.toFixed(2)}`], canonical: 'a' };
    if (sim >= 0.6) return { decision: 'ALIAS', confidence: sim, reason: 'name variant / alias, same kind', evidence: [...ev, `sim=${sim.toFixed(2)}`], canonical: 'a' };
  }

  // 8. Default — unrelated / not enough signal.
  return { decision: 'IGNORE', confidence: 0.5, reason: 'no authority relationship detected', evidence: [...ev, `sim=${sim.toFixed(2)}`] };
}

/** Classify a duplicate cluster (Phase 1 audit): EXACT_DUPLICATE / ALIAS / PARENT_CHILD / RELATED / UNRELATED. */
export function classifyCluster(entities: AuthorityEntity[]): { pair: [string, string]; verdict: AuthorityVerdict }[] {
  const out: { pair: [string, string]; verdict: AuthorityVerdict }[] = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const v = decideAuthority(entities[i], entities[j]);
      if (v.decision !== 'IGNORE') out.push({ pair: [entities[i].name, entities[j].name], verdict: v });
    }
  }
  return out;
}

export const entityAuthorityService = { decideAuthority, classifyCluster, isValidProjectName, resolveEntityKind };
