/**
 * Repair legacy graph pollution: products/apps/places/events stored as person/character.
 * Uses the deterministic entityClassifier — no LLM, no parallel store.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { classifyEntity, isCharacterEligible, toStorageType } from './entityClassifier';

export type PollutionHit = {
  id: string;
  name: string;
  storage: 'character' | 'people_place';
  currentType: string;
  correctClass: string;
  action: 'retype' | 'delete_character' | 'skip';
};

export type PollutionRepairReport = {
  scanned: { characters: number; peoplePlaces: number };
  hits: PollutionHit[];
  repaired: { charactersRemoved: number; peoplePlacesRetyped: number };
};

function shouldRepair(name: string): { repair: boolean; correctClass: string } {
  const c = classifyEntity(name);
  if (isCharacterEligible(c.type)) return { repair: false, correctClass: c.type };
  if (c.type === 'UNKNOWN' || c.type === 'UNCLASSIFIED') return { repair: false, correctClass: c.type };
  return { repair: true, correctClass: c.type };
}

export async function findPollutedEntities(userId: string): Promise<PollutionHit[]> {
  const hits: PollutionHit[] = [];

  const [{ data: chars }, { data: pp }] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name').eq('user_id', userId),
    supabaseAdmin.from('people_places').select('id, name, type').eq('user_id', userId),
  ]);

  for (const row of chars ?? []) {
    const { repair, correctClass } = shouldRepair(row.name);
    if (repair) {
      hits.push({
        id: row.id,
        name: row.name,
        storage: 'character',
        currentType: 'character',
        correctClass,
        action: 'delete_character',
      });
    }
  }

  for (const row of pp ?? []) {
    if (row.type !== 'person') continue;
    const { repair, correctClass } = shouldRepair(row.name);
    if (repair) {
      hits.push({
        id: row.id,
        name: row.name,
        storage: 'people_place',
        currentType: row.type,
        correctClass,
        action: 'retype',
      });
    }
  }

  return hits;
}

export async function repairPollutedEntities(userId: string): Promise<PollutionRepairReport> {
  const hits = await findPollutedEntities(userId);
  let charactersRemoved = 0;
  let peoplePlacesRetyped = 0;

  for (const hit of hits) {
    if (hit.action === 'delete_character') {
      const { error } = await supabaseAdmin.from('characters').delete().eq('id', hit.id).eq('user_id', userId);
      if (!error) charactersRemoved++;
      else logger.warn({ err: error, hit }, 'entityPollutionRepair: character delete failed');
    } else if (hit.action === 'retype') {
      let storageType = toStorageType(hit.correctClass as Parameters<typeof toStorageType>[0]);
      // Legacy DB check constraint may only allow person|place|organization|platform.
      if (storageType === 'event' || storageType === 'unclassified') {
        storageType = 'platform';
      }
      let { error } = await supabaseAdmin
        .from('people_places')
        .update({ type: storageType })
        .eq('id', hit.id)
        .eq('user_id', userId);
      if (error) {
        // Last resort: remove mis-typed row so it cannot promote to a character again.
        ({ error } = await supabaseAdmin.from('people_places').delete().eq('id', hit.id).eq('user_id', userId));
        if (!error) peoplePlacesRetyped++;
        else logger.warn({ err: error, hit }, 'entityPollutionRepair: people_places delete failed');
      } else {
        peoplePlacesRetyped++;
      }
    }
  }

  const [{ count: charCount }, { count: ppCount }] = await Promise.all([
    supabaseAdmin.from('characters').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin.from('people_places').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  return {
    scanned: { characters: charCount ?? 0, peoplePlaces: ppCount ?? 0 },
    hits,
    repaired: { charactersRemoved, peoplePlacesRetyped },
  };
}
