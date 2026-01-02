import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type { MemoryComponent, TimelineLink } from '../types';
import { supabaseAdmin } from './supabaseClient';
import { memoryService } from './memoryService';

class TimelineAssignmentService {
  /**
   * Assign memory component to timeline hierarchy levels
   * Uses rule-based inference first, can be enhanced with LLM later
   */
  async assignTimeline(
    component: MemoryComponent,
    userId: string
  ): Promise<TimelineLink | null> {
    // Get the journal entry to extract date context
    const entry = await memoryService.getEntry(userId, component.journal_entry_id);
    if (!entry) {
      logger.warn({ componentId: component.id }, 'Journal entry not found for component');
      return null;
    }

    // Rule-based timeline assignment
    const assignment = await this.inferTimelineLevels(component, entry);

    // Create timeline link
    const timelineLink: TimelineLink = {
      id: uuid(),
      component_id: component.id,
      mythos_id: assignment.mythos_id ?? null,
      epoch_id: assignment.epoch_id ?? null,
      era_id: assignment.era_id ?? null,
      saga_id: assignment.saga_id ?? null,
      arc_id: assignment.arc_id ?? null,
      chapter_id: assignment.chapter_id ?? null,
      scene_id: assignment.scene_id ?? null,
      action_id: assignment.action_id ?? null,
      micro_action_id: assignment.micro_action_id ?? null,
      metadata: {
        assignmentMethod: 'rule_based',
        confidence: assignment.confidence,
        inferredAt: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    };

    // Save to database
    const { error } = await supabaseAdmin.from('timeline_links').insert(timelineLink);

    if (error) {
      logger.error({ error, componentId: component.id }, 'Failed to save timeline link');
      throw error;
    }

    return timelineLink;
  }

  /**
   * Infer timeline hierarchy levels from component and entry
   * Rule-based inference using dates, tags, and content patterns
   */
  private async inferTimelineLevels(
    component: MemoryComponent,
    entry: { date: string; chapter_id?: string | null; tags: string[] }
  ): Promise<{
    mythos_id?: string | null;
    epoch_id?: string | null;
    era_id?: string | null;
    saga_id?: string | null;
    arc_id?: string | null;
    chapter_id?: string | null;
    scene_id?: string | null;
    action_id?: string | null;
    micro_action_id?: string | null;
    confidence: number;
  }> {
    const assignment: {
      mythos_id?: string | null;
      epoch_id?: string | null;
      era_id?: string | null;
      saga_id?: string | null;
      arc_id?: string | null;
      chapter_id?: string | null;
      scene_id?: string | null;
      action_id?: string | null;
      micro_action_id?: string | null;
      confidence: number;
    } = {
      confidence: 0.5, // Default confidence for rule-based
    };

    // Use chapter_id from entry if available
    if (entry.chapter_id) {
      assignment.chapter_id = entry.chapter_id;

      // Try to find parent arc for this chapter
      try {
        const { data: chapter } = await supabaseAdmin
          .from('chapters')
          .select('parent_id')
          .eq('id', entry.chapter_id)
          .single();

        if (chapter?.parent_id) {
          assignment.arc_id = chapter.parent_id;

          // Try to find parent saga for this arc
          const { data: arc } = await supabaseAdmin
            .from('timeline_arcs')
            .select('parent_id')
            .eq('id', chapter.parent_id)
            .single();

          if (arc?.parent_id) {
            assignment.saga_id = arc.parent_id;

            // Continue up the hierarchy
            const { data: saga } = await supabaseAdmin
              .from('timeline_sagas')
              .select('parent_id')
              .eq('id', arc.parent_id)
              .single();

            if (saga?.parent_id) {
              assignment.era_id = saga.parent_id;

              const { data: era } = await supabaseAdmin
                .from('timeline_eras')
                .select('parent_id')
                .eq('id', saga.parent_id)
                .single();

              if (era?.parent_id) {
                assignment.epoch_id = era.parent_id;

                const { data: epoch } = await supabaseAdmin
                  .from('timeline_epochs')
                  .select('parent_id')
                  .eq('id', era.parent_id)
                  .single();

                if (epoch?.parent_id) {
                  assignment.mythos_id = epoch.parent_id;
                }
              }
            }
          }
        }
      } catch (error) {
        logger.debug({ error, chapterId: entry.chapter_id }, 'Failed to traverse timeline hierarchy');
      }
    }

    // Infer based on component type
    if (component.component_type === 'timeline_marker') {
      assignment.confidence = 0.8; // High confidence for explicit timeline markers
    } else if (component.component_type === 'event') {
      assignment.confidence = 0.7; // Good confidence for events
    } else {
      assignment.confidence = 0.5; // Lower confidence for thoughts/reflections
    }

    return assignment;
  }

  /**
   * Batch assign multiple components to timeline
   */
  async batchAssignTimeline(
    components: MemoryComponent[],
    userId: string
  ): Promise<TimelineLink[]> {
    const links: TimelineLink[] = [];

    // Process in parallel (but limit concurrency)
    const batchSize = 10;
    for (let i = 0; i < components.length; i += batchSize) {
      const batch = components.slice(i, i + batchSize);
      const batchLinks = await Promise.all(
        batch.map(component => this.assignTimeline(component, userId).catch(error => {
          logger.error({ error, componentId: component.id }, 'Failed to assign timeline for component');
          return null;
        }))
      );

      links.push(...batchLinks.filter((link): link is TimelineLink => link !== null));
    }

    return links;
  }

  /**
   * Get timeline links for a component
   */
  async getTimelineLinks(componentId: string): Promise<TimelineLink[]> {
    const { data, error } = await supabaseAdmin
      .from('timeline_links')
      .select('*')
      .eq('component_id', componentId);

    if (error) {
      logger.error({ error, componentId }, 'Failed to get timeline links');
      throw error;
    }

    return (data ?? []) as TimelineLink[];
  }

  /**
   * Get components for a timeline level
   */
  async getComponentsForTimelineLevel(
    level: 'mythos' | 'epoch' | 'era' | 'saga' | 'arc' | 'chapter' | 'scene' | 'action' | 'micro_action',
    levelId: string
  ): Promise<MemoryComponent[]> {
    const columnMap: Record<string, string> = {
      mythos: 'mythos_id',
      epoch: 'epoch_id',
      era: 'era_id',
      saga: 'saga_id',
      arc: 'arc_id',
      chapter: 'chapter_id',
      scene: 'scene_id',
      action: 'action_id',
      micro_action: 'micro_action_id',
    };

    const column = columnMap[level];
    if (!column) {
      throw new Error(`Invalid timeline level: ${level}`);
    }

    const { data: links, error: linksError } = await supabaseAdmin
      .from('timeline_links')
      .select('component_id')
      .eq(column, levelId);

    if (linksError) {
      logger.error({ error: linksError, level, levelId }, 'Failed to get timeline links');
      throw linksError;
    }

    if (!links || links.length === 0) {
      return [];
    }

    const componentIds = links.map(link => link.component_id);

    const { data: components, error: componentsError } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .in('id', componentIds);

    if (componentsError) {
      logger.error({ error: componentsError }, 'Failed to get components');
      throw componentsError;
    }

    return (components ?? []) as MemoryComponent[];
  }
}

export const timelineAssignmentService = new TimelineAssignmentService();

