-- Add GIN index on characters.alias for fast fuzzy dedup queries.
--
-- The characterDeduplicationService loads (id, name, alias) for all of a user's
-- characters before every insert. Without this index, checking aliases requires
-- a sequential scan of every alias array in the table for that user.
--
-- GIN on the array column lets Postgres answer "does any row contain alias X?"
-- in O(log n) instead of O(n).

CREATE INDEX IF NOT EXISTS idx_characters_alias_gin
  ON public.characters USING GIN (alias);

-- Also add a covering index for the dedup SELECT pattern:
--   SELECT id, name, alias FROM characters WHERE user_id = $1
-- The btree on user_id already exists (characters_user_id_idx or similar),
-- but a composite covering index avoids a heap fetch for the name + alias columns.
CREATE INDEX IF NOT EXISTS idx_characters_dedup_covering
  ON public.characters (user_id)
  INCLUDE (name, alias);
