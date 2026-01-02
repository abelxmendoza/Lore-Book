/**
 * Normalizes arc/saga/era events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface ArcEvent {
  id: string;
  name: string;
  startDate: string | Date;
  endDate?: string | Date;
  type: 'era' | 'saga' | 'arc' | 'chapter';
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeArc: Normalizer<ArcEvent> = (arc: ArcEvent): NormalizedTimelineEvent[] => {
  const startDate = typeof arc.startDate === 'string' ? new Date(arc.startDate) : arc.startDate;
  const endDate = arc.endDate ? (typeof arc.endDate === 'string' ? new Date(arc.endDate) : arc.endDate) : undefined;
  
  const events: NormalizedTimelineEvent[] = [];
  
  // Start event
  events.push({
    title: `${arc.type.charAt(0).toUpperCase() + arc.type.slice(1)} Started: ${arc.name}`,
    description: arc.description,
    eventDate: startDate,
    tags: [arc.type, 'narrative', ...(arc.tags || [])],
    metadata: {
      arc_name: arc.name,
      arc_type: arc.type,
      event_type: `${arc.type}_start`,
      ...arc.metadata
    },
    sourceType: arc.type,
    sourceId: arc.id,
    confidence: 1.0
  });
  
  // End event (if applicable)
  if (endDate) {
    events.push({
      title: `${arc.type.charAt(0).toUpperCase() + arc.type.slice(1)} Ended: ${arc.name}`,
      description: arc.description,
      eventDate: endDate,
      tags: [arc.type, 'narrative', ...(arc.tags || [])],
      metadata: {
        arc_name: arc.name,
        arc_type: arc.type,
        event_type: `${arc.type}_end`,
        ...arc.metadata
      },
      sourceType: arc.type,
      sourceId: arc.id,
      confidence: 1.0
    });
  }
  
  return events;
};


