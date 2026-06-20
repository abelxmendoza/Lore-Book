import type { LoreBookDomain } from './loreBookParserTypes';

/** One entity LoreBook successfully seeded from a chat message. */
export type LoreBookAppliedItem = {
  domain: LoreBookDomain;
  name: string;
  confidence: number;
};

/** Ephemeral event surfaced to the client after message ingest parse. */
export type LoreBookNoticeEvent = {
  chatMessageId: string;
  userId: string;
  timestamp: string;
  items: LoreBookAppliedItem[];
};
