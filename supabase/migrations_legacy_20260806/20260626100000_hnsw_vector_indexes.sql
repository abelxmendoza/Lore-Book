-- =====================================================
-- HNSW VECTOR INDEXES — Durable Memory Architecture (efficiency)
--
-- Upgrade the hot-path semantic-search indexes from ivfflat to HNSW. This turns
-- the O(n) brute-force fallback into O(log n) approximate-nearest-neighbor for
-- the entity-resolution / claim-dedup / memory-recall paths.
--
-- Why HNSW over ivfflat for a continuously-growing memory store:
--   - Better recall at the same query latency (and no `lists` to tune).
--   - ivfflat clusters once at build time; rows inserted afterwards aren't in
--     the clustering until a REINDEX, so recall silently degrades as memory
--     grows. HNSW indexes new rows incrementally — exactly what an append-only
--     memory system needs.
--
-- Distance metric is cosine (<=>) throughout, so vector_cosine_ops is correct.
-- Params: m=16 (graph degree), ef_construction=64 (build-time quality). Tune
-- query-time recall with `SET hnsw.ef_search = 100;` if needed.
--
-- Ordering: create the HNSW index first, THEN drop the old ivfflat, so the
-- planner always has a vector index available during the migration.
--
-- NOTE: HNSW build is CPU/memory-intensive on large tables and CREATE INDEX
-- takes a brief lock. On very large production tables, prefer running these as
-- CREATE INDEX CONCURRENTLY by hand (cannot run inside a migration transaction).
-- =====================================================

-- omega_entities — entity-resolution semantic match (match_omega_entities RPC)
create index if not exists omega_entities_embedding_hnsw
  on public.omega_entities using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
drop index if exists idx_omega_entities_embedding;

-- omega_claims — claim semantic search / dedup
create index if not exists omega_claims_embedding_hnsw
  on public.omega_claims using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
drop index if exists idx_omega_claims_embedding;

-- journal_entries — memory recall
create index if not exists journal_entries_embedding_hnsw
  on public.journal_entries using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
drop index if exists journal_entries_embedding_idx;

-- characters — character semantic match
create index if not exists characters_embedding_hnsw
  on public.characters using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
drop index if exists character_embedding_idx;
