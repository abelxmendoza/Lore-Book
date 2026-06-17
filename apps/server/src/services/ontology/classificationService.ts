/**
 * Dynamic classifications — user-specific and global subcategories keyed by root_type.
 */
import { supabaseAdmin } from '../supabaseClient';
import type { RootType } from './canonical/rootType';
import { isRootType } from './canonical/rootType';
import {
  DEFAULT_SWIMLANES,
  SUPPLEMENTAL_GROUP_CLASSIFICATIONS,
  SUPPLEMENTAL_LOCATION_CLASSIFICATIONS,
  type SwimlaneDefinition,
} from './classificationDefaults';

export type ClassificationStatus = 'proposed' | 'active' | 'deprecated';
export type ClassificationCreatedBy = 'system' | 'user' | 'llm';

export interface ClassificationRow {
  id: string;
  user_id: string | null;
  root_type: RootType;
  label: string;
  parent_id: string | null;
  status: ClassificationStatus;
  confidence: number;
  usage_count: number;
  created_by: ClassificationCreatedBy;
  canonical_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UpsertClassificationInput {
  userId?: string;
  rootType: RootType;
  label: string;
  parentId?: string;
  status?: ClassificationStatus;
  confidence?: number;
  createdBy?: ClassificationCreatedBy;
  metadata?: Record<string, unknown>;
}

export interface ResolvedClassification {
  id?: string;
  label: string;
  rootType: RootType;
  metadata: Record<string, unknown>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let swimlaneCache: { at: number; lanes: SwimlaneDefinition[] } | null = null;

class ClassificationService {
  async findByRootType(
    rootType: RootType,
    opts: { userId?: string; status?: ClassificationStatus } = {}
  ): Promise<ClassificationRow[]> {
    let query = supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('root_type', rootType);

    if (opts.status) query = query.eq('status', opts.status);

    if (opts.userId) {
      query = query.or(`user_id.is.null,user_id.eq.${opts.userId}`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query.order('usage_count', { ascending: false });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || code === '42P01') return [];
      throw error;
    }

    return (data ?? []).filter((row): row is ClassificationRow =>
      isRootType(row.root_type)
    );
  }

  async findByLabel(
    rootType: RootType,
    label: string,
    userId?: string
  ): Promise<ClassificationRow | null> {
    const normalized = label.trim().toLowerCase();
    let query = supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('root_type', rootType)
      .ilike('label', normalized);

    if (userId) {
      query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || code === '42P01') return null;
      throw error;
    }
    if (!data || !isRootType(data.root_type)) return null;
    return data as ClassificationRow;
  }

  async getSwimlanes(userId?: string): Promise<SwimlaneDefinition[]> {
    if (swimlaneCache && Date.now() - swimlaneCache.at < CACHE_TTL_MS) {
      return swimlaneCache.lanes;
    }

    const rows = await this.findByRootType('CONCEPT', { userId, status: 'active' });
    const swimlanes = rows
      .filter((r) => r.metadata?.axis === 'swimlane')
      .map((r) => ({
        id: r.id,
        label: r.label,
        keywords: Array.isArray(r.metadata.keywords)
          ? (r.metadata.keywords as string[])
          : [],
        isDefault: r.label === 'life' || r.metadata.isDefault === true,
      }));

    const lanes = swimlanes.length > 0 ? swimlanes : DEFAULT_SWIMLANES;
    swimlaneCache = { at: Date.now(), lanes };
    return lanes;
  }

  /** Match content + tags against dynamic swimlane keyword patterns. */
  async matchSwimlane(content: string, tags: string[] = [], userId?: string): Promise<string> {
    const lanes = await this.getSwimlanes(userId);
    const haystack = `${content} ${tags.join(' ')}`.toLowerCase();

    for (const lane of lanes) {
      if (lane.isDefault || lane.keywords.length === 0) continue;
      for (const keyword of lane.keywords) {
        if (haystack.includes(keyword.toLowerCase())) {
          return lane.label;
        }
      }
    }

    return lanes.find((l) => l.isDefault)?.label ?? 'life';
  }

  /** Resolve a dynamic classification by entity name and root type. */
  async resolveForEntityName(
    name: string,
    rootType: RootType,
    userId?: string
  ): Promise<ResolvedClassification | null> {
    const label = name.trim().toLowerCase();
    if (!label) return null;

    const existing = await this.findByLabel(rootType, label, userId);
    if (existing) {
      await this.incrementUsage(existing.id);
      return {
        id: existing.id,
        label: existing.label,
        rootType: existing.root_type,
        metadata: existing.metadata,
      };
    }

    const supplemental = rootType === 'LOCATION'
      ? SUPPLEMENTAL_LOCATION_CLASSIFICATIONS.find((s) => s.match(name))
      : rootType === 'GROUP' || rootType === 'ORGANIZATION'
        ? SUPPLEMENTAL_GROUP_CLASSIFICATIONS.find((s) => s.match(name))
        : undefined;

    if (!supplemental) return null;

    const row = await this.upsert({
      rootType,
      label: supplemental.label,
      status: 'active',
      confidence: 0.85,
      createdBy: 'system',
      metadata: supplemental.metadata,
      userId,
    });

    if (!row) {
      return {
        label: supplemental.label,
        rootType,
        metadata: supplemental.metadata,
      };
    }

    return {
      id: row.id,
      label: row.label,
      rootType: row.root_type,
      metadata: row.metadata,
    };
  }

  /** Resolve glossary subcategory labels against the classifications table. */
  async resolveSubcategoryLabels(
    rootType: RootType,
    labels: string[],
    userId?: string
  ): Promise<ResolvedClassification[]> {
    const resolved: ResolvedClassification[] = [];
    for (const raw of labels) {
      const label = raw.trim().toLowerCase();
      if (!label) continue;
      const row = await this.findByLabel(rootType, label, userId);
      if (row) {
        resolved.push({
          id: row.id,
          label: row.label,
          rootType: row.root_type,
          metadata: row.metadata,
        });
      }
    }
    return resolved;
  }

  async upsert(input: UpsertClassificationInput): Promise<ClassificationRow | null> {
    const label = input.label.trim().toLowerCase();
    const existing = await this.findByLabel(input.rootType, label, input.userId);

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('classifications')
        .update({
          confidence: Math.max(existing.confidence, input.confidence ?? existing.confidence),
          usage_count: existing.usage_count + 1,
          status: input.status ?? existing.status,
          metadata: { ...existing.metadata, ...(input.metadata ?? {}) },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw error;
      return data as ClassificationRow;
    }

    const { data, error } = await supabaseAdmin
      .from('classifications')
      .insert({
        user_id: input.userId ?? null,
        root_type: input.rootType,
        label,
        parent_id: input.parentId ?? null,
        status: input.status ?? 'proposed',
        confidence: input.confidence ?? 0.5,
        usage_count: 1,
        created_by: input.createdBy ?? 'system',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || code === '42P01') return null;
      throw error;
    }
    return data as ClassificationRow;
  }

  async incrementUsage(id: string): Promise<void> {
    const { data } = await supabaseAdmin
      .from('classifications')
      .select('usage_count')
      .eq('id', id)
      .maybeSingle();

    if (!data) return;

    await supabaseAdmin
      .from('classifications')
      .update({
        usage_count: (data.usage_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  /** Invalidate in-memory swimlane cache (e.g. after admin updates). */
  clearSwimlaneCache(): void {
    swimlaneCache = null;
  }
}

export const classificationService = new ClassificationService();
