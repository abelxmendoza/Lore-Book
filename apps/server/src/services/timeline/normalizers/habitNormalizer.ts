/**
 * Normalizes habit events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface HabitEvent {
  id: string;
  date: string | Date;
  habitName: string;
  eventType: 'started' | 'completed' | 'missed' | 'milestone' | 'custom';
  description?: string;
  streak?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeHabitEvent: Normalizer<HabitEvent> = (event: HabitEvent): NormalizedTimelineEvent[] => {
  const eventDate = typeof event.date === 'string' ? new Date(event.date) : event.date;
  
  let title = '';
  if (event.eventType === 'started') {
    title = `Started habit: ${event.habitName}`;
  } else if (event.eventType === 'completed') {
    title = `Completed: ${event.habitName}${event.streak ? ` (${event.streak} day streak)` : ''}`;
  } else if (event.eventType === 'missed') {
    title = `Missed: ${event.habitName}`;
  } else if (event.eventType === 'milestone') {
    title = `Milestone: ${event.habitName}${event.streak ? ` (${event.streak} days)` : ''}`;
  } else {
    title = `${event.habitName}: ${event.description || event.eventType}`;
  }
  
  return [{
    title,
    description: event.description,
    eventDate,
    tags: ['habit', event.habitName.toLowerCase().replace(/\s+/g, '_'), event.eventType, ...(event.tags || [])],
    metadata: {
      habit_name: event.habitName,
      event_type: event.eventType,
      streak: event.streak,
      ...event.metadata
    },
    sourceType: 'habit',
    sourceId: event.id,
    confidence: 1.0
  }];
};


