/**
 * Entity learning service.
 *
 * Converts user CRUD/correction operations into reusable lessons stored in the
 * identity ledger, then exposes lightweight context for future extraction,
 * duplicate detection, and suggestion suppression.
 */

import { identityLedgerService, type IdentityMutationRow } from './identity/identityLedgerService';
import {
  normalizeSuggestionDismissalName,
  type RecordDismissalResult,
  type SuggestionDismissalDomain,
} from './suggestionDismissalService';
import { normalizeNameKey } from '../utils/nameNormalization';

export type LearningEntityDomain =
  | 'characters'
  | 'locations'
  | 'organizations'
  | 'projects'
  | 'skills'
  | 'events'
  | 'quests';

export type EntityLearningLessonType =
  | 'alias_equivalence'
  | 'canonical_name_preference'
  | 'duplicate_pattern'
  | 'false_positive'
  | 'suppression_rule'
  | 'entity_deleted'
  | 'domain_reclassification';

export type EntityLearningLesson = {
  lessonType: EntityLearningLessonType;
  domain: LearningEntityDomain | SuggestionDismissalDomain;
  phrase?: string;
  normalizedPhrase?: string;
  canonicalEntityId?: string;
  canonicalName?: string;
  alias?: string;
  strength?: number;
  reason?: string;
};

export type UserLearningContext = {
  aliasesByDomain: Map<string, { domain: string; canonicalEntityId: string; canonicalName?: string; aliases: string[] }>;
  suppressedByDomain: Map<string, { strength: number; reason?: string }>;
};

const DOMAIN_ENTITY_TYPE: Record<string, string> = {
  characters: 'character',
  locations: 'location',
  organizations: 'organization',
  projects: 'project',
  skills: 'skill',
  events: 'event',
  quests: 'quest',
};

function domainEntityType(domain: string): string {
  return DOMAIN_ENTITY_TYPE[domain] ?? domain.replace(/s$/, '');
}

function aliasContextKey(domain: string, alias: string): string {
  return `${domain}:${normalizeNameKey(alias)}`;
}

function suppressionContextKey(domain: string, normalizedName: string): string {
  return `${domain}:${normalizedName}`;
}

function uniqueAliases(aliases: string[], canonicalName?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const canonicalKey = canonicalName ? normalizeNameKey(canonicalName) : '';
  for (const alias of aliases) {
    const label = alias.trim();
    const key = normalizeNameKey(label);
    if (!label || key === canonicalKey || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function buildMergeLearningLessons(input: {
  domain: LearningEntityDomain;
  sourceId: string;
  sourceName: string;
  sourceAliases?: string[];
  targetId: string;
  targetName?: string;
  canonicalName: string;
  aliases: string[];
  reason?: string;
}): EntityLearningLesson[] {
  const aliases = uniqueAliases([
    input.sourceName,
    ...(input.sourceAliases ?? []),
    ...input.aliases,
  ], input.canonicalName);

  return [
    ...aliases.map((alias) => ({
      lessonType: 'alias_equivalence' as const,
      domain: input.domain,
      phrase: alias,
      normalizedPhrase: normalizeNameKey(alias),
      canonicalEntityId: input.targetId,
      canonicalName: input.canonicalName,
      alias,
      reason: input.reason,
    })),
    {
      lessonType: 'canonical_name_preference',
      domain: input.domain,
      phrase: input.sourceName,
      normalizedPhrase: normalizeNameKey(input.sourceName),
      canonicalEntityId: input.targetId,
      canonicalName: input.canonicalName,
      reason: input.reason,
    },
    {
      lessonType: 'duplicate_pattern',
      domain: input.domain,
      phrase: input.sourceName,
      normalizedPhrase: normalizeNameKey(input.sourceName),
      canonicalEntityId: input.targetId,
      canonicalName: input.canonicalName,
      reason: input.reason,
    },
  ];
}

class EntityLearningService {
  async recordMergeLearning(input: {
    userId: string;
    domain: LearningEntityDomain;
    sourceId: string;
    sourceName: string;
    sourceAliases?: string[];
    targetId: string;
    targetName?: string;
    canonicalName: string;
    aliases: string[];
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const lessons = buildMergeLearningLessons(input);
    await identityLedgerService.recordMutation({
      userId: input.userId,
      entityId: input.targetId,
      entityType: domainEntityType(input.domain),
      mutationType: 'ALIAS_ADDED',
      previousValue: {
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        sourceAliases: input.sourceAliases ?? [],
      },
      newValue: {
        targetId: input.targetId,
        canonicalName: input.canonicalName,
        aliases: input.aliases,
      },
      reason: input.reason ?? `Learned merge aliases for "${input.canonicalName}"`,
      source: 'USER',
      metadata: {
        learning_event: true,
        operation_type: 'merge',
        lessons,
        ...input.metadata,
      },
    });
  }

  async recordSuggestionDismissalLearning(input: {
    userId: string;
    domain: SuggestionDismissalDomain;
    name: string;
    result: RecordDismissalResult | null;
    sourceSuggestionId?: string | null;
    sourceMessageId?: string | null;
  }): Promise<void> {
    const normalizedName =
      input.result?.normalizedName ||
      normalizeSuggestionDismissalName(input.domain, input.name);
    if (!normalizedName) return;
    const strength = input.result?.dismissCount ?? 1;
    const lessons: EntityLearningLesson[] = [
      {
        lessonType: input.result?.isPermanent ? 'suppression_rule' : 'false_positive',
        domain: input.domain,
        phrase: input.name,
        normalizedPhrase: normalizedName,
        strength,
        reason: input.result?.isPermanent ? 'permanent_suggestion_suppression' : 'user_dismissed_suggestion',
      },
    ];

    await identityLedgerService.recordMutation({
      userId: input.userId,
      entityId: `suggestion:${input.domain}:${normalizedName}`,
      entityType: domainEntityType(input.domain),
      mutationType: 'CONFIDENCE_CHANGED',
      previousValue: { visible: true },
      newValue: {
        visible: !input.result?.isPermanent,
        dismissCount: input.result?.dismissCount ?? 1,
        isPermanent: input.result?.isPermanent ?? false,
      },
      reason: `Dismissed ${input.domain} suggestion "${input.name}"`,
      source: 'USER',
      metadata: {
        learning_event: true,
        operation_type: 'dismiss',
        sourceSuggestionId: input.sourceSuggestionId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        lessons,
      },
    });
  }

  async recordDeletionLearning(input: {
    userId: string;
    domain: LearningEntityDomain;
    entityId: string;
    name: string;
    aliases?: string[];
    reason?: string;
  }): Promise<void> {
    const lessons: EntityLearningLesson[] = [
      {
        lessonType: 'entity_deleted',
        domain: input.domain,
        phrase: input.name,
        normalizedPhrase: normalizeNameKey(input.name),
        strength: 1,
        reason: input.reason ?? 'user_deleted_entity',
      },
      ...uniqueAliases(input.aliases ?? [], input.name).map((alias) => ({
        lessonType: 'entity_deleted' as const,
        domain: input.domain,
        phrase: alias,
        normalizedPhrase: normalizeNameKey(alias),
        strength: 1,
        reason: input.reason ?? 'user_deleted_entity_alias',
      })),
    ];

    await identityLedgerService.recordMutation({
      userId: input.userId,
      entityId: input.entityId,
      entityType: domainEntityType(input.domain),
      mutationType: 'ENTITY_ARCHIVED',
      previousValue: { id: input.entityId, name: input.name, aliases: input.aliases ?? [] },
      newValue: { deleted: true },
      reason: input.reason ?? `Deleted "${input.name}"`,
      source: 'USER',
      metadata: {
        learning_event: true,
        operation_type: 'delete',
        lessons,
      },
    });
  }

  async getUserLearningContext(userId: string, opts: { limit?: number } = {}): Promise<UserLearningContext> {
    const rows = await identityLedgerService.getRecentMutations(userId, {
      limit: opts.limit ?? 500,
    });
    return buildUserLearningContext(rows);
  }

  async resolveAlias(
    userId: string,
    domain: LearningEntityDomain,
    phrase: string,
  ): Promise<{ canonicalEntityId: string; canonicalName?: string; aliases: string[] } | null> {
    const ctx = await this.getUserLearningContext(userId);
    return ctx.aliasesByDomain.get(aliasContextKey(domain, phrase)) ?? null;
  }
}

export function buildUserLearningContext(rows: IdentityMutationRow[]): UserLearningContext {
  const aliasesByDomain = new Map<string, { domain: string; canonicalEntityId: string; canonicalName?: string; aliases: string[] }>();
  const suppressedByDomain = new Map<string, { strength: number; reason?: string }>();

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const lessons = Array.isArray(metadata.lessons) ? metadata.lessons as EntityLearningLesson[] : [];
    for (const lesson of lessons) {
      if (lesson.lessonType === 'alias_equivalence' && lesson.alias && lesson.canonicalEntityId) {
        aliasesByDomain.set(aliasContextKey(String(lesson.domain), lesson.alias), {
          domain: String(lesson.domain),
          canonicalEntityId: lesson.canonicalEntityId,
          canonicalName: lesson.canonicalName,
          aliases: [lesson.alias],
        });
      }
      if (
        (lesson.lessonType === 'false_positive' || lesson.lessonType === 'suppression_rule' || lesson.lessonType === 'entity_deleted') &&
        lesson.normalizedPhrase
      ) {
        suppressedByDomain.set(suppressionContextKey(String(lesson.domain), lesson.normalizedPhrase), {
          strength: lesson.strength ?? 1,
          reason: lesson.reason,
        });
      }
    }
  }

  return { aliasesByDomain, suppressedByDomain };
}

export const entityLearningService = new EntityLearningService();
