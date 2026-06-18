/**
 * Collects P1 creation-protocol decisions for chat turn metadata.
 * Read-only: calls classifyForCreation without inserting characters.
 */
import { entityAmbiguityService } from './entityAmbiguityService';
import {
  characterRegistry,
  type CreationDecision,
} from './characterRegistry';
import {
  getEntityResolutionCoreMode,
} from './entities/entityResolutionConfig';
import type { ResolutionContext } from './entities/entityResolutionCore';

export type CreationOutcome = {
  mention: string;
  action: CreationDecision['action'];
  entityId?: string;
  entityName?: string;
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
    return { mention, action: 'reject', reason: decision.reason, authority };
  }
  if (decision.action === 'merge') {
    return {
      mention,
      action: 'merge',
      entityId: decision.characterId,
      entityName: decision.matchedName,
      authority,
    };
  }
  if (decision.action === 'defer') {
    return {
      mention,
      action: 'defer',
      candidates: decision.candidates,
      authority,
    };
  }
  return { mention, action: 'create', authority };
}

function authorityLabel(): CreationOutcome['authority'] {
  const mode = getEntityResolutionCoreMode();
  if (mode === 'on') return 'core';
  if (mode === 'shadow') return 'shadow';
  return 'legacy';
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
      parts.push(`started a record for ${o.mention}`);
    } else if (o.action === 'merge' && o.entityName) {
      parts.push(`linked ${o.mention} to existing ${o.entityName}`);
    } else if (o.action === 'defer') {
      parts.push(`needs clarification on ${o.mention}`);
    }
  }
  return parts.length > 0 ? parts.join('; ') : null;
}
