import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import { IdentityConflictDetector } from './identityConflicts';
import { IdentityDimensionBuilder } from './identityDimensions';
import { IdentityProjectionEngine } from './identityProjection';
import { IdentitySignalExtractor } from './identitySignals';
import { IdentityStabilityAnalyzer } from './identityStability';
import { IdentityStorage } from './identityStorage';
import { IdentitySummary } from './identitySummary';
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
      const rawSignals = await this.signals.extract(ctx.entries);

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

      // Step 4: Build dimensions (now async with semantic clustering)
      const dims = await this.dimensions.build(savedSignals.map((s) => ({
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

  /**
   * Process identity from a single entry (incremental update)
   * Used when new entries are created and contain identity signals
   */
  async processFromEntry(
    userId: string,
    entry: { id: string; text: string; timestamp: string },
    components?: any[]
  ): Promise<void> {
    try {
      logger.debug({ userId, entryId: entry.id }, 'Processing identity from single entry');

      // Extract signals from this entry
      const rawSignals = await this.signals.extract([entry]);

      if (rawSignals.length === 0) {
        logger.debug({ userId, entryId: entry.id }, 'No identity signals in entry');
        return;
      }

      // Generate embeddings for new signals
      const signalsWithEmbeddings = await Promise.all(
        rawSignals.map(async (signal) => {
          const embedding = await embeddingService.embedText(signal.text);
          return {
            ...signal,
            embedding,
            memory_id: entry.id,
          };
        })
      );

      // Save new signals
      const savedSignals = await this.storage.saveSignals(userId, signalsWithEmbeddings);

      // Link signals to memory components if available
      if (components && components.length > 0) {
        await this.storage.linkSignalsToComponents(savedSignals, components);
      }

      // Get existing profile to update
      const existingProfiles = await this.storage.getProfiles(userId);
      const latestProfile = existingProfiles[0] || null;

      if (latestProfile) {
        // Incremental update: add new signals to existing profile
        await this.updateProfileIncremental(userId, latestProfile.id, savedSignals);
      } else {
        // No existing profile: need to process with recent entries
        // For now, just save signals - full profile will be built on next manual run
        logger.debug({ userId }, 'No existing profile, signals saved for later processing');
      }
    } catch (error) {
      logger.error({ error, userId, entryId: entry.id }, 'Error processing identity from entry');
      // Don't throw - this is fire-and-forget
    }
  }

  /**
   * Incrementally update profile with new signals
   */
  private async updateProfileIncremental(
    userId: string,
    profileId: string,
    newSignals: any[]
  ): Promise<void> {
    try {
      // Get all signals for user (including new ones)
      const allSignals = await this.storage.getSignals(userId, 1000);

      // Rebuild dimensions with all signals (now async with semantic clustering)
      const dims = await this.dimensions.build(allSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Rebuild conflicts
      const conflicts = this.conflicts.detect(allSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Recompute stability
      const stability = this.stability.compute(allSignals.map((s) => ({
        ...s,
        type: s.type as any,
        text: s.text,
        evidence: s.evidence,
        timestamp: s.timestamp,
        weight: s.weight,
        confidence: s.confidence,
      })));

      // Update projection
      const projection = this.projection.project(dims);

      // Rebuild summary
      const summary = this.summary.build(dims, conflicts, stability, projection);

      // Update profile
      const { data: profileRow } = await this.storage.updateProfile(profileId, {
        dimensions: dims,
        conflicts,
        stability,
        projection,
        summary,
      });

      // Update dimensions and conflicts
      await this.storage.saveDimensions(userId, profileId, dims);
      await this.storage.saveConflicts(userId, profileId, conflicts);

      logger.debug({ userId, profileId, newSignalsCount: newSignals.length }, 'Profile updated incrementally');
    } catch (error) {
      logger.error({ error, userId, profileId }, 'Error updating profile incrementally');
      throw error;
    }
  }
}

