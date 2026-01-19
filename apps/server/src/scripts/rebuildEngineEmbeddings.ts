#!/usr/bin/env ts-node

/**
 * Rebuild Engine Embeddings Script
 * Re-syncs all engine blueprints and rebuilds embeddings
 */

import { logger } from '../logger';
import { ManifestSync } from '../services/engineManifest/manifestSync';

async function main() {
  logger.info('Starting engine embeddings rebuild');

  try {
    const sync = new ManifestSync();
    await sync.sync();
    logger.info('Engine embeddings rebuild completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Engine embeddings rebuild failed');
    process.exit(1);
  }
}

main();

