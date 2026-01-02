/**
 * Normalizes identity changes into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface IdentityChange {
  id: string;
  date: string | Date;
  dimension: string; // e.g., 'archetype', 'values', 'beliefs'
  oldValue?: string;
  newValue: string;
  description?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export const normalizeIdentityEvent: Normalizer<IdentityChange> = (change: IdentityChange): NormalizedTimelineEvent[] => {
  const eventDate = typeof change.date === 'string' ? new Date(change.date) : change.date;
  
  const title = change.oldValue
    ? `${change.dimension}: ${change.oldValue} → ${change.newValue}`
    : `${change.dimension}: ${change.newValue}`;
  
  return [{
    title,
    description: change.description,
    eventDate,
    tags: ['identity', 'identity_change', change.dimension],
    metadata: {
      dimension: change.dimension,
      old_value: change.oldValue,
      new_value: change.newValue,
      ...change.metadata
    },
    sourceType: 'identity_change',
    sourceId: change.id,
    confidence: change.confidence || 0.8
  }];
};


