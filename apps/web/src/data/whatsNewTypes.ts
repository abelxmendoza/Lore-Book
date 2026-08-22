export type WhatsNewEntry = {
  id: string;
  /** ISO date (YYYY-MM-DD). Displayed as month + year. */
  date: string;
  title: string;
  summary: string;
  /** Shared key so git-derived updates do not duplicate curated copy. */
  theme?: string;
};
