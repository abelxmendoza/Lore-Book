/**
 * Timeline V2 API adapter — reads/writes `life_arcs` instead of ghost timeline tables.
 * Chronology nested routes still use `chronology_index` via chronologyService.
 */
import {
  arcService,
  type ArcType,
  type LifeArc,
  type UpsertArcPayload,
} from './continuityRuntime/arcs/arcService';
import { arcMembershipService } from './continuityRuntime/arcs/arcMembershipService';
import { arcRelationshipService } from './continuityRuntime/arcs/arcRelationshipService';

export interface TimelineV2 {
  id: string;
  user_id: string;
  title: string;
  timeline_type: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  parent_id?: string | null;
  created_at: string;
  updated_at?: string;
}

const VALID_ARC_TYPES = new Set<string>(['life_era', 'skill', 'location', 'work', 'custom', 'occasion']);

export function normalizeTimelineArcType(timelineType?: string | null): ArcType {
  if (timelineType && VALID_ARC_TYPES.has(timelineType)) {
    return timelineType as ArcType;
  }
  return 'custom';
}

export function mapArcToTimelineV2(arc: LifeArc): TimelineV2 {
  return {
    id: arc.id,
    user_id: arc.user_id,
    title: arc.title,
    timeline_type: arc.arc_type,
    start_date: arc.start_date,
    end_date: arc.end_date,
    description: arc.summary,
    parent_id: arc.parent_id,
    created_at: arc.created_at,
    updated_at: arc.updated_at,
  };
}

function patchToArcPayload(patch: Partial<TimelineV2>): Partial<UpsertArcPayload> {
  const out: Partial<UpsertArcPayload> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.timeline_type !== undefined) out.arc_type = normalizeTimelineArcType(patch.timeline_type);
  if (patch.start_date !== undefined) out.start_date = patch.start_date;
  if (patch.end_date !== undefined) out.end_date = patch.end_date;
  if (patch.description !== undefined) out.summary = patch.description;
  if (patch.parent_id !== undefined) out.parent_id = patch.parent_id;
  return out;
}

function createPayload(input: Partial<TimelineV2>): UpsertArcPayload {
  if (!input.title?.trim()) {
    throw new Error('Title is required');
  }
  return {
    title: input.title.trim(),
    arc_type: normalizeTimelineArcType(input.timeline_type),
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    summary: input.description ?? null,
    parent_id: input.parent_id ?? null,
    source: 'user_created',
  };
}

export const timelineService = {
  async listTimelines(userId: string): Promise<TimelineV2[]> {
    const arcs = await arcService.listForUser(userId);
    return arcs
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(mapArcToTimelineV2);
  },

  async createTimeline(userId: string, input: Partial<TimelineV2>): Promise<TimelineV2> {
    const arc = await arcService.upsert(userId, createPayload(input));
    return mapArcToTimelineV2(arc);
  },

  async getTimelineHierarchy(userId: string, id: string): Promise<TimelineV2 | null> {
    const arc = await arcService.getById(userId, id);
    return arc ? mapArcToTimelineV2(arc) : null;
  },

  async updateTimeline(userId: string, id: string, patch: Partial<TimelineV2>): Promise<TimelineV2> {
    const existing = await arcService.getById(userId, id);
    if (!existing) {
      throw new Error('Timeline not found');
    }
    const arc = await arcService.update(userId, id, patchToArcPayload(patch));
    return mapArcToTimelineV2(arc);
  },

  async deleteTimeline(userId: string, id: string): Promise<void> {
    const existing = await arcService.getById(userId, id);
    if (!existing) {
      throw new Error('Timeline not found');
    }
    await arcService.delete(userId, id);
  },
};

export const timelineMembershipService = {
  async getMemberships(userId: string, timelineId: string) {
    return arcMembershipService.getMembershipsForArc(userId, timelineId);
  },
};

export const timelineSearchService = {
  async search(userId: string, query: string): Promise<TimelineV2[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const arcs = await arcService.listForUser(userId);
    return arcs
      .filter((arc) => arc.title.toLowerCase().includes(q))
      .map(mapArcToTimelineV2);
  },
};

export const timelineRelationshipService = {
  async getRelationships(userId: string, timelineId: string) {
    return arcRelationshipService.getRelationshipsForArc(userId, timelineId);
  },
};
