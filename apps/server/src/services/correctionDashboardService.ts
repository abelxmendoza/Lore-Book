// =====================================================
// CORRECTION DASHBOARD SERVICE
// Purpose: Make corrections, contradictions, and deprecated
// knowledge visible, auditable, and user-controllable
// =====================================================

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export type TargetType = 'CLAIM' | 'UNIT' | 'EVENT' | 'ENTITY';
export type CorrectionType =
  | 'AUTO_CONTRADICTION'
  | 'CONFIDENCE_DOWNGRADE'
  | 'USER_CORRECTION'
  | 'OVERRIDE_APPLIED'
  | 'ENTITY_MERGE';
export type ContradictionType = 'TEMPORAL' | 'FACTUAL' | 'PERSPECTIVE';
export type ContradictionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ContradictionStatus = 'OPEN' | 'DISMISSED' | 'RESOLVED';

export interface CorrectionRecord {
  id: string;
  user_id: string;
  target_type: TargetType;
  target_id: string;
  correction_type: CorrectionType;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  reason: string | null;
  initiated_by: 'SYSTEM' | 'USER';
  reversible: boolean;
  created_at: string;
  metadata: Record<string, any>;
}

export interface DeprecatedUnitView {
  unit_id: string;
  unit_type: 'EXPERIENCE' | 'FEELING' | 'THOUGHT' | 'CLAIM' | 'PERCEPTION' | 'DECISION';
  content: string;
  deprecated_reason: string;
  deprecated_at: string;
  linked_events: string[];
  source_message_ids: string[];
  confidence: number;
}

export interface ContradictionReview {
  id: string;
  user_id: string;
  unit_a_id: string;
  unit_b_id: string;
  contradiction_type: ContradictionType;
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  detected_at: string;
  resolved_at: string | null;
  resolution_action: string | null;
  metadata: Record<string, any>;
}

export interface CorrectionDashboardData {
  corrections: CorrectionRecord[];
  deprecated_units: DeprecatedUnitView[];
  open_contradictions: ContradictionReview[];
}

export class CorrectionDashboardService {
  /**
   * Get all dashboard data for a user
   */
  async getCorrectionDashboardData(userId: string): Promise<CorrectionDashboardData> {
    const [corrections, deprecatedUnits, openContradictions] = await Promise.all([
      this.listCorrectionRecords(userId),
      this.listDeprecatedUnits(userId),
      this.listOpenContradictions(userId),
    ]);

    return {
      corrections,
      deprecated_units: deprecatedUnits,
      open_contradictions: openContradictions,
    };
  }

  /**
   * List all correction records for a user
   */
  async listCorrectionRecords(userId: string): Promise<CorrectionRecord[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('correction_records')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      return (data || []).map(record => ({
        ...record,
        before_snapshot: record.before_snapshot || {},
        after_snapshot: record.after_snapshot || {},
        metadata: record.metadata || {},
      })) as CorrectionRecord[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list correction records');
      return [];
    }
  }

  /**
   * List all deprecated units for a user
   */
  async listDeprecatedUnits(userId: string): Promise<DeprecatedUnitView[]> {
    try {
      const { data: units, error } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>deprecated', 'true')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const deprecatedUnits: DeprecatedUnitView[] = [];

      for (const unit of units || []) {
        // Get linked events
        const { data: eventLinks } = await supabaseAdmin
          .from('event_unit_links')
          .select('event_id')
          .eq('unit_id', unit.id);

        const linkedEvents = (eventLinks || []).map(link => link.event_id);

        // Get source message IDs from utterance
        const { data: utterance } = await supabaseAdmin
          .from('utterances')
          .select('metadata')
          .eq('id', unit.utterance_id)
          .single();

        const sourceMessageIds =
          (utterance?.metadata?.source_message_ids as string[]) || [];

        deprecatedUnits.push({
          unit_id: unit.id,
          unit_type: unit.type as DeprecatedUnitView['unit_type'],
          content: unit.content,
          deprecated_reason: unit.metadata?.deprecated_reason || 'Unknown reason',
          deprecated_at: unit.updated_at || unit.created_at,
          linked_events: linkedEvents,
          source_message_ids: sourceMessageIds,
          confidence: unit.confidence || 0,
        });
      }

      return deprecatedUnits;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list deprecated units');
      return [];
    }
  }

  /**
   * List open contradictions for a user
   */
  async listOpenContradictions(userId: string): Promise<ContradictionReview[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('contradiction_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'OPEN')
        .order('severity', { ascending: false })
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return (data || []).map(review => ({
        ...review,
        metadata: review.metadata || {},
      })) as ContradictionReview[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list open contradictions');
      return [];
    }
  }

  /**
   * Record a correction
   */
  async recordCorrection(
    userId: string,
    targetType: TargetType,
    targetId: string,
    correctionType: CorrectionType,
    beforeSnapshot: Record<string, any>,
    afterSnapshot: Record<string, any>,
    reason: string | null = null,
    initiatedBy: 'SYSTEM' | 'USER' = 'SYSTEM',
    reversible: boolean = true,
    metadata: Record<string, any> = {}
  ): Promise<CorrectionRecord> {
    try {
      const { data, error } = await supabaseAdmin
        .from('correction_records')
        .insert({
          user_id: userId,
          target_type: targetType,
          target_id: targetId,
          correction_type: correctionType,
          before_snapshot: beforeSnapshot,
          after_snapshot: afterSnapshot,
          reason,
          initiated_by: initiatedBy,
          reversible,
          metadata,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      return {
        ...data,
        before_snapshot: data.before_snapshot || {},
        after_snapshot: data.after_snapshot || {},
        metadata: data.metadata || {},
      } as CorrectionRecord;
    } catch (error) {
      logger.error(
        { error, userId, targetType, targetId },
        'Failed to record correction'
      );
      throw error;
    }
  }

  /**
   * Prune a deprecated unit (mark as PRUNED)
   */
  async pruneDeprecatedUnit(
    userId: string,
    unitId: string,
    userReason: string
  ): Promise<void> {
    try {
      // Get unit before pruning
      const { data: unit, error: fetchError } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('id', unitId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !unit) {
        throw new Error('Unit not found');
      }

      const beforeSnapshot = { ...unit };

      // Mark unit as PRUNED
      const { error: updateError } = await supabaseAdmin
        .from('extracted_units')
        .update({
          metadata: {
            ...(unit.metadata || {}),
            deprecated: 'true',
            pruned: 'true',
            pruned_at: new Date().toISOString(),
            prune_reason: userReason,
          },
        })
        .eq('id', unitId);

      if (updateError) {
        throw updateError;
      }

      // Propagate removal (unlink from events)
      await supabaseAdmin.from('event_unit_links').delete().eq('unit_id', unitId);
      await supabaseAdmin.from('entity_unit_links').delete().eq('unit_id', unitId);

      // Record correction
      await this.recordCorrection(
        userId,
        'UNIT',
        unitId,
        'USER_CORRECTION',
        beforeSnapshot,
        { status: 'PRUNED', pruned_reason: userReason },
        userReason,
        'USER',
        true,
        { action: 'PRUNE' }
      );

      logger.info({ userId, unitId, userReason }, 'Deprecated unit pruned');
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to prune deprecated unit');
      throw error;
    }
  }

  /**
   * Restore a deprecated unit
   */
  async restoreDeprecatedUnit(userId: string, unitId: string): Promise<void> {
    try {
      // Get unit before restoration
      const { data: unit, error: fetchError } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('id', unitId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !unit) {
        throw new Error('Unit not found');
      }

      const beforeSnapshot = { ...unit };

      // Restore unit to ACTIVE
      const { error: updateError } = await supabaseAdmin
        .from('extracted_units')
        .update({
          metadata: {
            ...(unit.metadata || {}),
            deprecated: 'false',
            pruned: 'false',
            restored_at: new Date().toISOString(),
          },
        })
        .eq('id', unitId);

      if (updateError) {
        throw updateError;
      }

      // Reindex unit (could trigger event reassembly)
      // This is handled by the event assembly service when it runs

      // Record correction
      await this.recordCorrection(
        userId,
        'UNIT',
        unitId,
        'USER_CORRECTION',
        beforeSnapshot,
        { status: 'ACTIVE', restored: true },
        'User restored deprecated unit',
        'USER',
        true,
        { action: 'RESTORE' }
      );

      logger.info({ userId, unitId }, 'Deprecated unit restored');
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to restore deprecated unit');
      throw error;
    }
  }

  /**
   * Resolve a contradiction
   */
  async resolveContradiction(
    userId: string,
    contradictionId: string,
    resolutionAction:
      | 'MARK_CONTEXTUAL'
      | 'DEPRECATE_UNIT_A'
      | 'DEPRECATE_UNIT_B'
      | 'LOWER_CONFIDENCE'
      | 'IGNORE_CONTRADICTION',
    reason?: string
  ): Promise<void> {
    try {
      // Get contradiction before resolution
      const { data: contradiction, error: fetchError } = await supabaseAdmin
        .from('contradiction_reviews')
        .select('*')
        .eq('id', contradictionId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !contradiction) {
        throw new Error('Contradiction not found');
      }

      const beforeSnapshot = { ...contradiction };

      // Apply resolution action
      switch (resolutionAction) {
        case 'DEPRECATE_UNIT_A':
          await supabaseAdmin
            .from('extracted_units')
            .update({
              metadata: {
                deprecated: 'true',
                deprecated_reason: reason || 'Resolved contradiction',
              },
            })
            .eq('id', contradiction.unit_a_id);
          break;

        case 'DEPRECATE_UNIT_B':
          await supabaseAdmin
            .from('extracted_units')
            .update({
              metadata: {
                deprecated: 'true',
                deprecated_reason: reason || 'Resolved contradiction',
              },
            })
            .eq('id', contradiction.unit_b_id);
          break;

        case 'LOWER_CONFIDENCE':
          // Lower confidence of both units
          await supabaseAdmin.rpc('lower_unit_confidence', {
            unit_id: contradiction.unit_a_id,
            amount: 0.2,
          });
          await supabaseAdmin.rpc('lower_unit_confidence', {
            unit_id: contradiction.unit_b_id,
            amount: 0.2,
          });
          break;

        case 'MARK_CONTEXTUAL':
        case 'IGNORE_CONTRADICTION':
          // No action needed, just mark as resolved
          break;
      }

      // Update contradiction status
      const { error: updateError } = await supabaseAdmin
        .from('contradiction_reviews')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
          resolution_action: resolutionAction,
          metadata: {
            ...(contradiction.metadata || {}),
            resolution_reason: reason,
          },
        })
        .eq('id', contradictionId);

      if (updateError) {
        throw updateError;
      }

      // Record correction
      await this.recordCorrection(
        userId,
        'ENTITY', // Using ENTITY as target type for contradictions
        contradictionId,
        'USER_CORRECTION',
        beforeSnapshot,
        { status: 'RESOLVED', resolution_action: resolutionAction },
        reason || `Resolved contradiction: ${resolutionAction}`,
        'USER',
        true,
        { action: 'RESOLVE_CONTRADICTION', resolution_action: resolutionAction }
      );

      logger.info(
        { userId, contradictionId, resolutionAction },
        'Contradiction resolved'
      );
    } catch (error) {
      logger.error(
        { error, userId, contradictionId },
        'Failed to resolve contradiction'
      );
      throw error;
    }
  }

  /**
   * Manually correct a unit
   */
  async manuallyCorrectUnit(
    userId: string,
    unitId: string,
    correctedText: string,
    reason: string
  ): Promise<void> {
    try {
      // Get unit before correction
      const { data: unit, error: fetchError } = await supabaseAdmin
        .from('extracted_units')
        .select('*')
        .eq('id', unitId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !unit) {
        throw new Error('Unit not found');
      }

      const beforeSnapshot = { ...unit };

      // Update unit text
      const { error: updateError } = await supabaseAdmin
        .from('extracted_units')
        .update({
          content: correctedText,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(unit.metadata || {}),
            manually_corrected: true,
            correction_reason: reason,
            corrected_at: new Date().toISOString(),
          },
        })
        .eq('id', unitId);

      if (updateError) {
        throw updateError;
      }

      // Record correction
      await this.recordCorrection(
        userId,
        'UNIT',
        unitId,
        'USER_CORRECTION',
        beforeSnapshot,
        { content: correctedText, manually_corrected: true },
        reason,
        'USER',
        true,
        { action: 'MANUAL_CORRECTION' }
      );

      logger.info({ userId, unitId, reason }, 'Unit manually corrected');
    } catch (error) {
      logger.error({ error, userId, unitId }, 'Failed to manually correct unit');
      throw error;
    }
  }

  /**
   * Get corrections for a specific target (for chat context)
   */
  async getCorrectionsForTarget(
    userId: string,
    targetType: TargetType,
    targetId: string
  ): Promise<CorrectionRecord[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('correction_records')
        .select('*')
        .eq('user_id', userId)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      return (data || []).map(record => ({
        ...record,
        before_snapshot: record.before_snapshot || {},
        after_snapshot: record.after_snapshot || {},
        metadata: record.metadata || {},
      })) as CorrectionRecord[];
    } catch (error) {
      logger.error({ error, userId, targetType, targetId }, 'Failed to get corrections for target');
      return [];
    }
  }
}

export const correctionDashboardService = new CorrectionDashboardService();

