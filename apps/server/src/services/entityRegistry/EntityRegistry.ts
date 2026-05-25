// =====================================================
// ENTITY REGISTRY
//
// Single façade over the 4 fragmented entity tables:
//   characters, omega_entities, people_places, entities
//
// Why it exists: the ingestion pipeline was duplicating
// the same two-pass lookup (characters → omega_entities)
// in at least 3 separate locations. Any schema change
// required hunting those sites down. This registry is
// the one place that knows how to resolve an entity.
//
// Priority order: characters → omega_entities → people_places → entities
// (characters are the richest; entities are the most generic)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type EntitySource = 'character' | 'omega_entity' | 'person_place' | 'entity';

export interface CanonicalEntity {
  id: string;
  name: string;
  type: string;
  source: EntitySource;
}

// Row shapes returned by each table
type CharRow   = { id: string; name: string };
type OmegaRow  = { id: string; primary_name: string; entity_type?: string | null };
type PPRow     = { id: string; name: string; type?: string | null };
type EntRow    = { id: string; canonical_name: string; type?: string | null };

class EntityRegistry {

  /**
   * Resolve a single entity by its DB id.
   * Checks all four tables and returns the first match.
   */
  async resolveById(id: string, userId: string): Promise<CanonicalEntity | null> {
    try {
      const { data: char } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle() as { data: CharRow | null };

      if (char) return { id: char.id, name: char.name, type: 'CHARACTER', source: 'character' };

      const { data: omega } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name, entity_type')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle() as { data: OmegaRow | null };

      if (omega) return { id: omega.id, name: omega.primary_name, type: omega.entity_type ?? 'ENTITY', source: 'omega_entity' };

      const { data: pp } = await supabaseAdmin
        .from('people_places')
        .select('id, name, type')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle() as { data: PPRow | null };

      if (pp) return { id: pp.id, name: pp.name, type: pp.type ?? 'PERSON', source: 'person_place' };

      const { data: ent } = await supabaseAdmin
        .from('entities')
        .select('id, canonical_name, type')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle() as { data: EntRow | null };

      if (ent) return { id: ent.id, name: ent.canonical_name, type: ent.type ?? 'ENTITY', source: 'entity' };

      return null;
    } catch (err) {
      logger.debug({ err, id, userId }, 'EntityRegistry.resolveById: lookup error');
      return null;
    }
  }

  /**
   * Resolve an entity by name (case-insensitive).
   * Also checks aliases in people_places (corrected_names) and entities (aliases).
   */
  async resolveByName(name: string, userId: string): Promise<CanonicalEntity | null> {
    try {
      const { data: char } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', name)
        .limit(1)
        .maybeSingle() as { data: CharRow | null };

      if (char) return { id: char.id, name: char.name, type: 'CHARACTER', source: 'character' };

      const { data: omega } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name, entity_type')
        .eq('user_id', userId)
        .ilike('primary_name', name)
        .limit(1)
        .maybeSingle() as { data: OmegaRow | null };

      if (omega) return { id: omega.id, name: omega.primary_name, type: omega.entity_type ?? 'ENTITY', source: 'omega_entity' };

      const { data: ppByName } = await supabaseAdmin
        .from('people_places')
        .select('id, name, type')
        .eq('user_id', userId)
        .ilike('name', name)
        .limit(1)
        .maybeSingle() as { data: PPRow | null };

      if (ppByName) return { id: ppByName.id, name: ppByName.name, type: ppByName.type ?? 'PERSON', source: 'person_place' };

      const { data: ppByAlias } = await supabaseAdmin
        .from('people_places')
        .select('id, name, type')
        .eq('user_id', userId)
        .contains('corrected_names', [name.toLowerCase()])
        .limit(1)
        .maybeSingle() as { data: PPRow | null };

      if (ppByAlias) return { id: ppByAlias.id, name: ppByAlias.name, type: ppByAlias.type ?? 'PERSON', source: 'person_place' };

      const { data: entByName } = await supabaseAdmin
        .from('entities')
        .select('id, canonical_name, type')
        .eq('user_id', userId)
        .ilike('canonical_name', name)
        .limit(1)
        .maybeSingle() as { data: EntRow | null };

      if (entByName) return { id: entByName.id, name: entByName.canonical_name, type: entByName.type ?? 'ENTITY', source: 'entity' };

      const { data: entByAlias } = await supabaseAdmin
        .from('entities')
        .select('id, canonical_name, type')
        .eq('user_id', userId)
        .contains('aliases', [name.toLowerCase()])
        .limit(1)
        .maybeSingle() as { data: EntRow | null };

      if (entByAlias) return { id: entByAlias.id, name: entByAlias.canonical_name, type: entByAlias.type ?? 'ENTITY', source: 'entity' };

      return null;
    } catch (err) {
      logger.debug({ err, name, userId }, 'EntityRegistry.resolveByName: lookup error');
      return null;
    }
  }

  /**
   * Bulk resolve a list of IDs. Returns only the ones found.
   * Parallelises the four table lookups rather than calling resolveById in a loop.
   */
  async resolveManyById(ids: string[], userId: string): Promise<CanonicalEntity[]> {
    if (ids.length === 0) return [];

    const [chars, omegas, pps, ents] = await Promise.all([
      supabaseAdmin.from('characters').select('id, name').in('id', ids).eq('user_id', userId),
      supabaseAdmin.from('omega_entities').select('id, primary_name, entity_type').in('id', ids).eq('user_id', userId),
      supabaseAdmin.from('people_places').select('id, name, type').in('id', ids).eq('user_id', userId),
      supabaseAdmin.from('entities').select('id, canonical_name, type').in('id', ids).eq('user_id', userId),
    ]);

    const result: CanonicalEntity[] = [];
    const seen = new Set<string>();

    for (const c of ((chars.data ?? []) as CharRow[])) {
      if (!seen.has(c.id)) { result.push({ id: c.id, name: c.name, type: 'CHARACTER', source: 'character' }); seen.add(c.id); }
    }
    for (const o of ((omegas.data ?? []) as OmegaRow[])) {
      if (!seen.has(o.id)) { result.push({ id: o.id, name: o.primary_name, type: o.entity_type ?? 'ENTITY', source: 'omega_entity' }); seen.add(o.id); }
    }
    for (const p of ((pps.data ?? []) as PPRow[])) {
      if (!seen.has(p.id)) { result.push({ id: p.id, name: p.name, type: p.type ?? 'PERSON', source: 'person_place' }); seen.add(p.id); }
    }
    for (const e of ((ents.data ?? []) as EntRow[])) {
      if (!seen.has(e.id)) { result.push({ id: e.id, name: e.canonical_name, type: e.type ?? 'ENTITY', source: 'entity' }); seen.add(e.id); }
    }

    return result;
  }
}

export const entityRegistry = new EntityRegistry();
