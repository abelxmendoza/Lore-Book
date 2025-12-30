import { logger } from '../../logger';
import { randomUUID } from 'crypto';
import { embeddingService } from '../embeddingService';
import { IdentitySignalExtractor } from './identitySignals';
import { IdentityDimensionBuilder } from './identityDimensions';
import { IdentityConflictDetector } from './identityConflicts';
import { IdentityStabilityAnalyzer } from './identityStability';
import { IdentityProjectionEngine } from './identityProjection';
import { IdentitySummary } from './identitySummary';
import { IdentityStorage } from './identityStorage';
import type { IdentitySignal, IdentityCoreProfile } from './identityTypes';

/**
 * Main Identity Core Engine
 * Extracts the essence of who you are from journal entries
 */
export class IdentityCoreEngine {
  private signals: IdentitySignalExtractor;
  private dimensions: IdentityDimensionBuilder;
  private conflicts: IdentityConflictDetector;
  private stability: IdentityStabilityAnalyzer;
  private projection: IdentityProjectionEngine;
  private summary: IdentitySummary;
  private storage: IdentityStorage;

  constructor() {
    this.signals = new IdentitySignalExtractor();
    this.dimensions = new IdentityDimensionBuilder();
    this.conflicts = new IdentityConflictDetector();
    this.stability = new IdentityStabilityAnalyzer();
    this.projection = new IdentityProjectionEngine();
    this.summary = new IdentitySummary();
    this.storage = new IdentityStorage();
  }

  /**
   * Process identity core from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<IdentityCoreProfile> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing identity core');

      // Step 1: Extract identity signals
      const rawSignals = this.signals.extract(ctx.entries);

      if (rawSignals.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No identity signals found');
        return {
          id: randomUUID(),
          dimensions: [],
          conflicts: [],
          stability: {
            volatility: 0,
            anchors: [],
            unstableTraits: [],
          },
          projection: {
            trajectory: [],
            predictedIdentity: 'Unknown',
          },
          summary: 'No identity signals detected in entries.',
        };
      }

      // Step 2: Generate embeddings
      const signalsWithEmbeddings = await Promise.all(
        rawSignals.map(async (signal) => {
          const embedding = await embeddingService.embedText(signal.text);
          return {
            ...signal,
            embedding,
          };
        })
      );

      // Step 3: Save signals
      const savedSignals = await this.storage.saveSignals(ctx.user.id, signalsWithEmbeddings);

      // Step 4: Build dimensions
      const dims = this.dimensions.build(savedSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Step 5: Detect conflicts
      const conflicts = this.conflicts.detect(savedSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Step 6: Compute stability
      const stability = this.stability.compute(savedSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Step 7: Project identity
      const projection = this.projection.project(dims);

      // Step 8: Build summary
      const summary = this.summary.build(dims, conflicts, stability, projection);

      // Step 9: Create profile
      const profile: IdentityCoreProfile = {
        id: randomUUID(),
        dimensions: dims,
        conflicts,
        stability,
        projection,
        summary,
      };

      // Step 10: Save profile
      const savedProfile = await this.storage.save(ctx.user.id, profile);

      // Step 11: Save dimensions with profile ID
      await this.storage.saveDimensions(ctx.user.id, savedProfile.id, dims);

      // Step 12: Save conflicts with profile ID
      await this.storage.saveConflicts(ctx.user.id, savedProfile.id, conflicts);

      logger.info(
        {
          userId: ctx.user.id,
          signals: savedSignals.length,
          dimensions: dims.length,
          conflicts: conflicts.length,
          profileId: savedProfile.id,
        },
        'Processed identity core'
      );

      return {
        ...profile,
        id: savedProfile.id,
        user_id: savedProfile.user_id,
        created_at: savedProfile.created_at,
        updated_at: savedProfile.updated_at,
      };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing identity core');
      throw error;
    }
  }
}

