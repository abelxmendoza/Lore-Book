/** The resolved shape of a mode-routed turn — enough to replay it on "try again". */
export type ResolvedTurnState = {
  mode: string;
  scopeIntent?: string;
  scopeSource?: string;
  entities?: Array<{ id?: string; name: string }>;
  threadId?: string;
  responseMode?: string;
  /** The original user message text, capped — needed to re-drive the handler on retry. */
  originalMessageText: string;
};

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
  resolvedTurnState?: ResolvedTurnState;
  /** Occasional themed "Noted." lead-in on a normal assistant reply. */
  notedLeadIn?: boolean;
  /** Chat-driven group/organization write outcome — drives the client's success toast. */
  organizationId?: unknown;
  organizationName?: unknown;
  groupCreated?: unknown;
  groupRenamed?: unknown;
  groupWriteMembers?: unknown;
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
  if (input.resolvedTurnState) {
    metadata.resolvedTurnState = input.resolvedTurnState;
  }
  if (input.notedLeadIn) {
    metadata.notedLeadIn = true;
  }
  if (input.groupCreated || input.groupRenamed) {
    metadata.organizationId = input.organizationId;
    metadata.organizationName = input.organizationName;
    metadata.groupCreated = input.groupCreated;
    metadata.groupRenamed = input.groupRenamed;
    metadata.groupWriteMembers = input.groupWriteMembers;
  }

  return metadata;
}
