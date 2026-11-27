import { z } from 'zod';

/** Canonical backing record kinds LoreBook can cite. */
export const LORE_SOURCE_KINDS = [
  'chat_message',
  'chat_thread',
  'utterance',
  'episode',
  'journal_entry',
  'resolved_event',
  'timeline_event',
  'user_file',
  'photo',
  'character_media',
  'x_post',
  'calendar',
  'manual',
  'external_conversation',
  'external_conversation_message',
] as const;

export const LORE_INTAKE_CHANNELS = [
  'chat',
  'document_upload',
  'photo',
  'screenshot',
  'journal',
  'calendar',
  'manual',
  'integration',
  'external_conversation',
  'unknown',
] as const;

export const LORE_ENTITY_REF_KINDS = [
  'character',
  'location',
  'organization',
  'project',
  'event',
  'relationship',
] as const;

export const loreSourceKindSchema = z.enum(LORE_SOURCE_KINDS);
export const loreIntakeChannelSchema = z.enum(LORE_INTAKE_CHANNELS);
export const loreEntityRefKindSchema = z.enum(LORE_ENTITY_REF_KINDS);

export type LoreSourceKind = z.infer<typeof loreSourceKindSchema>;
export type LoreIntakeChannel = z.infer<typeof loreIntakeChannelSchema>;
export type LoreEntityRefKind = z.infer<typeof loreEntityRefKindSchema>;

export type LoreEntityRef = {
  kind: LoreEntityRefKind;
  id: string;
  name?: string;
};

export type LoreSourceRef = {
  kind: LoreSourceKind;
  id: string;
  label?: string;
  quote?: string;
  intakeChannel?: LoreIntakeChannel;
  route?: string;
};

export const loreEntityRefSchema = z.object({
  kind: loreEntityRefKindSchema,
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200).optional(),
});

export const loreSourceRefSchema = z.object({
  kind: loreSourceKindSchema,
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(240).optional(),
  quote: z.string().trim().min(1).max(2000).optional(),
  intakeChannel: loreIntakeChannelSchema.optional(),
  route: z.string().trim().min(1).max(240).optional(),
});

const CHAT_SOURCE_TYPES = new Set([
  'chat',
  'conversation',
  'message',
  'thread',
  'chat_attachment',
  'life_chronicle',
]);

const DOCUMENT_SOURCE_TYPES = new Set([
  'document',
  'document_upload',
  'file',
  'file_upload',
  'import',
  'resume',
  'upload',
]);

const PHOTO_SOURCE_TYPES = new Set([
  'photo',
  'image',
  'screenshot',
  'chat_attachment',
  'character_media',
  'album',
]);

const CALENDAR_SOURCE_TYPES = new Set(['calendar', 'google_calendar', 'ical']);
const EXTERNAL_CONVERSATION_SOURCE_TYPES = new Set([
  'external_conversation',
  'imported_conversation',
  'chatgpt',
  'chatgpt_export',
  'claude_export',
]);

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function intakeChannelFromSourceType(sourceType?: string | null): LoreIntakeChannel {
  const token = normalizeToken(sourceType);
  if (!token) return 'unknown';
  if (EXTERNAL_CONVERSATION_SOURCE_TYPES.has(token)) return 'external_conversation';
  if (CHAT_SOURCE_TYPES.has(token)) return token === 'chat_attachment' ? 'screenshot' : 'chat';
  if (DOCUMENT_SOURCE_TYPES.has(token)) return 'document_upload';
  if (PHOTO_SOURCE_TYPES.has(token)) return token === 'chat_attachment' || token === 'character_media' ? 'screenshot' : 'photo';
  if (CALENDAR_SOURCE_TYPES.has(token)) return 'calendar';
  if (token === 'manual' || token === 'user') return 'manual';
  if (token === 'journal' || token === 'journal_entry' || token === 'life_log') return 'journal';
  if (token.startsWith('x_') || token === 'twitter') return 'integration';
  return 'unknown';
}

function pushUniqueSource(sources: LoreSourceRef[], next: LoreSourceRef | null | undefined): void {
  if (!next?.id) return;
  if (sources.some((source) => source.kind === next.kind && source.id === next.id)) return;
  sources.push(next);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry)))];
}

export function extractLoreSourcesFromMetadata(
  metadata?: Record<string, unknown> | null,
  options?: {
    sourceType?: string | null;
    sourceKind?: string | null;
    sourceId?: string | null;
  },
): LoreSourceRef[] {
  const meta = metadata ?? {};
  const intakeChannel = intakeChannelFromSourceType(options?.sourceType);
  const sources: LoreSourceRef[] = [];

  for (const messageId of asStringArray(meta.source_message_ids)) {
    pushUniqueSource(sources, {
      kind: 'chat_message',
      id: messageId,
      intakeChannel: 'chat',
      label: 'Chat message',
    });
  }

  const messageId = asString(meta.source_message_id);
  if (messageId) {
    pushUniqueSource(sources, {
      kind: 'chat_message',
      id: messageId,
      intakeChannel: 'chat',
      label: 'Chat message',
    });
  }

  const threadId = asString(meta.source_thread_id) ?? asString(meta.thread_id) ?? asString(meta.sessionId);
  if (threadId) {
    pushUniqueSource(sources, {
      kind: 'chat_thread',
      id: threadId,
      intakeChannel: intakeChannel === 'screenshot' ? 'screenshot' : 'chat',
      label: intakeChannel === 'screenshot' ? 'Chat thread (attachment)' : 'Chat thread',
    });
  }

  for (const fileId of [asString(meta.source_file_id), asString(meta.user_file_id)]) {
    if (!fileId) continue;
    pushUniqueSource(sources, {
      kind: 'user_file',
      id: fileId,
      intakeChannel: 'document_upload',
      label: asString(meta.source_filename) ?? 'Uploaded document',
    });
  }

  for (const photoId of [asString(meta.photoId), asString(meta.photo_id)]) {
    if (!photoId) continue;
    pushUniqueSource(sources, {
      kind: 'photo',
      id: photoId,
      intakeChannel: PHOTO_SOURCE_TYPES.has(normalizeToken(asString(meta.albumSource) ?? options?.sourceType))
        ? 'screenshot'
        : 'photo',
      label: asString(meta.photoFilename) ?? 'Photo',
    });
  }

  const episodeId = asString(meta.episode_id) ?? asString(meta.episodeId);
  if (episodeId) {
    pushUniqueSource(sources, {
      kind: 'episode',
      id: episodeId,
      intakeChannel: 'chat',
      label: 'Conversation episode',
    });
  }

  const utteranceId = asString(meta.utterance_id) ?? asString(meta.utteranceId);
  if (utteranceId) {
    pushUniqueSource(sources, {
      kind: 'utterance',
      id: utteranceId,
      intakeChannel: 'chat',
      label: 'Message span',
    });
  }

  const externalConversationId =
    asString(meta.external_conversation_id)
    ?? asString(meta.source_conversation_id)
    ?? asString(meta.import_conversation_id);
  if (externalConversationId) {
    pushUniqueSource(sources, {
      kind: 'external_conversation',
      id: externalConversationId,
      intakeChannel: 'external_conversation',
      label: asString(meta.external_provider)
        ? `Imported ${asString(meta.external_provider)} conversation`
        : 'Imported conversation',
    });
  }

  for (const externalMessageId of asStringArray(meta.external_message_ids)) {
    pushUniqueSource(sources, {
      kind: 'external_conversation_message',
      id: externalMessageId,
      intakeChannel: 'external_conversation',
      label: 'Imported message',
    });
  }

  const externalMessageId = asString(meta.external_message_id) ?? asString(meta.import_message_id);
  if (externalMessageId) {
    pushUniqueSource(sources, {
      kind: 'external_conversation_message',
      id: externalMessageId,
      intakeChannel: 'external_conversation',
      label: 'Imported message',
    });
  }

  const canonicalKind = options?.sourceKind?.trim();
  const canonicalId = options?.sourceId?.trim();
  if (canonicalKind === 'journal_entry' && canonicalId) {
    pushUniqueSource(sources, {
      kind: 'journal_entry',
      id: canonicalId,
      intakeChannel,
      label: 'Life log moment',
    });
  } else if (canonicalKind === 'resolved_event' && canonicalId) {
    pushUniqueSource(sources, {
      kind: 'resolved_event',
      id: canonicalId,
      intakeChannel,
      label: 'Timeline event',
    });
  } else if (canonicalKind === 'timeline_event' && canonicalId) {
    pushUniqueSource(sources, {
      kind: 'timeline_event',
      id: canonicalId,
      intakeChannel,
      label: 'Timeline event',
    });
  }

  return sources;
}

export function extractLoreEntityRefsFromMetadata(metadata?: Record<string, unknown> | null): LoreEntityRef[] {
  const meta = metadata ?? {};
  const entities: LoreEntityRef[] = [];

  for (const id of asStringArray(meta.peopleIds ?? meta.people_ids ?? meta.people)) {
    entities.push({ kind: 'character', id });
  }
  for (const id of asStringArray(meta.locationIds ?? meta.location_ids ?? meta.locations)) {
    entities.push({ kind: 'location', id });
  }
  for (const id of asStringArray(meta.organizationIds ?? meta.organization_ids ?? meta.organizations)) {
    entities.push({ kind: 'organization', id });
  }
  for (const id of asStringArray(meta.projectIds ?? meta.project_ids ?? meta.projects)) {
    entities.push({ kind: 'project', id });
  }
  for (const id of asStringArray(meta.relationshipIds ?? meta.relationship_ids)) {
    entities.push({ kind: 'relationship', id });
  }
  for (const id of asStringArray(meta.eventIds ?? meta.event_ids)) {
    entities.push({ kind: 'event', id });
  }

  return entities;
}
