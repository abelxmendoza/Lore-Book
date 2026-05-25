-- Engine Registry & Health System V1
-- Tracks engine metadata, health, and dependencies

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Engine Manifest Table
CREATE TABLE IF NOT EXISTS public.engine_manifest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('core', 'analytics', 'specialized', 'domain')),
  version TEXT DEFAULT '1.0.0',
  path TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deprecated')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Engine Health Table
CREATE TABLE IF NOT EXISTS public.engine_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_name TEXT NOT NULL UNIQUE REFERENCES engine_manifest(name) ON DELETE CASCADE,
  last_run TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  last_error TEXT,
  average_duration_ms INT,
  run_count BIGINT DEFAULT 0,
  error_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Engine Dependencies Table
CREATE TABLE IF NOT EXISTS public.engine_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_name TEXT NOT NULL REFERENCES engine_manifest(name) ON DELETE CASCADE,
  depends_on TEXT NOT NULL REFERENCES engine_manifest(name) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(engine_name, depends_on)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engine_manifest_category ON public.engine_manifest(category);
CREATE INDEX IF NOT EXISTS idx_engine_manifest_status ON public.engine_manifest(status);
CREATE INDEX IF NOT EXISTS idx_engine_health_name ON public.engine_health(engine_name);
CREATE INDEX IF NOT EXISTS idx_engine_dependencies_engine ON public.engine_dependencies(engine_name);
CREATE INDEX IF NOT EXISTS idx_engine_dependencies_depends ON public.engine_dependencies(depends_on);

-- Success Handler Function
CREATE OR REPLACE FUNCTION update_engine_health_success(
  p_engine_name TEXT,
  p_duration INT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO engine_health (engine_name, last_run, last_success, average_duration_ms, run_count)
  VALUES (p_engine_name, NOW(), NOW(), p_duration, 1)
  ON CONFLICT (engine_name) DO UPDATE SET
    last_run = NOW(),
    last_success = NOW(),
    run_count = engine_health.run_count + 1,
    average_duration_ms = 
      (engine_health.average_duration_ms * engine_health.run_count + p_duration)
      / (engine_health.run_count + 1),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Error Handler Function
CREATE OR REPLACE FUNCTION update_engine_health_error(
  p_engine_name TEXT,
  p_error TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO engine_health (engine_name, last_run, last_error, error_count)
  VALUES (p_engine_name, NOW(), p_error, 1)
  ON CONFLICT (engine_name) DO UPDATE SET
    last_run = NOW(),
    last_error = p_error,
    error_count = engine_health.error_count + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS (if needed for multi-user, but for now we'll keep it open for system use)
-- For V1, we'll skip RLS since this is system-level data

