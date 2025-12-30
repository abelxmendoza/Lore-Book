/**
 * Normalizes relationship/interaction events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface RelationshipEvent {
  id: string;
  date: string | Date;
  characterName: string;
  eventType: 'met' | 'interaction' | 'conflict' | 'milestone' | 'custom';
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeRelationshipEvent: Normalizer<RelationshipEvent> = (event: RelationshipEvent): NormalizedTimelineEvent[] => {
  const eventDate = typeof event.date === 'string' ? new Date(event.date) : event.date;
  
  let title = '';
  if (event.eventType === 'met') {
    title = `Met ${event.characterName}`;
  } else if (event.eventType === 'interaction') {
    title = `Interaction with ${event.characterName}`;
  } else if (event.eventType === 'conflict') {
    title = `Conflict with ${event.characterName}`;
  } else if (event.eventType === 'milestone') {
    title = `Milestone with ${event.characterName}`;
  } else {
    title = `${event.characterName}: ${event.description || 'Event'}`;
  }
  
  return [{
    title,
    description: event.description,
    eventDate,
    tags: ['relationship', event.eventType, ...(event.tags || [])],
    metadata: {
      character_name: event.characterName,
      event_type: event.eventType,
      ...event.metadata
    },
    sourceType: 'relationship',
    sourceId: event.id,
    confidence: 1.0
  }];
};


