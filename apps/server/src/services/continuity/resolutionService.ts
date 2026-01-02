import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ContinuityEvent } from '../../types';

/**
 * Resolution Service
 * Handles resolution of continuity events (contradictions, etc.)
 */
class ResolutionService {
  /**
   * Resolve a contradiction
   */
  async resolveContradiction(
    eventId: string,
    userId: string,
    resolution: {
      action: 'accept_left' | 'accept_right' | 'merge' | 'resolve_with_notes' | 'dismiss';
      notes?: string;
      resolved_text?: string;
    }
  ): Promise<ContinuityEvent> {
    const { action, notes, resolved_text } = resolution;
    const resolutionMetadata = {
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_action: action,
      resolution_notes: notes,
      resolved_text: resolved_text,
    };

    // Get current event
    const { data: event, error: fetchError } = await supabaseAdmin
      .from('continuity_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !event) {
      throw new Error('Contradiction not found');
    }

    // Update event with resolution
    const { data: updatedEvent, error: updateError } = await supabaseAdmin
      .from('continuity_events')
      .update({
        metadata: {
          ...event.metadata,
          ...resolutionMetadata,
        },
      })
      .eq('id', eventId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      logger.error({ error: updateError, eventId, userId }, 'Failed to resolve contradiction');
      throw new Error('Failed to resolve contradiction');
    }

    logger.info({ eventId, userId, action }, 'Contradiction resolved');

    return updatedEvent as ContinuityEvent;
  }

  /**
   * Get contradiction details including components
   */
  async getContradictionDetails(
    eventId: string,
    userId: string
  ): Promise<{
    event: ContinuityEvent;
    originalComponent: any;
    contradictingComponent: any;
    supportingEvidence: any[];
    contradictingEvidence: any[];
    timelineContext: any[];
  }> {
    // Get event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('continuity_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (eventError || !event) {
      throw new Error('Contradiction not found');
    }

    // Get components
    const componentIds = event.source_components || [];
    if (componentIds.length < 2) {
      throw new Error('Contradiction must have at least 2 components');
    }

    // Get components - need to join with journal_entries to filter by user_id
    const { data: components, error: componentsError } = await supabaseAdmin
      .from('memory_components')
      .select(`
        *,
        journal_entries!inner(id, user_id)
      `)
      .in('id', componentIds)
      .eq('journal_entries.user_id', userId);

    if (componentsError || !components || components.length < 2) {
      throw new Error('Failed to fetch components');
    }

    // Sort by timestamp/created_at to determine original vs contradicting
    const sortedComponents = components.sort((a: any, b: any) => {
      const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
      const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
      return aTime - bTime;
    });

    const originalComponent = sortedComponents[0];
    const contradictingComponent = sortedComponents[1];

    // Get supporting/contradicting evidence (simplified - would need more logic)
    const supportingEvidence: any[] = [];
    const contradictingEvidence: any[] = [];

    // Get timeline context (components around the same time)
    const timelineContext: any[] = [];

    return {
      event: event as ContinuityEvent,
      originalComponent,
      contradictingComponent,
      supportingEvidence,
      contradictingEvidence,
      timelineContext,
    };
  }

  /**
   * Get contradiction evidence
   */
  async getContradictionEvidence(eventId: string, userId: string): Promise<{
    supporting: any[];
    contradicting: any[];
  }> {
    // TODO: Implement evidence fetching logic
    return {
      supporting: [],
      contradicting: [],
    };
  }

  /**
   * Get contradiction timeline context
   */
  async getContradictionTimeline(eventId: string, userId: string): Promise<any[]> {
    // TODO: Implement timeline context fetching
    return [];
  }

  /**
   * Generate AI suggestion for resolving contradiction
   */
  async generateAISuggestion(eventId: string, userId: string): Promise<{
    suggestion: string;
    explanation: string;
    confidence: number;
    reasoning: string[];
    action: 'accept_left' | 'accept_right' | 'merge' | 'dismiss';
  }> {
    const details = await this.getContradictionDetails(eventId, userId);
    
    // Simple heuristic-based suggestion (TODO: Replace with LLM)
    return {
      suggestion: 'Consider keeping the original statement as it appears earlier in your timeline.',
      explanation: 'The original statement has more temporal context.',
      confidence: 0.7,
      reasoning: [
        'Original statement appears earlier in timeline',
        'Contradicting statement may be a correction or update',
      ],
      action: 'accept_left',
    };
  }
}

export const resolutionService = new ResolutionService();
