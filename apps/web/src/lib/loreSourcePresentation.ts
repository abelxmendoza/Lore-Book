import type { LoreEntityRef, LoreIntakeChannel, LoreSourceKind, LoreSourceRef } from '../lib/api-contracts';

export const INTAKE_CHANNEL_LABELS: Record<LoreIntakeChannel, string> = {
  chat: 'Chat',
  document_upload: 'Document',
  photo: 'Photo',
  screenshot: 'Screenshot',
  journal: 'Life log',
  calendar: 'Calendar',
  manual: 'Manual entry',
  integration: 'Integration',
  unknown: 'Source',
};

export const SOURCE_KIND_LABELS: Record<LoreSourceKind, string> = {
  chat_message: 'Chat message',
  chat_thread: 'Chat thread',
  utterance: 'Message span',
  episode: 'Conversation episode',
  journal_entry: 'Life log moment',
  resolved_event: 'Timeline event',
  timeline_event: 'Timeline event',
  user_file: 'Uploaded file',
  photo: 'Photo',
  character_media: 'Character media',
  x_post: 'Post',
  calendar: 'Calendar event',
  manual: 'Manual entry',
};

export function loreSourceRoute(source: LoreSourceRef): string | null {
  if (source.route) return source.route;
  switch (source.kind) {
    case 'chat_message':
    case 'chat_thread':
    case 'utterance':
    case 'episode':
      return '/chat';
    case 'journal_entry':
      return '/timeline';
    case 'resolved_event':
    case 'timeline_event':
      return '/timeline';
    case 'user_file':
      return '/documents';
    case 'photo':
    case 'character_media':
      return '/photos';
    default:
      return null;
  }
}

export function loreEntityRoute(entity: LoreEntityRef): string | null {
  switch (entity.kind) {
    case 'character':
      return '/characters';
    case 'location':
      return '/locations';
    case 'organization':
      return '/organizations';
    case 'project':
      return '/projects';
    case 'event':
      return '/events';
    case 'relationship':
      return '/love';
    default:
      return null;
  }
}

export function formatLoreSourceSummary(source: LoreSourceRef): string {
  return source.label ?? SOURCE_KIND_LABELS[source.kind] ?? source.kind;
}

export function formatIntakeChannelLabel(channel?: LoreIntakeChannel): string {
  if (!channel) return INTAKE_CHANNEL_LABELS.unknown;
  return INTAKE_CHANNEL_LABELS[channel] ?? INTAKE_CHANNEL_LABELS.unknown;
}
