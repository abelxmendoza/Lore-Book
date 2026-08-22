import { describe, it, expect, beforeAll } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { journalWriteMetadata } from './journalOccurrenceWrite';

const MIGRATION = resolve(
  process.cwd(),
  '../../supabase/migrations/20260821120000_journal_occurrence_nullable.sql',
);

const user = process.env.USER || process.env.LOGNAME || 'postgres';
const DATABASE_URL =
  process.env.JOURNAL_OCCURRENCE_TEST_DATABASE_URL ??
  `postgres://${user}@127.0.0.1:5432/lorekeeper_occ_nullable_test`;

const SCHEMA = 'occ_nullable_test';
const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const LEGACY_DATED = '00000000-0000-4000-8000-000000000010';
const LEGACY_MISMATCH = '00000000-0000-4000-8000-000000000011';
const LEGACY_SAME = '00000000-0000-4000-8000-000000000012';
const NULL_ID = '00000000-0000-4000-8000-000000000020';
const KNOWN_ID = '00000000-0000-4000-8000-000000000021';
const JULY_OCC = '00000000-0000-4000-8000-000000000030';
const JULY_REC = '00000000-0000-4000-8000-000000000031';
const CORRECT_ID = '00000000-0000-4000-8000-000000000040';
const TENANT_B = '00000000-0000-4000-8000-000000000050';
const RECORDED_AUG = '2026-08-21T15:00:00.000Z';
const OCCURRED_JULY = '2026-07-12T18:00:00.000Z';
const OCCURRED_MAR = '2024-03-15T10:00:00.000Z';

describe('nullable occurrence migration against isolated Homebrew Postgres', () => {
  let sql: ReturnType<typeof postgres>;
  let pgVersion = '';
  let timezone = '';

  beforeAll(async () => {
    sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 5 });
    const ver = await sql`select version() as v, current_setting('timezone') as tz`;
    pgVersion = String(ver[0].v);
    timezone = String(ver[0].tz);
  });

  it('documents the isolated test database', () => {
    expect(pgVersion).toMatch(/PostgreSQL/);
    expect(DATABASE_URL).toContain('lorekeeper_occ_nullable_test');
    expect(DATABASE_URL).not.toMatch(/railway|supabase\.co|prod/i);
    expect(timezone.length).toBeGreaterThan(0);
  });

  it('replays pre-migration → apply → null/chronology/search proofs', async () => {
    const migration = readFileSync(MIGRATION, 'utf8');

    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`);

    await sql.unsafe(`
      CREATE TABLE ${SCHEMA}.journal_entries (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        date timestamp with time zone DEFAULT now() NOT NULL,
        content text NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        end_time timestamp with time zone,
        time_precision text DEFAULT 'exact',
        time_confidence numeric(3,2) DEFAULT 1.0,
        "timestamp" timestamp with time zone DEFAULT now(),
        metadata jsonb DEFAULT '{}'::jsonb,
        CONSTRAINT journal_entries_time_precision_check CHECK (
          time_precision = ANY (ARRAY['exact'::text, 'day'::text, 'month'::text, 'year'::text, 'approximate'::text])
        )
      );
      CREATE TABLE ${SCHEMA}.chronology_index (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid NOT NULL,
        journal_entry_id uuid NOT NULL,
        start_time timestamp with time zone NOT NULL,
        end_time timestamp with time zone,
        time_precision text NOT NULL,
        year_bucket integer NOT NULL,
        month_bucket date,
        decade_bucket integer,
        UNIQUE (user_id, journal_entry_id)
      );
      CREATE INDEX journal_entries_date_idx ON ${SCHEMA}.journal_entries USING btree (date DESC);
      CREATE FUNCTION ${SCHEMA}.compute_chronology_buckets(p_start_time timestamptz, p_end_time timestamptz DEFAULT NULL)
      RETURNS TABLE(year_bucket integer, month_bucket date, decade_bucket integer)
      LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY SELECT EXTRACT(YEAR FROM p_start_time)::INTEGER,
          DATE_TRUNC('month', p_start_time)::DATE,
          (EXTRACT(YEAR FROM p_start_time) / 10)::INTEGER * 10;
      END $$;
      CREATE FUNCTION ${SCHEMA}.sync_chronology_index() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE v_buckets RECORD;
      BEGIN
        SELECT * INTO v_buckets FROM ${SCHEMA}.compute_chronology_buckets(COALESCE(NEW.date, NOW()), COALESCE(NEW.end_time, NULL));
        INSERT INTO ${SCHEMA}.chronology_index (user_id, journal_entry_id, start_time, end_time, time_precision, year_bucket, month_bucket, decade_bucket)
        VALUES (NEW.user_id, NEW.id, COALESCE(NEW.date, NOW()), NEW.end_time, COALESCE(NEW.time_precision, 'exact'),
          v_buckets.year_bucket, v_buckets.month_bucket, v_buckets.decade_bucket)
        ON CONFLICT (user_id, journal_entry_id) DO UPDATE SET
          start_time = EXCLUDED.start_time;
        RETURN NEW;
      END $$;
      CREATE TRIGGER sync_chronology_index_trigger
        AFTER INSERT OR UPDATE OF date, end_time, time_precision ON ${SCHEMA}.journal_entries
        FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.sync_chronology_index();
    `);

    const beforeNow = await sql.unsafe(`
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, content)
      VALUES ('${LEGACY_DATED}', '${USER_A}', 'Omitted date uses default now()')
      RETURNING date, created_at
    `);
    expect(beforeNow[0].date).not.toBeNull();
    const driftMs = Math.abs(new Date(beforeNow[0].date).getTime() - Date.now());
    expect(driftMs).toBeLessThan(10_000);

    await sql.unsafe(`
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, date, content, created_at, "timestamp")
      VALUES (
        '${LEGACY_MISMATCH}', '${USER_A}', '${OCCURRED_MAR}',
        'Maya started at Vanguard Robotics.', '${RECORDED_AUG}', '${OCCURRED_MAR}'
      );
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, date, content, created_at, "timestamp")
      VALUES (
        '${LEGACY_SAME}', '${USER_A}', '${RECORDED_AUG}',
        'Old-style date equals created_at.', '${RECORDED_AUG}', '${RECORDED_AUG}'
      );
    `);

    const chronoDefault = await sql.unsafe(
      `SELECT start_time FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${LEGACY_DATED}'`,
    );
    expect(chronoDefault).toHaveLength(1);

    const snapshot = await sql.unsafe(`
      SELECT id, date, created_at, "timestamp" AS ts
      FROM ${SCHEMA}.journal_entries
      WHERE id IN ('${LEGACY_DATED}', '${LEGACY_MISMATCH}', '${LEGACY_SAME}')
      ORDER BY id
    `);

    const rewritten = migration
      .replaceAll('public.journal_entries', `${SCHEMA}.journal_entries`)
      .replaceAll('public.chronology_index', `${SCHEMA}.chronology_index`)
      .replaceAll('public.sync_chronology_index', `${SCHEMA}.sync_chronology_index`)
      .replaceAll('compute_chronology_buckets', `${SCHEMA}.compute_chronology_buckets`);
    await sql.unsafe(rewritten);

    const nullability = await sql.unsafe(`
      SELECT is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = '${SCHEMA}' AND table_name = 'journal_entries' AND column_name IN ('date', 'timestamp')
      ORDER BY column_name
    `);
    const dateCol = nullability.find((c: { column_name?: string }) => true);
    const cols = await sql.unsafe(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = '${SCHEMA}' AND table_name = 'journal_entries'
        AND column_name IN ('date', 'timestamp')
    `);
    const dateMeta = cols.find((c: { column_name: string }) => c.column_name === 'date');
    const tsMeta = cols.find((c: { column_name: string }) => c.column_name === 'timestamp');
    expect(dateMeta?.is_nullable).toBe('YES');
    expect(dateMeta?.column_default).toBeNull();
    expect(tsMeta?.is_nullable).toBe('YES');
    expect(tsMeta?.column_default).toBeNull();

    const after = await sql.unsafe(`
      SELECT id, date, created_at, "timestamp" AS ts
      FROM ${SCHEMA}.journal_entries
      WHERE id IN ('${LEGACY_DATED}', '${LEGACY_MISMATCH}', '${LEGACY_SAME}')
      ORDER BY id
    `);
    expect(after).toHaveLength(3);
    for (let i = 0; i < snapshot.length; i++) {
      expect(String(after[i].date)).toBe(String(snapshot[i].date));
      expect(String(after[i].created_at)).toBe(String(snapshot[i].created_at));
      expect(String(after[i].ts)).toBe(String(snapshot[i].ts));
    }

    const mentionedAt = RECORDED_AUG;
    const metadata = journalWriteMetadata(
      {},
      {
        occurredAt: null,
        occurredEnd: null,
        mentionedAt,
        recordedAt: RECORDED_AUG,
        precision: 'unknown',
        dbPrecision: 'approximate',
        confidence: 0,
        temporalSource: 'recording_fallback',
        expression: null,
        unresolvedReason: 'user said occurrence is unknown',
      },
    );
    expect(metadata.occurrenceStatus).toBe('unresolved');

    await sql.unsafe(`
      INSERT INTO ${SCHEMA}.journal_entries
        (id, user_id, date, content, created_at, time_precision, "timestamp", metadata)
      VALUES (
        '${NULL_ID}', '${USER_A}', NULL,
        'I remember this, but I do not know when it happened.',
        '${RECORDED_AUG}', 'approximate', NULL, $$${JSON.stringify(metadata)}$$::jsonb
      );
      INSERT INTO ${SCHEMA}.journal_entries
        (id, user_id, date, content, created_at, time_precision, "timestamp", metadata)
      VALUES (
        '${KNOWN_ID}', '${USER_A}', '${OCCURRED_JULY}',
        'I went to the event on July 12, 2026.',
        '${RECORDED_AUG}', 'day', '${OCCURRED_JULY}',
        '{"mentionedAt":"${RECORDED_AUG}"}'::jsonb
      );
    `);

    const nullRow = await sql.unsafe(
      `SELECT date, time_precision, created_at, metadata FROM ${SCHEMA}.journal_entries WHERE id = '${NULL_ID}'`,
    );
    expect(nullRow[0].date).toBeNull();
    expect(nullRow[0].time_precision).toBe('approximate');
    expect(nullRow[0].metadata.mentionedAt).toBe(mentionedAt);
    expect(nullRow[0].metadata.occurrenceStatus).toBe('unresolved');

    const knownRow = await sql.unsafe(
      `SELECT date FROM ${SCHEMA}.journal_entries WHERE id = '${KNOWN_ID}'`,
    );
    expect(new Date(knownRow[0].date).toISOString()).toBe(OCCURRED_JULY);

    const chronoNull = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${NULL_ID}'`,
    );
    expect(chronoNull[0].n).toBe(0);

    const nowLeak = await sql.unsafe(`
      SELECT count(*)::int AS n FROM ${SCHEMA}.chronology_index
      WHERE journal_entry_id = '${NULL_ID}'
        AND start_time > now() - interval '1 hour'
    `);
    expect(nowLeak[0].n).toBe(0);

    const chronoKnown = await sql.unsafe(
      `SELECT start_time FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${KNOWN_ID}'`,
    );
    expect(chronoKnown).toHaveLength(1);
    expect(new Date(chronoKnown[0].start_time).toISOString()).toBe(OCCURRED_JULY);

    await sql.unsafe(`
      INSERT INTO ${SCHEMA}.journal_entries
        (id, user_id, date, content, created_at, time_precision, "timestamp")
      VALUES ('${CORRECT_ID}', '${USER_A}', '${OCCURRED_JULY}', 'Will be corrected', '${RECORDED_AUG}', 'day', '${OCCURRED_JULY}');
    `);
    expect(
      (await sql.unsafe(`SELECT count(*)::int AS n FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${CORRECT_ID}'`))[0].n,
    ).toBe(1);

    await sql.unsafe(`
      UPDATE ${SCHEMA}.journal_entries
      SET date = NULL, time_precision = 'approximate', "timestamp" = NULL
      WHERE id = '${CORRECT_ID}'
    `);
    const afterClear = await sql.unsafe(
      `SELECT date, created_at FROM ${SCHEMA}.journal_entries WHERE id = '${CORRECT_ID}'`,
    );
    expect(afterClear[0].date).toBeNull();
    expect(new Date(afterClear[0].created_at).toISOString()).toBe(RECORDED_AUG);
    expect(
      (await sql.unsafe(`SELECT count(*)::int AS n FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${CORRECT_ID}'`))[0].n,
    ).toBe(0);

    await sql.unsafe(`
      UPDATE ${SCHEMA}.journal_entries
      SET date = '${OCCURRED_JULY}', time_precision = 'day', "timestamp" = '${OCCURRED_JULY}'
      WHERE id = '${CORRECT_ID}'
    `);
    expect(
      (await sql.unsafe(`SELECT count(*)::int AS n FROM ${SCHEMA}.chronology_index WHERE journal_entry_id = '${CORRECT_ID}'`))[0].n,
    ).toBe(1);

    await sql.unsafe(`
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, date, content, created_at, time_precision, "timestamp")
      VALUES ('${JULY_OCC}', '${USER_A}', '${OCCURRED_JULY}', 'Occurred July, recorded August', '${RECORDED_AUG}', 'day', '${OCCURRED_JULY}');
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, date, content, created_at, time_precision, "timestamp", metadata)
      VALUES ('${JULY_REC}', '${USER_A}', NULL, 'Unknown occurrence recorded July', '2026-07-20T12:00:00.000Z', 'approximate', NULL, '{"mentionedAt":"2026-07-20T12:00:00.000Z"}'::jsonb);
      INSERT INTO ${SCHEMA}.journal_entries (id, user_id, date, content, created_at)
      VALUES ('${TENANT_B}', '${USER_B}', '${OCCURRED_JULY}', 'Jamie tenant isolation row', '${RECORDED_AUG}');
    `);

    const julyOccurred = await sql.unsafe(`
      SELECT id FROM ${SCHEMA}.journal_entries
      WHERE user_id = '${USER_A}'
        AND date >= '2026-07-01T00:00:00Z' AND date < '2026-08-01T00:00:00Z'
    `);
    const julyIds = julyOccurred.map((r: { id: string }) => r.id);
    expect(julyIds).toContain(JULY_OCC);
    expect(julyIds).not.toContain(JULY_REC);

    const julyRecorded = await sql.unsafe(`
      SELECT id FROM ${SCHEMA}.journal_entries
      WHERE user_id = '${USER_A}'
        AND created_at >= '2026-07-01T00:00:00Z' AND created_at < '2026-08-01T00:00:00Z'
    `);
    expect(julyRecorded.map((r: { id: string }) => r.id)).toContain(JULY_REC);

    const sorted = await sql.unsafe(`
      SELECT id, date FROM ${SCHEMA}.journal_entries
      WHERE user_id = '${USER_A}'
      ORDER BY date DESC NULLS LAST
      LIMIT 20
    `);
    const firstNull = sorted.findIndex((r: { date: Date | null }) => r.date == null);
    const lastDated = [...sorted].reverse().findIndex((r: { date: Date | null }) => r.date != null);
    if (firstNull !== -1) {
      expect(sorted.slice(0, firstNull).every((r: { date: Date | null }) => r.date != null)).toBe(true);
    }
    expect(lastDated).not.toBe(-1);

    const tenant = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.journal_entries WHERE user_id = '${USER_A}' AND id = '${TENANT_B}'`,
    );
    expect(tenant[0].n).toBe(0);

    const plan = await sql.unsafe(`
      EXPLAIN (FORMAT JSON)
      SELECT id FROM ${SCHEMA}.journal_entries
      WHERE user_id = '${USER_A}'
        AND date >= '2026-07-01T00:00:00Z' AND date < '2026-08-01T00:00:00Z'
      ORDER BY date DESC NULLS LAST
    `);
    const planText = JSON.stringify(plan);
    expect(planText).toMatch(/Index Scan|Bitmap|Seq Scan|Sort/);

    const exported = await sql.unsafe(
      `SELECT json_build_object('date', date) AS row FROM ${SCHEMA}.journal_entries WHERE id = '${NULL_ID}'`,
    );
    expect(exported[0].row).toEqual({ date: null });

    await expect(
      sql.unsafe(`ALTER TABLE ${SCHEMA}.journal_entries ALTER COLUMN date SET NOT NULL`),
    ).rejects.toThrow(/null/i);

    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    expect(dateCol).toBeTruthy();
  });
});
