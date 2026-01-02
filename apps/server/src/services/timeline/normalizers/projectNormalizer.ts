/**
 * Normalizes project events into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface ProjectEvent {
  id: string;
  name: string;
  date: string | Date;
  type: 'start' | 'milestone' | 'completion' | 'custom';
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export const normalizeProjectEvent: Normalizer<ProjectEvent> = (project: ProjectEvent): NormalizedTimelineEvent[] => {
  const eventDate = typeof project.date === 'string' ? new Date(project.date) : project.date;
  
  let title = project.name;
  if (project.type === 'start') {
    title = `Started: ${project.name}`;
  } else if (project.type === 'milestone') {
    title = `Milestone: ${project.name}`;
  } else if (project.type === 'completion') {
    title = `Completed: ${project.name}`;
  }
  
  return [{
    title,
    description: project.description,
    eventDate,
    tags: ['project', project.type, ...(project.tags || [])],
    metadata: {
      project_name: project.name,
      event_type: project.type,
      ...project.metadata
    },
    sourceType: 'project',
    sourceId: project.id,
    confidence: 1.0
  }];
};


