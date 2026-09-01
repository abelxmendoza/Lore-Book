/**
 * Live-DB proof for the Saga (life_arcs.parent_id) / Narrative Anchor
 * (arc_event_links.metadata.narrative_role) model described in
 * arcNarrativeService.ts. Same opt-in pattern as lifeArcsIsolation.pg.test.ts
 * (RUN_LIFE_ARCS_RLS_TEST=true, real Supabase project, throwaway users
 * cleaned up in afterAll) — see that file for why this can't go through
 * arcNarrativeService itself (supabaseAdmin is unconditionally mocked under
 * Vitest, so these hit the tables directly to prove the real schema/RLS
 * behavior, independent of the service layer).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const RUN = process.env.RUN_LIFE_ARCS_RLS_TEST === 'true';
const CONNECTION_STRING = process.env.SUPABASE_CONNECTION_STRING || process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const READY = RUN && CONNECTION_STRING && SUPABASE_URL && SERVICE_ROLE_KEY;

describe.skipIf(!READY)('Saga (parent_id) / Narrative Anchor (arc_event_links) — live Supabase project', () => {
  let sql: ReturnType<typeof postgres>;
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let userCId: string; // "brand-new user" — receives no one else's saga data
  let sagaId: string;
  let careerArcId: string;
  let creativeArcId: string;
  let journalAId: string;

  const suffix = randomUUID().slice(0, 8);

  async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      await tx.unsafe(`SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}'`);
      return fn(tx);
    });
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    const mk = async (label: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `arc-narrative-test-${label}-${suffix}@example.invalid`,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error(`failed to create user ${label}`);
      return data.user.id;
    };
    userAId = await mk('a');
    userBId = await mk('b');
    userCId = await mk('c');

    // Saga: a root life_arcs row (parent_id IS NULL) — the existing hierarchy
    // mechanism, no new table.
    const { data: saga, error: sagaErr } = await admin
      .from('life_arcs')
      .insert({ user_id: userAId, title: 'Narrative test saga', arc_type: 'life_era', source: 'user_created', confidence: 1 })
      .select('id')
      .single();
    if (sagaErr || !saga) throw sagaErr ?? new Error('failed to seed saga');
    sagaId = saga.id;

    // Two member arcs, deliberately on different tracks, both pointing at the saga.
    const { data: careerArc, error: careerErr } = await admin
      .from('life_arcs')
      .insert({
        user_id: userAId,
        title: 'Narrative test career arc',
        arc_type: 'work',
        track: 'career',
        parent_id: sagaId,
        source: 'user_created',
        confidence: 1,
      })
      .select('id')
      .single();
    if (careerErr || !careerArc) throw careerErr ?? new Error('failed to seed career arc');
    careerArcId = careerArc.id;

    const { data: creativeArc, error: creativeErr } = await admin
      .from('life_arcs')
      .insert({
        user_id: userAId,
        title: 'Narrative test creative arc',
        arc_type: 'skill',
        track: 'creative',
        parent_id: sagaId,
        source: 'user_created',
        confidence: 1,
      })
      .select('id')
      .single();
    if (creativeErr || !creativeArc) throw creativeErr ?? new Error('failed to seed creative arc');
    creativeArcId = creativeArc.id;

    const { data: journal, error: journalErr } = await admin
      .from('journal_entries')
      .insert({ user_id: userAId, content: 'Narrative anchor test journal entry' })
      .select('id')
      .single();
    if (journalErr || !journal) throw journalErr ?? new Error('failed to seed journal entry');
    journalAId = journal.id;

    sql = postgres(CONNECTION_STRING!, { max: 1, connect_timeout: 10 });
  });

  afterAll(async () => {
    await sql?.end();
    // journal_entries has no ON DELETE CASCADE from auth.users (see
    // lifeArcsIsolation.pg.test.ts) — clean it up explicitly.
    if (journalAId) await admin.from('journal_entries').delete().eq('id', journalAId);
    for (const id of [userAId, userBId, userCId]) {
      if (id) await admin.auth.admin.deleteUser(id); // cascades life_arcs + arc_event_links
    }
  });

  it('a saga contains arcs spanning multiple tracks', async () => {
    const rows = await asUser(userAId, (tx) =>
      tx.unsafe(`SELECT id, track FROM life_arcs WHERE parent_id = '${sagaId}' ORDER BY track`)
    );
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual([careerArcId, creativeArcId].sort());
    expect(new Set(rows.map((r: { track: string }) => r.track))).toEqual(new Set(['career', 'creative']));
  });

  it('another user cannot retrieve saga membership', async () => {
    const rows = await asUser(userBId, (tx) => tx.unsafe(`SELECT id FROM life_arcs WHERE parent_id = '${sagaId}'`));
    expect(rows).toHaveLength(0);
  });

  it('a brand-new user receives no saga/arc data at all', async () => {
    const rows = await asUser(userCId, (tx) => tx.unsafe(`SELECT id FROM life_arcs`));
    expect(rows).toHaveLength(0);
  });

  it('the same event can hold different narrative roles in different arcs', async () => {
    const { data: linkOrigin, error: e1 } = await admin
      .from('arc_event_links')
      .insert({
        user_id: userAId,
        arc_id: careerArcId,
        journal_entry_id: journalAId,
        temporal_role: 'during',
        metadata: { narrative_role: 'origin' },
      })
      .select('id')
      .single();
    if (e1 || !linkOrigin) throw e1 ?? new Error('failed to insert origin link');

    const { data: linkEnding, error: e2 } = await admin
      .from('arc_event_links')
      .insert({
        user_id: userAId,
        arc_id: creativeArcId,
        journal_entry_id: journalAId,
        temporal_role: 'during',
        metadata: { narrative_role: 'ending' },
      })
      .select('id')
      .single();
    if (e2 || !linkEnding) throw e2 ?? new Error('failed to insert ending link');

    const rows = await asUser(userAId, (tx) =>
      tx.unsafe(
        `SELECT arc_id, metadata->>'narrative_role' AS role FROM arc_event_links WHERE journal_entry_id = '${journalAId}' ORDER BY arc_id`
      )
    );
    const roleByArc = new Map(rows.map((r: { arc_id: string; role: string }) => [r.arc_id, r.role]));
    expect(roleByArc.get(careerArcId)).toBe('origin');
    expect(roleByArc.get(creativeArcId)).toBe('ending');

    // Unlink one anchor — the underlying journal entry must survive.
    const { error: delErr } = await admin.from('arc_event_links').delete().eq('id', linkOrigin.id);
    if (delErr) throw delErr;

    const remaining = await asUser(userAId, (tx) =>
      tx.unsafe(`SELECT id FROM arc_event_links WHERE journal_entry_id = '${journalAId}'`)
    );
    expect(remaining).toHaveLength(1); // the 'ending' link only

    const journalStillExists = await admin.from('journal_entries').select('id').eq('id', journalAId).maybeSingle();
    expect(journalStillExists.data).not.toBeNull();

    // Clean up the remaining link explicitly (not FK-cascaded from the users
    // deleted in afterAll's loop order — belt-and-suspenders, cheap either way).
    await admin.from('arc_event_links').delete().eq('id', linkEnding.id);
  });
});
