/**
 * Narrative anchor persistence and rebuild orchestration.
 */
import { logger } from '../../logger';
import { isIndividualPersonName, normalizePersonNameKey } from '../../utils/personNameValidation';
import { evaluateWrongDomain } from '../characters/audit/wrongDomainCharacterGuard';
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

const NON_PERSON_LABELS = new Set([
  'one piece', 'claude code', 'background check', 'relationships', 'also you',
  'user in', 'self made', 'lorebook', 'codex', 'chatgpt',
]);

function isEligibleNarrativePerson(name: string, provenance = ''): boolean {
  const key = normalizePersonNameKey(name);
  return !NON_PERSON_LABELS.has(key) && isIndividualPersonName(name) &&
    !evaluateWrongDomain(name, provenance).wrongDomain;
}

function relationCueMatches(type: string, text: string): boolean {
  const normalized = type.toLowerCase().replace(/[_-]/g, ' ');
  if (/romantic|dating|partner|spouse|boyfriend|girlfriend|sexual|hookup|ex\b/.test(normalized)) {
    return /\b(date[ds]?|dating|romantic|kiss(?:ed|ing)?|hook(?:ed|ing) up|sex|slept with|boyfriend|girlfriend|partner|spouse|married|crush|ex)\b/i.test(text);
  }
  if (/family|parent|mother|father|sibling|brother|sister|aunt|uncle|cousin|kin/.test(normalized)) {
    return /\b(family|parent|mother|mom|father|dad|sibling|brother|sister|aunt|uncle|cousin|niece|nephew|grandma|grandpa)\b/i.test(text);
  }
  if (/coworker|colleague|manager|employee|work/.test(normalized)) {
    return /\b(work(?:ed|ing)?|coworker|colleague|job|office|company|manager|employee|team)\b/i.test(text);
  }
  if (/friend/.test(normalized)) return /\b(friend|friends|friendship|bestie)\b/i.test(text);
  if (/enemy|conflict|rival|distrust/.test(normalized)) return /\b(conflict|fight|fought|argument|enemy|rival|distrust|falling out)\b/i.test(text);
  return /\b(know|knows|knew|met|introduced|mentor|roommate|neighbor)\b/i.test(text);
}

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}…` : compact;
}

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
  const [charsRes, locsRes, orgsRes, orgMembersRes, factsRes, relsRes, linksRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('characters')
      .select('id, name, metadata, importance_score, relationship_depth')
      .eq('user_id', userId),
    supabaseAdmin.from('locations').select('id, name, metadata').eq('user_id', userId),
    supabaseAdmin
      .from('organizations')
      .select('id, name, type')
      .eq('user_id', userId),
    supabaseAdmin
      .from('organization_members')
      .select('organization_id, character_id')
      .eq('user_id', userId)
      .not('character_id', 'is', null),
    supabaseAdmin
      .from('entity_facts')
      .select('entity_id, fact, category')
      .eq('user_id', userId)
      .limit(500),
    supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, closeness_score, summary, last_shared_memory_id, metadata')
      .eq('user_id', userId),
    supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_id, entity_type, session_id, mention_count')
      .eq('user_id', userId)
      .eq('entity_type', 'character'),
    supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, people, locations, start_time, significance_score, significance_level, metadata')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(250),
  ]);

  const contextErrors = [
    charsRes.error,
    locsRes.error,
    orgsRes.error,
    orgMembersRes.error,
    factsRes.error,
    relsRes.error,
    linksRes.error,
    eventsRes.error,
  ].filter(Boolean);
  if (contextErrors.length > 0) {
    const first = contextErrors[0]!;
    logger.error({ error: first, userId }, 'narrativeAnchor: build context query failed');
    throw first;
  }

  const threadCountByEntity = new Map<string, number>();
  for (const link of linksRes.data ?? []) {
    const id = link.entity_id as string;
    threadCountByEntity.set(id, (threadCountByEntity.get(id) ?? 0) + 1);
  }

  const entities: EntityGravityInput[] = [];

  const organizationNameKeys = new Set((orgsRes.data ?? []).map((org) => normalizePersonNameKey(org.name)));
  for (const c of charsRes.data ?? []) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    if (meta.lifecycle_status === 'pending_deletion') continue;
    const provenance = [c.name, ...(Array.isArray(meta.roles) ? meta.roles : [])].join(' ');
    if (organizationNameKeys.has(normalizePersonNameKey(c.name)) || !isEligibleNarrativePerson(c.name, provenance)) continue;
    entities.push({
      entityId: c.id,
      entityType: 'character',
      name: c.name,
      mentionCount: Number(meta.mention_count ?? 1),
      threadCount: threadCountByEntity.get(c.id) ?? 0,
      daysMentioned: Number(meta.days_mentioned ?? 1),
      emotionalWeight: Number(meta.emotional_intensity ?? 0.3),
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
    const members = (orgMembersRes.data ?? []).filter((member) => member.organization_id === o.id);
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

  const journalIds = [...new Set((relsRes.data ?? [])
    .map((row) => row.last_shared_memory_id as string | null)
    .filter((id): id is string => Boolean(id)))];
  const { data: journalRows, error: journalError } = journalIds.length
    ? await supabaseAdmin.from('journal_entries').select('id, content').eq('user_id', userId).in('id', journalIds)
    : { data: [], error: null };
  if (journalError) throw journalError;
  const journalById = new Map<string, string>();
  for (const row of (journalRows ?? []) as Array<{ id: string; content: string }>) {
    journalById.set(row.id, row.content);
  }
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));

  const relationships = (relsRes.data ?? []).flatMap((r) => {
    const source = entityById.get(r.source_character_id as string);
    const target = entityById.get(r.target_character_id as string);
    if (!source || !target) return [];
    const sourceText = r.last_shared_memory_id ? journalById.get(r.last_shared_memory_id as string) : undefined;
    // Summaries and metadata labels are derived assertions, not source spans.
    // Only the referenced user memory may prove this edge.
    const candidateTexts = [sourceText].filter((value): value is string => Boolean(value));
    const direct = candidateTexts.filter((text) => {
      const lower = text.toLowerCase();
      return lower.includes(source.name.toLowerCase()) && lower.includes(target.name.toLowerCase()) &&
        relationCueMatches(String(r.relationship_type ?? ''), text);
    });
    if (direct.length === 0) return [];
    return [{
      sourceId: source.entityId,
      targetId: target.entityId,
      type: (r.relationship_type as string) ?? 'related',
      strength: r.closeness_score != null ? Number(r.closeness_score) / 10 : undefined,
      directEvidence: true,
      evidence: direct.map((text, index) => ({
        id: `relationship-${r.id}-${index}`,
        label: excerpt(text),
        source: 'relationship' as const,
        sourceRef: r.last_shared_memory_id as string | undefined,
        confidence: 0.9,
      })),
    }];
  });

  const knownEntityIds = new Set(entities.map((entity) => entity.entityId));
  const events = (eventsRes.data ?? []).map((event) => ({
    id: event.id as string,
    title: event.title as string,
    entityIds: [
      ...((event.people as string[] | null) ?? []),
      ...((event.locations as string[] | null) ?? []),
    ].filter((id) => knownEntityIds.has(id)),
    startDate: event.start_time as string | undefined,
    summary: event.summary as string | undefined,
    significanceScore: Number(event.significance_score ?? 0),
    significanceLevel: event.significance_level as string | undefined,
    evidence: event.summary ? [{
      id: `event-${event.id}`,
      label: excerpt(event.summary as string),
      source: 'event' as const,
      sourceRef: event.id as string,
      confidence: Math.max(0.7, Number(event.significance_score ?? 0) / 100),
    }] : [],
  }));

  for (const entity of entities) {
    const participationCount = events.filter((event) => event.entityIds.includes(entity.entityId)).length;
    entity.eventParticipation = Math.min(1, participationCount / 5);
  }

  return {
    userId,
    entities,
    coMentionPairs,
    facts,
    relationships,
    organizations,
    events,
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
      .select('id, metadata')
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
      metadata: {
        ...((existing?.metadata ?? {}) as Record<string, unknown>),
        publication_status: 'published',
        validation_version: 'provenance_v2',
      },
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
      const { error } = await supabaseAdmin.from('narrative_anchor_members').insert(
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
      if (error) {
        logger.error({ error, userId, anchorId, title: anchor.title }, 'narrativeAnchor: member insert failed');
        throw error;
      }
    }
  }
}

export const narrativeAnchorService = {
  async rebuildForUser(userId: string): Promise<NarrativeAnchor[]> {
    const ctx = await loadBuildContext(userId);
    const anchors = buildAnchorsFromContext(ctx);
    await persistGravityScores(userId, ctx.entities);
    await persistAnchors(userId, anchors);

    // Preserve rejected legacy rows for audit, but make them unpublishable.
    const currentKeys = anchors
      .map((anchor) => anchor.provenance.consolidationKey ?? anchor.id)
      .filter(Boolean);
    const { data: storedAnchors, error: storedError } = await supabaseAdmin
      .from('narrative_anchors')
      .select('id, consolidation_key, metadata')
      .eq('user_id', userId);
    if (storedError) throw storedError;

    const currentKeySet = new Set(currentKeys);
    const staleIds = (storedAnchors ?? [])
      .filter((row) => !row.consolidation_key || !currentKeySet.has(row.consolidation_key))
      .map((row) => row.id);
    for (const staleId of staleIds) {
      const stored = (storedAnchors ?? []).find((row) => row.id === staleId);
      const metadata = (stored?.metadata ?? {}) as Record<string, unknown>;
      const { error: quarantineError } = await supabaseAdmin.from('narrative_anchors').update({
        metadata: {
          ...metadata,
          publication_status: 'quarantined',
          quarantine_reason: 'unsupported_after_provenance_rebuild',
          validation_version: 'provenance_v2',
          quarantined_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('id', staleId);
      if (quarantineError) {
        logger.error({ error: quarantineError, userId, staleId }, 'narrativeAnchor: quarantine failed');
        throw quarantineError;
      }
    }

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
      .contains('metadata', { publication_status: 'published' })
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
      .contains('metadata', { publication_status: 'published' })
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
