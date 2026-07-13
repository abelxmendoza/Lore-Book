/* Vendored mirror of packages/api-contracts for Vercel (rootDirectory=apps/web). Keep in sync. */
export {
  apiSuccessEnvelopeSchema,
  apiErrorEnvelopeSchema,
  apiSuccessDualShape,
  unwrapApiData,
  type ApiErrorEnvelope,
} from './envelopes';

export {
  chatStreamDurabilitySchema,
  durabilityNoticeSchema,
  chatStreamIngestionStatusSchema,
  type ChatStreamDurability,
} from './chat/durability';

export {
  chatStreamEventSchema,
  chatStreamMetadataEventSchema,
  chatStreamChunkEventSchema,
  chatStreamDoneEventSchema,
  chatStreamErrorEventSchema,
  formatSseDataLine,
  parseChatStreamEvent,
  type ChatStreamEvent,
  type ChatStreamMetadataEvent,
  type ChatStreamChunkEvent,
  type ChatStreamDoneEvent,
  type ChatStreamErrorEvent,
} from './chat/streamEvents';
