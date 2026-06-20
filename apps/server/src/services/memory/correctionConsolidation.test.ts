import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabaseAdmin: {} }));

import {
  claimMatchScore,
  planCorrectionConsolidation,
  applyClaimLifecycle,
  consolidateCorrections,
  CORRECTION_CONFIDENCE_FLOOR,
  type CandidateClaim,
  type ApplyClient,
} from './correctionConsolidation';
import { __resetSchemaCapabilityCache } from './schemaCapability';
import type { MemoryEventRow } from './memoryEventService';

beforeEach(() => __resetSchemaCapabilityCache());

const claim = (over: Partial<CandidateClaim>): CandidateClaim => ({
  id: 'c1',
  text: 'Her name is Maria',
  lifecycle_state: 'active',
  ...over,
});

// ── claimMatchScore ──────────────────────────────────────────────────────────
describe('claimMatchScore', () => {
  it('scores shared meaningful terms (case-insensitive, stopwords ignored)', () => {
    expect(claimMatchScore('Actually her name is Maya not Maria', claim({ text: 'name Maria' }))).toBe(1);
    expect(claimMatchScore('completely unrelated text', claim({ text: 'Maria' }))).toBe(0);
  });

  it('is robust to empty/blank/null input', () => {
    expect(claimMatchScore('', claim({ text: 'Maria' }))).toBe(0);
    expect(claimMatchScore('Maria', claim({ text: '' }))).toBe(0);
    expect(claimMatchScore(null, claim({ text: 'Maria' }))).toBe(0);
  });
});

// ── planCorrectionConsolidation ──────────────────────────────────────────────
describe('planCorrectionConsolidation', () => {
  it('transitions the best-matching active claim to corrected', () => {
    const plans = planCorrectionConsolidation('Actually her name is Maya not Maria', [
      claim({ id: 'c1', text: 'Maria name' }),
      claim({ id: 'c2', text: 'lives in Denver' }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ claimId: 'c1', fromState: 'active', toState: 'corrected', action: 'correct' });
  });

  it('returns at most one claim (a correction fixes one thing)', () => {
    const plans = planCorrectionConsolidation('Maria Maria Maria', [
      claim({ id: 'c1', text: 'Maria' }),
      claim({ id: 'c2', text: 'Maria' }),
    ]);
    expect(plans).toHaveLength(1);
  });

  it('skips terminal claims (retracted/corrected never resurrect)', () => {
    expect(
      planCorrectionConsolidation('Maria', [claim({ text: 'Maria', lifecycle_state: 'retracted' })])
    ).toEqual([]);
    expect(
      planCorrectionConsolidation('Maria', [claim({ text: 'Maria', lifecycle_state: 'corrected' })])
    ).toEqual([]);
  });

  it('derives state from is_active when lifecycle_state is absent (pre-migration rows)', () => {
    const plans = planCorrectionConsolidation('Maria name', [
      { id: 'c1', text: 'Maria name', is_active: true },
    ]);
    expect(plans[0]).toMatchObject({ fromState: 'active', toState: 'corrected' });
  });

  it('does nothing for low-confidence corrections (below the floor)', () => {
    expect(
      planCorrectionConsolidation('Maria', [claim({ text: 'Maria' })], {
        correctionConfidence: CORRECTION_CONFIDENCE_FLOOR - 0.05,
      })
    ).toEqual([]);
  });

  it('does nothing for weak matches (below the match threshold)', () => {
    expect(
      planCorrectionConsolidation('Maya', [claim({ text: 'a totally different long claim about Denver' })])
    ).toEqual([]);
  });

  it('handles empty candidate list', () => {
    expect(planCorrectionConsolidation('Maria', [])).toEqual([]);
  });
});

// ── applyClaimLifecycle (guarded + fail-open) ────────────────────────────────
function applyClient(opts: { capable: boolean; updateError?: unknown }) {
  const limit = vi.fn(async () => ({ error: opts.capable ? null : { code: '42703' } }));
  const eq = vi.fn(async () => ({ error: opts.updateError ?? null }));
  const update = vi.fn((_values: Record<string, unknown>) => ({ eq }));
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select, update }));
  return { client: { from } as unknown as ApplyClient, update, eq };
}

describe('applyClaimLifecycle', () => {
  it('updates the claim when the column exists (non-active supersedes)', async () => {
    const { client, update, eq } = applyClient({ capable: true });
    await expect(applyClaimLifecycle('c1', 'corrected', { client })).resolves.toBe(true);
    const values = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(values).toMatchObject({ lifecycle_state: 'corrected', is_active: false });
    expect(values.end_time).toBeDefined();
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('sets last_confirmed_at when transitioning to active', async () => {
    const { client, update } = applyClient({ capable: true });
    await applyClaimLifecycle('c1', 'active', { client });
    const values = update.mock.calls[0]![0] as Record<string, unknown>;
    expect(values).toMatchObject({ lifecycle_state: 'active' });
    expect(values.last_confirmed_at).toBeDefined();
    expect(values.is_active).toBeUndefined();
  });

  it('no-ops (false) when the column does not exist yet — safe pre-migration', async () => {
    const { client, update } = applyClient({ capable: false });
    await expect(applyClaimLifecycle('c1', 'corrected', { client })).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('returns false (no throw) when the update errors', async () => {
    const { client } = applyClient({ capable: true, updateError: { message: 'boom' } });
    await expect(applyClaimLifecycle('c1', 'corrected', { client })).resolves.toBe(false);
  });
});

// ── consolidateCorrections (orchestrator, fail-open) ─────────────────────────
const correctionEvent = (over: Partial<MemoryEventRow>): MemoryEventRow =>
  ({
    user_id: 'u1',
    kind: 'correction',
    actor: 'user',
    session_id: null,
    source_message_id: 'm1',
    entity_id: null,
    extraction_method: 'heuristic',
    confidence: 0.85,
    user_confirmed: true,
    content: 'Actually her name is Maya not Maria',
    payload: {},
    supersedes_event_id: null,
    occurred_at: new Date().toISOString(),
    ...over,
  }) as MemoryEventRow;

describe('consolidateCorrections', () => {
  it('transitions matched claims and reports a summary', async () => {
    const { client } = applyClient({ capable: true });
    const summary = await consolidateCorrections({
      corrections: [correctionEvent({})],
      loadCandidateClaims: async () => [claim({ id: 'c1', text: 'Maria name' })],
      client,
    });
    expect(summary).toEqual({ correctionsProcessed: 1, claimsTransitioned: 1, skipped: 0 });
  });

  it('skips corrections with no matching claim', async () => {
    const { client } = applyClient({ capable: true });
    const summary = await consolidateCorrections({
      corrections: [correctionEvent({})],
      loadCandidateClaims: async () => [claim({ id: 'c1', text: 'unrelated Denver weather' })],
      client,
    });
    expect(summary).toMatchObject({ correctionsProcessed: 1, claimsTransitioned: 0, skipped: 1 });
  });

  it('is fail-open when loadCandidateClaims throws (one bad correction does not abort the batch)', async () => {
    const { client } = applyClient({ capable: true });
    const summary = await consolidateCorrections({
      corrections: [
        correctionEvent({ content: 'first will throw' }),
        correctionEvent({ content: 'Actually her name is Maya not Maria' }),
      ],
      loadCandidateClaims: async (c) => {
        if (c.content === 'first will throw') throw new Error('db down');
        return [claim({ id: 'c1', text: 'Maria name' })];
      },
      client,
    });
    expect(summary.correctionsProcessed).toBe(2);
    expect(summary.claimsTransitioned).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it('counts an apply failure as skipped (capability off)', async () => {
    const { client } = applyClient({ capable: false });
    const summary = await consolidateCorrections({
      corrections: [correctionEvent({})],
      loadCandidateClaims: async () => [claim({ id: 'c1', text: 'Maria name' })],
      client,
    });
    expect(summary).toMatchObject({ claimsTransitioned: 0, skipped: 1 });
  });

  it('handles an empty batch', async () => {
    const { client } = applyClient({ capable: true });
    await expect(
      consolidateCorrections({ corrections: [], loadCandidateClaims: async () => [], client })
    ).resolves.toEqual({ correctionsProcessed: 0, claimsTransitioned: 0, skipped: 0 });
  });
});
