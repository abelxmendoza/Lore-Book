import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function recompileBeliefRecord(record: BeliefQueueAuditRecord): {
  claimText: string;
  metadataPatch: Record<string, unknown>;
} {
  const rendered = record.compiledProposition?.renderedText || record.originalText;
  return {
    claimText: rendered,
    metadataPatch: {
      normalized_summary: rendered,
      belief_cognition_migration: {
        decision: record.migrationDecision,
        speech_act: record.speechAct,
        domain: record.proposedDomain,
        durability: record.proposedDurability,
        routing_target: record.routingTarget,
        repaired_subject: record.repairedSubject,
        removed_story_group_subject: record.removedStoryGroupSubject,
      },
      proposed_mutation: record.proposedMutation?.reason,
    },
  };
}
