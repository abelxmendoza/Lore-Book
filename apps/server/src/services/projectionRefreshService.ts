/**
 * Refresh stale derived projections from their source memories.
 */
import { biographyFoundationService } from './biographyFoundationService';
import { artifactRegistry, type ArtifactIndexEntry } from './artifactRegistry';
import { logger } from '../logger';
import { timelineFoundationService } from './timelineFoundationService';

export type RefreshableProjectionType = 'biography_snapshot' | 'timeline_event';

export interface ProjectionRefreshResult {
  refreshed: boolean;
  type: RefreshableProjectionType;
  artifactId: string;
  artifact?: ArtifactIndexEntry;
  message?: string;
}

const REFRESHABLE_TYPES: RefreshableProjectionType[] = ['biography_snapshot', 'timeline_event'];

export async function refreshProjection(
  userId: string,
  artifactId: string,
  type: RefreshableProjectionType
): Promise<ProjectionRefreshResult> {
  if (type === 'biography_snapshot') {
    const output = await biographyFoundationService.generateBiography(userId);
    if (!output) {
      return {
        refreshed: false,
        type,
        artifactId,
        message: 'Not enough data to regenerate biography',
      };
    }

    const latest = await artifactRegistry.get(userId, artifactId, type);
    logger.info({ userId, artifactId, type }, 'Biography projection refreshed');

    return {
      refreshed: true,
      type,
      artifactId,
      artifact: latest?.entry,
      message: 'Biography summary refreshed from your latest memories',
    };
  }

  const ok = await timelineFoundationService.refreshResolvedEvent(userId, artifactId);
  if (!ok) {
    return {
      refreshed: false,
      type,
      artifactId,
      message: 'Could not refresh timeline event — source memory may be missing',
    };
  }

  const latest = await artifactRegistry.get(userId, artifactId, type);
  logger.info({ userId, artifactId, type }, 'Timeline projection refreshed');

  return {
    refreshed: true,
    type,
    artifactId,
    artifact: latest?.entry,
    message: 'Timeline event refreshed from source memory',
  };
}

export async function refreshStaleProjections(
  userId: string,
  items: Array<{ id: string; type: RefreshableProjectionType; stale?: boolean }>
): Promise<ProjectionRefreshResult[]> {
  const stale = items.filter((item) => item.stale && REFRESHABLE_TYPES.includes(item.type));
  const results: ProjectionRefreshResult[] = [];

  for (const item of stale) {
    results.push(await refreshProjection(userId, item.id, item.type));
  }

  return results;
}
