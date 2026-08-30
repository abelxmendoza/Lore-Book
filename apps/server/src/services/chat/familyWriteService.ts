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
  operation: 'set_relation' | 'add_member' | 'set_side' | 'exclude' | 'delete_pending';
  characterId: string | null;
  characterName: string;
  relation: string | null;
};

// Bounded, unambiguous "1-4 name-like words" for use inside a larger regex
// via string interpolation — no lazy `.{1,60}?` next to a `\s+` boundary,
// which CodeQL flags as a polynomial-time ReDoS risk on uncontrolled
// (chat-message) input: `.` also matches whitespace, so a lazy dot-group
// immediately followed by `\s+` has to try every possible split point across
// a run of whitespace. A token class that never matches whitespace itself
// removes that ambiguity entirely.
// Lazy throughout (`*?`/`{0,3}?`) so this prefers the SHORTEST valid name —
// matching the original `.{1,60}?` semantics of deferring an optional
// trailing word ("'s", "as", "my") to its own group instead of swallowing it
// into the name. Laziness doesn't reopen the ReDoS risk: safety here comes
// from the token class never overlapping `\s`, not from greedy vs lazy.
const NAME_TOKENS = `[a-zA-Z][a-zA-Z'’.-]*?(?:\\s+[a-zA-Z][a-zA-Z'’.-]*?){0,3}?`;

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find-only lookup against the user's OWN family tree (not the raw
 * `characters` table) — so a command like "delete Uncle Ralph" can only ever
 * act on someone already placed on the tree, never collide with a same-named
 * non-family character, and naturally surfaces ambiguity (this account has
 * had two same-first-name uncles) instead of silently guessing.
 */
export async function findFamilyMemberByName(
  userId: string,
  rawName: string,
): Promise<
  | { status: 'found'; id: string; name: string; relation: string }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: string[] }
> {
  const name = cleanName(rawName);
  const key = normalizeNameKey(name);
  const tree = await familyTreeService.getUserFamilyTree(userId);
  const members = (tree?.members ?? []).filter((m) => !m.is_self && !m.is_placeholder);

  const wholeWordMatch = (haystack: string, term: string): boolean => {
    if (!term) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
  };

  const matches = members.filter((m) => {
    if (normalizeNameKey(m.name ?? '') === key) return true;
    if (m.first_name && normalizeNameKey(m.first_name) === key) return true;
    if (normalizeNameKey(m.kinship_title ?? '') === key) return true;
    // Colloquial combined reference ("Uncle Ralph", "Tía Grace") — the search
    // text contains the member's first name as a whole word.
    return Boolean(m.first_name) && wholeWordMatch(key, normalizeNameKey(m.first_name!));
  });

  if (matches.length === 0) return { status: 'not_found' };
  if (matches.length > 1) {
    return { status: 'ambiguous', candidates: matches.map((m) => m.name) };
  }
  const only = matches[0];
  return { status: 'found', id: only.id, name: only.name, relation: only.relation };
}

export async function findOrCreateCharacter(userId: string, name: string): Promise<{ id: string; name: string; created: boolean }> {
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
    new RegExp(
      `\\b(?:mark|set|add)\\s+(${NAME_TOKENS})\\s+(?:as\\s+)?(?:my\\s+)?(mom|mother|dad|father|brother|sister|cousin|uncle|aunt|grandma|grandmother|grandpa|grandfather|sibling|parent|child|son|daughter|niece|nephew)\\b`,
      'i',
    ),
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

  const add = text.match(
    new RegExp(`\\badd\\s+(${NAME_TOKENS})\\s+(?:to|into)\\s+(?:my\\s+)?(?:family(?:\\s+tree)?|kin)\\b`, 'i'),
  );
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

  const side = text.match(
    new RegExp(`\\b(?:change|set|correct)\\s+(${NAME_TOKENS})(?:'s)?\\s+side\\s+to\\s+(maternal|paternal|both|other)\\b`, 'i'),
  );
  if (side) {
    const lookup = await findFamilyMemberByName(userId, side[1]);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find "${cleanName(side[1])}" in your family tree.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one match for "${cleanName(side[1])}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    const newSide = side[2].toLowerCase() as 'maternal' | 'paternal' | 'both' | 'other';
    const ok = await familyTreeService.setMemberRelationship(userId, lookup.id, {
      relation: lookup.relation,
      side: newSide,
    });
    if (!ok) throw new Error(`Couldn't update ${lookup.name}'s side.`);
    return {
      summary: `Set **${lookup.name}**'s side to ${newSide}.`,
      operation: 'set_side',
      characterId: lookup.id,
      characterName: lookup.name,
      relation: lookup.relation,
    };
  }

  // Bare "remove/exclude X from my family (tree)" — soft, reversible (keeps
  // the Character card). Checked before the delete patterns below; delete
  // requires an explicit "entirely"/"permanently"/"as a character" suffix
  // (or a bare "delete X" with no "from my family tree" clause at all).
  const exclude = text.match(
    new RegExp(`\\b(?:remove|exclude)\\s+(${NAME_TOKENS})\\s+from\\s+(?:my\\s+)?family(?:\\s+tree)?\\b`, 'i'),
  );
  const deleteEntirely = text.match(
    new RegExp(
      `\\bremove\\s+(${NAME_TOKENS})\\s+(?:entirely|permanently|as\\s+a\\s+(?:character|person)|for\\s+good)\\b`,
      'i',
    ),
  );
  if (exclude && !deleteEntirely) {
    const lookup = await findFamilyMemberByName(userId, exclude[1]);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find "${cleanName(exclude[1])}" in your family tree.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one match for "${cleanName(exclude[1])}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    const ok = await familyTreeService.excludeMember(userId, lookup.id);
    if (!ok) throw new Error(`Couldn't remove ${lookup.name} from your family tree.`);
    return {
      summary: `Removed **${lookup.name}** from your Family Tree (their Character card is kept — say "keep ${lookup.name}" to undo).`,
      operation: 'exclude',
      characterId: lookup.id,
      characterName: lookup.name,
      relation: lookup.relation,
    };
  }

  const deleteBare = text.match(new RegExp(`\\bdelete\\s+(${NAME_TOKENS})[.!]?$`, 'i'));
  const deleteWithFamily = text.match(
    new RegExp(`\\bdelete\\s+(${NAME_TOKENS})\\s+from\\s+(?:my\\s+)?family(?:\\s+tree)?\\s*[.!]?$`, 'i'),
  );
  const deleteName = deleteWithFamily?.[1] ?? deleteEntirely?.[1] ?? deleteBare?.[1];
  if (deleteName) {
    const lookup = await findFamilyMemberByName(userId, deleteName);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find "${cleanName(deleteName)}" in your family tree.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one match for "${cleanName(deleteName)}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    // Never delete directly from chat text — surface a confirmation question;
    // the response-compiler action-chip pipeline turns this into a chip the
    // user must explicitly click before `deleteCharacter` actually runs.
    return {
      summary: `Delete **${lookup.name}** from your family tree? This permanently removes the character and everything tied to it, and can't be undone.`,
      operation: 'delete_pending',
      characterId: lookup.id,
      characterName: lookup.name,
      relation: lookup.relation,
    };
  }

  throw new Error('Try “mark Marcus as my cousin” or “add Jamie to my family tree”.');
}
