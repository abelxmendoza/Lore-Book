-- =====================================================
-- CHARACTERS SPECIES COLUMN (Pets in the Character Book, Phase 1)
-- Pets stay in the characters table rather than a separate one — the web
-- layer already documents this intent (certifiedEntity.ts: "pets are still
-- character cards"). A non-null species marks a row as a pet and doubles as
-- the actual data (dog, cat, etc.), the same way pronouns/sex already do
-- double duty on this table. Additive and nullable — safe to apply live.
-- =====================================================

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS species text;
