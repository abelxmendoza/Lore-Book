/**
 * Cross-user RLS isolation proof for life_arcs, against the real Supabase
 * project (not a mock). Skipped by default — opt in with
 * RUN_LIFE_ARCS_RLS_TEST=true, reusing SUPABASE_CONNECTION_STRING/
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY already in .env. Creates two
 * throwaway auth users, proves isolation by assuming their identity at the
 * Postgres session level (the same request.jwt.claims mechanism PostgREST
 * uses), then deletes both users in afterAll (cascades their rows away).
 *
 * This intentionally tests the database RLS policies directly rather than
 * going through arcService/the life-arc routes — those are under active
 * concurrent development, but the RLS policies on life_arcs/arc_event_links
 * are stable and are the actual last line of defense regardless of what the
 * application layer looks like.
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

describe.skipIf(!READY)('life_arcs cross-user RLS isolation (live Supabase project)', () => {
  let sql: ReturnType<typeof postgres>;
  let admin: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let arcId: string;
  let journalEntryBId: string;

  const suffix = randomUUID().slice(0, 8);
  const emailA = `rls-isolation-test-a-${suffix}@example.invalid`;
  const emailB = `rls-isolation-test-b-${suffix}@example.invalid`;

  async function asUser<T>(userId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      await tx.unsafe(
        `SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}'`
      );
      return fn(tx);
    });
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    const { data: a, error: aErr } = await admin.auth.admin.createUser({ email: emailA, email_confirm: true });
    if (aErr || !a.user) throw aErr ?? new Error('failed to create user A');
    userAId = a.user.id;

    const { data: b, error: bErr } = await admin.auth.admin.createUser({ email: emailB, email_confirm: true });
    if (bErr || !b.user) throw bErr ?? new Error('failed to create user B');
    userBId = b.user.id;

    const { data: arc, error: arcErr } = await admin
      .from('life_arcs')
      .insert({
        user_id: userAId,
        title: 'RLS isolation test arc',
        arc_type: 'life_era',
        source: 'user_created',
        confidence: 1,
      })
      .select('id')
      .single();
    if (arcErr || !arc) throw arcErr ?? new Error('failed to seed test arc');
    arcId = arc.id;

    // arc_event_links requires a resolved_event_id or journal_entry_id target
    // (arc_event_links_has_target check constraint) — give user B one of
    // their own so the insert attempt below fails on RLS, not on that
    // unrelated constraint.
    const { data: journalEntry, error: journalErr } = await admin
      .from('journal_entries')
      .insert({ user_id: userBId, content: 'RLS isolation test journal entry' })
      .select('id')
      .single();
    if (journalErr || !journalEntry) throw journalErr ?? new Error('failed to seed test journal entry');
    journalEntryBId = journalEntry.id;

    sql = postgres(CONNECTION_STRING!, { max: 1, connect_timeout: 10 });
  });

  afterAll(async () => {
    await sql?.end();
    // journal_entries has no ON DELETE CASCADE from auth.users — clean it up
    // explicitly, or deleting the users below leaves an orphaned row behind.
    if (journalEntryBId) await admin.from('journal_entries').delete().eq('id', journalEntryBId);
    // life_arcs/arc_event_links DO cascade via FK ON DELETE CASCADE.
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it('sanity check: the RLS role-assumption mechanism actually restricts the session (unrelated table)', async () => {
    // If this fails, request.jwt.claims isn't taking effect at all, and every
    // other test in this file would pass for the wrong reason (a broken
    // session looks identical to a correctly-RLS'd empty result).
    const asAnon = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE anon`);
      return tx.unsafe(`SELECT id FROM life_arcs WHERE id = '${arcId}'`);
    });
    expect(asAnon).toHaveLength(0);
  });

  it('user A can read their own arc', async () => {
    const rows = await asUser(userAId, (tx) => tx.unsafe(`SELECT id FROM life_arcs WHERE id = '${arcId}'`));
    expect(rows).toHaveLength(1);
  });

  it('user B cannot read user A\'s arc', async () => {
    const rows = await asUser(userBId, (tx) => tx.unsafe(`SELECT id FROM life_arcs WHERE id = '${arcId}'`));
    expect(rows).toHaveLength(0);
  });

  it('user B cannot list user A\'s arcs by scanning', async () => {
    const rows = await asUser(userBId, (tx) => tx.unsafe(`SELECT id FROM life_arcs WHERE user_id = '${userAId}'`));
    expect(rows).toHaveLength(0);
  });

  it('user B cannot update user A\'s arc', async () => {
    const rows = await asUser(userBId, (tx) =>
      tx.unsafe(`UPDATE life_arcs SET title = 'hijacked' WHERE id = '${arcId}' RETURNING id`)
    );
    expect(rows).toHaveLength(0);

    const check = await admin.from('life_arcs').select('title').eq('id', arcId).single();
    expect(check.data?.title).toBe('RLS isolation test arc');
  });

  it('user B cannot delete user A\'s arc', async () => {
    const rows = await asUser(userBId, (tx) => tx.unsafe(`DELETE FROM life_arcs WHERE id = '${arcId}' RETURNING id`));
    expect(rows).toHaveLength(0);

    const check = await admin.from('life_arcs').select('id').eq('id', arcId).maybeSingle();
    expect(check.data).not.toBeNull();
  });

  // KNOWN GAP — see report: arc_event_links_insert's WITH CHECK only verifies
  // (auth.uid() = user_id) on the link row itself; it never verifies that the
  // referenced arc_id actually belongs to that same user. This test documents
  // the gap rather than papering over it — it currently FAILS, proving cross-
  // tenant link insertion is possible today.
  it('user B cannot attach an event link to user A\'s arc', async () => {
    const rows = await asUser(userBId, (tx) =>
      tx.unsafe(
        `INSERT INTO arc_event_links (user_id, arc_id, journal_entry_id, temporal_role)
         VALUES ('${userBId}', '${arcId}', '${journalEntryBId}', 'during') RETURNING id`
      )
    );
    expect(rows).toHaveLength(0);
  });
});
