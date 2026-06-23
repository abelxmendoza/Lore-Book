/**
 * Character lexical audit — deterministic checks against entityClassifier + name validation.
 */
import { classifyEntity, isCharacterEligible } from '../entities/entityClassifier';
import {
  isCollectivePersonName,
  isPlaceholderPersonName,
  isRoleDescriptorPersonName,
} from '../../utils/personNameValidation';
import { supabaseAdmin } from '../supabaseClient';

export type CharacterLexicalIssue = {
  id: string;
  name: string;
  rule: string;
  issue: string;
  severity: 'error' | 'warning';
  classifierType?: string;
  classifierReason?: string;
  importanceLevel?: string | null;
};

export type CharacterLexicalAudit = {
  userId: string;
  characterCount: number;
  issues: CharacterLexicalIssue[];
};

const NON_PERSON_TYPES = new Set([
  'PLACE',
  'LOCATION',
  'ORGANIZATION',
  'COMPANY',
  'GROUP',
  'PRODUCT',
  'BRAND',
  'APP',
  'EVENT',
  'FOOD_DRINK',
  'MEDIA',
  'SKILL',
  'VEHICLE',
  'HOUSEHOLD',
]);

class CharacterLexicalAuditService {
  async audit(userId: string): Promise<CharacterLexicalAudit> {
    const { data: characters, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, importance_level, metadata')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;

    const issues: CharacterLexicalIssue[] = [];

    for (const row of characters ?? []) {
      const name = String(row.name ?? '').trim();
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const isSelf = meta.is_self === true || /^me$/i.test(name);

      if (isPlaceholderPersonName(name)) {
        issues.push({
          id: row.id,
          name,
          rule: 'person_name.placeholder',
          issue: 'Placeholder or unresolved name — not a real person',
          severity: 'error',
          importanceLevel: row.importance_level,
        });
        continue;
      }

      if (isCollectivePersonName(name)) {
        issues.push({
          id: row.id,
          name,
          rule: 'person_name.collective',
          issue: 'Collective or group label — belongs in Organizations, not Character Book',
          severity: 'error',
          importanceLevel: row.importance_level,
        });
        continue;
      }

      if (isRoleDescriptorPersonName(name)) {
        issues.push({
          id: row.id,
          name,
          rule: 'person_name.role_descriptor',
          issue: 'Role or scene descriptor — not a stable person identity',
          severity: 'warning',
          importanceLevel: row.importance_level,
        });
      }

      const cls = classifyEntity(name);
      if (NON_PERSON_TYPES.has(cls.type)) {
        issues.push({
          id: row.id,
          name,
          rule: 'entity_classifier.wrong_book',
          issue: `Lexical classifier says ${cls.type} — should not be a character card`,
          severity: 'error',
          classifierType: cls.type,
          classifierReason: cls.reason,
          importanceLevel: row.importance_level,
        });
      } else if (!isCharacterEligible(cls.type) && !isSelf) {
        issues.push({
          id: row.id,
          name,
          rule: 'entity_classifier.unclassified',
          issue: 'No positive person evidence — needs more context before promotion',
          severity: 'warning',
          classifierType: cls.type,
          classifierReason: cls.reason,
          importanceLevel: row.importance_level,
        });
      }

      if (
        meta.public_figure === true &&
        !isSelf &&
        ['protagonist', 'major'].includes(String(row.importance_level ?? ''))
      ) {
        issues.push({
          id: row.id,
          name,
          rule: 'public_figure.importance_cap',
          issue: 'Public figure should not be protagonist/major tier unless family or romantic',
          severity: 'warning',
          importanceLevel: row.importance_level,
        });
      }
    }

    return {
      userId,
      characterCount: characters?.length ?? 0,
      issues,
    };
  }
}

export const characterLexicalAuditService = new CharacterLexicalAuditService();
