/**
 * Normalizes job/work events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface JobRecord {
  id: string;
  company?: string;
  position?: string;
  startDate: string | Date;
  endDate?: string | Date;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeJobEvent: Normalizer<JobRecord> = (job: JobRecord): NormalizedTimelineEvent[] => {
  const startDate = typeof job.startDate === 'string' ? new Date(job.startDate) : job.startDate;
  const endDate = job.endDate ? (typeof job.endDate === 'string' ? new Date(job.endDate) : job.endDate) : undefined;
  
  const events: NormalizedTimelineEvent[] = [];
  
  // Start event
  events.push({
    title: job.position 
      ? `Started ${job.position}${job.company ? ` at ${job.company}` : ''}`
      : `Job Started${job.company ? ` at ${job.company}` : ''}`,
    description: job.description,
    eventDate: startDate,
    tags: ['job', 'work', 'career', ...(job.tags || [])],
    metadata: {
      company: job.company,
      position: job.position,
      event_type: 'job_start',
      ...job.metadata
    },
    sourceType: 'job',
    sourceId: job.id,
    confidence: 1.0
  });
  
  // End event (if applicable)
  if (endDate) {
    events.push({
      title: job.position 
        ? `Ended ${job.position}${job.company ? ` at ${job.company}` : ''}`
        : `Job Ended${job.company ? ` at ${job.company}` : ''}`,
      description: job.description,
      eventDate: endDate,
      tags: ['job', 'work', 'career', ...(job.tags || [])],
      metadata: {
        company: job.company,
        position: job.position,
        event_type: 'job_end',
        ...job.metadata
      },
      sourceType: 'job',
      sourceId: job.id,
      confidence: 1.0
    });
  }
  
  return events;
};


