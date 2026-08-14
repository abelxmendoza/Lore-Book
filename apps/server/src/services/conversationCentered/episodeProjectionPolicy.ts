export type EpisodeProjectionRow = {
  title: string;
  boundary_reason: string;
  source_event_ids?: string[] | null;
};

/** Operational segmentation markers are not autobiographical events. */
export function isCanonicalLifeEpisode(row: EpisodeProjectionRow): boolean {
  return !(
    row.boundary_reason === 'thread-start' &&
    row.title.trim().toLowerCase() === 'thread start' &&
    (row.source_event_ids ?? []).length === 0
  );
}
