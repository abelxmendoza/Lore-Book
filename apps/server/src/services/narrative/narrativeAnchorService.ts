/**
 * Narrative anchor persistence and rebuild orchestration.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { buildAnchorsFromContext } from './anchorClusterBuilder';
import { computeGravityBatch } from './entityGravityService';
import type {
  AnchorBuildContext,
  AnchorMember,
  EntityGravityInput,
  NarrativeAnchor,
  NarrativeAnchorType,
} from './narrativeAnchorTypes';

type AnchorRow = {
  id: string;
  user_id: string;
  title: string;
  anchor_type: string;
  confidence: number;
  gravity_score: number;
  start_date: string | null;
  end_date: string | null;
  evidence: unknown;
  provenance: unknown;
  metadata: unknown;
  consolidation_key: string | null;
};

type MemberRow = {
  id: string;
  anchor_id: string;
  member_kind: string;
  member_id: string | null;
  member_name: string;
  role: string | null;
  gravity_score: number | null;
  evidence: unknown;
};

function rowToAnchor(row: AnchorRow, members: MemberRow[]): NarrativeAnchor {
  const pick = (kind: string) =>
    members
      .filter((m) => m.member_kind === kind)
      .map(
        (m): AnchorMember => ({
          id: m.member_id ?? m.id,
          kind: m.member_kind as AnchorMember['kind'],
          name: m.member_name,
          role: m.role ?? undefined,
          gravityScore: m.gravity_score ?? undefined,
          evidence: (m.evidence as AnchorMember['evidence']) ?? [],
        }),
      );

  const provenance = (row.provenance ?? {}) as NarrativeAnchor['provenance'];

  return {
    id: row.id,
    title: row.title,
    anchorType: row.anchor_type as NarrativeAnchorType,
    confidence: row.confidence,
    gravityScore: row.gravity_score,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    entities: pick('entity'),
    events: pick('event'),
    groups: pick('group'),
    places: pick('place'),
    evidence: (row.evidence as NarrativeAnchor['evidence']) ?? [],
    provenance,
  };
}

async function loadBuildContext(userId: string): Promise<AnchorBuildContext> {
  const [charsRes, locsRes, orgsRes, factsRes, relsRes, linksRes] = await Promise.all([
    supabaseAdmin
      .from('characters')
      .select('id, name, metadata, importance_score, emotional_intensity, relationship_depth')
      .eq('user_id', userId)
      .neq('lifecycle_status', 'pending_deletion'),
    supabaseAdmin.from('locations').select('id, name, metadata').eq('user_id', userId),
    supabaseAdmin
      .from('organizations')
      .select('id, name, type, character_organizations(character_id)')
      .eq('user_id', userId),
    supabaseAdmin
      .from('entity_facts')
      .select('entity_id, fact, category')
      .eq('user_id', userId)
      .limit(500),
    supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type, closeness_score')
      .eq('user_id', userId),
    supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_id, entity_type, session_id, mention_count')
      .eq('user_id', userId)
      .eq('entity_type', 'character'),
  ]);

  const threadCountByEntity = new Map<string, number>();
  for (const link of linksRes.data ?? []) {
    const id = link.entity_id as string;
    threadCountByEntity.set(id, (threadCountByEntity.get(id) ?? 0) + 1);
  }

  const entities: EntityGravityInput[] = [];

  for (const c of charsRes.data ?? []) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    entities.push({
      entityId: c.id,
      entityType: 'character',
      name: c.name,
      mentionCount: Number(meta.mention_count ?? 1),
      threadCount: threadCountByEntity.get(c.id) ?? 0,
      daysMentioned: Number(meta.days_mentioned ?? 1),
      emotionalWeight: Number(c.emotional_intensity ?? 0.3),
      eventParticipation: Number(meta.event_count ?? 0) / 5,
      relationshipStrength: Number(c.relationship_depth ?? 0) / 10,
      communityMembership: 0,
      narrativeImportance: Number(c.importance_score ?? 0.3),
      roles: Array.isArray(meta.roles) ? (meta.roles as string[]) : [],
      facts: [],
    });
  }

  for (const l of locsRes.data ?? []) {
    const meta = (l.metadata ?? {}) as Record<string, unknown>;
    entities.push({
      entityId: l.id,
      entityType: 'location',
      name: l.name,
      mentionCount: Number(meta.mention_count ?? 1),
      threadCount: 0,
      daysMentioned: 1,
      emotionalWeight: 0.2,
      eventParticipation: 0.2,
      relationshipStrength: 0,
      communityMembership: 0,
      narrativeImportance: 0.3,
    });
  }

  const facts = (factsRes.data ?? []).map((f) => ({
    entityId: f.entity_id as string,
    text: f.fact as string,
    category: f.category as string | undefined,
  }));

  for (const ent of entities) {
    ent.facts = facts.filter((f) => f.entityId === ent.entityId).map((f) => f.text);
  }

  // Co-mention pairs from shared conversation threads
  const sessionEntities = new Map<string, Set<string>>();
  for (const link of linksRes.data ?? []) {
    const sid = link.session_id as string;
    const eid = link.entity_id as string;
    if (!sessionEntities.has(sid)) sessionEntities.set(sid, new Set());
    sessionEntities.get(sid)!.add(eid);
  }

  const coMentionCounts = new Map<string, number>();
  for (const ids of sessionEntities.values()) {
    const arr = [...ids];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join(':');
        coMentionCounts.set(key, (coMentionCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const coMentionPairs = [...coMentionCounts.entries()].map(([key, count]) => {
    const [a, b] = key.split(':');
    return { a, b, count };
  });

  const organizations = (orgsRes.data ?? []).map((o) => {
    const members = (o.character_organizations as Array<{ character_id: string }> | null) ?? [];
    return {
      id: o.id as string,
      name: o.name as string,
      type: o.type as string | undefined,
      memberIds: members.map((m) => m.character_id),
    };
  });

  for (const ent of entities) {
    const memberships = organizations.filter((o) => o.memberIds.includes(ent.entityId)).length;
    ent.communityMembership = Math.min(1, memberships / 3);
  }

  const relationships = (relsRes.data ?? []).map((r) => ({
    sourceId: r.source_character_id as string,
    targetId: r.target_character_id as string,
    type: (r.relationship_type as string) ?? 'related',
    strength: r.closeness_score != null ? Number(r.closeness_score) / 10 : undefined,
  }));

  return {
    userId,
    entities,
    coMentionPairs,
    facts,
    relationships,
    organizations,
    events: [],
    recurringPatterns: [],
  };
}

async function persistGravityScores(userId: string, inputs: EntityGravityInput[]): Promise<void> {
  const scores = computeGravityBatch(inputs);
  const rows = scores.map((s) => ({
    user_id: userId,
    entity_id: s.entityId,
    entity_type: s.entityType,
    entity_name: s.name,
    gravity_score: s.gravityScore,
    components: s.components,
    roles: s.roles,
    computed_at: new Date().toISOString(),
  }));

  if (rows.length === 0) return;

  const { error } = await supabaseAdmin.from('entity_gravity_scores').upsert(rows, {
    onConflict: 'user_id,entity_id,entity_type',
  });
  if (error) logger.warn({ error, userId }, 'narrativeAnchor: gravity upsert failed');
}

async function persistAnchors(userId: string, anchors: NarrativeAnchor[]): Promise<void> {
  for (const anchor of anchors) {
    const { data: existing } = await supabaseAdmin
      .from('narrative_anchors')
      .select('id')
      .eq('user_id', userId)
      .eq('consolidation_key', anchor.provenance.consolidationKey ?? anchor.id)
      .maybeSingle();

    const row = {
      user_id: userId,
      title: anchor.title,
      anchor_type: anchor.anchorType,
      confidence: anchor.confidence,
      gravity_score: anchor.gravityScore,
      start_date: anchor.startDate ?? null,
      end_date: anchor.endDate ?? null,
      evidence: anchor.evidence,
      provenance: anchor.provenance,
      consolidation_key: anchor.provenance.consolidationKey ?? anchor.id,
      updated_at: new Date().toISOString(),
    };

    let anchorId = existing?.id as string | undefined;

    if (anchorId) {
      await supabaseAdmin.from('narrative_anchors').update(row).eq('id', anchorId);
      await supabaseAdmin.from('narrative_anchor_members').delete().eq('anchor_id', anchorId);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('narrative_anchors')
        .insert(row)
        .select('id')
        .single();
      if (error) {
        logger.warn({ error, title: anchor.title }, 'narrativeAnchor: insert failed');
        continue;
      }
      anchorId = inserted.id;
    }

    const members = [
      ...anchor.entities.map((m) => ({ ...m, member_kind: 'entity' })),
      ...anchor.events.map((m) => ({ ...m, member_kind: 'event' })),
      ...anchor.groups.map((m) => ({ ...m, member_kind: 'group' })),
      ...anchor.places.map((m) => ({ ...m, member_kind: 'place' })),
    ];

    if (members.length > 0) {
      await supabaseAdmin.from('narrative_anchor_members').insert(
        members.map((m) => ({
          anchor_id: anchorId,
          user_id: userId,
          member_kind: m.member_kind,
          member_id: m.id,
          member_name: m.name,
          role: m.role ?? null,
          gravity_score: m.gravityScore ?? null,
          evidence: m.evidence,
        })),
      );
    }
  }
}

export const narrativeAnchorService = {
  async rebuildForUser(userId: string): Promise<NarrativeAnchor[]> {
    const ctx = await loadBuildContext(userId);
    const anchors = buildAnchorsFromContext(ctx);
    await persistGravityScores(userId, ctx.entities);
    await persistAnchors(userId, anchors);
    return anchors;
  },

  async listAnchors(
    userId: string,
    options: { anchorType?: NarrativeAnchorType; limit?: number } = {},
  ): Promise<NarrativeAnchor[]> {
    let query = supabaseAdmin
      .from('narrative_anchors')
      .select('*')
      .eq('user_id', userId)
      .order('gravity_score', { ascending: false });

    if (options.anchorType) query = query.eq('anchor_type', options.anchorType);
    if (options.limit) query = query.limit(options.limit);

    const { data: rows, error } = await query;
    if (error || !rows?.length) return [];

    const anchorIds = rows.map((r) => r.id);
    const { data: members } = await supabaseAdmin
      .from('narrative_anchor_members')
      .select('*')
      .in('anchor_id', anchorIds);

    const byAnchor = new Map<string, MemberRow[]>();
    for (const m of members ?? []) {
      const list = byAnchor.get(m.anchor_id) ?? [];
      list.push(m as MemberRow);
      byAnchor.set(m.anchor_id, list);
    }

    return (rows as AnchorRow[]).map((r) => rowToAnchor(r, byAnchor.get(r.id) ?? []));
  },

  async getAnchor(userId: string, anchorId: string): Promise<NarrativeAnchor | null> {
    const { data: row } = await supabaseAdmin
      .from('narrative_anchors')
      .select('*')
      .eq('user_id', userId)
      .eq('id', anchorId)
      .maybeSingle();

    if (!row) return null;

    const { data: members } = await supabaseAdmin
      .from('narrative_anchor_members')
      .select('*')
      .eq('anchor_id', anchorId);

    return rowToAnchor(row as AnchorRow, (members ?? []) as MemberRow[]);
  },

  /** Pure build from supplied context (for tests and dry-run). */
  buildFromContext(ctx: AnchorBuildContext): NarrativeAnchor[] {
    return buildAnchorsFromContext(ctx);
  },

  loadBuildContext,
};
