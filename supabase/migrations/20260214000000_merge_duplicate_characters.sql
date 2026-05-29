-- Merge duplicate characters for existing users.
--
-- Strategy: for each user, find character pairs where the lowercase name of
-- one is a prefix/substring of the other (catches "Mom" / "my mom",
-- "Jerry" / "Jerry Smith"). Keep the older record (more established) and
-- point all foreign-key references at it before deleting the duplicate.
--
-- This migration is safe to re-run — it only merges, never deletes the
-- canonical record, and all merges are logged to a scratch table.
--
-- Requires: pg_trgm extension (already enabled in this project).

-- ─── Scratch log so we can audit what was merged ─────────────────────────────
CREATE TABLE IF NOT EXISTS _character_merge_log (
  canonical_id   uuid NOT NULL,
  merged_id      uuid NOT NULL,
  canonical_name text,
  merged_name    text,
  merged_at      timestamptz DEFAULT now()
);

-- ─── Main merge procedure ─────────────────────────────────────────────────────
DO $$
DECLARE
  r           record;
  canonical   uuid;
  duplicate   uuid;
BEGIN
  -- Find pairs: same user, one name is contained in the other (case-insensitive).
  -- Also catches short-prefix containment: "mom" ⊂ "my mom", "jerry" ⊂ "jerry smith".
  FOR r IN
    SELECT
      a.id   AS id_a,
      a.name AS name_a,
      a.created_at AS created_a,
      b.id   AS id_b,
      b.name AS name_b,
      b.created_at AS created_b
    FROM characters a
    JOIN characters b
      ON  a.user_id = b.user_id
      AND a.id <> b.id
      AND a.id < b.id  -- avoid processing the same pair twice
    WHERE
      -- Substring containment (handles "Mom" / "my mom", "Jerry" / "Jerry Smith")
      (
        lower(a.name) = lower(b.name)
        OR lower(a.name) LIKE '%' || lower(b.name) || '%'
        OR lower(b.name) LIKE '%' || lower(a.name) || '%'
      )
      -- Require at least 3 chars to avoid merging on trivially short strings
      AND length(a.name) >= 3
      AND length(b.name) >= 3
  LOOP
    -- Keep the older record as canonical (more established)
    IF r.created_a <= r.created_b THEN
      canonical := r.id_a;
      duplicate := r.id_b;
    ELSE
      canonical := r.id_b;
      duplicate := r.id_a;
    END IF;

    -- Skip if duplicate was already merged in a previous iteration
    IF NOT EXISTS (SELECT 1 FROM characters WHERE id = duplicate) THEN
      CONTINUE;
    END IF;

    -- Reroute foreign-key references from duplicate → canonical
    UPDATE character_memories       SET character_id = canonical WHERE character_id = duplicate;
    UPDATE character_relationships  SET source_character_id = canonical WHERE source_character_id = duplicate;
    UPDATE character_relationships  SET target_character_id = canonical WHERE target_character_id = duplicate;
    UPDATE entity_mentions          SET entity_id = canonical::text WHERE entity_id = duplicate::text;

    -- Merge aliases: add the duplicate's name into the canonical's alias array
    -- (if it isn't already there) so future mentions resolve correctly.
    UPDATE characters
    SET
      alias      = array(
                     SELECT DISTINCT unnest(
                       coalesce(alias, '{}') ||
                       ARRAY[(SELECT name FROM characters WHERE id = duplicate)]
                     )
                   ),
      updated_at = now()
    WHERE id = canonical
      AND NOT (coalesce(alias, '{}') @> ARRAY[(SELECT name FROM characters WHERE id = duplicate)]);

    -- Log the merge
    INSERT INTO _character_merge_log (canonical_id, merged_id, canonical_name, merged_name)
    SELECT canonical, duplicate, c.name, d.name
    FROM characters c, characters d
    WHERE c.id = canonical AND d.id = duplicate;

    -- Delete the duplicate
    DELETE FROM characters WHERE id = duplicate;

    RAISE NOTICE 'Merged character % into %', duplicate, canonical;
  END LOOP;
END;
$$;
