# Legacy migration archive

These migrations document LoreBook's pre-baseline database history. They are
not an active Supabase migration directory and must not be replayed as a chain.

The old remote ledger was not reproducible: multiple entries used different
timestamps, some versions were malformed, remote-only entries lacked source
SQL, and at least one migration was recorded as applied while its expected
tables were absent.

The active chain begins at
`supabase/migrations/20260807040000_production_schema_baseline.sql`, which is a
schema-only snapshot of production. Historical SQL remains here for audit and
for recovering intentionally seeded system data. Never point `db push` or
`migration up` at this directory.
