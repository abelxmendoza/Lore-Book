-- Isolated replay for DROP public.character_timeline_events.
-- Creates a throwaway schema, seeds canonical + hostile CTE rows, drops the
-- table, then proves resolved_events and Character delete still work.
-- Production ledger version: 20260821194550 (name drop_character_timeline_events).

BEGIN;

CREATE SCHEMA IF NOT EXISTS cte_drop_replay;
SET search_path TO cte_drop_replay;

CREATE TABLE characters (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL
);

CREATE TABLE resolved_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  people uuid[] NOT NULL DEFAULT '{}',
  start_time timestamptz
);

CREATE TABLE character_timeline_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  event_id uuid REFERENCES resolved_events(id) ON DELETE CASCADE,
  source_episode_id uuid,
  event_title text,
  event_date timestamptz,
  connection_character_id uuid REFERENCES characters(id),
  timeline_type text NOT NULL DEFAULT 'lore'
);

INSERT INTO characters (id, user_id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Maya Temp'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Maya Chen');

INSERT INTO resolved_events (id, user_id, title, people, start_time) VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Maya started at MemoVault',
    ARRAY['11111111-1111-1111-1111-111111111111'::uuid],
    '2026-03-12T19:00:00Z'
  );

INSERT INTO character_timeline_events (
  id, user_id, character_id, event_id, source_episode_id, event_title, event_date, connection_character_id, timeline_type
) VALUES
  (
    '44444444-4444-4444-4444-444444444444',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    NULL,
    '55555555-5555-5555-5555-555555555555',
    'Unmatched leftover title',
    '1999-01-01T00:00:00Z',
    '22222222-2222-2222-2222-222222222222',
    'lore'
  );

DO $$
DECLARE
  canonical_count int;
BEGIN
  SELECT count(*) INTO canonical_count FROM resolved_events;
  IF canonical_count <> 1 THEN
    RAISE EXCEPTION 'pre-drop canonical count %', canonical_count;
  END IF;
END $$;

DROP TABLE character_timeline_events CASCADE;

DO $$
DECLARE
  remaining_events int;
  remaining_people uuid[];
BEGIN
  IF to_regclass('cte_drop_replay.character_timeline_events') IS NOT NULL THEN
    RAISE EXCEPTION 'character_timeline_events still exists after DROP';
  END IF;

  SELECT count(*), (SELECT people FROM resolved_events LIMIT 1)
    INTO remaining_events, remaining_people
    FROM resolved_events;

  IF remaining_events <> 1 THEN
    RAISE EXCEPTION 'resolved_events changed by DROP: %', remaining_events;
  END IF;
  IF remaining_people <> ARRAY['11111111-1111-1111-1111-111111111111'::uuid] THEN
    RAISE EXCEPTION 'people[] changed by DROP';
  END IF;
END $$;

-- Character merge: rewrite people[] without a CTE helper.
UPDATE resolved_events
SET people = ARRAY['22222222-2222-2222-2222-222222222222'::uuid]
WHERE people = ARRAY['11111111-1111-1111-1111-111111111111'::uuid];

-- Character hard-delete: source card can go; no connection_character_id FK remains.
DELETE FROM characters WHERE id = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  remaining_chars int;
  remaining_people uuid[];
BEGIN
  SELECT count(*) INTO remaining_chars FROM characters;
  SELECT people INTO remaining_people FROM resolved_events LIMIT 1;
  IF remaining_chars <> 1 THEN
    RAISE EXCEPTION 'unexpected character count after delete: %', remaining_chars;
  END IF;
  IF remaining_people <> ARRAY['22222222-2222-2222-2222-222222222222'::uuid] THEN
    RAISE EXCEPTION 'canonical people[] not rewritten to survivor';
  END IF;
END $$;

ROLLBACK;
