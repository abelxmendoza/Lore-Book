/**
 * Narrative anchor resolver — retrieval chains for entity-centric queries.
 * "Tell me about Bryan" → Bryan → Middle School Era → School → Band → Wednesday Practices
 */
import type { AnchorRetrievalChain, NarrativeAnchor } from './narrativeAnchorTypes';
import { narrativeAnchorService } from './narrativeAnchorService';
import { buildAnchorsFromContext } from './anchorClusterBuilder';
import { computeEntityGravity } from './entityGravityService';
import type { EntityGravityInput } from './narrativeAnchorTypes';

function formatRetrievalContext(chain: AnchorRetrievalChain): string {
  const lines: string[] = [
    `Narrative context for ${chain.entityName} (gravity ${chain.gravityScore.toFixed(2)}):`,
  ];

  for (const anchor of chain.anchors) {
    const related = anchor.relatedEntities.filter((n) => n !== chain.entityName).join(', ');
    lines.push(`• ${anchor.title} [${anchor.anchorType}] — ${related || 'cluster members'}`);
    for (const ev of anchor.evidence.slice(0, 2)) {
      lines.push(`  - ${ev.label}`);
    }
  }

  return lines.join('\n');
}

function resolveFromAnchors(
  entityId: string,
  entityName: string,
  gravityScore: number,
  anchors: NarrativeAnchor[],
): AnchorRetrievalChain {
  const matching = anchors
    .filter((a) => a.entities.some((e) => e.id === entityId))
    .sort((a, b) => b.gravityScore - a.gravityScore)
    .slice(0, 5);

  return {
    entityId,
    entityName,
    gravityScore,
    anchors: matching.map((a) => ({
      anchorId: a.id,
      title: a.title,
      anchorType: a.anchorType,
      gravityScore: a.gravityScore,
      relatedEntities: a.entities.map((e) => e.name),
      evidence: a.evidence.slice(0, 5),
    })),
  };
}

export const narrativeAnchorResolver = {
  resolveFromAnchors,

  async resolveForEntity(userId: string, entityId: string, entityName?: string): Promise<AnchorRetrievalChain> {
    const anchors = await narrativeAnchorService.listAnchors(userId, { limit: 100 });

    const { data: gravityRow } = await import('../supabaseClient').then(({ supabaseAdmin }) =>
      supabaseAdmin
        .from('entity_gravity_scores')
        .select('gravity_score, entity_name')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', 'character')
        .maybeSingle(),
    );

    const name = entityName ?? (gravityRow?.entity_name as string) ?? 'Entity';
    const gravityScore = Number(gravityRow?.gravity_score ?? 0.5);

    return resolveFromAnchors(entityId, name, gravityScore, anchors);
  },

  resolveForEntityInContext(
    entity: EntityGravityInput,
    ctx: Parameters<typeof buildAnchorsFromContext>[0],
  ): AnchorRetrievalChain {
    const anchors = buildAnchorsFromContext(ctx);
    const gravity = computeEntityGravity(entity);
    return resolveFromAnchors(entity.entityId, entity.name, gravity.gravityScore, anchors);
  },

  formatRetrievalContext,
};
