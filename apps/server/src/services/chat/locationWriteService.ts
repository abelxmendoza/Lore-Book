/**
 * Explicit Places book writes from chat — create / rename / delete / aliases.
 */

import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';
import { locationSuggestionService } from '../locationSuggestionService';
import { locationService } from '../locationService';
import { entityLearningService } from '../entityLearningService';

export type LocationWriteResult = {
  summary: string;
  operation: 'create' | 'rename' | 'delete' | 'aliases';
  locationId: string | null;
  locationName: string;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findLocationByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; metadata: Record<string, unknown> | null } | null> {
  const key = normalizeNameKey(name);
  const { data } = await supabaseAdmin.from('locations').select('id, name, metadata').eq('user_id', userId);
  const hit = (data ?? []).find((row) => {
    const meta = (row.metadata as Record<string, unknown> | null) ?? null;
    if (String(meta?.migration_status ?? '') === 'moved') return false;
    if (meta?.place_book_visible === false) return false;
    if (normalizeNameKey(String(row.name ?? '')) === key) return true;
    const aliases = Array.isArray(meta?.aliases) ? (meta!.aliases as unknown[]) : [];
    return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
  });
  if (!hit) return null;
  return {
    id: hit.id as string,
    name: hit.name as string,
    metadata: (hit.metadata as Record<string, unknown> | null) ?? null,
  };
}

export async function writeLocationFromChat(
  userId: string,
  message: string,
): Promise<LocationWriteResult> {
  const text = message.trim();

  const rename = text.match(/\b(?:rename)\s+(?:the\s+)?(?:place|location)\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanName(rename[1]);
    const to = cleanName(rename[2]);
    const existing = await findLocationByName(userId, from);
    if (!existing) throw new Error(`I couldn't find a place named "${from}" to rename.`);
    await locationService.updateLocation(userId, existing.id, { name: to });
    return {
      summary: `Renamed the place **${existing.name}** to **${to}**.`,
      operation: 'rename',
      locationId: existing.id,
      locationName: to,
    };
  }

  const del = text.match(
    /\b(?:delete|remove)\s+(?:the\s+)?(?:place|location)\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?(?:places?|locations?)(?:\s+book)?\b/i,
  );
  if (del) {
    const name = cleanName(del[1] || del[2] || '');
    const existing = await findLocationByName(userId, name);
    if (!existing) throw new Error(`I couldn't find a place named "${name}" to delete.`);
    const deleted = await locationService.deleteLocation(userId, existing.id, {
      reason: 'chat_location_write_delete',
    });
    if (!deleted) throw new Error(`Failed to delete "${existing.name}".`);
    void entityLearningService.recordDeletionLearning({
      userId,
      domain: 'locations',
      entityId: existing.id,
      name: existing.name,
      aliases: Array.isArray(existing.metadata?.aliases) ? (existing.metadata!.aliases as string[]) : [],
      reason: 'chat_location_write_delete',
    });
    return {
      summary: `Deleted **${existing.name}** from Places.`,
      operation: 'delete',
      locationId: existing.id,
      locationName: existing.name,
    };
  }

  const create = text.match(
    /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?(?:place|location)(?:\s+book)?\b/i,
  );
  if (create) {
    const name = cleanName(create[1]);
    const existing = await findLocationByName(userId, name);
    if (existing) {
      return {
        summary: `**${existing.name}** is already in Places.`,
        operation: 'create',
        locationId: existing.id,
        locationName: existing.name,
      };
    }
    try {
      const created = await locationSuggestionService.acceptSuggestion(userId, {
        name,
        context: 'Created via chat LOCATION_WRITE',
      });
      return {
        summary: `Added **${created.name}** to Places.`,
        operation: 'create',
        locationId: created.id,
        locationName: created.name,
      };
    } catch (error) {
      if (error instanceof Error && /already exist/i.test(error.message)) {
        return {
          summary: `**${name}** is already in Places.`,
          operation: 'create',
          locationId: null,
          locationName: name,
        };
      }
      logger.error({ err: error, userId, name }, 'locationWrite: create failed');
      throw error;
    }
  }

  const alias = text.match(/\b(?:also\s+called|alias(?:es)?\s+(?:for|of)|add\s+alias(?:es)?\s+(?:for|to))\s+(.{1,60})\b/i);
  if (alias) {
    // "also called Foo for Bar" is ambiguous; support "add alias Foo for Bar"
    const forMatch = text.match(/\b(?:alias(?:es)?|also\s+called)\s+(.{1,40}?)\s+(?:for|to)\s+(.{1,40})$/i);
    if (forMatch) {
      const aliasName = cleanName(forMatch[1]);
      const placeName = cleanName(forMatch[2]);
      const existing = await findLocationByName(userId, placeName);
      if (!existing) throw new Error(`I couldn't find a place named "${placeName}".`);
      const prev = Array.isArray(existing.metadata?.aliases)
        ? (existing.metadata!.aliases as string[])
        : [];
      const next = [...new Set([...prev, aliasName].map((a) => a.trim()).filter(Boolean))];
      await locationService.updateLocation(userId, existing.id, { aliases: next });
      return {
        summary: `Added alias **${aliasName}** for **${existing.name}**.`,
        operation: 'aliases',
        locationId: existing.id,
        locationName: existing.name,
      };
    }
  }

  throw new Error(
    'Try “add Northwind Depot as a place”, “rename the place X to Y”, or “delete the place X”.',
  );
}
