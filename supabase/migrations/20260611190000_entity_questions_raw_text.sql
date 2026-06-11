-- Keep the raw mention ("Derrik the other manager that worked at SpaceX") so
-- "someone else" answers can derive a distinguishing display name ("Derrik
-- (SpaceX)") from the clause the name gate stripped.
ALTER TABLE entity_questions ADD COLUMN IF NOT EXISTS raw_text TEXT;
