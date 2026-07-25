/**
 * Collects P1 creation-protocol decisions for chat turn metadata.
 * Read-only: calls classifyForCreation without inserting characters.
 */
import {
  characterRegistry,
  type CreationDecision,
} from './characterRegistry';
import {
  arbitrateDomainStrong,
  arbitrateDomainWeak,
  hasPersonNameShape,
  type ArbitrationDomain,
} from './characters/audit/characterIdentityGate';
import {
  getEntityResolutionCoreMode,
} from './entities/entityResolutionConfig';
import type { ResolutionContext } from './entities/entityResolutionCore';
import { entityAmbiguityService } from './entityAmbiguityService';
import { extractExplicitSelfStageName } from './selfCharacterService';

export type CreationOutcome = {
  mention: string;
  action: CreationDecision['action'] | 'route';
  entityId?: string;
  entityName?: string;
  entityType?: 'character' | 'self_alias' | ArbitrationDomain;
  persistence?: 'candidate' | 'confirmed';
  reason?: string;
  candidates?: Array<{ character_id: string; name: string; subtitle?: string }>;
  /** Which resolver was authoritative for this outcome. */
  authority: 'core' | 'legacy' | 'shadow';
};

function decisionToOutcome(
  mention: string,
  decision: CreationDecision,
  authority: CreationOutcome['authority']
): CreationOutcome {
  if (decision.action === 'reject') {
    return {
      mention,
      action: 'reject',
      reason: decision.reason,
      entityType: 'character',
      persistence: 'candidate',
      authority,
    };
  }
  if (decision.action === 'merge') {
    return {
      mention,
      action: 'merge',
      entityId: decision.characterId,
      entityName: decision.matchedName,
      entityType: 'character',
      persistence: decision.characterId ? 'confirmed' : 'candidate',
      authority,
    };
  }
  if (decision.action === 'defer') {
    return {
      mention,
      action: 'defer',
      candidates: decision.candidates,
      entityType: 'character',
      persistence: 'candidate',
      authority,
    };
  }
  return {
    mention,
    action: 'create',
    entityType: 'character',
    persistence: 'candidate',
    authority,
  };
}

function authorityLabel(): CreationOutcome['authority'] {
  const mode = getEntityResolutionCoreMode();
  if (mode === 'on') return 'core';
  if (mode === 'shadow') return 'shadow';
  return 'legacy';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyCreationMentionDomain(
  mention: string,
  message: string,
): CreationOutcome['entityType'] | null {
  const explicitStageName = extractExplicitSelfStageName(message);
  if (
    explicitStageName &&
    explicitStageName.localeCompare(mention, undefined, { sensitivity: 'accent' }) === 0
  ) {
    return 'self_alias';
  }

  const escaped = escapeRegExp(mention);
  const musicTitle = new RegExp(
    `\\b(?:songs?|tracks?)\\b[^.!?\\n]{0,120}\\b(?:called|named|titled)\\b[^.!?\\n]{0,220}${escaped}`,
    'i',
  );
  if (musicTitle.test(message)) return 'media';

  const explicitEvent = new RegExp(
    `${escaped}\\b[^.!?\\n]{0,90}\\b(?:is|was|will be|coming up)\\b[^.!?\\n]{0,90}\\b(?:show|event|festival|concert|expo|rave|gala)\\b`,
    'i',
  );
  if (explicitEvent.test(message)) return 'event';

  const strong = arbitrateDomainStrong(mention, message);
  if (strong.domain) return strong.domain;
  if (hasPersonNameShape(mention)) return null;
  return arbitrateDomainWeak(mention, message).domain;
}

/**
 * Run the creation protocol for capitalized name mentions in a message.
 * Deduplicates mentions; skips when the mention already resolves in the books.
 */
export async function collectCreationOutcomesForMessage(
  userId: string,
  message: string,
  options?: {
    context?: ResolutionContext;
    threadEntityIds?: string[];
  }
): Promise<CreationOutcome[]> {
  const mentions = entityAmbiguityService.extractEntityMentions(message);
  if (mentions.length === 0) return [];

  const context: ResolutionContext = {
    ...options?.context,
    threadEntityIds: options?.threadEntityIds ?? options?.context?.threadEntityIds,
  };

  const seen = new Set<string>();
  const outcomes: CreationOutcome[] = [];
  const authority = authorityLabel();

  for (const mention of mentions) {
    const key = mention.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const routedDomain = classifyCreationMentionDomain(mention.text, message);
    if (routedDomain) {
      outcomes.push({
        mention: mention.text,
        action: 'route',
        entityType: routedDomain,
        persistence: 'candidate',
        reason:
          routedDomain === 'self_alias'
            ? 'explicit_self_stage_name'
            : `wrong_domain_${routedDomain}`,
        authority,
      });
      continue;
    }

    const decision = await characterRegistry.classifyForCreation(userId, mention.text, { context });
    outcomes.push(decisionToOutcome(mention.text, decision, authority));
  }

  return outcomes.filter(o => o.action !== 'reject' || o.reason !== 'core_skip');
}

export function summarizeCreationOutcomes(outcomes: CreationOutcome[]): string | null {
  if (outcomes.length === 0) return null;

  const parts: string[] = [];
  for (const o of outcomes) {
    if (o.action === 'create') {
      parts.push(`person candidate ${o.mention} awaits ingestion confirmation`);
    } else if (o.action === 'merge' && o.entityName) {
      // Creation protocol "merge" means mention resolution, not a persisted
      // identity merge. Keep user-facing mutation semantics unambiguous.
      parts.push(`resolved ${o.mention} as existing ${o.entityName}`);
    } else if (o.action === 'defer') {
      parts.push(`needs clarification on ${o.mention}`);
    } else if (o.action === 'route') {
      if (o.entityType === 'self_alias') {
        parts.push(`recognized ${o.mention} as your stage name`);
      } else {
        parts.push(`routed ${o.mention} to ${o.entityType ?? 'non-person'} detection`);
      }
    }
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
