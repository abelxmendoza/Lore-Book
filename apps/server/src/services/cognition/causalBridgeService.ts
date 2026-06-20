import { logger } from '../../logger';
import { bridgeResolvedEvent } from '../narrativeSpine/legacyClaimBridge';
import { upsertEdge } from '../narrativeSpine/narrativeClaimRepository';
import { CAUSAL_TYPE_TO_SPINE } from './relationshipRegistry';

export type CausalLinkBridgeInput = {
  causeEventId: string;
  effectEventId: string;
  causalType: string;
  confidence: number;
  causalLinkId?: string;
  evidence?: string;
};

export async function bridgeCausalLink(
  userId: string,
  link: CausalLinkBridgeInput,
): Promise<boolean> {
  const causeClaim = await bridgeResolvedEvent(userId, link.causeEventId);
  const effectClaim = await bridgeResolvedEvent(userId, link.effectEventId);

  if (!causeClaim || !effectClaim) {
    logger.debug(
      { userId, causeEventId: link.causeEventId, effectEventId: link.effectEventId },
      'causalBridge: could not resolve event claims',
    );
    return false;
  }

  const relation = CAUSAL_TYPE_TO_SPINE[link.causalType] ?? 'led_to';
  const edge = await upsertEdge(userId, causeClaim.id, effectClaim.id, relation, link.confidence, {
    causal_type: link.causalType,
    source: 'event_causal_links',
    causal_link_id: link.causalLinkId ?? null,
    evidence: link.evidence ?? null,
  });

  return Boolean(edge);
}

export function ingestCausalLink(userId: string, link: CausalLinkBridgeInput): void {
  void bridgeCausalLink(userId, link).catch((err) => {
    logger.warn({ err, userId, link }, 'causalBridge: ingest failed');
  });
}
