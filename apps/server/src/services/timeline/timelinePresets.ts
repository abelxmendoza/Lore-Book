/**
 * Timeline filter presets for different view modes
 */

import type { TimelineFilter } from './timelineEngine';

export const TimelinePresets = {
  /**
   * All events (no filter)
   */
  life: (): TimelineFilter => ({}),

  /**
   * Martial arts and fight events
   */
  martialArts: (): TimelineFilter => ({
    tags: ['martial_arts', 'fight', 'training']
  }),

  /**
   * Job/work related events
   */
  job: (jobId?: string): TimelineFilter => ({
    sourceTypes: ['job', 'work_event'],
    ...(jobId && { tags: [jobId] })
  }),

  /**
   * Project events
   */
  project: (projectId?: string): TimelineFilter => ({
    sourceTypes: ['project'],
    ...(projectId && { tags: [projectId] })
  }),

  /**
   * Relationship and interaction events
   */
  relationships: (): TimelineFilter => ({
    sourceTypes: ['relationship']
  }),

  /**
   * Narrative structure events (eras, sagas, arcs, chapters)
   */
  eras: (): TimelineFilter => ({
    sourceTypes: ['era', 'saga', 'arc', 'chapter']
  }),

  /**
   * Identity change events
   */
  identity: (): TimelineFilter => ({
    sourceTypes: ['identity_change', 'identity_signal']
  }),

  /**
   * Emotion events
   */
  emotions: (): TimelineFilter => ({
    sourceTypes: ['emotion']
  }),

  /**
   * Paracosm (imagined world) events
   */
  paracosm: (): TimelineFilter => ({
    sourceTypes: ['paracosm_event']
  }),

  /**
   * Journal entries only
   */
  journal: (): TimelineFilter => ({
    sourceTypes: ['journal']
  }),

  /**
   * Habit tracking events
   */
  habits: (): TimelineFilter => ({
    sourceTypes: ['habit']
  }),

  /**
   * Date range filter
   */
  dateRange: (startDate: Date, endDate: Date): TimelineFilter => ({
    startDate,
    endDate
  }),

  /**
   * Recent events (last N days)
   */
  recent: (days: number = 30): TimelineFilter => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    return {
      startDate,
      endDate
    };
  }
};


