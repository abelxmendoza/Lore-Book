// =====================================================
// MEMORY EVENT SERVICE — Durable Memory Architecture, Slice 1
//
// Append-only writer + reader for the `memory_events` source-of-truth log.
// `buildMemoryEventRow` is a pure function (validation/defaults/clamping) so the
// core logic is testable without a database. Writes are FAIL-OPEN: capturing an
// event must never break the chat / ingestion path it is observing.
// =====================================================

import { supabaseAdmin } from '../supabaseClient';

export const MEMORY_EVENT_KINDS = [
  'user_message',
  'assistant_message',
  'correction',
  'entity_extraction',
  'relationship_change',
  'file_upload',
  'inference',
  'fact_update',
  'retraction',
  'deletion',
] as const;

export type MemoryEventKind = (typeof MEMORY_EVENT_KINDS)[number];

export const MEMORY_EVENT_ACTORS = ['user', 'assistant', 'system'] as const;
export type MemoryEventActor = (typeof MEMORY_EVENT_ACTORS)[number];

export interface MemoryEventInput {
  userId: string;
  kind: MemoryEventKind;
  actor?: MemoryEventActor;
  sessionId?: string | null;
  sourceMessageId?: string | null;
  entityId?: string | null;
  extractionMethod?: string | null;
  /** 0..1; out-of-range or non-finite values are coerced to null. */
  confidence?: number | null;
  userConfirmed?: boolean;
  content?: string | null;
  payload?: Record<string, unknown> | null;
  /** A retraction/correction references the event it supersedes (older event is kept). */
  supersedesEventId?: string | null;
  /** When it actually happened; defaults to now(). */
  occurredAt?: string | Date | null;
}

/** Snake-cased row shape inserted into `memory_events`. */
export interface MemoryEventRow {
  user_id: string;
  kind: MemoryEventKind;
  actor: MemoryEventActor;
  session_id: string | null;
  source_message_id: string | null;
  entity_id: string | null;
  extraction_method: string | null;
  confidence: number | null;
  user_confirmed: boolean;
  content: string | null;
  payload: Record<string, unknown>;
  supersedes_event_id: string | null;
  occurred_at: string;
}

/** Minimal structural type for the supabase client we depend on (keeps tests trivial). */
export interface MemoryEventClient {
  from(table: string): {
    insert(rows: MemoryEventRow[]): Promise<{ data: unknown; error: unknown }>;
    select(columns?: string): MemoryEventQuery;
  };
}

interface MemoryEventQuery {
  eq(column: string, value: unknown): MemoryEventQuery;
  order(column: string, opts: { ascending: boolean }): MemoryEventQuery;
  limit(n: number): Promise<{ data: unknown; error: unknown }>;
}

const TABLE = 'memory_events';

/**
 * One-time kill switch: if the table doesn't exist yet (migration not applied),
 * disable capture after the first failure so we don't spam logs on every chat
 * turn. Re-enabled on process restart (which a migration/deploy entails).
 */
let captureDisabled = false;

/** @internal Test-only: reset the missing-table kill switch between cases. */
export function __resetMemoryEventCaptureForTests(): void {
  captureDisabled = false;
}

function isMissingRelationError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01') return true; // undefined_table
  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes('memory_events') &&
    (msg.includes('does not exist') || msg.includes('could not find the table') || msg.includes('schema cache'))
  );
}

/** If the error means the table isn't there yet, disable capture (logged once). */
function handleInsertError(error: unknown): void {
  if (isMissingRelationError(error)) {
    if (!captureDisabled) {
      captureDisabled = true;
      console.warn(
        '[memoryEvents] table not found — capture disabled until restart. Apply migration 20260624100000_memory_events.sql.'
      );
    }
    return;
  }
  console.warn('[memoryEvents] insert failed (fail-open):', error);
}

function clampConfidence(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function toIso(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return new Date().toISOString();
}

/**
 * Pure builder: validate + normalize a MemoryEventInput into an insertable row.
 * Throws only on structurally-invalid input (missing user, bad kind/actor) — the
 * kind of programming error we want surfaced in tests, not swallowed at runtime.
 */
export function buildMemoryEventRow(input: MemoryEventInput): MemoryEventRow {
  if (!input || typeof input.userId !== 'string' || !input.userId.trim()) {
    throw new Error('memoryEvent: userId is required');
  }
  if (!MEMORY_EVENT_KINDS.includes(input.kind)) {
    throw new Error(`memoryEvent: invalid kind "${String(input.kind)}"`);
  }
  const actor = input.actor ?? 'user';
  if (!MEMORY_EVENT_ACTORS.includes(actor)) {
    throw new Error(`memoryEvent: invalid actor "${String(actor)}"`);
  }

  return {
    user_id: input.userId,
    kind: input.kind,
    actor,
    session_id: input.sessionId ?? null,
    source_message_id: input.sourceMessageId ?? null,
    entity_id: input.entityId ?? null,
    extraction_method: input.extractionMethod ?? null,
    confidence: clampConfidence(input.confidence),
    user_confirmed: input.userConfirmed === true,
    content: input.content ?? null,
    payload: input.payload ?? {},
    supersedes_event_id: input.supersedesEventId ?? null,
    occurred_at: toIso(input.occurredAt),
  };
}

/**
 * Append one event. FAIL-OPEN: returns false and logs on any error so a logging
 * failure can never break the path being observed. Never throws.
 */
export async function appendMemoryEvent(
  input: MemoryEventInput,
  client: MemoryEventClient = supabaseAdmin as unknown as MemoryEventClient
): Promise<boolean> {
  if (captureDisabled) return false;
  let row: MemoryEventRow;
  try {
    row = buildMemoryEventRow(input);
  } catch (err) {
    console.warn('[memoryEvents] skipped malformed event:', err instanceof Error ? err.message : err);
    return false;
  }
  try {
    const { error } = await client.from(TABLE).insert([row]);
    if (error) {
      handleInsertError(error);
      return false;
    }
    return true;
  } catch (err) {
    handleInsertError(err);
    return false;
  }
}

/**
 * Append many events. FAIL-OPEN: malformed entries are skipped; a DB failure
 * returns 0. Never throws. Returns the count attempted to insert.
 */
export async function appendMemoryEvents(
  inputs: MemoryEventInput[],
  client: MemoryEventClient = supabaseAdmin as unknown as MemoryEventClient
): Promise<number> {
  const rows: MemoryEventRow[] = [];
  for (const input of inputs ?? []) {
    try {
      rows.push(buildMemoryEventRow(input));
    } catch (err) {
      console.warn('[memoryEvents] skipped malformed event:', err instanceof Error ? err.message : err);
    }
  }
  if (rows.length === 0 || captureDisabled) return 0;
  try {
    const { error } = await client.from(TABLE).insert(rows);
    if (error) {
      handleInsertError(error);
      return 0;
    }
    return rows.length;
  } catch (err) {
    handleInsertError(err);
    return 0;
  }
}

/** Read recent events for a user (consolidation / audit). Fail-open: returns [] on error. */
export async function getRecentMemoryEvents(
  userId: string,
  opts: { limit?: number; kind?: MemoryEventKind } = {},
  client: MemoryEventClient = supabaseAdmin as unknown as MemoryEventClient
): Promise<MemoryEventRow[]> {
  try {
    let query = client.from(TABLE).select('*').eq('user_id', userId);
    if (opts.kind) query = query.eq('kind', opts.kind);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(opts.limit ?? 100, 1000)));
    if (error) {
      console.warn('[memoryEvents] read failed (fail-open):', error);
      return [];
    }
    return (data as MemoryEventRow[] | null) ?? [];
  } catch (err) {
    console.warn('[memoryEvents] read threw (fail-open):', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Read events about a specific entity. Fail-open: returns [] on error. */
export async function getMemoryEventsForEntity(
  userId: string,
  entityId: string,
  opts: { limit?: number } = {},
  client: MemoryEventClient = supabaseAdmin as unknown as MemoryEventClient
): Promise<MemoryEventRow[]> {
  try {
    const { data, error } = await client
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(opts.limit ?? 100, 1000)));
    if (error) {
      console.warn('[memoryEvents] entity read failed (fail-open):', error);
      return [];
    }
    return (data as MemoryEventRow[] | null) ?? [];
  } catch (err) {
    console.warn('[memoryEvents] entity read threw (fail-open):', err instanceof Error ? err.message : err);
    return [];
  }
}
