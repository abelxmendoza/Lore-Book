-- =====================================================
-- LOREBOOK CHRONICLE — living project history (Phase 1)
-- Tracks milestones, pending detections, and vision for LoreBook itself.
-- Idempotent seed via ON CONFLICT.
-- =====================================================

CREATE TABLE IF NOT EXISTS project_chronicle_milestones (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  significance SMALLINT NOT NULL CHECK (significance BETWEEN 1 AND 5),
  category TEXT NOT NULL DEFAULT 'other',
  chapter_id TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_chronicle_milestones_occurred
  ON project_chronicle_milestones (occurred_at DESC);

CREATE TABLE IF NOT EXISTS project_chronicle_pending_detections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  significance SMALLINT NOT NULL CHECK (significance BETWEEN 1 AND 5),
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL,
  source_ref TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_chronicle_pending_status
  ON project_chronicle_pending_detections (status, detected_at DESC);

CREATE TABLE IF NOT EXISTS project_chronicle_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed canonical milestones (matches projectChronicleSeed.ts)
INSERT INTO project_chronicle_milestones (id, slug, title, summary, occurred_at, significance, category, chapter_id, source)
VALUES
  ('ms-lorebook-created', 'lorebook-created', 'LoreBook Created',
   'Abel begins development of LoreBook — an AI that understands human lives, stories, memories, relationships, and meaning.',
   '2025-01-01T00:00:00Z', 5, 'founding', 'ch-idea', 'manual'),
  ('ms-memory-foundations', 'memory-foundations', 'Memory Foundations Pipeline',
   'Ingestion pipeline, journal entries, and semantic retrieval establish the continuity loop.',
   '2025-03-01T00:00:00Z', 4, 'architecture', 'ch-memory', 'manual'),
  ('ms-entity-linking', 'entity-linking', 'Entity Linking Released',
   'People, places, and projects resolve across conversations with deduplication and canonical mapping.',
   '2025-06-15T00:00:00Z', 3, 'new_capability', 'ch-memory', 'manual'),
  ('ms-identity-integrity', 'identity-integrity', 'Identity Integrity System',
   'Collision detection, correction authority, and truth states prevent silent identity merges.',
   '2025-10-01T00:00:00Z', 5, 'architecture', 'ch-identity', 'manual'),
  ('ms-provenance-graph', 'provenance-graph', 'Provenance System Completed',
   'Every claim traces to evidence — cognition mutations, MRQ, and correction workflows.',
   '2026-02-01T00:00:00Z', 4, 'architecture', 'ch-identity', 'manual'),
  ('ms-narrative-engine', 'narrative-story-engine', 'Narrative Story Engine Completed',
   'Life arcs, chapters, turning points, and Story-of-Self synthesis from accumulated evidence.',
   '2026-04-01T00:00:00Z', 5, 'technical_breakthrough', 'ch-narrative', 'manual'),
  ('ms-what-ai-knows', 'what-ai-knows-dashboard', 'What AI Knows Dashboard Launched',
   'Identity custody surface — users export everything the system holds with truth states.',
   '2026-05-01T00:00:00Z', 4, 'ux_release', 'ch-narrative', 'manual'),
  ('ms-lore-agents', 'lore-agents-orchestration', 'Lore Agents Orchestration Layer',
   'Memory, identity, narrative, contradiction, and system agents coordinate through a shared tool layer.',
   '2026-06-10T00:00:00Z', 4, 'new_capability', 'ch-social', 'manual'),
  ('ms-omni-timeline', 'omni-timeline', 'Omni Timeline Universal Search',
   'Timeline swimlanes, hierarchy panel, and universal search across life arcs.',
   '2026-06-15T00:00:00Z', 4, 'ux_release', 'ch-narrative', 'manual'),
  ('ms-chronicle', 'lorebook-chronicle', 'LoreBook Chronicle — Living Project History',
   'LoreBook gains a self-narrative: milestones, vision evolution, and automatic project autobiography.',
   '2026-06-18T00:00:00Z', 5, 'new_capability', 'ch-social', 'manual'),
  ('ms-social-intelligence', 'social-intelligence-engine', 'Social Intelligence Engine',
   'Kinship inference, relationship peripherals, and social projection layers deepen interpersonal understanding.',
   '2026-06-12T00:00:00Z', 4, 'technical_breakthrough', 'ch-social', 'manual')
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_chronicle_meta (key, value)
VALUES ('stage', '{"current":"BETA","progressPercent":72,"label":"Beta — narrative intelligence architecture maturing"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
