/**
 * Base types and interfaces for timeline event normalization
 */

export interface NormalizedTimelineEvent {
  title: string;
  description?: string;
  eventDate: Date;
  endDate?: Date;
  tags: string[];
  metadata?: Record<string, any>;
  sourceId?: string;
  sourceType: string;
  confidence?: number;
}

export interface TimelineEvent {
  id: string;
  userId: string;
  sourceType: string;
  sourceId?: string;
  title: string;
  description?: string;
  eventDate: Date;
  endDate?: Date;
  tags: string[];
  metadata?: Record<string, any>;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export type Normalizer<T> = (source: T) => NormalizedTimelineEvent[];


