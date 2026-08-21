/**
 * entity_timeline_events is historical compatibility / diagnostics only.
 *
 * It must never manufacture occurrence, ordering, organization participation,
 * location presence, relationship state, or canonical event identity.
 *
 * New rows are not written. Existing rows remain readable for compatibility
 * trays until a later migration drops the table.
 */

export const ENTITY_TIMELINE_COMPATIBILITY = {
  table: 'entity_timeline_events',
  writesEnabled: false,
  role: 'historical_compatibility_diagnostics',
  usage: 'compatibility_only',
  dateAuthority: 'not_occurrence',
  userLabel: 'Legacy record — date not verified',
  stopWriteReason:
    'Canonical Location/Organization Timeline and Working Memory no longer treat entity_timeline_events as chronology. New writes would only pollute compatibility trays.',
} as const;

export type EntityTimelineCreationPath = 'resolved_event' | 'episode' | 'thread' | 'unknown';

export type EntityTimelineCanonicalAssociation =
  | 'accepted_on_this_timeline'
  | 'not_on_this_timeline'
  | 'not_an_event_association';

export type EntityTimelineCompatibilityReviewItem = {
  id: string;
  entityId: string;
  reason: 'contaminated_primary_entity' | 'legacy_unmatched';
  title: string;
  eventId: string | null;
  sourceEpisodeId: string | null;
  sourceThreadId: string | null;
  creationPath: EntityTimelineCreationPath;
  canonicalMatch: false;
  canonicalAssociation: EntityTimelineCanonicalAssociation;
  hasLegacyDate: boolean;
  hasLegacyCreatedAt: boolean;
  dateVerified: false;
  label: typeof ENTITY_TIMELINE_COMPATIBILITY.userLabel;
  archiveCandidate: true;
  usage: typeof ENTITY_TIMELINE_COMPATIBILITY.usage;
};

export type LegacyEntityTimelineDiagnosticRow = {
  id: string;
  event_id?: string | null;
  source_episode_id?: string | null;
  source_thread_id?: string | null;
  event_title?: string | null;
  event_date?: string | null;
  created_at?: string | null;
};

export function describeLegacyEntityTimelineRow(input: {
  entityId: string;
  row: LegacyEntityTimelineDiagnosticRow;
}): EntityTimelineCompatibilityReviewItem {
  const eventId = input.row.event_id ?? null;
  const sourceEpisodeId = input.row.source_episode_id ?? null;
  const sourceThreadId = input.row.source_thread_id ?? null;
  const creationPath: EntityTimelineCreationPath = eventId
    ? 'resolved_event'
    : sourceEpisodeId
      ? 'episode'
      : sourceThreadId
        ? 'thread'
        : 'unknown';
  const conversationArtifact = !eventId && Boolean(sourceEpisodeId || sourceThreadId);
  return {
    id: input.row.id,
    entityId: input.entityId,
    reason: conversationArtifact ? 'contaminated_primary_entity' : 'legacy_unmatched',
    title:
      input.row.event_title
      || (conversationArtifact ? 'Conversation' : 'Untitled Event'),
    eventId,
    sourceEpisodeId,
    sourceThreadId,
    creationPath,
    canonicalMatch: false,
    canonicalAssociation: eventId ? 'not_on_this_timeline' : 'not_an_event_association',
    hasLegacyDate: Boolean(input.row.event_date),
    hasLegacyCreatedAt: Boolean(input.row.created_at),
    dateVerified: false,
    label: ENTITY_TIMELINE_COMPATIBILITY.userLabel,
    archiveCandidate: true,
    usage: ENTITY_TIMELINE_COMPATIBILITY.usage,
  };
}

export type EntityTimelineRebuildResult = {
  rebuilt: false;
  deprecated: true;
  writesEnabled: false;
  reason: string;
};

export function skippedEntityTimelineRebuild(): EntityTimelineRebuildResult {
  return {
    rebuilt: false,
    deprecated: true,
    writesEnabled: false,
    reason: ENTITY_TIMELINE_COMPATIBILITY.stopWriteReason,
  };
}
