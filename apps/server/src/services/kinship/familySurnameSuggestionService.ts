/**
 * Surname-match suggestions — when two characters who are already
 * identified as family-role (a kinship title like "Cousin Jerry", an
 * existing family relationship edge, or a family_override on the tree)
 * share a last name, suggest they might be related.
 *
 * Suggest-only by default: this never writes a confirmed family edge on
 * its own for bare surname matches, so a common surname (Smith, Garcia)
 * can't silently link two unrelated people.
 *
 * Exception: when both already share the same user-asserted tree parent
 * (`family_override.connects_to_id`) AND the same last name, we sync the
 * missing bidirectional edges (cousin↔cousin family link + parent_of from
 * the shared aunt/uncle). That is tree placement the user already confirmed.
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
  metadata?: Record<string, unknown> | null;
};

type FamilyOverride = {
  relation?: string;
  side?: string | null;
  connects_to_id?: string | null;
};

export type PossibleFamilyMatch = {
  id: string;
  characterAId: string;
  characterAName: string;
  characterBId: string;
  characterBName: string;
  sharedLastName: string;
};

function readOverride(meta: Record<string, unknown> | null | undefined): FamilyOverride | null {
  const raw = meta?.family_override;
  if (!raw || typeof raw !== 'object') return null;
  return raw as FamilyOverride;
}

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
        .select('id, name, last_name, metadata')
        .eq('id', characterId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!character?.last_name?.trim()) return;

      const self = character as CharacterRow;
      if (!(await this.isFamilyRoleCharacter(userId, self))) return;

      const lastNameKey = normalizeNameKey(self.last_name!);

      const { data: others } = await supabaseAdmin
        .from('characters')
        .select('id, name, last_name, metadata')
        .eq('user_id', userId)
        .neq('id', characterId)
        .not('last_name', 'is', null)
        .neq('last_name', '');
      if (!others?.length) return;

      for (const other of others as CharacterRow[]) {
        if (!other.last_name || normalizeNameKey(other.last_name) !== lastNameKey) continue;
        if (!(await this.isFamilyRoleCharacter(userId, other))) continue;
        await this.linkOrSuggest(userId, self, other);
      }
    } catch (err) {
      logger.debug({ err, userId, characterId }, 'checkForSurnameMatches failed (non-fatal)');
    }
  }

  /**
   * Sweep the account for cousins who already share a tree parent + surname
   * and sync missing bidirectional edges. Safe to call from family-tree reads.
   */
  async reconcileTreePlacedSurnameLinks(userId: string): Promise<number> {
    let linked = 0;
    try {
      const { data: chars } = await supabaseAdmin
        .from('characters')
        .select('id, name, last_name, metadata')
        .eq('user_id', userId);
      const rows = (chars ?? []) as CharacterRow[];

      // Align self↔cousin edges with family_override.relation (cousin beats stale sibling).
      for (const row of rows) {
        const override = readOverride(row.metadata ?? undefined);
        if (!override?.relation || override.relation === 'sibling') continue;
        const fixed = await this.alignProtagonistKinshipWithOverride(userId, row.id, override.relation);
        if (fixed) linked++;
      }

      const bySurname = new Map<string, CharacterRow[]>();
      for (const row of rows) {
        const key = normalizeNameKey(row.last_name ?? '');
        if (!key) continue;
        const override = readOverride(row.metadata ?? undefined);
        if (!override?.connects_to_id) continue;
        if (!(await this.isFamilyRoleCharacter(userId, row))) continue;
        const list = bySurname.get(key) ?? [];
        list.push(row);
        bySurname.set(key, list);
      }

      for (const group of bySurname.values()) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            const parentA = readOverride(a.metadata ?? undefined)?.connects_to_id;
            const parentB = readOverride(b.metadata ?? undefined)?.connects_to_id;
            if (!parentA || parentA !== parentB) continue;
            const changed = await this.syncSharedParentCousins(userId, a, b, parentA);
            if (changed) linked++;
          }
        }
      }
    } catch (err) {
      logger.debug({ err, userId }, 'reconcileTreePlacedSurnameLinks failed (non-fatal)');
    }
    return linked;
  }

  /** When the tree says cousin, don't leave a stale sibling kinship on the self edge. */
  private async alignProtagonistKinshipWithOverride(
    userId: string,
    characterId: string,
    relation: string,
  ): Promise<boolean> {
    const { data: self } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .contains('metadata', { is_self: true })
      .maybeSingle();
    if (!self?.id || self.id === characterId) return false;

    const { data: edges } = await supabaseAdmin
      .from('character_relationships')
      .select('id, metadata, relationship_type')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${self.id},target_character_id.eq.${characterId}),and(source_character_id.eq.${characterId},target_character_id.eq.${self.id})`,
      );

    const list = edges ?? [];
    const preferred = list.find(
      (e) =>
        e.relationship_type !== 'possible_family' &&
        ((e.metadata as Record<string, unknown> | null)?.kinship === relation ||
          String(e.relationship_type).includes(relation)),
    );
    let changed = false;
    for (const edge of list) {
      if ((edge.relationship_type as string) === 'possible_family') continue;
      const meta = (edge.metadata as Record<string, unknown> | null) ?? {};
      if (preferred && edge.id !== preferred.id && meta.kinship === 'sibling') {
        await supabaseAdmin
          .from('character_relationships')
          .update({
            status: 'dismissed',
            metadata: {
              ...meta,
              superseded_by: preferred.id,
              reason: 'duplicate_sibling_vs_tree_override',
            },
          })
          .eq('id', edge.id);
        changed = true;
        continue;
      }
      if (meta.kinship === relation) continue;
      if (meta.kinship && meta.kinship !== 'sibling' && meta.kinship !== 'related') continue;
      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: relation === 'cousin' ? 'cousin_of' : edge.relationship_type,
          relationship_category: 'family',
          status: 'active',
          metadata: { ...meta, kinship: relation, aligned_from_family_override: true },
        })
        .eq('id', edge.id);
      changed = true;
    }
    return changed;
  }

  /** Kinship-titled name, family_override, categories, or any existing family edge. */
  private async isFamilyRoleCharacter(userId: string, character: CharacterRow): Promise<boolean> {
    if (parseKinshipFromName(character.name)) return true;

    const meta = character.metadata ?? {};
    if (readOverride(meta)) return true;
    const categories = meta.relationship_categories;
    if (Array.isArray(categories) && categories.some((c) => String(c).toLowerCase() === 'family')) {
      return true;
    }

    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('relationship_category, relationship_type, relationship_role, metadata')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

    return (rels ?? []).some((r) => {
      if ((r.relationship_type as string | null) === 'possible_family') return false;
      return isFamilyRelationshipRow(r as FamilyRelationshipRowLike);
    });
  }

  private async linkOrSuggest(userId: string, a: CharacterRow, b: CharacterRow): Promise<void> {
    const parentA = readOverride(a.metadata ?? undefined)?.connects_to_id;
    const parentB = readOverride(b.metadata ?? undefined)?.connects_to_id;
    if (parentA && parentA === parentB) {
      await this.syncSharedParentCousins(userId, a, b, parentA);
      return;
    }
    await this.suggestIfNew(userId, a, b);
  }

  /**
   * User already placed both under the same aunt/uncle and they share a surname —
   * ensure parent_of edges + a confirmed family link between them.
   */
  private async syncSharedParentCousins(
    userId: string,
    a: CharacterRow,
    b: CharacterRow,
    parentId: string,
  ): Promise<boolean> {
    let changed = false;

    for (const child of [a, b]) {
      const ensured = await this.ensureParentOfEdge(userId, parentId, child.id);
      if (ensured) changed = true;
    }

    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id, relationship_type, status, metadata')
      .eq('user_id', userId)
      .or(
        `and(source_character_id.eq.${a.id},target_character_id.eq.${b.id}),and(source_character_id.eq.${b.id},target_character_id.eq.${a.id})`,
      );

    const rows = existing ?? [];
    const confirmed = rows.find(
      (r) =>
        r.status === 'active' &&
        r.relationship_type !== 'possible_family' &&
        isFamilyRelationshipRow(r as FamilyRelationshipRowLike),
    );
    if (confirmed) {
      // Upgrade stale sibling kinship labels when both are tree-placed cousins.
      const kin = (confirmed.metadata as Record<string, unknown> | null)?.kinship;
      if (kin === 'sibling') {
        await supabaseAdmin
          .from('character_relationships')
          .update({
            metadata: {
              ...((confirmed.metadata as Record<string, unknown> | null) ?? {}),
              kinship: 'cousin',
              inference_source: 'surname_tree_comember',
              shared_last_name: a.last_name,
            },
          })
          .eq('id', confirmed.id);
        changed = true;
      }
      return changed;
    }

    const pending = rows.find((r) => r.relationship_type === 'possible_family');
    if (pending) {
      await supabaseAdmin
        .from('character_relationships')
        .update({
          relationship_type: 'family',
          relationship_category: 'family',
          status: 'active',
          inference_status: 'asserted',
          summary: `Both share the last name "${a.last_name}" and sit under the same family-tree parent`,
          metadata: {
            ...((pending.metadata as Record<string, unknown> | null) ?? {}),
            inference_source: 'surname_tree_comember',
            shared_last_name: a.last_name,
            kinship: 'cousin',
          },
        })
        .eq('id', pending.id);
      return true;
    }

    if (rows.length > 0) return changed; // dismissed or non-family edge — don't override

    await supabaseAdmin.from('character_relationships').insert({
      user_id: userId,
      source_character_id: a.id,
      target_character_id: b.id,
      relationship_type: 'family',
      relationship_category: 'family',
      status: 'active',
      inference_status: 'asserted',
      summary: `Both share the last name "${a.last_name}" and sit under the same family-tree parent`,
      metadata: {
        inference_source: 'surname_tree_comember',
        shared_last_name: a.last_name,
        kinship: 'cousin',
      },
    });
    return true;
  }

  private async ensureParentOfEdge(userId: string, parentId: string, childId: string): Promise<boolean> {
    if (!parentId || !childId || parentId === childId) return false;
    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id, relationship_type, status')
      .eq('user_id', userId)
      .eq('source_character_id', parentId)
      .eq('target_character_id', childId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.relationship_type === 'parent_of' && existing.status === 'active') return false;
      // Don't clobber an intentional non-parent edge.
      return false;
    }

    const { data: reverse } = await supabaseAdmin
      .from('character_relationships')
      .select('id')
      .eq('user_id', userId)
      .eq('source_character_id', childId)
      .eq('target_character_id', parentId)
      .limit(1)
      .maybeSingle();
    if (reverse) return false;

    await supabaseAdmin.from('character_relationships').insert({
      user_id: userId,
      source_character_id: parentId,
      target_character_id: childId,
      relationship_type: 'parent_of',
      relationship_category: 'family',
      status: 'active',
      inference_status: 'asserted',
      summary: 'Synced from shared family-tree placement + surname',
      metadata: {
        inference_source: 'surname_tree_comember',
        kinship: 'parent',
      },
    });
    return true;
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
