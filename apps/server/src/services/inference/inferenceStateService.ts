/**
 * Persists orchestrator throttle state. Falls back to in-memory when the table
 * is not migrated yet.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { InferenceSyncReport, UserInferenceState } from './inferenceTypes';

const memory = new Map<string, UserInferenceState>();
let tableMissing = false;

function emptyState(userId: string): UserInferenceState {
  return {
    user_id: userId,
    last_chat_at: null,
    last_t1_run_at: null,
    last_t2_run_at: null,
    pending_reasons: [],
    domain_timestamps: {},
    last_report: null,
    updated_at: new Date().toISOString(),
  };
}

function isMissingTableError(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist|Could not find the table/i.test(message);
}

export async function getInferenceState(userId: string): Promise<UserInferenceState> {
  if (tableMissing) return memory.get(userId) ?? emptyState(userId);

  const { data, error } = await supabaseAdmin
    .from('user_inference_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) {
      tableMissing = true;
      logger.warn('user_inference_state table missing — using in-memory throttle');
      return memory.get(userId) ?? emptyState(userId);
    }
    throw error;
  }

  if (!data) return emptyState(userId);

  return {
    user_id: data.user_id,
    last_chat_at: data.last_chat_at,
    last_t1_run_at: data.last_t1_run_at,
    last_t2_run_at: data.last_t2_run_at,
    pending_reasons: Array.isArray(data.pending_reasons) ? data.pending_reasons : [],
    domain_timestamps: (data.domain_timestamps ?? {}) as UserInferenceState['domain_timestamps'],
    last_report: (data.last_report as InferenceSyncReport | null) ?? null,
    updated_at: data.updated_at,
  };
}

export async function saveInferenceState(userId: string, patch: Partial<UserInferenceState>): Promise<void> {
  const current = await getInferenceState(userId);
  const next: UserInferenceState = {
    ...current,
    ...patch,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (tableMissing) {
    memory.set(userId, next);
    return;
  }

  const { error } = await supabaseAdmin.from('user_inference_state').upsert({
    user_id: userId,
    last_chat_at: next.last_chat_at,
    last_t1_run_at: next.last_t1_run_at,
    last_t2_run_at: next.last_t2_run_at,
    pending_reasons: next.pending_reasons,
    domain_timestamps: next.domain_timestamps,
    last_report: next.last_report,
    updated_at: next.updated_at,
  });

  if (error && isMissingTableError(error.message)) {
    tableMissing = true;
    memory.set(userId, next);
    return;
  }
  if (error) throw error;
}

export async function noteInferenceActivity(userId: string, reason: string): Promise<void> {
  const state = await getInferenceState(userId);
  const reasons = new Set(state.pending_reasons);
  reasons.add(reason);
  await saveInferenceState(userId, {
    last_chat_at: reason === 'chat_message' ? new Date().toISOString() : state.last_chat_at,
    pending_reasons: [...reasons],
  });
}

export async function clearPendingReasons(userId: string): Promise<void> {
  await saveInferenceState(userId, { pending_reasons: [] });
}
