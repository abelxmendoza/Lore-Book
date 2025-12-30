/**
 * Normalizes emotion events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface EmotionEvent {
  id: string;
  date: string | Date;
  emotion: string;
  intensity?: number;
  trigger?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeEmotionEvent: Normalizer<EmotionEvent> = (event: EmotionEvent): NormalizedTimelineEvent[] => {
  const eventDate = typeof event.date === 'string' ? new Date(event.date) : event.date;
  
  const title = `Emotion: ${event.emotion}${event.intensity ? ` (${event.intensity}/10)` : ''}`;
  
  return [{
    title,
    description: event.description || event.trigger,
    eventDate,
    tags: ['emotion', event.emotion.toLowerCase(), ...(event.tags || [])],
    metadata: {
      emotion: event.emotion,
      intensity: event.intensity,
      trigger: event.trigger,
      ...event.metadata
    },
    sourceType: 'emotion',
    sourceId: event.id,
    confidence: 0.8 // Emotions can be subjective
  }];
};


