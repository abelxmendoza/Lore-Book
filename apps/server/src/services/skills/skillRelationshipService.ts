import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizeSkillKey } from './skillIdentity';
import { skillService } from './skillService';
import { skillLoreService } from './skillLoreService';

export type SkillLinkInput = {
  parent_skill_name?: string;
  related_skill_names?: string[];
  confidence?: number;
  evidence?: string;
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

class SkillRelationshipService {
  private findByKey(
    skills: Awaited<ReturnType<typeof skillService.getSkills>>,
    name: string
  ) {
    const key = normalizeSkillKey(name);
    return skills.find((s) => normalizeSkillKey(s.skill_name) === key);
  }

  /** Child skill specializes under parent (e.g. Armbar → Brazilian Jiu-Jitsu). */
  async linkSubskill(
    userId: string,
    childSkillId: string,
    parentSkillId: string,
    opts: { confidence?: number; evidence?: string } = {}
  ): Promise<void> {
    if (childSkillId === parentSkillId) return;

    const { error } = await supabaseAdmin.from('skill_relationships').upsert(
      {
        user_id: userId,
        from_skill_id: childSkillId,
        to_skill_id: parentSkillId,
        relationship_type: 'specialization_of',
        confidence: opts.confidence ?? 0.75,
        strength: 0.7,
        metadata: opts.evidence ? { evidence: opts.evidence } : {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,from_skill_id,to_skill_id,relationship_type' }
    );

    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, childSkillId, parentSkillId }, 'skill_relationships upsert failed');
    }

    const child = await skillService.getSkill(userId, childSkillId);
    if (child) {
      const profile = (child.metadata?.skill_profile ?? {}) as Record<string, unknown>;
      const parentIds = new Set<string>(
        Array.isArray(profile.parent_skill_ids) ? (profile.parent_skill_ids as string[]) : []
      );
      parentIds.add(parentSkillId);
      const history = skillLoreService.appendHistory(child.metadata ?? {}, {
        event_type: 'relationship',
        summary: `Linked as subskill of parent skill`,
        source_type: 'manual',
      });
      await skillService.updateSkillMetadata(userId, childSkillId, {
        skill_profile: { ...profile, parent_skill_ids: [...parentIds] },
        skill_history: history,
      });
    }
  }

  async linkRelated(
    userId: string,
    fromSkillId: string,
    toSkillId: string,
    opts: { confidence?: number } = {}
  ): Promise<void> {
    if (fromSkillId === toSkillId) return;
    const { error } = await supabaseAdmin.from('skill_relationships').upsert(
      {
        user_id: userId,
        from_skill_id: fromSkillId,
        to_skill_id: toSkillId,
        relationship_type: 'related_to',
        confidence: opts.confidence ?? 0.6,
        strength: 0.5,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,from_skill_id,to_skill_id,relationship_type' }
    );
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, fromSkillId, toSkillId }, 'related_to link failed');
    }
  }

  /** Resolve names from extraction and wire parent/subskill + related edges. */
  async linkFromExtraction(
    userId: string,
    skillId: string,
    links: SkillLinkInput
  ): Promise<void> {
    const skills = await skillService.getSkills(userId, { active_only: false });
    const confidence = links.confidence ?? 0.7;

    if (links.parent_skill_name?.trim()) {
      const parent = this.findByKey(skills, links.parent_skill_name);
      if (parent) {
        await this.linkSubskill(userId, skillId, parent.id, {
          confidence,
          evidence: links.evidence,
        });
      } else {
        const child = await skillService.getSkill(userId, skillId);
        if (child) {
          const profile = (child.metadata?.skill_profile ?? {}) as Record<string, unknown>;
          await skillService.updateSkillMetadata(userId, skillId, {
            skill_profile: { ...profile, pending_parent_skill_name: links.parent_skill_name.trim() },
          });
        }
      }
    }

    for (const relatedName of links.related_skill_names ?? []) {
      if (!relatedName?.trim()) continue;
      const related = this.findByKey(skills, relatedName);
      if (related) {
        await this.linkRelated(userId, skillId, related.id, { confidence });
      }
    }
  }

  async resolvePendingParentLinks(userId: string): Promise<number> {
    const skills = await skillService.getSkills(userId, { active_only: false });
    let linked = 0;
    for (const s of skills) {
      const profile = (s.metadata?.skill_profile ?? {}) as Record<string, unknown>;
      const pending = profile.pending_parent_skill_name as string | undefined;
      if (!pending?.trim()) continue;
      const parent = this.findByKey(skills, pending);
      if (!parent) continue;
      await this.linkSubskill(userId, s.id, parent.id);
      const { pending_parent_skill_name: _, ...rest } = profile;
      await skillService.updateSkillMetadata(userId, s.id, { skill_profile: rest });
      linked++;
    }
    return linked;
  }
}

export const skillRelationshipService = new SkillRelationshipService();
