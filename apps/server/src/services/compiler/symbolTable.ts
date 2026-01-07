// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Entity Symbol Table - Compiler-style symbol resolution
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { randomUUID } from 'crypto';
import type { EntryIR } from './types';

export type EntityType = 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT' | 'CONCEPT';
export type ScopeType = 'GLOBAL' | 'ERA' | 'EVENT' | 'THREAD';
export type CertaintySource = 'DIRECT_EXPERIENCE' | 'REFERENCE' | 'INFERENCE';

export interface EntitySymbol {
  id: string;
  canonical_name: string;
  entity_type: EntityType;
  aliases: string[];
  confidence: number;
  introduced_by_entry_id: string;
  certainty_source: CertaintySource;
}

export interface SymbolScope {
  scope_id: string;
  scope_type: ScopeType;
  parent_scope_id?: string;
  symbols: Map<string, EntitySymbol>; // lookup by name/alias
}

export class EntitySymbolTable {
  private scopes: Map<string, SymbolScope> = new Map();

  /**
   * Enter a new scope
   */
  async enterScope(
    scopeType: ScopeType,
    scopeId: string,
    parentScopeId?: string
  ): Promise<void> {
    const scope: SymbolScope = {
      scope_id: scopeId,
      scope_type: scopeType,
      parent_scope_id: parentScopeId,
      symbols: new Map(),
    };

    this.scopes.set(scopeId, scope);

    // Also persist to database
    try {
      await supabaseAdmin
        .from('symbol_scopes')
        .upsert({
          id: scopeId,
          scope_type: scopeType,
          parent_scope_id: parentScopeId,
          user_id: await this.getUserIdFromScope(scopeId),
        }, {
          onConflict: 'id',
        });
    } catch (error) {
      logger.debug({ error, scopeId }, 'Failed to persist scope to database');
    }

    logger.debug({ scopeId, scopeType, parentScopeId }, 'Entered symbol scope');
  }

  /**
   * Define a symbol in a scope
   */
  async defineSymbol(scopeId: string, symbol: EntitySymbol): Promise<void> {
    const scope = this.scopes.get(scopeId);
    if (!scope) {
      logger.warn({ scopeId }, 'Scope not found, creating it');
      await this.enterScope('THREAD', scopeId); // Default to THREAD
      return this.defineSymbol(scopeId, symbol);
    }

    // Add canonical name
    scope.symbols.set(symbol.canonical_name.toLowerCase(), symbol);

    // Add aliases
    for (const alias of symbol.aliases) {
      scope.symbols.set(alias.toLowerCase(), symbol);
    }

    // Persist to database
    try {
      const userId = await this.getUserIdFromScope(scopeId);
      if (userId) {
        await supabaseAdmin
          .from('entity_symbols')
          .upsert({
            id: symbol.id,
            canonical_name: symbol.canonical_name,
            entity_type: symbol.entity_type,
            aliases: symbol.aliases,
            confidence: symbol.confidence,
            introduced_by_entry_id: symbol.introduced_by_entry_id,
            certainty_source: symbol.certainty_source,
            scope_id: scopeId,
            user_id: userId,
          }, {
            onConflict: 'id',
          });
      }
    } catch (error) {
      logger.debug({ error, symbolId: symbol.id }, 'Failed to persist symbol to database');
    }

    logger.debug({ scopeId, symbolName: symbol.canonical_name }, 'Defined symbol in scope');
  }

  /**
   * Resolve a symbol by name (walk up scope chain)
   */
  async resolve(name: string, scopeId: string): Promise<EntitySymbol | null> {
    let currentScopeId: string | undefined = scopeId;

    while (currentScopeId) {
      const scope = this.scopes.get(currentScopeId);
      
      if (scope) {
        const symbol = scope.symbols.get(name.toLowerCase());
        if (symbol) {
          logger.debug({ name, scopeId: currentScopeId, symbolId: symbol.id }, 'Resolved symbol');
          return symbol;
        }
      }

      // Try database lookup
      const dbSymbol = await this.resolveFromDatabase(name, currentScopeId);
      if (dbSymbol) {
        // Load into memory cache
        if (scope) {
          scope.symbols.set(name.toLowerCase(), dbSymbol);
        }
        return dbSymbol;
      }

      // Walk up to parent scope
      if (scope?.parent_scope_id) {
        currentScopeId = scope.parent_scope_id;
      } else {
        // Try to get parent from database
        const { data: scopeData } = await supabaseAdmin
          .from('symbol_scopes')
          .select('parent_scope_id')
          .eq('id', currentScopeId)
          .single();

        currentScopeId = scopeData?.parent_scope_id || undefined;
      }
    }

    logger.debug({ name, scopeId }, 'Symbol not found in scope chain');
    return null;
  }

  /**
   * Resolve from database
   */
  private async resolveFromDatabase(name: string, scopeId: string): Promise<EntitySymbol | null> {
    try {
      // Search in current scope and parent scopes
      const { data: symbol } = await supabaseAdmin
        .from('entity_symbols')
        .select('*')
        .eq('scope_id', scopeId)
        .or(`canonical_name.ilike.%${name}%,aliases.cs.{${name}}`)
        .limit(1)
        .single();

      if (symbol) {
        return {
          id: symbol.id,
          canonical_name: symbol.canonical_name,
          entity_type: symbol.entity_type,
          aliases: symbol.aliases || [],
          confidence: symbol.confidence,
          introduced_by_entry_id: symbol.introduced_by_entry_id,
          certainty_source: symbol.certainty_source,
        };
      }
    } catch (error) {
      logger.debug({ error, name, scopeId }, 'Failed to resolve symbol from database');
    }

    return null;
  }

  /**
   * Get user ID from scope (helper)
   */
  private async getUserIdFromScope(scopeId: string): Promise<string> {
    try {
      const { data } = await supabaseAdmin
        .from('symbol_scopes')
        .select('user_id')
        .eq('id', scopeId)
        .single();

      return data?.user_id || '';
    } catch {
      // Try to get from entry_ir
      const { data } = await supabaseAdmin
        .from('entry_ir')
        .select('user_id')
        .eq('thread_id', scopeId)
        .limit(1)
        .single();

      return data?.user_id || '';
    }
  }

  /**
   * Load scope from database
   */
  async loadScope(scopeId: string): Promise<void> {
    try {
      const { data: scopeData } = await supabaseAdmin
        .from('symbol_scopes')
        .select('*')
        .eq('id', scopeId)
        .single();

      if (scopeData) {
        const scope: SymbolScope = {
          scope_id: scopeData.id,
          scope_type: scopeData.scope_type,
          parent_scope_id: scopeData.parent_scope_id,
          symbols: new Map(),
        };

        // Load symbols for this scope
        const { data: symbols } = await supabaseAdmin
          .from('entity_symbols')
          .select('*')
          .eq('scope_id', scopeId);

        if (symbols) {
          for (const symbolData of symbols) {
            const symbol: EntitySymbol = {
              id: symbolData.id,
              canonical_name: symbolData.canonical_name,
              entity_type: symbolData.entity_type,
              aliases: symbolData.aliases || [],
              confidence: symbolData.confidence,
              introduced_by_entry_id: symbolData.introduced_by_entry_id,
              certainty_source: symbolData.certainty_source,
            };

            scope.symbols.set(symbol.canonical_name.toLowerCase(), symbol);
            for (const alias of symbol.aliases) {
              scope.symbols.set(alias.toLowerCase(), symbol);
            }
          }
        }

        this.scopes.set(scopeId, scope);
        logger.debug({ scopeId }, 'Loaded scope from database');
      }
    } catch (error) {
      logger.debug({ error, scopeId }, 'Failed to load scope from database');
    }
  }
}

export const entitySymbolTable = new EntitySymbolTable();

