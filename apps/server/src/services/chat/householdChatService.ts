/**
 * Explicit household writes from chat — create/delete a household, add/move
 * a member in or out, move a household to a new location. Mirrors
 * familyWriteService.ts's shape: narrow regex -> resolve by name ->
 * direct-execute for reversible ops, confirmation-question for the one
 * destructive op (deleting a whole household).
 */
import { normalizeNameKey } from '../../utils/nameNormalization';
import { householdService } from '../kinship/householdService';
import { householdWriteService } from '../kinship/householdWriteService';
import { findOrCreateCharacter } from './familyWriteService';

export type HouseholdWriteResult = {
  summary: string;
  operation: 'create' | 'add_member' | 'remove_member' | 'move' | 'delete_pending';
  householdId: string | null;
  householdName: string | null;
};

/** Trims trailing .!?," one character at a time — a regex here (`[.!?,"]+$`)
 *  is a polynomial-ReDoS shape on uncontrolled chat text (CodeQL-flagged);
 *  this is provably linear since there's no backtracking at all. */
function stripTrailingPunctuation(s: string): string {
  let end = s.length;
  while (end > 0 && '.!?,"'.includes(s[end - 1])) end--;
  return s.slice(0, end);
}

function cleanPhrase(raw: string): string {
  return stripTrailingPunctuation(raw.replace(/^(?:the|a|an|my)\s+/i, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull the optional "because ..." clause off the end of a command, e.g.
 * "Ralph moved out ... because he got his own place" -> "he got his own
 * place". Deliberately not a single `/\bbecause\s+(.+)$/` regex — `\s+`
 * immediately followed by `.+` (which also matches whitespace) is
 * ReDoS-prone on a long run of spaces, since the two quantifiers can split
 * the run ambiguously many ways. A tiny keyword-only regex (no quantifier
 * overlap, so no backtracking) plus a plain string slice is both safe and
 * simpler.
 */
function extractBecauseReason(text: string): string | undefined {
  const match = /\bbecause\b/i.exec(text);
  if (!match) return undefined;
  const reason = text.slice(match.index + match[0].length).trim();
  return reason || undefined;
}

// Bounded, unambiguous "1-6 word-like tokens" for names/addresses inside a
// larger regex — see PR #398 (household names/addresses run longer than
// person names, e.g. "Mom and Dad's House" or "456 Oak Ave"). No lazy
// `.{1,80}?` next to a `\s+` boundary, which CodeQL flags as ReDoS-prone on
// uncontrolled chat text: the token class never overlaps `\s`, so there's no
// ambiguous split point regardless of run length.
const PHRASE_TOKENS = `[a-zA-Z0-9][a-zA-Z0-9'’.-]*?(?:\\s+[a-zA-Z0-9][a-zA-Z0-9'’.-]*?){0,5}?`;

/** Find-only lookup against the user's own households — never guesses when a name is ambiguous. */
export async function findHouseholdByName(
  userId: string,
  rawName: string,
): Promise<
  | { status: 'found'; id: string; name: string }
  | { status: 'not_found' }
  | { status: 'ambiguous'; candidates: string[] }
> {
  const name = cleanPhrase(rawName);
  const key = normalizeNameKey(name);
  const households = await householdService.listHouseholds(userId);

  const matches = households.filter((h) => {
    const nameKey = normalizeNameKey(h.name ?? '');
    const locationKey = normalizeNameKey(h.locationName ?? '');
    if (nameKey === key || locationKey === key) return true;
    return (key.length >= 3 && (nameKey.includes(key) || locationKey.includes(key))) || false;
  });

  if (matches.length === 0) return { status: 'not_found' };
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches.map((h) => h.name) };
  return { status: 'found', id: matches[0].id, name: matches[0].name };
}

export async function writeHouseholdFromChat(userId: string, message: string): Promise<HouseholdWriteResult> {
  const text = message.trim();

  const create = text.match(
    new RegExp(`\\bcreate\\s+(?:a\\s+)?household\\s+(?:called|named)\\s+(${PHRASE_TOKENS})\\s*[.!]?$`, 'i'),
  );
  if (create) {
    const name = cleanPhrase(create[1]);
    const household = await householdWriteService.createHousehold(userId, name);
    return {
      summary: `Created the **${household.name}** household.`,
      operation: 'create',
      householdId: household.id,
      householdName: household.name,
    };
  }

  const addMember = text.match(
    new RegExp(`\\badd\\s+(${PHRASE_TOKENS})\\s+to\\s+(?:the\\s+)?(${PHRASE_TOKENS})\\s+household\\b`, 'i'),
  );
  if (addMember) {
    const personName = cleanPhrase(addMember[1]);
    const lookup = await findHouseholdByName(userId, addMember[2]);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find a "${cleanPhrase(addMember[2])}" household.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one household matching "${cleanPhrase(addMember[2])}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    const reason = extractBecauseReason(text);
    const character = await findOrCreateCharacter(userId, personName);
    await householdWriteService.addHouseholdMember(userId, lookup.id, character.name, {
      characterId: character.id,
      reason,
    });
    return {
      summary: `Added **${character.name}** to the **${lookup.name}** household${character.created ? ' (created Character card)' : ''}.`,
      operation: 'add_member',
      householdId: lookup.id,
      householdName: lookup.name,
    };
  }

  const removeMember = text.match(
    new RegExp(
      `\\b(?:remove\\s+(${PHRASE_TOKENS})\\s+from|(${PHRASE_TOKENS})\\s+moved\\s+out\\s+of)\\s+(?:the\\s+)?(${PHRASE_TOKENS})\\s+household\\b`,
      'i',
    ),
  );
  if (removeMember) {
    const personName = cleanPhrase(removeMember[1] ?? removeMember[2]);
    const householdPhrase = removeMember[3];
    const lookup = await findHouseholdByName(userId, householdPhrase);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find a "${cleanPhrase(householdPhrase)}" household.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one household matching "${cleanPhrase(householdPhrase)}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    const personLookup = await findOrCreateCharacter(userId, personName);
    const reason = extractBecauseReason(text);
    const ok = await householdWriteService.removeHouseholdMember(userId, lookup.id, personLookup.id, reason);
    if (!ok) throw new Error(`${personLookup.name} doesn't currently live at the ${lookup.name} household.`);
    return {
      summary: `Removed **${personLookup.name}** from the **${lookup.name}** household (their Character card is kept — history preserved).`,
      operation: 'remove_member',
      householdId: lookup.id,
      householdName: lookup.name,
    };
  }

  const move = text.match(
    new RegExp(`\\bmove\\s+(?:the\\s+)?(${PHRASE_TOKENS})\\s+household\\s+to\\s+(${PHRASE_TOKENS})\\s*[.!]?$`, 'i'),
  );
  if (move) {
    const lookup = await findHouseholdByName(userId, move[1]);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find a "${cleanPhrase(move[1])}" household.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one household matching "${cleanPhrase(move[1])}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    const newLocation = cleanPhrase(move[2]);
    const reason = extractBecauseReason(text);
    await householdWriteService.moveHousehold(userId, lookup.id, newLocation, reason);
    return {
      summary: `Moved the **${lookup.name}** household to **${newLocation}**.`,
      operation: 'move',
      householdId: lookup.id,
      householdName: lookup.name,
    };
  }

  const deleteHousehold = text.match(new RegExp(`\\bdelete\\s+(?:the\\s+)?(${PHRASE_TOKENS})\\s+household\\b`, 'i'));
  if (deleteHousehold) {
    const lookup = await findHouseholdByName(userId, deleteHousehold[1]);
    if (lookup.status === 'not_found') {
      throw new Error(`I couldn't find a "${cleanPhrase(deleteHousehold[1])}" household.`);
    }
    if (lookup.status === 'ambiguous') {
      throw new Error(`I found more than one household matching "${cleanPhrase(deleteHousehold[1])}": ${lookup.candidates.join(', ')}. Which one did you mean?`);
    }
    // Never delete directly from chat text — surface a confirmation question;
    // the response-compiler action-chip pipeline (see PR #398) turns this
    // into a chip the user must explicitly click before deleteHousehold runs.
    return {
      summary: `Delete the **${lookup.name}** household? This removes it from your household list (its history is kept) and can't be undone from chat alone.`,
      operation: 'delete_pending',
      householdId: lookup.id,
      householdName: lookup.name,
    };
  }

  throw new Error('Try "add Ralph to the Mom and Dad\'s House household" or "create a household called Grandma\'s House".');
}
