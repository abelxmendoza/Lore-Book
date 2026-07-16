/**
 * Relationship salience inputs — classify each person's bond category and
 * recency so the salience engine can weigh who currently matters.
 *
 * Classification is generic-pattern only (kinship words, romantic relationship
 * types, work roles); names and identities always come from the user's graph.
 */
import type { AnchorBuildContext, EntityGravityInput } from './narrativeAnchorTypes';
import type { SalienceCategory } from './narrativeCognitionTypes';

const FAMILY_RE =
  /\b(mom|mother|dad|father|grandm(?:a|other)|grandpa|grandfather|abuel[oa]|brother|sister|sibling|cousin|aunt|uncle|t[ií][oa]s?|nephew|niece|household|family)\b/i;
const ROMANTIC_RE =
  /\b(girlfriend|boyfriend|partner|spouse|wife|husband|romantic|dating|situationship|ex[- ]?(girlfriend|boyfriend|partner)?)\b/i;
const ENDED_BOND_RE = /\b(ex[- ]?(girlfriend|boyfriend|partner)?|broke up|breakup|ended (things|the relationship)|former partner)\b/i;
const COWORKER_RE =
  /\b(coworker|colleague|manager|boss|team ?lead|lead engineer|lead developer|teammate|supervisor|works? with (me|us)|on my team)\b/i;
const MENTOR_RE = /\b(mentor|coach|teacher|professor|advisor)\b/i;
const FRIEND_RE = /\b(best ?friend|close friend|friend|homie|bestie)\b/i;
const WORK_ORG_RE = /\b(company|employer|team|department|workplace)\b/i;
const COMMUNITY_ORG_RE = /\b(band|scene|community|club|crew|collective)\b/i;

export type PersonSalienceInput = {
  gravity: EntityGravityInput;
  category: SalienceCategory;
  /** Days since the entity last appeared; null when recency is unknown. */
  daysSinceLastSeen: number | null;
  /** A romantic bond that ended but may still carry emotional weight. */
  hasEndedBond: boolean;
};

function corpusFor(entity: EntityGravityInput, ctx: AnchorBuildContext): string {
  const relTypes = ctx.relationships
    .filter((r) => r.sourceId === entity.entityId || r.targetId === entity.entityId)
    .map((r) => r.type);
  return [...(entity.roles ?? []), ...(entity.facts ?? []), ...relTypes].join(' ');
}

function orgCorpusFor(entity: EntityGravityInput, ctx: AnchorBuildContext): string {
  return ctx.organizations
    .filter((org) => org.memberIds.includes(entity.entityId))
    .map((org) => `${org.name} ${org.type ?? ''}`)
    .join(' ');
}

export function classifyPersonCategory(
  entity: EntityGravityInput,
  ctx: AnchorBuildContext,
): SalienceCategory {
  const corpus = corpusFor(entity, ctx);
  const orgCorpus = orgCorpusFor(entity, ctx);

  // Romantic beats family ("dating my brother's friend" mentions both worlds);
  // family beats work (a cousin who also works with you is family first).
  if (ROMANTIC_RE.test(corpus)) return 'partner_or_ex';
  if (FAMILY_RE.test(corpus)) return 'family';
  if (MENTOR_RE.test(corpus)) return 'mentor';
  if (COWORKER_RE.test(corpus) || WORK_ORG_RE.test(orgCorpus)) return 'coworker';
  if (FRIEND_RE.test(corpus)) return 'friend';
  if (COMMUNITY_ORG_RE.test(orgCorpus)) return 'community';
  return 'other';
}

export function daysBetween(fromIso: string | undefined, toIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, (to - from) / 86_400_000);
}

export function buildSalienceInputs(
  ctx: AnchorBuildContext,
  recencyByEntity: Map<string, string>,
  now: string,
): PersonSalienceInput[] {
  return ctx.entities
    .filter((entity) => entity.entityType === 'character')
    .map((entity) => {
      const corpus = corpusFor(entity, ctx);
      return {
        gravity: entity,
        category: classifyPersonCategory(entity, ctx),
        daysSinceLastSeen: daysBetween(recencyByEntity.get(entity.entityId), now),
        hasEndedBond: ENDED_BOND_RE.test(corpus),
      };
    });
}
