/**
 * Fields streamed on assistant turns that must survive chat_messages persistence.
 */
export type AssistantPersistMetadataInput = {
  sources?: unknown;
  connections?: unknown;
  continuityWarnings?: unknown;
  response_mode?: unknown;
  recall_sources?: unknown;
  mentionedEntities?: unknown;
  characterIds?: unknown;
  creationOutcomes?: unknown;
  creationOutcomeSummary?: unknown;
  staleProjectionHints?: unknown;
  staleProjectionSummary?: unknown;
  tokenUsage?: unknown;
};

export function buildAssistantPersistMetadata(
  input: AssistantPersistMetadataInput
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    sources: input.sources,
    connections: input.connections,
    continuityWarnings: input.continuityWarnings,
    response_mode: input.response_mode,
    recall_sources: input.recall_sources,
    mentionedEntities: input.mentionedEntities,
    characterIds: input.characterIds,
  };

  if (input.creationOutcomes) {
    metadata.creationOutcomes = input.creationOutcomes;
  }
  if (input.creationOutcomeSummary !== undefined && input.creationOutcomeSummary !== null) {
    metadata.creationOutcomeSummary = input.creationOutcomeSummary;
  }
  if (input.staleProjectionHints) {
    metadata.staleProjectionHints = input.staleProjectionHints;
  }
  if (input.staleProjectionSummary !== undefined && input.staleProjectionSummary !== null) {
    metadata.staleProjectionSummary = input.staleProjectionSummary;
  }
  if (input.tokenUsage) {
    metadata.tokenUsage = input.tokenUsage;
  }

  return metadata;
}
