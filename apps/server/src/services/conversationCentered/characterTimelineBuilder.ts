// =====================================================
// CHARACTER TIMELINE BUILDER
// Canonical Character Timeline for the modal. Occurrence comes from the
// shared stitched projection of resolved_events.
// =====================================================

import { logger } from '../../logger';
import {
  buildCanonicalCharacterTimeline,
  emptyCharacterTimelineResult,
  ResolvedEventsQueryError,
  type CharacterEntityTimelineResult,
} from '../characters/characterEntityTimelineService';

export type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';

export class CharacterTimelineBuilder {
  async buildTimelines(
    userId: string,
    characterId: string,
    timezone?: string,
  ): Promise<CharacterEntityTimelineResult> {
    try {
      return await buildCanonicalCharacterTimeline(userId, characterId, timezone);
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to build character timelines');
      if (error instanceof ResolvedEventsQueryError) throw error;
      return emptyCharacterTimelineResult();
    }
  }
}

export const characterTimelineBuilder = new CharacterTimelineBuilder();
