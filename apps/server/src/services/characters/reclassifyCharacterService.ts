/**
 * Guarded character reclassification — moves a record that landed in the
 * Character Book into the correct entity book (organization, location,
 * project, skill, event).
 *
 * Each target domain's own admission rules run BEFORE the move: the same
 * guards its suggestion pipeline uses (place wrong-domain/type guards,
 * project type guard, junk/test-label checks). A rejected move returns the
 * guard's reason instead of silently seeding a wrong-domain record, and the
 * character is only marked `reclassified` after the target book accepted it.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { guardPlaceCandidate } from '../lexical/places/placeTypeGuard';
import { guardPlaceWrongDomain } from '../lexical/places/placeWrongDomainGuard';
import { guardProjectCandidate } from '../lexical/projects/projectTypeGuard';
import { locationSuggestionService } from '../locationSuggestionService';
import { organizationService } from '../organizationService';
import { projectSuggestionService } from '../projects/projectSuggestionService';
import { skillService } from '../skills/skillService';

import { isJunkTestData } from './audit/wrongDomainCharacterGuard';

export const RECLASSIFY_TARGETS = ['organization', 'location', 'project', 'skill', 'event'] as const;
export type ReclassifyTarget = (typeof RECLASSIFY_TARGETS)[number];

export type ReclassifyValidation = {
  allowed: boolean;
  reason?: string;
  rulesFired?: string[];
};

export type ReclassifyCharacterRecord = {
  id: string;
  name: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ReclassifyOutcome = {
  target: ReclassifyTarget;
  targetId: string | null;
  targetName: string;
  mergedIntoExisting: boolean;
};

export function isReclassifyTarget(value: unknown): value is ReclassifyTarget {
  return typeof value === 'string' && (RECLASSIFY_TARGETS as readonly string[]).includes(value);
}

/**
 * Run the target book's admission rules against the candidate name.
 * Pure — no DB access — so it is directly unit-testable.
 */
export function validateReclassification(
  name: string,
  context: string,
  target: ReclassifyTarget,
): ReclassifyValidation {
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

  // Organizations, skills, and events accept any real name; the junk/test and
  // length checks above are their shared floor. The user is explicitly
  // correcting a misclassification, so their judgment on the domain wins.
  return { allowed: true };
}

class ReclassifyCharacterService {
  /**
   * Create the record in the target book through that book's own service
   * (dedupe + canonical naming included). Throws on failure — the caller
   * must not mark the character reclassified if this throws.
   */
  async performReclassification(
    userId: string,
    character: ReclassifyCharacterRecord,
    target: ReclassifyTarget,
  ): Promise<ReclassifyOutcome> {
    const provenance = {
      reclassified_from: 'character',
      reclassified_from_character_id: character.id,
      reclassified_at: new Date().toISOString(),
    };
    const name = character.name.trim();
    const summary = character.summary?.trim() || null;

    if (target === 'organization') {
      const org = await organizationService.createOrganization(userId, {
        name,
        description: summary ?? `Reclassified from character: ${name}`,
        metadata: { ...provenance },
      });
      return {
        target,
        targetId: org.id ?? null,
        targetName: org.name ?? name,
        // createOrganization dedupes by name and returns the existing org
        mergedIntoExisting: (org.metadata as Record<string, unknown> | null)?.reclassified_from_character_id !== character.id,
      };
    }

    if (target === 'location') {
      try {
        const created = await locationSuggestionService.acceptSuggestion(userId, {
          name,
          context: 'Reclassified from Character Book',
          description: summary ?? undefined,
        });
        await this.attachProvenance('locations', created.id, userId, provenance);
        return { target, targetId: created.id, targetName: created.name, mergedIntoExisting: false };
      } catch (error) {
        // acceptSuggestion throws when a similar place already exists — that
        // still means the entity lives in the right book now.
        if (error instanceof Error && /already exist/i.test(error.message)) {
          return { target, targetId: null, targetName: name, mergedIntoExisting: true };
        }
        throw error;
      }
    }

    if (target === 'project') {
      const project = await projectSuggestionService.materializeProject(userId, {
        name,
        description: summary,
      });
      await this.attachProvenance('projects', project?.id ?? null, userId, provenance);
      return {
        target,
        targetId: project?.id ?? null,
        targetName: project?.name ?? name,
        mergedIntoExisting: false,
      };
    }

    if (target === 'skill') {
      const skill = await skillService.createSkill(userId, {
        skill_name: name,
        skill_category: 'other',
        description: summary ?? `Reclassified from character: ${name}`,
        auto_detected: false,
        metadata: { ...provenance },
      });
      return { target, targetId: skill.id ?? null, targetName: name, mergedIntoExisting: false };
    }

    // target === 'event' — the Events book (/api/conversation/events) reads
    // `resolved_events`. `event_candidates` is a continuity-pattern table and
    // `events` does not exist in the live schema.
    const { data: event, error } = await supabaseAdmin
      .from('resolved_events')
      .insert({
        user_id: userId,
        title: name,
        summary: summary ?? `Reclassified from character: ${name}`,
        type: 'reclassified',
        start_time: new Date().toISOString(),
        confidence: 1.0,
        metadata: { ...provenance },
      })
      .select('id, title')
      .single();
    if (error) {
      logger.error({ error, userId, name }, 'reclassify: resolved_events insert failed');
      throw new Error('Could not create the event in the Events book.');
    }
    return { target, targetId: event?.id ?? null, targetName: event?.title ?? name, mergedIntoExisting: false };
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
      logger.warn({ error, table, id }, 'reclassify: provenance attach skipped');
    }
  }
}

export const reclassifyCharacterService = new ReclassifyCharacterService();
