// =====================================================
// PIPELINE RUN SERVICE
//
// Records every ingestion pipeline execution in pipeline_runs.
// Enables partial-ingestion detection, reconciliation sweeps,
// and operational health monitoring.
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface StepResult {
  step: string;
  success: boolean;
  duration_ms: number;
  error?: string;
}

class PipelineRunService {
  /**
   * Open a new pipeline run record. Call at the START of pipeline execution.
   * Returns the run ID to pass to subsequent calls.
   */
  async start(params: {
    jobId: string;
    userId: string;
    chatMessageId?: string;
    sessionId?: string;
  }): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('pipeline_runs')
      .insert({
        job_id:          params.jobId,
        user_id:         params.userId,
        chat_message_id: params.chatMessageId ?? null,
        session_id:      params.sessionId ?? null,
        status:          'running',
      })
      .select('id')
      .single();

    if (error) {
      logger.warn({ error, jobId: params.jobId }, 'PipelineRunService: start failed');
      return null;
    }

    return data.id as string;
  }

  /**
   * Append a completed step result. Call after each of the 12 pipeline steps.
   * Non-blocking: errors are logged but not thrown.
   */
  async recordStep(runId: string, result: StepResult): Promise<void> {
    // Use jsonb_array_append via raw SQL to atomically push to the array
    const { error } = await supabaseAdmin.rpc('pipeline_run_append_step', {
      p_run_id:     runId,
      p_step:       result.step,
      p_success:    result.success,
      p_duration_ms: result.duration_ms,
      p_error:      result.error ?? null,
    });

    if (error) {
      // Fallback: fetch-increment-write (less efficient but works without the RPC)
      await this.recordStepFallback(runId, result);
    }
  }

  private async recordStepFallback(runId: string, result: StepResult): Promise<void> {
    const { data: current } = await supabaseAdmin
      .from('pipeline_runs')
      .select('step_results, completed_steps')
      .eq('id', runId)
      .single();

    if (!current) return;

    const steps: StepResult[] = (current.step_results as StepResult[]) ?? [];
    steps.push(result);

    await supabaseAdmin
      .from('pipeline_runs')
      .update({
        step_results:    steps,
        completed_steps: steps.length,
      })
      .eq('id', runId);
  }

  /**
   * Mark a pipeline run as successfully completed.
   */
  async complete(runId: string, startedAt: number): Promise<void> {
    const durationMs = Date.now() - startedAt;
    const { error } = await supabaseAdmin
      .from('pipeline_runs')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        duration_ms:  durationMs,
      })
      .eq('id', runId);

    if (error) {
      logger.warn({ error, runId }, 'PipelineRunService: complete update failed');
    }
  }

  /**
   * Mark a pipeline run as failed (all retries exhausted or unrecoverable error).
   */
  async fail(
    runId: string,
    startedAt: number,
    error: unknown,
    failedAtStep?: string
  ): Promise<void> {
    const durationMs = Date.now() - startedAt;
    const { error: dbError } = await supabaseAdmin
      .from('pipeline_runs')
      .update({
        status:        'failed',
        completed_at:  new Date().toISOString(),
        duration_ms:   durationMs,
        error:         String(error),
        failed_at_step: failedAtStep ?? null,
      })
      .eq('id', runId);

    if (dbError) {
      logger.warn({ dbError, runId }, 'PipelineRunService: fail update failed');
    }
  }

  /**
   * Mark a run as partial (some steps succeeded, some failed — run did not fully complete).
   */
  async markPartial(runId: string, startedAt: number, failedAtStep: string): Promise<void> {
    const durationMs = Date.now() - startedAt;
    await supabaseAdmin
      .from('pipeline_runs')
      .update({
        status:        'partial',
        completed_at:  new Date().toISOString(),
        duration_ms:   durationMs,
        failed_at_step: failedAtStep,
      })
      .eq('id', runId);
  }

  /**
   * Reconciliation sweep: find all incomplete runs older than 5 minutes.
   * These represent jobs that started but never finished (process crash, etc.)
   */
  async findIncomplete(userId?: string): Promise<Array<{
    id: string;
    jobId: string;
    chatMessageId: string | null;
    sessionId: string | null;
    status: string;
    startedAt: string;
    completedSteps: number;
    failedAtStep: string | null;
  }>> {
    let query = supabaseAdmin
      .from('pipeline_runs_incomplete')
      .select('*');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      logger.warn({ error }, 'PipelineRunService: findIncomplete query failed');
      return [];
    }

    return (data ?? []).map((r: any) => ({
      id:             r.id,
      jobId:          r.job_id,
      chatMessageId:  r.chat_message_id,
      sessionId:      r.session_id,
      status:         r.status,
      startedAt:      r.started_at,
      completedSteps: r.completed_steps,
      failedAtStep:   r.failed_at_step,
    }));
  }
}

export const pipelineRunService = new PipelineRunService();
