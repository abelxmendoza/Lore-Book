/**
 * Surname-match suggestions — when two characters who are already
 * identified as family-role (a kinship title like "Cousin Jerry", or an
 * existing family relationship edge) share a last name, suggest they might
 * be related. Suggest-only: this never writes a confirmed family edge on
 * its own, so a common surname (Smith, Garcia) can't silently link two
 * unrelated people. The suggestion is a character_relationships row with
 * relationship_type 'possible_family' and status 'pending' — it stays
 * invisible to FamilyGraphService.getGraph() (see isFamilyRelationshipRow)
 * until the user confirms it via PATCH /api/relationships/character-links/:id.
 */
import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { supabaseAdmin } from '../supabaseClient';
import { parseKinshipFromName } from './kinshipGlossary';
import { isFamilyRelationshipRow, type FamilyRelationshipRowLike } from './familyGraphService';

type CharacterRow = {
  id: string;
  name: string;
  last_name: string | null;
};

export type PossibleFamilyMatch = {
  id: string;
  characterAId: string;
  characterAName: string;
  characterBId: string;
  characterBName: string;
  sharedLastName: string;
};

class FamilySurnameSuggestionService {
  /**
   * Call after any write that sets or changes a character's last_name
   * (modal edit, chat correction, name-upgrade, or creation). Fire-and-forget
   * — never awaited into a response, matching the other post-write inference
   * calls in this codebase (characterImportanceService, socialStandingService).
   */
  async checkForSurnameMatches(userId: string, characterId: string): Promise<void> {
    try {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('id, name, last_name')
        .eq('id', characterId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!character?.last_name?.trim()) return;

      const self = character as CharacterRow;
      if (!(await this.isFamilyRoleCharacter(userId, self))) return;

      const lastNameKey = normalizeNameKey(self.last_name!);

      const { data: others } = await supabaseAdmin
        .from('characters')
        .select('id, name, last_name')
        .eq('user_id', userId)
        .neq('id', characterId)
        .not('last_name', 'is', null)
        .neq('last_name', '');
      if (!others?.length) return;

      for (const other of others as CharacterRow[]) {
        if (!other.last_name || normalizeNameKey(other.last_name) !== lastNameKey) continue;
        if (!(await this.isFamilyRoleCharacter(userId, other))) continue;
        await this.suggestIfNew(userId, self, other);
      }
    } catch (err) {
      logger.debug({ err, userId, characterId }, 'checkForSurnameMatches failed (non-fatal)');
    }
  }

  /** Kinship-titled name (e.g. "Cousin Jerry"), or any existing family edge. */
  private async isFamilyRoleCharacter(userId: string, character: CharacterRow): Promise<boolean> {
    if (parseKinshipFromName(character.name)) return true;

    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('relationship_category, relationship_type, relationship_role, metadata')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

    return (rels ?? []).some((r) => isFamilyRelationshipRow(r as FamilyRelationshipRowLike));
  }

  private async suggestIfNew(userId: string, a: CharacterRow, b: CharacterRow): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${a.id},target_character_id.eq.${b.id}),and(source_character_id.eq.${b.id},target_character_id.eq.${a.id})`,
      )
      .limit(1)
      .maybeSingle();
    if (existing) return; // any existing edge (confirmed, pending, or dismissed) wins — never re-suggest

    await supabaseAdmin.from('character_relationships').insert({
      user_id: userId,
      source_character_id: a.id,
      target_character_id: b.id,
      relationship_type: 'possible_family',
      status: 'pending',
      inference_status: 'inferred',
      summary: `Both share the last name "${a.last_name}" — possibly related`,
      metadata: {
        inference_source: 'surname_match',
        shared_last_name: a.last_name,
      },
    });
  }

  /** Pending possible_family suggestions across the account, for the Family Book. */
  async listPendingSuggestions(userId: string): Promise<PossibleFamilyMatch[]> {
    const { data: rows } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, metadata')
      .eq('user_id', userId)
      .eq('relationship_type', 'possible_family')
      .eq('status', 'pending');
    if (!rows?.length) return [];

    const ids = [...new Set(rows.flatMap((r) => [r.source_character_id as string, r.target_character_id as string]))];
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .in('id', ids);
    const nameById = new Map((chars ?? []).map((c) => [c.id as string, c.name as string]));

    return rows.map((r) => ({
      id: r.id as string,
      characterAId: r.source_character_id as string,
      characterAName: nameById.get(r.source_character_id as string) ?? 'Unknown',
      characterBId: r.target_character_id as string,
      characterBName: nameById.get(r.target_character_id as string) ?? 'Unknown',
      sharedLastName: ((r.metadata as Record<string, unknown> | null)?.shared_last_name as string | undefined) ?? '',
    }));
  }
}

export const familySurnameSuggestionService = new FamilySurnameSuggestionService();
