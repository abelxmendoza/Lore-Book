export type InstagramMedia = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  timestamp?: string;
  [key: string]: unknown;
};

export type InstagramSyncResult = {
  count: number;
};
