/**
 * Persist discovered entity links to entity_relationships / character_relationships.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { selfCharacterService } from '../selfCharacterService';
import { entityRegistry } from '../entityRegistry/EntityRegistry';
import type { DiscoveredEntityLink } from './canonical/relationshipKnowledge';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { MeaningResolutionResult } from '../meaning/meaningResolutionTypes';

export type EntityStorageType = 'character' | 'omega_entity';

export interface ResolvedEntityRef {
  id: string;
  type: EntityStorageType;
  name: string;
}

export interface RelationshipPersistResult {
  persisted: number;
  skipped: number;
  characterEdges: number;
  entityEdges: number;
}

const MIN_CONFIDENCE = 0.65;
const SELF_ALIASES = new Set(['self', 'me', 'user', 'protagonist']);

class RelationshipPersistenceService {
  async persistFromInterpretation(
    userId: string,
    messageId: string,
    lexical: LexicalAnalysisResult,
    meaning: MeaningResolutionResult
  ): Promise<RelationshipPersistResult> {
    const links = lexical.entityLinks ?? [];
    if (links.length === 0) {
      return { persisted: 0, skipped: 0, characterEdges: 0, entityEdges: 0 };
    }

    const refs = await this.buildRefIndex(userId, meaning);
    let persisted = 0;
    let skipped = 0;
    let characterEdges = 0;
    let entityEdges = 0;

    for (const link of links) {
      if (link.confidence < MIN_CONFIDENCE) {
        skipped++;
        continue;
      }
      if (link.relationshipType === 'MENTIONED_IN' && link.confidence < 0.75) {
        skipped++;
        continue;
      }

      const from = await this.resolveEndpoint(userId, link.subject, refs);
      const to = await this.resolveEndpoint(userId, link.object, refs);
      if (!from || !to) {
        skipped++;
        continue;
      }
      if (from.id === to.id && from.type === to.type) {
        skipped++;
        continue;
      }

      const scope = link.scope?.toLowerCase() ?? null;
      const evidence = link.cue;

      if (from.type === 'character' && to.type === 'character') {
        const ok = await this.upsertCharacterRelationship(
          userId,
          from,
          to,
          link.relationshipType,
          link.confidence,
          messageId,
          evidence
        );
        if (ok) {
          persisted++;
          characterEdges++;
        } else skipped++;
      } else {
        const ok = await this.upsertEntityRelationship(
          userId,
          from,
          to,
          link.relationshipType,
          scope,
          link.confidence,
          messageId,
          evidence,
          link
        );
        if (ok) {
          persisted++;
          entityEdges++;
        } else skipped++;
      }
    }

    if (persisted > 0) {
      logger.info(
        { userId, messageId, persisted, skipped, characterEdges, entityEdges },
        'Persisted relationship links from interpretation pipeline'
      );
    }

    return { persisted, skipped, characterEdges, entityEdges };
  }

  /** Load relationship knowledge for a character from stored edges. */
  async loadCharacterRelationshipKnowledge(
    userId: string,
    characterId: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabaseAdmin
      .from('entity_relationships')
      .select('id, from_entity_id, to_entity_id, from_entity_type, to_entity_type, relationship_type, scope, confidence, metadata')
      .eq('user_id', userId)
      .or(`and(from_entity_id.eq.${characterId},from_entity_type.eq.character),and(to_entity_id.eq.${characterId},to_entity_type.eq.character)`)
      .limit(50);

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || code === '42P01') return {};
      throw error;
    }

    const edges = data ?? [];
    if (edges.length === 0) return {};

    const linkedEntities = edges.map((e) => ({
      direction: e.from_entity_id === characterId ? 'outgoing' : 'incoming',
      entityId: e.from_entity_id === characterId ? e.to_entity_id : e.from_entity_id,
      entityType: e.from_entity_id === characterId ? e.to_entity_type : e.from_entity_type,
      relationshipType: e.relationship_type,
      scope: e.scope,
      confidence: e.confidence,
    }));

    const roles = [...new Set(
      edges.flatMap((e) => {
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        return typeof meta.role === 'string' ? [meta.role] : [];
      })
    )];
    const scopes = [...new Set(edges.map((e) => String(e.scope ?? '').toUpperCase()).filter(Boolean))];

    return {
      stored_relationship_edges: linkedEntities,
      relationship_roles: roles,
      relationship_scopes: scopes,
      relationship_edge_count: edges.length,
      relationship_knowledge_at: new Date().toISOString(),
    };
  }

  private async buildRefIndex(
    userId: string,
    meaning: MeaningResolutionResult
  ): Promise<Map<string, ResolvedEntityRef>> {
    const index = new Map<string, ResolvedEntityRef>();

    const self = await selfCharacterService.ensureSelfCharacter(userId).catch(() => null);
    if (self?.id) {
      index.set('self', { id: self.id, type: 'character', name: String(self.name ?? 'self') });
    }

    for (const entity of meaning.resolvedEntities) {
      if (!entity.entityId) continue;
      const type: EntityStorageType = entity.kind === 'ORGANIZATION' ? 'omega_entity' : 'character';
      index.set(entity.normalized, { id: entity.entityId, type, name: entity.surface });
      index.set(entity.surface.trim().toLowerCase(), { id: entity.entityId, type, name: entity.surface });
    }

    for (const rel of meaning.resolvedRelationships) {
      if (!rel.targetName || !rel.targetEntityId) continue;
      const key = rel.targetName.trim().toLowerCase();
      index.set(key, { id: rel.targetEntityId, type: 'character', name: rel.targetName });
    }

    const [{ data: chars }, orgResult, omegaResult] = await Promise.all([
      supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId),
      supabaseAdmin.from('organizations').select('id, name').eq('user_id', userId),
      supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId),
    ]);
    const orgs = orgResult.error ? [] : orgResult.data;
    const omega = omegaResult.error ? [] : omegaResult.data;

    for (const c of chars ?? []) {
      const ref: ResolvedEntityRef = { id: c.id, type: 'character', name: String(c.name ?? '') };
      index.set(String(c.name ?? '').trim().toLowerCase(), ref);
      for (const a of (c.alias as string[] | null) ?? []) {
        index.set(String(a).trim().toLowerCase(), ref);
      }
    }

    for (const o of orgs ?? []) {
      const ref: ResolvedEntityRef = { id: o.id, type: 'omega_entity', name: String(o.name ?? '') };
      index.set(String(o.name ?? '').trim().toLowerCase(), ref);
    }

    for (const oe of omega ?? []) {
      const ref: ResolvedEntityRef = { id: oe.id, type: 'omega_entity', name: String(oe.primary_name ?? '') };
      index.set(String(oe.primary_name ?? '').trim().toLowerCase(), ref);
    }

    return index;
  }

  private async resolveEndpoint(
    userId: string,
    label: string,
    refs: Map<string, ResolvedEntityRef>
  ): Promise<ResolvedEntityRef | null> {
    const key = label.trim().toLowerCase();
    if (SELF_ALIASES.has(key)) {
      return refs.get('self') ?? null;
    }
    const hit = refs.get(key);
    if (hit) return hit;

    const canonical = await entityRegistry.resolveByName(label, userId);
    if (canonical?.source === 'character') {
      return { id: canonical.id, type: 'character', name: canonical.name };
    }
    if (canonical?.source === 'omega_entity') {
      return { id: canonical.id, type: 'omega_entity', name: canonical.name };
    }

    // Lazy self lookup if missing
    if (key === 'self') {
      const self = await selfCharacterService.ensureSelfCharacter(userId).catch(() => null);
      if (self?.id) {
        return { id: self.id, type: 'character', name: String(self.name ?? 'self') };
      }
    }
    return null;
  }

  private async upsertEntityRelationship(
    userId: string,
    from: ResolvedEntityRef,
    to: ResolvedEntityRef,
    relationshipType: string,
    scope: string | null,
    confidence: number,
    messageId: string,
    evidence: string,
    link: DiscoveredEntityLink
  ): Promise<boolean> {
    try {
      const { data: existing } = await supabaseAdmin
        .from('entity_relationships')
        .select('id, evidence_count, evidence_source_ids, confidence, metadata')
        .eq('user_id', userId)
        .eq('from_entity_id', from.id)
        .eq('from_entity_type', from.type)
        .eq('to_entity_id', to.id)
        .eq('to_entity_type', to.type)
        .eq('relationship_type', relationshipType)
        .eq('scope', scope ?? '')
        .maybeSingle();

      if (existing) {
        const sourceIds = [...new Set([...(existing.evidence_source_ids ?? []), messageId])];
        await supabaseAdmin.from('entity_relationships').update({
          evidence_count: (existing.evidence_count ?? 1) + 1,
          confidence: Math.max(existing.confidence ?? 0, confidence),
          evidence_source_ids: sourceIds,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existing.metadata as Record<string, unknown> ?? {}),
            role: link.role,
            hint: link.hint,
            evidence,
            last_detected_at: new Date().toISOString(),
            source: 'interpretation_pipeline',
          },
        }).eq('id', existing.id);
        return true;
      }

      const { error } = await supabaseAdmin.from('entity_relationships').insert({
        user_id: userId,
        from_entity_id: from.id,
        from_entity_type: from.type,
        to_entity_id: to.id,
        to_entity_type: to.type,
        relationship_type: relationshipType,
        scope,
        confidence,
        evidence_count: 1,
        evidence_source_ids: [messageId],
        metadata: {
          role: link.role,
          hint: link.hint,
          evidence,
          detected_at: new Date().toISOString(),
          source: 'interpretation_pipeline',
        },
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '23505') return true;
        if (code === 'PGRST205' || code === '42P01') return false;
        throw error;
      }
      return true;
    } catch (err) {
      logger.warn({ err, userId, from: from.name, to: to.name }, 'entity_relationship upsert failed');
      return false;
    }
  }

  private async upsertCharacterRelationship(
    userId: string,
    from: ResolvedEntityRef,
    to: ResolvedEntityRef,
    relationshipType: string,
    confidence: number,
    messageId: string,
    evidence: string
  ): Promise<boolean> {
    try {
      const closeness = Math.round(Math.max(-10, Math.min(10, (confidence - 0.5) * 20)));
      const { error } = await supabaseAdmin.from('character_relationships').upsert(
        {
          user_id: userId,
          source_character_id: from.id,
          target_character_id: to.id,
          relationship_type: relationshipType,
          closeness_score: closeness,
          updated_at: new Date().toISOString(),
          metadata: { evidence, messageId, source: 'interpretation_pipeline' },
        } as Record<string, unknown>,
        { onConflict: 'user_id,source_character_id,target_character_id,relationship_type' }
      );

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'PGRST205' || code === '42P01') return false;
        throw error;
      }
      return true;
    } catch (err) {
      logger.warn({ err, userId, from: from.name, to: to.name }, 'character_relationship upsert failed');
      return false;
    }
  }
}

export const relationshipPersistenceService = new RelationshipPersistenceService();
