import { logger } from '../../logger';
import { randomUUID } from 'crypto';
import { embeddingService } from '../embeddingService';
import { MythExtractor } from './mythExtractor';
import { MythArchetypeMapper } from './mythArchetypeMapper';
import { MythPatternDetector } from './mythPatternDetector';
import { MythNarrativeBuilder } from './mythNarrativeBuilder';
import { MythStorage } from './mythStorage';
import type { MythElement, InnerMyth } from './mythTypes';

/**
 * Main Inner Mythology Engine
 * Identifies and structures mythological elements, archetypes, motifs, and narrative patterns
 */
export class InnerMythologyEngine {
  private extractor: MythExtractor;
  private mapper: MythArchetypeMapper;
  private patterns: MythPatternDetector;
  private builder: MythNarrativeBuilder;
  private storage: MythStorage;

  constructor() {
    this.extractor = new MythExtractor();
    this.mapper = new MythArchetypeMapper();
    this.patterns = new MythPatternDetector();
    this.builder = new MythNarrativeBuilder();
    this.storage = new MythStorage();
  }

  /**
   * Process inner mythology from context
   */
  async process(ctx: { entries: any[]; user: { id: string } }): Promise<InnerMyth> {
    try {
      logger.debug({ userId: ctx.user.id, entries: ctx.entries.length }, 'Processing inner mythology');

      // Step 1: Extract myth elements
      const elements = this.extractor.extract(ctx.entries);

      if (elements.length === 0) {
        logger.debug({ userId: ctx.user.id }, 'No myth elements found');
        return {
          id: randomUUID(),
          name: 'Inner Mythology',
          themes: [],
          motifs: [],
          summary: 'No mythological elements detected in entries.',
        };
      }

      // Step 2: Map to archetypes
      const archetypes = this.mapper.map(elements);

      // Step 3: Detect motifs
      const motifs = this.patterns.detect(elements);

      // Step 4: Generate embeddings
      const withEmbeddings = await Promise.all(
        elements.map(async (element) => {
          const embedding = await embeddingService.embedText(element.text);
          return {
            ...element,
            embedding,
          };
        })
      );

      // Step 5: Save elements
      const savedElements = await this.storage.saveElements(ctx.user.id, withEmbeddings);

      // Step 6: Update motifs with saved element IDs
      const motifsWithIds = motifs.map((motif) => ({
        ...motif,
        elements: motif.elements.map((el) => {
          const saved = savedElements.find((se) => se.text === el.text && se.category === el.category);
          return saved ? { ...el, id: saved.id } : el;
        }),
      }));

      // Step 7: Save motifs
      const savedMotifs = await this.storage.saveMotifs(ctx.user.id, motifsWithIds);

      // Step 8: Extract themes
      const themes = [
        ...new Set([
          ...archetypes.map((a) => a.archetype),
          ...motifs.map((m) => m.motifType),
        ]),
      ];

      // Step 9: Build narrative summary
      const summary = this.builder.build(themes, motifs);

      // Step 10: Create inner myth
      const myth: InnerMyth = {
        id: randomUUID(),
        name: 'Inner Mythology',
        themes,
        motifs: savedMotifs.map((sm, i) => ({
          ...motifsWithIds[i],
          id: sm.id,
          user_id: sm.user_id,
          created_at: sm.created_at,
        })),
        summary,
      };

      // Step 11: Save myth
      const savedMyth = await this.storage.save(ctx.user.id, myth);

      // Step 12: Save archetypes
      await this.storage.saveArchetypes(ctx.user.id, savedMyth.id, archetypes);

      logger.info(
        {
          userId: ctx.user.id,
          elements: savedElements.length,
          motifs: savedMotifs.length,
          archetypes: archetypes.length,
          mythId: savedMyth.id,
        },
        'Processed inner mythology'
      );

      return {
        ...myth,
        id: savedMyth.id,
        user_id: savedMyth.user_id,
        created_at: savedMyth.created_at,
        updated_at: savedMyth.updated_at,
      };
    } catch (error) {
      logger.error({ error, userId: ctx.user.id }, 'Error processing inner mythology');
      throw error;
    }
  }
}

