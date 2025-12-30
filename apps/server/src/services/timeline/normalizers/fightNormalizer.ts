/**
 * Normalizes fight/martial arts events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface FightRecord {
  id: string;
  date: string | Date;
  opponent?: string;
  notes?: string;
  result?: string;
  method?: string;
  gym?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeFightEvent: Normalizer<FightRecord> = (fight: FightRecord): NormalizedTimelineEvent[] => {
  const eventDate = typeof fight.date === 'string' ? new Date(fight.date) : fight.date;
  const title = fight.opponent 
    ? `Fight vs ${fight.opponent}`
    : 'Fight Event';
  
  return [{
    title,
    description: fight.notes || undefined,
    eventDate,
    tags: ['martial_arts', 'fight', ...(fight.tags || [])],
    metadata: {
      result: fight.result,
      method: fight.method,
      gym: fight.gym,
      opponent: fight.opponent,
      ...fight.metadata
    },
    sourceType: 'fight',
    sourceId: fight.id,
    confidence: 1.0
  }];
};


