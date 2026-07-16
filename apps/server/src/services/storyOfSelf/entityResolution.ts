/**
 * Canonical entity resolution for narrative evidence.
 *
 * The hard case is two people sharing a name (an uncle and a scene friend with
 * the same first name). Resolution never guesses between candidates that share
 * a surface form: it disambiguates from relationship-role words and alias
 * context near the mention, honors persisted separation constraints
 * (characters.metadata.distinct_from — the same store characterDeduplication
 * respects), and otherwise records a collision warning instead of attributing
 * the mention to anyone.
 */
import type {
  EntitySeparationConstraint,
  EvidenceRecord,
  KnownEntity,
} from './narrativeRecords';

export interface EntityResolutionOutcome {
  records: EvidenceRecord[];
  constraints: EntitySeparationConstraint[];
  collisionWarnings: string[];
}

const KINSHIP_ROLE_RE =
  /\b(uncle|aunt|t[ií][oa]|cousin|brother|sister|mom|dad|mother|father|grandma|grandpa|abuel[oa]|nephew|niece)\b/i;

const CORRECTION_RE =
  /\bdo(?:n'?t| not) (?:confuse|mix up)\b|\bnot the same (?:person|as)\b|\bkeep(?:s)? (?:getting|being) confused with\b/i;

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface AliasIndexEntry {
  surface: string;
  entityId: string;
  /** true when this alias is unique to the entity (not shared with others). */
  exclusive: boolean;
}

function buildAliasIndex(entities: KnownEntity[]): Map<string, AliasIndexEntry[]> {
  const index = new Map<string, AliasIndexEntry[]>();
  for (const entity of entities) {
    const surfaces = new Set(
      [entity.name, ...entity.aliases].map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    for (const surface of surfaces) {
      const list = index.get(surface) ?? [];
      list.push({ surface, entityId: entity.id, exclusive: true });
      index.set(surface, list);
    }
  }
  for (const list of index.values()) {
    if (list.length > 1) list.forEach((e) => (e.exclusive = false));
  }
  return index;
}

/** Separation constraints persisted on the roster plus ones stated in corrections. */
export function buildSeparationConstraints(
  entities: KnownEntity[],
  records: EvidenceRecord[]
): EntitySeparationConstraint[] {
  const byPair = new Map<string, EntitySeparationConstraint>();

  for (const entity of entities) {
    for (const otherId of entity.distinctFromIds) {
      const key = pairKey(entity.id, otherId);
      if (!byPair.has(key)) {
        byPair.set(key, {
          entityIdA: entity.id,
          entityIdB: otherId,
          reason: 'user marked entities as distinct',
          evidenceIds: [],
          confidence: 0.95,
        });
      }
    }
  }

  // Corrections like "X's name is <shared name>. Do not confuse him with my
  // tío <shared name>." reinforce separation between every pair of
  // same-surface entities named in that record.
  const aliasIndex = buildAliasIndex(entities);
  for (const record of records) {
    if (!CORRECTION_RE.test(record.text)) continue;
    for (const [surface, list] of aliasIndex) {
      if (list.length < 2) continue;
      if (!new RegExp(`\\b${escapeRegExp(surface)}\\b`, 'i').test(record.text)) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const key = pairKey(list[i].entityId, list[j].entityId);
          const existing = byPair.get(key);
          if (existing) {
            if (!existing.evidenceIds.includes(record.id)) existing.evidenceIds.push(record.id);
            existing.confidence = Math.max(existing.confidence, 0.9);
          } else {
            byPair.set(key, {
              entityIdA: list[i].entityId,
              entityIdB: list[j].entityId,
              reason: 'user correction: do not confuse same-name entities',
              evidenceIds: [record.id],
              confidence: 0.9,
            });
          }
        }
      }
    }
  }

  return [...byPair.values()];
}

/**
 * Resolve mentions in every record. Ambiguous surfaces (same name, multiple
 * candidates) resolve only when local context — a kinship/role word or an
 * exclusive alias — points at exactly one candidate; otherwise the mention is
 * dropped and a collision warning is recorded.
 */
export function resolveEntities(
  records: EvidenceRecord[],
  entities: KnownEntity[]
): EntityResolutionOutcome {
  const constraints = buildSeparationConstraints(entities, records);
  const aliasIndex = buildAliasIndex(entities);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const collisionWarnings = new Set<string>();

  const resolved = records.map((record) => {
    const mentions: EvidenceRecord['mentions'] = [];
    const seenEntityIds = new Set<string>();

    for (const [surface, candidates] of aliasIndex) {
      const surfaceRe = new RegExp(`\\b${escapeRegExp(surface)}\\b`, 'i');
      const match = surfaceRe.exec(record.text);
      if (!match) continue;

      if (candidates.length === 1) {
        const { entityId } = candidates[0];
        if (!seenEntityIds.has(entityId)) {
          seenEntityIds.add(entityId);
          mentions.push({ entityId, surface, confidence: 0.9 });
        }
        continue;
      }

      // Ambiguous surface: look at the words immediately around the mention.
      const start = Math.max(0, match.index - 30);
      const context = record.text.slice(start, match.index + surface.length + 30);
      const kinshipNearby = KINSHIP_ROLE_RE.test(context);

      const scored = candidates
        .map((candidate) => {
          const entity = byId.get(candidate.entityId);
          if (!entity) return { candidate, score: 0 };
          let score = 0;
          const role = entity.relationshipRole?.toLowerCase() ?? '';
          const roleIsKin = KINSHIP_ROLE_RE.test(role);
          if (kinshipNearby && roleIsKin) score += 2;
          if (kinshipNearby && !roleIsKin) score -= 2;
          // An exclusive alias appearing elsewhere in the record pins the entity.
          for (const alias of entity.aliases) {
            const a = alias.trim().toLowerCase();
            if (!a || a === surface) continue;
            if (
              (aliasIndex.get(a) ?? []).length === 1 &&
              new RegExp(`\\b${escapeRegExp(a)}\\b`, 'i').test(record.text)
            ) {
              score += 3;
            }
          }
          return { candidate, score };
        })
        .sort((a, b) => b.score - a.score);

      const [best, second] = scored;
      if (best && best.score > 0 && (!second || best.score > second.score)) {
        if (!seenEntityIds.has(best.candidate.entityId)) {
          seenEntityIds.add(best.candidate.entityId);
          mentions.push({ entityId: best.candidate.entityId, surface, confidence: 0.7 });
        }
      } else {
        collisionWarnings.add(
          `ambiguous mention "${surface}" matches ${candidates.length} entities; left unattributed (evidence ${record.id})`
        );
      }
    }

    return { ...record, mentions };
  });

  return { records: resolved, constraints, collisionWarnings: [...collisionWarnings] };
}

/** True when the two entity ids are under a separation constraint. */
export function isSeparated(
  a: string,
  b: string,
  constraints: EntitySeparationConstraint[]
): boolean {
  const key = pairKey(a, b);
  return constraints.some((c) => pairKey(c.entityIdA, c.entityIdB) === key);
}
