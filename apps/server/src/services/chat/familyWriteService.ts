/**
 * Explicit Family Tree writes from chat — mark kinship / add to family.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';
import { characterRegistry } from '../characterRegistry';
import { familyTreeService } from '../familyTreeService';
import { randomUUID } from 'crypto';

export type FamilyWriteResult = {
  summary: string;
  operation: 'set_relation' | 'add_member';
  characterId: string | null;
  characterName: string;
  relation: string | null;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findOrCreateCharacter(userId: string, name: string): Promise<{ id: string; name: string; created: boolean }> {
  const key = normalizeNameKey(name);
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, status')
    .eq('user_id', userId);
  const hit = (data ?? []).find((row) => {
    if (row.status === 'reclassified') return false;
    if (normalizeNameKey(String(row.name ?? '')) === key) return true;
    const aliases = Array.isArray(row.alias) ? (row.alias as unknown[]) : [];
    return aliases.some((a) => typeof a === 'string' && normalizeNameKey(a) === key);
  });
  if (hit) return { id: hit.id as string, name: hit.name as string, created: false };

  return characterRegistry.runExclusive(userId, async () => {
    const decision = await characterRegistry.classifyForCreation(userId, name, {
      sourceEntityType: 'person',
    });
    if (decision.action === 'merge') {
      return { id: decision.characterId, name: decision.matchedName, created: false };
    }
    const clean = decision.action === 'create' ? decision.cleanName : name;
    const parts = clean.split(/\s+/);
    const now = new Date().toISOString();
    const { data: created, error } = await supabaseAdmin
      .from('characters')
      .insert({
        id: randomUUID(),
        user_id: userId,
        name: clean,
        first_name: parts[0],
        last_name: parts.slice(1).join(' ') || null,
        status: 'active',
        has_met: true,
        metadata: { created_via: 'family_write' },
        created_at: now,
        updated_at: now,
      })
      .select('id, name')
      .single();
    if (error || !created) throw new Error(`Could not create a Character card for "${name}".`);
    return { id: created.id as string, name: created.name as string, created: true };
  });
}

export async function writeFamilyFromChat(userId: string, message: string): Promise<FamilyWriteResult> {
  const text = message.trim();

  const kin = text.match(
    /\b(?:mark|set|add)\s+(.{1,60}?)\s+(?:as\s+)?(?:my\s+)?(mom|mother|dad|father|brother|sister|cousin|uncle|aunt|grandma|grandmother|grandpa|grandfather|sibling|parent|child|son|daughter|niece|nephew)\b/i,
  );
  if (kin) {
    const name = cleanName(kin[1]);
    const relation = kin[2].toLowerCase();
    const character = await findOrCreateCharacter(userId, name);
    const ok = await familyTreeService.setMemberRelationship(userId, character.id, { relation });
    if (!ok) throw new Error(`Couldn't set ${character.name} as ${relation}.`);
    return {
      summary: `Marked **${character.name}** as your ${relation}${character.created ? ' (created Character card)' : ''}.`,
      operation: 'set_relation',
      characterId: character.id,
      characterName: character.name,
      relation,
    };
  }

  const add = text.match(/\badd\s+(.{1,60}?)\s+(?:to|into)\s+(?:my\s+)?(?:family(?:\s+tree)?|kin)\b/i);
  if (add) {
    const name = cleanName(add[1]);
    const character = await findOrCreateCharacter(userId, name);
    const ok = await familyTreeService.setMemberRelationship(userId, character.id, {
      relation: 'related',
    });
    if (!ok) throw new Error(`Couldn't add ${character.name} to your family tree.`);
    return {
      summary: `Added **${character.name}** to your Family Tree${character.created ? ' (created Character card)' : ''}.`,
      operation: 'add_member',
      characterId: character.id,
      characterName: character.name,
      relation: 'related',
    };
  }

  throw new Error('Try “mark Marcus as my cousin” or “add Jamie to my family tree”.');
}
