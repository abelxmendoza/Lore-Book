/**
 * Normalizes paracosm (imagined world) events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface ParacosmEvent {
  id: string;
  date: string | Date;
  worldName?: string;
  eventDescription: string;
  type?: 'creation' | 'exploration' | 'development' | 'custom';
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeParacosm: Normalizer<ParacosmEvent> = (event: ParacosmEvent): NormalizedTimelineEvent[] => {
  const eventDate = typeof event.date === 'string' ? new Date(event.date) : event.date;
  
  let title = event.eventDescription;
  if (event.worldName) {
    title = event.type === 'creation'
      ? `Created world: ${event.worldName}`
      : event.type === 'exploration'
      ? `Explored: ${event.worldName}`
      : event.type === 'development'
      ? `Developed: ${event.worldName}`
      : `${event.worldName}: ${event.eventDescription}`;
  }
  
  return [{
    title,
    description: event.eventDescription,
    eventDate,
    tags: ['paracosm', 'imagined_world', event.type || 'custom', ...(event.tags || [])],
    metadata: {
      world_name: event.worldName,
      event_type: event.type || 'custom',
      ...event.metadata
    },
    sourceType: 'paracosm_event',
    sourceId: event.id,
    confidence: 0.9 // Paracosm events are imagined, so slightly lower confidence
  }];
};


