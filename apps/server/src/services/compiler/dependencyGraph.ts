// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Dependency Graph - Tracks entry dependencies
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { EntryIR } from './types';

export class DependencyGraph {
  /**
   * Update dependency graph for an IR entry
   */
  async updateDependencyGraph(ir: EntryIR): Promise<void> {
    try {
      // Link entities to entry
      for (const entity of ir.entities) {
        await this.linkEntityToEntry(entity.entity_id, ir.id, ir.user_id);
      }

      // Link related entries
      if (ir.narrative_links.related_entry_ids) {
        for (const relatedId of ir.narrative_links.related_entry_ids) {
          await this.linkEntryDependency(ir.id, relatedId, ir.user_id);
        }
      }

      // Link previous entry
      if (ir.narrative_links.previous_entry_id) {
        await this.linkEntryDependency(ir.id, ir.narrative_links.previous_entry_id, ir.user_id);
      }

      logger.debug({ irId: ir.id, entityCount: ir.entities.length }, 'Updated dependency graph');
    } catch (error) {
      logger.error({ error, irId: ir.id }, 'Failed to update dependency graph');
    }
  }

  /**
   * Link entity to entry
   */
  private async linkEntityToEntry(entityId: string, entryId: string, userId?: string): Promise<void> {
    try {
      // Use provided userId or try to get it from database
      const finalUserId = userId || await this.getEntryUserId(entryId);
      if (!finalUserId) {
        logger.warn({ entryId }, 'Could not get user ID for entry');
        return;
      }

      // Store in dependency graph table
      const { error } = await supabaseAdmin
        .from('entry_dependencies')
        .upsert({
          entry_id: entryId,
          dependency_type: 'ENTITY',
          dependency_id: entityId,
          user_id: finalUserId,
        }, {
          onConflict: 'entry_id,dependency_type,dependency_id',
        });

      if (error) throw error;
    } catch (error) {
      logger.debug({ error, entityId, entryId }, 'Failed to link entity to entry');
    }
  }

  /**
   * Link entry dependency
   */
  private async linkEntryDependency(entryId: string, dependentEntryId: string, userId?: string): Promise<void> {
    try {
      // Use provided userId or try to get it from database
      const finalUserId = userId || await this.getEntryUserId(entryId);
      if (!finalUserId) {
        logger.warn({ entryId }, 'Could not get user ID for entry');
        return;
      }

      const { error } = await supabaseAdmin
        .from('entry_dependencies')
        .upsert({
          entry_id: entryId,
          dependency_type: 'ENTRY',
          dependency_id: dependentEntryId,
          user_id: finalUserId,
        }, {
          onConflict: 'entry_id,dependency_type,dependency_id',
        });

      if (error) throw error;
    } catch (error) {
      logger.debug({ error, entryId, dependentEntryId }, 'Failed to link entry dependency');
    }
  }

  /**
   * Get affected entries (transitive closure)
   */
  async getAffectedEntries(changedEntryIds: string[]): Promise<Set<string>> {
    const affected = new Set<string>(changedEntryIds);
    const queue = [...changedEntryIds];

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Get all entries that depend on this entry
      const { data: dependents } = await supabaseAdmin
        .from('entry_dependencies')
        .select('entry_id')
        .eq('dependency_type', 'ENTRY')
        .eq('dependency_id', current);

      if (dependents) {
        for (const dep of dependents) {
          if (!affected.has(dep.entry_id)) {
            affected.add(dep.entry_id);
            queue.push(dep.entry_id);
          }
        }
      }
    }

    return affected;
  }

  /**
   * Get entry user ID (helper)
   */
  private async getEntryUserId(entryId: string): Promise<string> {
    const { data } = await supabaseAdmin
      .from('entry_ir')
      .select('user_id')
      .eq('id', entryId)
      .single();

    return data?.user_id || '';
  }
}

export const dependencyGraph = new DependencyGraph();

