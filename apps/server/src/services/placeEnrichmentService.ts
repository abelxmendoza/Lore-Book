/**
 * Enriches place records with canonical type, tags, and personal significance
 * from chat / journal text.
 */

import { logger } from '../logger';
import { inferPlaceType } from '../constants/placeTypes';
import { supabaseAdmin } from './supabaseClient';

type LocationRow = {
  id: string;
  name: string;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
};

const TAG_RULES: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(goth|gothic)\b/i, tag: 'Goth Scene' },
  { re: /\b(punk)\b/i, tag: 'Punk Scene' },
  { re: /\b(ska)\b/i, tag: 'Ska Scene' },
  { re: /\b(live music|live band|concert)\b/i, tag: 'Live Music' },
  { re: /\b(danc(e|ing)|dance floor)\b/i, tag: 'Dancing' },
  { re: /\b(late night|after hours)\b/i, tag: 'Late Night' },
  { re: /\b(lgbtq|queer|gay bar|drag)\b/i, tag: 'LGBTQ Friendly' },
  { re: /\b(historic|legendary|iconic)\b/i, tag: 'Historic Venue' },
  { re: /\b(computer science|csuf|engineering)\b/i, tag: 'Computer Science' },
  { re: /\b(research|lab|laboratory)\b/i, tag: 'Research' },
  { re: /\b(alumni|graduated)\b/i, tag: 'Alumni' },
  { re: /\b(robotics|autonomous)\b/i, tag: 'Robotics' },
  { re: /\b(field ops|field operations|pilot site)\b/i, tag: 'Field Operations' },
];

const SIG_RULES: Array<{ re: RegExp; sig: string }> = [
  { re: /\b(childhood home|grew up here)\b/i, sig: 'childhood_home' },
  { re: /\b(favorite spot|my favorite place)\b/i, sig: 'favorite_spot' },
  { re: /\b(first date)\b/i, sig: 'first_date_location' },
  { re: /\b(training gym|where i train|bjj)\b/i, sig: 'training_gym' },
  { re: /\b(hangout|hang out spot)\b/i, sig: 'hangout_spot' },
  { re: /\b(creative space|my studio)\b/i, sig: 'creative_space' },
];

function mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map(s => s.toLowerCase()));
  const out = [...existing];
  for (const item of incoming) {
    const key = item.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

function inferTags(text: string): string[] {
  const tags = new Set<string>();
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) tags.add(rule.tag);
  }
  return [...tags];
}

function inferSignificance(text: string): string[] {
  const sigs = new Set<string>();
  for (const rule of SIG_RULES) {
    if (rule.re.test(text)) sigs.add(rule.sig);
  }
  return [...sigs];
}

function nameMentionedInText(name: string, text: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

export type PlaceProfileUpdate = {
  type?: string | null;
  place_tags?: string[];
  place_significance?: string[];
};

class PlaceEnrichmentService {
  async applyProfile(
    userId: string,
    locationId: string,
    update: PlaceProfileUpdate,
  ): Promise<{ success: boolean }> {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, metadata')
      .eq('user_id', userId)
      .eq('id', locationId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return { success: false };
    }

    const metadata = { ...(existing.metadata ?? {}) } as Record<string, unknown>;

    if (update.place_tags !== undefined) {
      metadata.place_tags = update.place_tags.filter(Boolean);
    }
    if (update.place_significance !== undefined) {
      metadata.place_significance = update.place_significance.filter(Boolean);
    }

    const patch: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (update.type !== undefined) {
      patch.type = update.type;
    }

    const { error } = await supabaseAdmin
      .from('locations')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', locationId);

    if (error) {
      logger.debug({ error, locationId }, 'Failed to apply place profile');
      return { success: false };
    }

    return { success: true };
  }

  async enrichFromText(
    userId: string,
    locationId: string,
    text: string,
    options?: { forceType?: boolean },
  ): Promise<boolean> {
    const { data: row } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, metadata')
      .eq('user_id', userId)
      .eq('id', locationId)
      .maybeSingle();

    if (!row) return false;

    const context = `${row.name} ${text}`;
    const inferredType = inferPlaceType(row.name, context, row.type);
    const genericTypes = new Set(['unknown', 'venue', 'other', 'place', '']);
    const shouldSetType =
      options?.forceType ||
      !row.type ||
      genericTypes.has(String(row.type).toLowerCase());

    const metadata = { ...(row.metadata ?? {}) } as Record<string, unknown>;
    const prevTags = Array.isArray(metadata.place_tags) ? (metadata.place_tags as string[]) : [];
    const prevSig = Array.isArray(metadata.place_significance)
      ? (metadata.place_significance as string[])
      : [];

    const update: PlaceProfileUpdate = {
      place_tags: mergeUnique(prevTags, inferTags(context)),
      place_significance: mergeUnique(prevSig, inferSignificance(context)),
    };
    if (shouldSetType && inferredType) {
      update.type = inferredType;
    }

    const result = await this.applyProfile(userId, locationId, update);
    return result.success;
  }

  async enrichMentionedInText(userId: string, message: string): Promise<string[]> {
    const { data: rows } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, metadata')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (!rows?.length) return [];

    const enriched: string[] = [];
    for (const row of rows as LocationRow[]) {
      if (!nameMentionedInText(row.name, message)) continue;
      const ok = await this.enrichFromText(userId, row.id, message);
      if (ok) enriched.push(row.id);
    }
    return enriched;
  }
}

export const placeEnrichmentService = new PlaceEnrichmentService();
