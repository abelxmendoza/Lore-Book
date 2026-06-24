/**
 * Association Ingestion Service — the LIVE entry point that makes the
 * association graph real. For a chat message it:
 *
 *   1. runs the LoreBook semantic analyzer (read-only, canonical identity),
 *   2. hydrates the user's persisted association graph,
 *   3. folds the analysis into it (semantic edges primary, regex fallback),
 *   4. persists the updated edges, and
 *   5. returns any promotions / group candidates the new evidence supports.
 *
 * It is gated behind ASSOCIATION_GRAPH_ENABLED and is fully fail-open: any error
 * is swallowed so it can never break the ingestion pipeline. This is what stops
 * LoreBook jumping mention → group: group candidates only come back here once
 * the promotion thresholds are met.
 */
import { analyzeSemanticsForUser } from '../lorebook/semantic';
import { selfCharacterService } from '../selfCharacterService';
import { logger } from '../../logger';
import { associationGraphStore } from './associationGraphStore';
import { associationInferenceService, type IngestResult } from './associationInferenceService';
import { associationBookBridge } from './associationBookBridge';
import { entityRef, type EntityRef } from './associationTypes';

export interface IngestMessageInput {
  userId: string;
  text: string;
  messageId?: string;
}

export const associationIngestionService = {
  enabled(): boolean {
    return process.env.ASSOCIATION_GRAPH_ENABLED === 'true';
  },

  /** Resolve the narrating subject (the self character) for this user. */
  async resolveSelf(userId: string): Promise<EntityRef> {
    try {
      const self = await selfCharacterService.ensureSelfCharacter(userId);
      const id = (self?.id as string) || 'self';
      const name = (self?.name as string) || 'Self';
      return entityRef(name, 'person', id);
    } catch {
      return { id: 'self', name: 'Self', kind: 'person' };
    }
  },

  /** Ingest one message into the user's association graph. Fail-open. */
  async ingestMessage(input: IngestMessageInput): Promise<IngestResult | null> {
    if (!this.enabled()) return null;
    const text = (input.text ?? '').trim();
    if (text.length < 3) return null;

    try {
      const analysis = await analyzeSemanticsForUser(input.userId, text, { messageId: input.messageId });
      const subject = await this.resolveSelf(input.userId);
      const graph = await associationGraphStore.loadGraph(input.userId);

      const result = associationInferenceService.ingestFromAnalysis(analysis, subject, graph);

      await associationGraphStore.persist(input.userId, graph.all());

      // Route evidence-earned memberships/groups into the confirm-before-truth books.
      const bridged = await associationBookBridge.route(input.userId, result, input.messageId);

      if (result.promotions.length > 0 || result.groups.length > 0 || bridged.organizationSuggestions > 0) {
        logger.info(
          {
            userId: input.userId,
            promotions: result.promotions.map((p) => `${p.fromType}→${p.toType}`),
            groups: result.groups.map((g) => g.name),
            orgSuggestions: bridged.organizationSuggestions,
            groupCandidates: bridged.groupCandidates,
          },
          'association graph: promotions/groups earned from accumulated evidence',
        );
      }
      return result;
    } catch (error) {
      logger.warn({ error, userId: input.userId }, 'association ingestion failed (non-fatal)');
      return null;
    }
  },
};
