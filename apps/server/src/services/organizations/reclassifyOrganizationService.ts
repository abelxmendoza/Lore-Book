/**
 * Guarded organization reclassification — moves a Groups & Organizations card
 * that landed in the wrong book into the correct entity book (character,
 * location, project, skill, event). Each target book's own admission rules
 * run BEFORE the move (the same guards its suggestion pipeline uses), so a
 * rejected move returns the guard's reason instead of silently seeding a
 * wrong-domain record. The source organization is only deleted after the
 * target book accepts the record.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { isJunkTestData } from '../characters/audit/wrongDomainCharacterGuard';
import { characterRegistry } from '../characterRegistry';
import { guardPlaceCandidate } from '../lexical/places/placeTypeGuard';
import { guardPlaceWrongDomain } from '../lexical/places/placeWrongDomainGuard';
import { guardProjectCandidate } from '../lexical/projects/projectTypeGuard';
import { locationSuggestionService } from '../locationSuggestionService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { skillService } from '../skills/skillService';
import { evaluateLifeLogEligibility, isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';
import { normalizeNameKey } from '../../utils/nameNormalization';

export const ORGANIZATION_RECLASSIFY_TARGETS = [
  'character',
  'location',
  'project',
  'skill',
  'event',
] as const;
export type OrganizationReclassifyTarget = (typeof ORGANIZATION_RECLASSIFY_TARGETS)[number];

export type OrganizationReclassifyValidation = {
  allowed: boolean;
  reason?: string;
  rulesFired?: string[];
};

export type ReclassifyOrganizationRecord = {
  id: string;
  name: string;
  description?: string | null;
  aliases?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export type OrganizationReclassifyOutcome = {
  target: OrganizationReclassifyTarget;
  targetId: string | null;
  targetName: string;
  mergedIntoExisting: boolean;
};

export function isOrganizationReclassifyTarget(value: unknown): value is OrganizationReclassifyTarget {
  return typeof value === 'string' && (ORGANIZATION_RECLASSIFY_TARGETS as readonly string[]).includes(value);
}

/**
 * Run the target book's admission rules against the candidate name.
 * Pure — no DB access — so it is directly unit-testable.
 */
export function validateOrganizationReclassification(
  name: string,
  context: string,
  target: OrganizationReclassifyTarget,
): OrganizationReclassifyValidation {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length < 2 || trimmed.length > 120) {
    return { allowed: false, reason: 'Name is too short or too long to be a valid entity name.' };
  }
  if (isJunkTestData(trimmed, context)) {
    return { allowed: false, reason: 'This looks like test/placeholder data, not a real entity.' };
  }

  if (target === 'location') {
    const wrongDomain = guardPlaceWrongDomain(trimmed, context);
    if (!wrongDomain.allowed) {
      return {
        allowed: false,
        reason: `Places rules rejected "${trimmed}"${wrongDomain.rejectedAs ? ` — it reads as ${String(wrongDomain.rejectedAs).toLowerCase().replace(/_/g, ' ')}` : ''}. It would not be a valid Location card.`,
        rulesFired: wrongDomain.rulesFired,
      };
    }
    const candidate = guardPlaceCandidate(trimmed, context);
    if (!candidate.allowed) {
      return {
        allowed: false,
        reason: `Places rules rejected "${trimmed}"${candidate.rejectedAs ? ` — it reads as ${String(candidate.rejectedAs).toLowerCase().replace(/_/g, ' ')}` : ''}.`,
        rulesFired: candidate.rulesFired,
      };
    }
    return { allowed: true, rulesFired: candidate.rulesFired };
  }

  if (target === 'project') {
    const guard = guardProjectCandidate(trimmed, context);
    if (!guard.allowed) {
      return {
        allowed: false,
        reason:
          guard.rejectionReason ??
          `Projects rules rejected "${trimmed}"${guard.rejectedAs ? ` — it reads as ${String(guard.rejectedAs).toLowerCase().replace(/_/g, ' ')}` : ''}.`,
        rulesFired: guard.rulesFired,
      };
    }
    return { allowed: true, rulesFired: guard.rulesFired };
  }

  // Characters, skills, and events: user correction wins after the shared
  // junk/length floor. Domain-specific suggestion guards stay out of the way
  // of an explicit "this was filed wrong" move.
  return { allowed: true };
}

class ReclassifyOrganizationService {
  async performReclassification(
    userId: string,
    organization: ReclassifyOrganizationRecord,
    target: OrganizationReclassifyTarget,
  ): Promise<OrganizationReclassifyOutcome> {
    const provenance = {
      reclassified_from: 'organization',
      reclassified_from_organization_id: organization.id,
      reclassified_at: new Date().toISOString(),
    };
    const name = organization.name.trim();
    const summary = organization.description?.trim() || null;
    const aliases = (organization.aliases ?? []).filter((a) => a && a.trim().length > 0).map((a) => a.trim());

    if (target === 'character') {
      return this.toCharacter(userId, name, summary, aliases, provenance);
    }
    if (target === 'location') {
      return this.toLocation(userId, name, summary, provenance);
    }
    if (target === 'project') {
      return this.toProject(userId, name, summary, provenance);
    }
    if (target === 'skill') {
      return this.toSkill(userId, name, summary, provenance);
    }
    return this.toEvent(userId, name, summary, provenance);
  }

  private async toCharacter(
    userId: string,
    name: string,
    summary: string | null,
    aliases: string[],
    provenance: Record<string, unknown>,
  ): Promise<OrganizationReclassifyOutcome> {
    return characterRegistry.runExclusive(userId, async () => {
      // User is correcting a misfiled group → person; skip known-non-person so
      // the still-present organization row does not block the move.
      const decision = await characterRegistry.classifyForCreation(userId, name, {
        sourceEntityType: 'person',
      });

      if (decision.action === 'merge') {
        await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, {
          source: 'organization_reclassify',
        });
        await this.enrichCharacter(userId, decision.characterId, summary, aliases, provenance);
        return {
          target: 'character' as const,
          targetId: decision.characterId,
          targetName: decision.matchedName ?? name,
          mergedIntoExisting: true,
        };
      }

      if (decision.action === 'defer') {
        const first = decision.candidates?.[0];
        if (first?.character_id) {
          await characterRegistry.mergeMention(userId, first.character_id, decision.cleanName, {
            source: 'organization_reclassify',
          });
          await this.enrichCharacter(userId, first.character_id, summary, aliases, provenance);
          return {
            target: 'character' as const,
            targetId: first.character_id,
            targetName: first.name ?? name,
            mergedIntoExisting: true,
          };
        }
      }

      if (decision.action === 'reject') {
        throw new Error(`Could not move to Characters: ${decision.reason.replace(/_/g, ' ')}.`);
      }

      const cleanName = decision.action === 'create' ? decision.cleanName : name.trim();
      const parts = cleanName.split(/\s+/);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('characters')
        .insert({
          user_id: userId,
          name: cleanName,
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || null,
          alias: aliases,
          summary,
          status: 'active',
          has_met: true,
          metadata: { ...provenance, created_via: 'organization_reclassify' },
          created_at: now,
          updated_at: now,
        })
        .select('id, name')
        .single();
      if (error || !data) {
        logger.error({ error, name: cleanName }, 'reclassify organization: character insert failed');
        throw new Error('Could not create the character in the Characters book.');
      }
      return {
        target: 'character' as const,
        targetId: data.id,
        targetName: data.name ?? cleanName,
        mergedIntoExisting: false,
      };
    });
  }

  private async enrichCharacter(
    userId: string,
    characterId: string,
    summary: string | null,
    aliases: string[],
    provenance: Record<string, unknown>,
  ): Promise<void> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('summary, alias, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return;
    const existingAliases = Array.isArray(data.alias)
      ? (data.alias as unknown[]).filter((a): a is string => typeof a === 'string')
      : [];
    const patch: Record<string, unknown> = {
      alias: [...new Set([...existingAliases, ...aliases].map((a) => a.trim()).filter(Boolean))],
      metadata: {
        ...((data.metadata as Record<string, unknown> | null) ?? {}),
        ...provenance,
        merged_from_organization: true,
      },
      updated_at: new Date().toISOString(),
    };
    if (!String(data.summary ?? '').trim() && summary) {
      patch.summary = summary;
    }
    await supabaseAdmin.from('characters').update(patch).eq('id', characterId).eq('user_id', userId);
  }

  private async toLocation(
    userId: string,
    name: string,
    summary: string | null,
    provenance: Record<string, unknown>,
  ): Promise<OrganizationReclassifyOutcome> {
    try {
      const created = await locationSuggestionService.acceptSuggestion(userId, {
        name,
        context: 'Reclassified from Groups & Organizations',
        description: summary ?? undefined,
      });
      await this.attachProvenance('locations', created.id, userId, provenance);
      return { target: 'location', targetId: created.id, targetName: created.name, mergedIntoExisting: false };
    } catch (error) {
      // acceptSuggestion throws when a similar place already exists — that
      // still means the entity lives in the right book now.
      if (error instanceof Error && /already exist/i.test(error.message)) {
        return { target: 'location', targetId: null, targetName: name, mergedIntoExisting: true };
      }
      throw error;
    }
  }

  private async toProject(
    userId: string,
    name: string,
    summary: string | null,
    provenance: Record<string, unknown>,
  ): Promise<OrganizationReclassifyOutcome> {
    const { projectService } = await import('../projectService');
    const existingProjects = await projectService.listProjects(userId);
    const nameKey = normalizeNameKey(name);
    const preexisting = existingProjects.find(
      (p) => normalizeNameKey(p.name) === nameKey || normalizeNameKey(p.normalized_name ?? '') === nameKey,
    );

    const project = await projectSuggestionService.materializeProject(userId, {
      name,
      description: summary,
    });
    const mergedIntoExisting = Boolean(preexisting);
    await this.attachProvenance('projects', project?.id ?? null, userId, {
      ...provenance,
      ...(mergedIntoExisting ? { merged_from_organization: true } : {}),
    });
    if (mergedIntoExisting && project?.id && summary && !String(project.description ?? '').trim()) {
      await supabaseAdmin
        .from('projects')
        .update({ description: summary, updated_at: new Date().toISOString() })
        .eq('id', project.id)
        .eq('user_id', userId);
    }
    return {
      target: 'project',
      targetId: project?.id ?? null,
      targetName: project?.name ?? name,
      mergedIntoExisting,
    };
  }

  private async toSkill(
    userId: string,
    name: string,
    summary: string | null,
    provenance: Record<string, unknown>,
  ): Promise<OrganizationReclassifyOutcome> {
    const skills = await skillService.getSkills(userId);
    const key = normalizeNameKey(name);
    const existing = skills.find((s) => normalizeNameKey(s.skill_name) === key);
    if (existing) {
      const nextDescription = existing.description?.trim()
        ? existing.description
        : summary ?? existing.description ?? undefined;
      if (nextDescription && nextDescription !== existing.description) {
        await skillService.updateSkill(userId, existing.id, { description: nextDescription });
      }
      await skillService.updateSkillMetadata(userId, existing.id, {
        ...provenance,
        merged_from_organization: true,
      });
      return {
        target: 'skill',
        targetId: existing.id,
        targetName: existing.skill_name,
        mergedIntoExisting: true,
      };
    }

    const skill = await skillService.createSkill(userId, {
      skill_name: name,
      skill_category: 'other',
      description: summary ?? `Reclassified from group: ${name}`,
      auto_detected: false,
      metadata: { ...provenance },
    });
    return {
      target: 'skill',
      targetId: skill.id ?? null,
      targetName: skill.skill_name ?? name,
      mergedIntoExisting: false,
    };
  }

  private async toEvent(
    userId: string,
    name: string,
    summary: string | null,
    provenance: Record<string, unknown>,
  ): Promise<OrganizationReclassifyOutcome> {
    const eligibility = evaluateLifeLogEligibility({ text: summary ?? name, title: name });
    if (!eligibility.eligible || !isPublishableLifeLogTitle(name)) {
      throw new Error(
        `Could not create a Life Log event: ${eligibility.reason.replace(/^rejected_/, '').replace(/_/g, ' ')}.`,
      );
    }
    const { data: event, error } = await supabaseAdmin
      .from('resolved_events')
      .insert({
        user_id: userId,
        title: name,
        summary: summary ?? name,
        type: eligibility.reason,
        start_time: null,
        confidence: 1.0,
        metadata: {
          ...provenance,
          life_log: {
            publication_status: 'published',
            eligibility_reason: eligibility.reason,
            eligibility_confidence: eligibility.confidence,
            policy_version: 'v2',
          },
        },
      })
      .select('id, title')
      .single();
    if (error) {
      logger.error({ error, userId, name }, 'reclassify organization: resolved_events insert failed');
      throw new Error('Could not create the event in the Events book.');
    }
    return {
      target: 'event',
      targetId: event?.id ?? null,
      targetName: event?.title ?? name,
      mergedIntoExisting: false,
    };
  }

  private async attachProvenance(
    table: 'locations' | 'projects',
    id: string | null,
    userId: string,
    provenance: Record<string, unknown>,
  ): Promise<void> {
    if (!id) return;
    const { data } = await supabaseAdmin
      .from(table)
      .select('metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    const merged = { ...((data?.metadata as Record<string, unknown>) ?? {}), ...provenance };
    const { error } = await supabaseAdmin
      .from(table)
      .update({ metadata: merged, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      logger.warn({ error, table, id }, 'reclassify organization: provenance attach skipped');
    }
  }
}

export const reclassifyOrganizationService = new ReclassifyOrganizationService();
