export type GithubEvent = {
  id?: string;
  type?: string;
  title?: string;
  repo?: string;
  created_at?: string;
  summary?: string;
  [key: string]: unknown;
};

export type GithubSyncResult = {
  count: number;
};
