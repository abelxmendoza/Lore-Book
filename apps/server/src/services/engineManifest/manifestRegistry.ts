import fs from 'fs';
import path from 'path';

import { logger } from '../../logger';

import type { EngineManifestRecord } from './manifestTypes';

/**
 * Loads local blueprint markdown files and creates manifest entries
 */
export class ManifestRegistry {
  /**
   * Load local blueprints from /docs/engines/*.md
   */
  static loadLocalBlueprints(): {
    manifest: EngineManifestRecord[];
    blueprints: Array<{ name: string; blueprint: string }>;
  } {
    const manifest: EngineManifestRecord[] = [];
    const blueprints: Array<{ name: string; blueprint: string }> = [];

    try {
      // Try to load from docs/engines directory
      const docsPath = path.join(process.cwd(), 'docs', 'engines');
      
      if (!fs.existsSync(docsPath)) {
        logger.warn({ docsPath }, 'Engine blueprints directory not found, creating it');
        fs.mkdirSync(docsPath, { recursive: true });
        return { manifest, blueprints };
      }

      const files = fs.readdirSync(docsPath);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(docsPath, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const name = file.replace('.md', '');

        // Determine category based on name patterns
        let category: EngineManifestRecord['category'] = 'specialized';
        if (name.includes('chronology') || name.includes('continuity') || name.includes('context')) {
          category = 'core';
        } else if (name.includes('analytics') || name.includes('pulse') || name.includes('insight')) {
          category = 'analytics';
        } else if (name.includes('health') || name.includes('financial') || name.includes('time')) {
          category = 'domain';
        }

        manifest.push({
          name,
          category,
          status: 'implemented',
          version: '1.0.0',
          description: `Blueprint for ${name} engine`,
        });

        blueprints.push({ name, blueprint: raw });
      }

      logger.info({ count: manifest.length }, 'Loaded local engine blueprints');
    } catch (error) {
      logger.error({ error }, 'Failed to load local blueprints');
    }

    return { manifest, blueprints };
  }

  /**
   * Get all engine names from services directory
   */
  static getEngineNamesFromServices(): string[] {
    const engines: string[] = [];

    try {
      const servicesPath = path.join(process.cwd(), 'apps', 'server', 'src', 'services');
      
      if (!fs.existsSync(servicesPath)) {
        return engines;
      }

      const entries = fs.readdirSync(servicesPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if it has an engine file
          const engineFiles = ['engine.ts', 'Engine.ts', `${entry.name}Engine.ts`];
          const hasEngine = engineFiles.some(file => {
            const filePath = path.join(servicesPath, entry.name, file);
            return fs.existsSync(filePath);
          });

          if (hasEngine) {
            engines.push(entry.name);
          }
        }
      }

      logger.debug({ engines: engines.length }, 'Found engines from services directory');
    } catch (error) {
      logger.error({ error }, 'Failed to scan services directory');
    }

    return engines;
  }
}

