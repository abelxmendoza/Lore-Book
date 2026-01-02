import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import { ProjectionExtractor } from './projectionExtractor';
import { ProjectionClassifier } from './projectionClassifier';
import { ProjectionLinker } from './projectionLinker';
import { ProjectionScore } from './projectionScore';
import { ProjectionStorage } from './projectionStorage';
import type { SocialProjection, ProjectionLink } from './types';

/**
 * Main Social Projection Engine
 * Identifies hypothetical people, imagined groups, influencer/celebrity references
 */
export class SocialProjectionEngine {
  private extractor: ProjectionExtractor;
  private classifier: ProjectionClassifier;
  private linker: ProjectionLinker;
  private scorer: ProjectionScore;
  private storage: ProjectionStorage;

  constructor() {
    this.extractor = new ProjectionExtractor();
    this.classifier = new ProjectionClassifier();
    this.linker = new ProjectionLinker();
    this.scorer = new ProjectionScore();
    this.storage = new ProjectionStorage();
  }

  /**
   * Process social projections from context
   */
  async process(ctx: {
    entries: any[];
    user: { id: string };
    crushId?: string;
    gymId?: string;
    groupId?: string;
  }): Promise<{ projections: SocialProjection[]; links: ProjectionLink[] }> {
    try {
      logger.debug(
        { userId: ctx.user.id, entries: ctx.entries.length },
        'Processing social projections'
      );

      // Step 1: Extract projections
      let projections = this.extractor.extract(ctx.entries);

      if (projections.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No social projections found');
        return { projections: [], links: [] };
      }

      // Step 2: Classify projections
      projections = projections.map((p) => this.classifier.classify(p));

      // Step 3: Score projections
      const scored = projections.map((p) => ({
        ...p,
        score: this.scorer.score(p),
      }));

      // Step 4: Generate embeddings
      const withEmbeddings = await Promise.all(
        scored.map(async (p) => {
          const embedding = await embeddingService.embedText(p.evidence);
          return {
            ...p,
            embedding,
            memory_id: ctx.entries.find((e) => e.text === p.evidence)?.id,
          };
        })
      );

      // Step 5: Save projections
      const saved = await this.storage.saveProjections(ctx.user.id, withEmbeddings);

      // Step 6: Link projections
      const links = this.linker.link(saved, ctx);

      // Step 7: Save links
      const savedLinks = await this.storage.saveLinks(ctx.user.id, links);

      logger.info(
        {
          userId: ctx.user.id,
          projections: saved.length,
          links: savedLinks.length,
        },
        'Processed social projections'
      );

      return {
        projections: saved.map((p) => ({
          id: p.id,
          name: p.name,
          projectionType: p.projection_type,
          evidence: p.evidence,
          timestamp: p.timestamp,
          confidence: p.confidence,
          source: p.source,
          tags: p.tags || [],
          score: p.score,
          embedding: p.embedding || [],
          memory_id: p.memory_id,
          user_id: p.user_id,
          created_at: p.created_at,
        })),
        links: savedLinks.map((l) => ({
          id: l.id,
          projectionId: l.projection_id,
          relatedTo: l.related_to,
          linkType: l.link_type,
          confidence: l.confidence,
          user_id: l.user_id,
          created_at: l.created_at,
        })),
      };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing social projections');
      throw error;
    }
  }
}

