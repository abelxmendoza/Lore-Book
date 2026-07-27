/**
 * Guarded location reclassification — moves a Places card that landed in the
 * wrong book into the correct entity book (organization, character, project,
 * skill, event). If the target already exists, merges aliases / description
 * onto it and hides the place card.
 */
import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { isJunkTestData } from '../characters/audit/wrongDomainCharacterGuard';
import { characterRegistry } from '../characterRegistry';
import { guardProjectCandidate } from '../lexical/projects/projectTypeGuard';
import { organizationService } from '../organizationService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { skillService } from '../skills/skillService';
import { evaluateLifeLogEligibility, isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';
import { normalizeNameKey } from '../../utils/nameNormalization';

export const LOCATION_RECLASSIFY_TARGETS = [
  'organization',
  'character',
  'project',
  'skill',
  'event',
] as const;
export type LocationReclassifyTarget = (typeof LOCATION_RECLASSIFY_TARGETS)[number];

export type LocationReclassifyValidation = {
  allowed: boolean;
  reason?: string;
  rulesFired?: string[];
};

export type ReclassifyLocationRecord = {
  id: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LocationReclassifyOutcome = {
  target: LocationReclassifyTarget;
  targetId: string | null;
  targetName: string;
  mergedIntoExisting: boolean;
};

export function isLocationReclassifyTarget(value: unknown): value is LocationReclassifyTarget {
  return typeof value === 'string' && (LOCATION_RECLASSIFY_TARGETS as readonly string[]).includes(value);
}

function locationAliases(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!Array.isArray(metadata?.aliases)) return [];
  return (metadata!.aliases as unknown[])
    .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    .map((a) => a.trim());
}

/**
 * Run the target book's admission rules against the candidate name.
 * Pure — no DB access — so it is directly unit-testable.
 */
export function validateLocationReclassification(
  name: string,
  context: string,
  target: LocationReclassifyTarget,
): LocationReclassifyValidation {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length < 2 || trimmed.length > 120) {
    return { allowed: false, reason: 'Name is too short or too long to be a valid entity name.' };
  }
  if (isJunkTestData(trimmed, context)) {
    return { allowed: false, reason: 'This looks like test/placeholder data, not a real entity.' };
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

  // Organizations, characters, skills, and events: user correction wins after
  // the shared junk/length floor. Domain-specific suggestion guards stay out
  // of the way of an explicit "this was filed wrong" move.
  return { allowed: true };
}

class ReclassifyLocationService {
  async performReclassification(
    userId: string,
    location: ReclassifyLocationRecord,
    target: LocationReclassifyTarget,
  ): Promise<LocationReclassifyOutcome> {
    const provenance = {
      reclassified_from: 'location',
      reclassified_from_location_id: location.id,
      reclassified_at: new Date().toISOString(),
    };
    const name = location.name.trim();
    const summary = location.description?.trim() || null;
    const aliases = locationAliases(location.metadata);

    if (target === 'organization') {
      return this.toOrganization(userId, name, summary, aliases, provenance);
    }
    if (target === 'character') {
      return this.toCharacter(userId, name, summary, aliases, provenance);
    }
    if (target === 'project') {
      return this.toProject(userId, name, summary, provenance);
    }
    if (target === 'skill') {
      return this.toSkill(userId, name, summary, provenance);
    }
    return this.toEvent(userId, name, summary, provenance);
  }

  /**
   * Soft-hide the place from the Places book after the target accepted it.
   * Uses migration_status=moved (already filtered by listLocations).
   */
  async archiveSourceLocation(
    userId: string,
    location: ReclassifyLocationRecord,
    outcome: LocationReclassifyOutcome,
  ): Promise<void> {
    const meta = {
      ...((location.metadata ?? {}) as Record<string, unknown>),
      migration_status: 'moved',
      place_book_visible: false,
      reclassified_from: 'location',
      reclassified_to: outcome.target,
      reclassified_at: new Date().toISOString(),
      ...(outcome.targetId ? { reclassified_target_id: outcome.targetId } : {}),
    };
    const { error } = await supabaseAdmin
      .from('locations')
      .update({ metadata: meta, updated_at: new Date().toISOString() })
      .eq('id', location.id)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, locationId: location.id }, 'reclassify location: archive source failed');
      throw new Error('Moved to the target book, but could not hide the place card.');
    }
  }

  private async toOrganization(
    userId: string,
    name: string,
    summary: string | null,
    aliases: string[],
    provenance: Record<string, unknown>,
  ): Promise<LocationReclassifyOutcome> {
    const existing = await organizationService.findByName(userId, name);
    const org = await organizationService.createOrganization(userId, {
      name,
      description: summary ?? `Reclassified from place: ${name}`,
      aliases,
      metadata: { ...provenance },
    });
    const mergedIntoExisting = Boolean(existing);

    if (mergedIntoExisting && org.id) {
      const existingAliases = Array.isArray(org.aliases) ? org.aliases : [];
      const mergedAliases = [...new Set([...existingAliases, ...aliases, name].map((a) => a.trim()).filter(Boolean))];
      const nextDescription =
        org.description?.trim()
          ? org.description
          : summary ?? org.description ?? null;
      const nextMeta = {
        ...((org.metadata as Record<string, unknown> | null) ?? {}),
        ...provenance,
        merged_from_location: true,
      };
      await organizationService.updateOrganization(userId, org.id, {
        aliases: mergedAliases,
        description: nextDescription ?? undefined,
        metadata: nextMeta,
      });
    }

    return {
      target: 'organization',
      targetId: org.id ?? null,
      targetName: org.name ?? name,
      mergedIntoExisting,
    };
  }

  private async toCharacter(
    userId: string,
    name: string,
    summary: string | null,
    aliases: string[],
    provenance: Record<string, unknown>,
  ): Promise<LocationReclassifyOutcome> {
    return characterRegistry.runExclusive(userId, async () => {
      // User is correcting a misfiled place → person; skip known-non-person
      // so the still-present location row does not block the move.
      const decision = await characterRegistry.classifyForCreation(userId, name, {
        sourceEntityType: 'person',
      });

      if (decision.action === 'merge') {
        await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, {
          source: 'location_reclassify',
        });
        await this.enrichCharacter(userId, decision.characterId, summary, aliases, provenance);
        return {
          target: 'character',
          targetId: decision.characterId,
          targetName: decision.matchedName ?? name,
          mergedIntoExisting: true,
        };
      }

      if (decision.action === 'defer') {
        // Explicit user correction: prefer the first candidate over leaving
        // the place card stuck. Fall through to create if somehow empty.
        const first = decision.candidates?.[0];
        if (first?.character_id) {
          await characterRegistry.mergeMention(userId, first.character_id, decision.cleanName, {
            source: 'location_reclassify',
          });
          await this.enrichCharacter(userId, first.character_id, summary, aliases, provenance);
          return {
            target: 'character',
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
          id: randomUUID(),
          user_id: userId,
          name: cleanName,
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || null,
          alias: aliases,
          summary: summary,
          status: 'active',
          has_met: true,
          metadata: { ...provenance, created_via: 'location_reclassify' },
          created_at: now,
          updated_at: now,
        })
        .select('id, name')
        .single();
      if (error || !data) {
        logger.error({ error, name: cleanName }, 'reclassify location: character insert failed');
        throw new Error('Could not create the character in the Characters book.');
      }
      return {
        target: 'character',
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
        merged_from_location: true,
      },
      updated_at: new Date().toISOString(),
    };
    if (!String(data.summary ?? '').trim() && summary) {
      patch.summary = summary;
    }
    await supabaseAdmin.from('characters').update(patch).eq('id', characterId).eq('user_id', userId);
  }

  private async toProject(
    userId: string,
    name: string,
    summary: string | null,
    provenance: Record<string, unknown>,
  ): Promise<LocationReclassifyOutcome> {
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
      ...(mergedIntoExisting ? { merged_from_location: true } : {}),
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
  ): Promise<LocationReclassifyOutcome> {
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
        merged_from_location: true,
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
      description: summary ?? `Reclassified from place: ${name}`,
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
  ): Promise<LocationReclassifyOutcome> {
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
      logger.error({ error, userId, name }, 'reclassify location: resolved_events insert failed');
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
    table: 'projects',
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
      logger.warn({ error, table, id }, 'reclassify location: provenance attach skipped');
    }
  }
}

export const reclassifyLocationService = new ReclassifyLocationService();
