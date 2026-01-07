// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Symbol Resolver - Resolves entities for entries
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { entitySymbolTable, type EntitySymbol, type EntityType, type CertaintySource } from './symbolTable';
import { epistemicTypeChecker } from './epistemicTypeChecker';
import { omegaMemoryService } from '../omegaMemoryService';
import { randomUUID } from 'crypto';
import type { EntryIR } from './types';

export class SymbolResolver {
  /**
   * Resolve entities for an entry using symbol table
   */
  async resolveEntitiesForEntry(entryIR: EntryIR): Promise<{
    resolved: EntitySymbol[];
    updatedIR: EntryIR;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let updatedIR = entryIR;

    // Determine scope for this entry
    const scopeId = await this.determineScope(entryIR);

    // Ensure scope exists
    await entitySymbolTable.enterScope('THREAD', scopeId);

    const resolved: EntitySymbol[] = [];

    for (const entityRef of entryIR.entities) {
      try {
        // Try to resolve symbol
        let symbol = await entitySymbolTable.resolve(entityRef.mention_text, scopeId);

        if (!symbol) {
          // Create new symbol
          symbol = await this.createNewSymbol(entityRef, entryIR, scopeId);
          await entitySymbolTable.defineSymbol(scopeId, symbol);
        }

        // Type check entity usage
        const typeCheck = epistemicTypeChecker.typeCheckEntityUsage(updatedIR, symbol);

        if (typeCheck.result === 'INVALID_LOW_CONFIDENCE') {
          // Downgrade assertion
          updatedIR = epistemicTypeChecker.downgradeAssertion(updatedIR, symbol);
          warnings.push(...(typeCheck.warnings || []));
        } else if (typeCheck.result === 'VALID_WITH_RESTRICTIONS') {
          warnings.push(...(typeCheck.warnings || []));
        }

        resolved.push(symbol);
      } catch (error) {
        logger.warn({ error, entityRef, entryId: entryIR.id }, 'Failed to resolve entity symbol');
      }
    }

    return { resolved, updatedIR, warnings };
  }

  /**
   * Determine scope for an entry
   */
  private async determineScope(entryIR: EntryIR): Promise<string> {
    // Use thread_id as scope (THREAD scope)
    // Could be enhanced to detect ERA or EVENT scopes
    return entryIR.thread_id;
  }

  /**
   * Create a new symbol from entity reference
   */
  private async createNewSymbol(
    entityRef: { entity_id: string; mention_text: string; confidence: number },
    entryIR: EntryIR,
    scopeId: string
  ): Promise<EntitySymbol> {
    try {
      // Get entity details from database
      const { data: entity } = await supabaseAdmin
        .from('entities')
        .select('*')
        .eq('id', entityRef.entity_id)
        .single();

      if (!entity) {
        // Fallback: create minimal symbol
        return {
          id: randomUUID(),
          canonical_name: entityRef.mention_text,
          entity_type: 'PERSON',
          aliases: [],
          confidence: entityRef.confidence,
          introduced_by_entry_id: entryIR.id,
          certainty_source: this.inferCertaintySource(entryIR),
        };
      }

      // Map entity type
      const entityType: EntityType = this.mapEntityType(entity.type);

      return {
        id: entity.id,
        canonical_name: entity.primary_name || entityRef.mention_text,
        entity_type: entityType,
        aliases: entity.aliases || [],
        confidence: entity.confidence || entityRef.confidence,
        introduced_by_entry_id: entryIR.id,
        certainty_source: this.inferCertaintySource(entryIR),
      };
    } catch (error) {
      logger.warn({ error, entityRef }, 'Failed to load entity for symbol creation');
      
      // Fallback
      return {
        id: randomUUID(),
        canonical_name: entityRef.mention_text,
        entity_type: 'PERSON',
        aliases: [],
        confidence: entityRef.confidence,
        introduced_by_entry_id: entryIR.id,
        certainty_source: this.inferCertaintySource(entryIR),
      };
    }
  }

  /**
   * Map entity type from database to symbol type
   */
  private mapEntityType(dbType: string): EntityType {
    const mapping: Record<string, EntityType> = {
      person: 'PERSON',
      character: 'CHARACTER',
      location: 'LOCATION',
      org: 'ORG',
      organization: 'ORG',
      event: 'EVENT',
      concept: 'CONCEPT',
    };

    return mapping[dbType.toLowerCase()] || 'PERSON';
  }

  /**
   * Infer certainty source from entry
   */
  private inferCertaintySource(entryIR: EntryIR): CertaintySource {
    if (entryIR.certainty_source === 'DIRECT_EXPERIENCE') {
      return 'DIRECT_EXPERIENCE';
    }
    if (entryIR.knowledge_type === 'BELIEF') {
      return 'INFERENCE';
    }
    return 'REFERENCE';
  }
}

export const symbolResolver = new SymbolResolver();

