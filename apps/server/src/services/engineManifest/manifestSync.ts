import OpenAI from 'openai';
import { logger } from '../../logger';
import { ManifestService } from './manifestService';
import { ManifestRegistry } from './manifestRegistry';

/**
 * Syncs local blueprints to Supabase and creates embeddings
 */
export class ManifestSync {
  private openai: OpenAI;
  private manifestService: ManifestService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.manifestService = new ManifestService();
  }

  /**
   * Sync local blueprints to Supabase and create embeddings
   */
  async sync(): Promise<void> {
    try {
      logger.info('Starting engine manifest sync');

      // Load local blueprints
      const { manifest, blueprints } = ManifestRegistry.loadLocalBlueprints();

      if (manifest.length === 0) {
        logger.warn('No local blueprints found');
        return;
      }

      // Upsert manifest records
      await this.manifestService.upsertManifest(manifest);

      // Add blueprints and create embeddings
      for (const blueprint of blueprints) {
        // Add blueprint
        await this.manifestService.addBlueprint(blueprint.name, blueprint.blueprint);

        // Create embedding
        try {
          const embeddingResponse = await this.openai.embeddings.create({
            model: 'text-embedding-3-large',
            input: blueprint.blueprint,
          });

          const embedding = embeddingResponse.data[0].embedding;
          const tokens = embeddingResponse.usage.total_tokens;

          // Add embedding
          await this.manifestService.addEmbedding(blueprint.name, embedding, tokens);

          logger.debug({ engine: blueprint.name, tokens }, 'Created embedding');
        } catch (error) {
          logger.error({ error, engine: blueprint.name }, 'Failed to create embedding');
        }
      }

      logger.info({ engines: manifest.length }, 'Completed engine manifest sync');
    } catch (error) {
      logger.error({ error }, 'Failed to sync engine manifest');
      throw error;
    }
  }
}

