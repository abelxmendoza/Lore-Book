import { logger } from '../../logger';
import { activityResolver } from '../activities/activityResolver';
import { supabaseAdmin } from '../supabaseClient';

import type { Action, ActionType, RLStateVector } from './types';

export class ActionSpace {
  async getAvailableActions(
    userId: string,
    state: RLStateVector
  ): Promise<Action[]> {
    const allActions: ActionType[] = [
      'train', 'code', 'rest', 'socialize', 'reflect', 'learn',
      'create', 'work', 'plan', 'explore', 'connect', 'grow',
      'maintain', 'heal', 'serve', 'play',
    ];

    const available: Action[] = [];

    for (const actionType of allActions) {
      if (this.isActionFeasible(actionType, state)) {
        available.push({
          id: `${actionType}_${Date.now()}`,
          type: actionType,
          timestamp: new Date().toISOString(),
          context: {},
          metadata: {},
        });
      }
    }

    return available;
  }

  private isActionFeasible(actionType: ActionType, state: RLStateVector): boolean {
    if (actionType === 'train' && state.energy < 0.3) {
      return false;
    }

    if (actionType === 'code' && state.energy < 0.2) {
      return false;
    }

    if (actionType === 'train' && state.stress > 0.8) {
      return false;
    }

    if (actionType === 'socialize' && state.time_of_day > 22) {
      return false;
    }

    if (actionType === 'socialize' && state.time_of_day < 8) {
      return false;
    }

    const alwaysAvailable: ActionType[] = ['rest', 'reflect', 'plan'];
    if (alwaysAvailable.includes(actionType)) {
      return true;
    }

    return true;
  }

  async extractActionsFromEntry(userId: string, entryId: string): Promise<Action[]> {
    try {
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('id', entryId)
        .single();

      if (!entry) return [];

      const activities = await activityResolver.process({
        entries: [entry],
        user: { id: userId },
      });

      const actions: Action[] = activities.map(activity => ({
        id: `action_${activity.id}_${Date.now()}`,
        type: this.mapActivityToActionType(activity.normalized_name || activity.name),
        timestamp: entry.date || entry.created_at,
        context: {
          location: entry.metadata?.location,
          people: entry.metadata?.people || [],
          entry_id: entryId,
        },
        metadata: {
          activity_id: activity.id,
          entry_id: entryId,
        },
      }));

      return actions;
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to extract actions from entry');
      return [];
    }
  }

  private mapActivityToActionType(activityName: string): ActionType {
    const name = activityName.toLowerCase();

    if (name.includes('bjj') || name.includes('jiu') || name.includes('spar') || 
        name.includes('gym') || name.includes('train') || name.includes('workout') ||
        name.includes('rolling') || name.includes('grappling')) {
      return 'train';
    }

    if (name.includes('code') || name.includes('program') || name.includes('robot') ||
        name.includes('deploy') || name.includes('debug') || name.includes('software')) {
      return 'code';
    }

    if (name.includes('social') || name.includes('friend') || name.includes('party') ||
        name.includes('club') || name.includes('date') || name.includes('hangout')) {
      return 'socialize';
    }

    if (name.includes('art') || name.includes('music') || name.includes('write') ||
        name.includes('create') || name.includes('design') || name.includes('draw')) {
      return 'create';
    }

    if (name.includes('learn') || name.includes('study') || name.includes('read') ||
        name.includes('course') || name.includes('skill') || name.includes('education')) {
      return 'learn';
    }

    if (name.includes('work') || name.includes('job') || name.includes('career') ||
        name.includes('professional') || name.includes('business')) {
      return 'work';
    }

    if (name.includes('reflect') || name.includes('journal') || name.includes('meditate') ||
        name.includes('think') || name.includes('contemplate')) {
      return 'reflect';
    }

    return 'unknown';
  }

  async getActionHistory(
    userId: string,
    limit: number = 50
  ): Promise<Action[]> {
    try {
      const { data } = await supabaseAdmin
        .from('strategy_actions')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      return (data || []).map(row => ({
        id: row.id,
        type: row.action_type as ActionType,
        timestamp: row.timestamp,
        duration_minutes: row.duration_minutes,
        intensity: row.intensity,
        context: row.context || {},
        outcome: row.outcome,
        metadata: row.metadata || {},
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get action history');
      return [];
    }
  }
}
