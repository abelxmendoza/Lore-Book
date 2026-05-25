-- =====================================================
-- LORE-KEEPER PRIVACY, SCOPE & MEMORY OWNERSHIP ENGINE
-- Purpose: Enforce ownership, visibility, retention,
-- and access boundaries across ALL Lore-Keeper subsystems.
-- =====================================================

-- Memory Scopes: Scope definitions
CREATE TABLE IF NOT EXISTS memory_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type TEXT NOT NULL CHECK (scope_type IN (
        'PRIVATE',
        'SHARED',
        'ANONYMOUS',
        'ARCHIVED',
        'DELETED'
    )),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Scoped Resources: Resources with scope assignments
CREATE TABLE IF NOT EXISTS scoped_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type TEXT NOT NULL CHECK (resource_type IN (
        'CLAIM',
        'DECISION',
        'INSIGHT',
        'PREDICTION',
        'GOAL',
        'VALUE',
        'EVENT',
        'ENTITY',
        'RELATIONSHIP',
        'OUTCOME',
        'SIGNAL',
        'SNAPSHOT'
    )),
    resource_id UUID NOT NULL,
    scope_id UUID NOT NULL REFERENCES memory_scopes(id) ON DELETE RESTRICT,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(resource_type, resource_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scoped_resources_user ON scoped_resources(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_scoped_resources_type_id ON scoped_resources(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_scoped_resources_scope ON scoped_resources(scope_id);
CREATE INDEX IF NOT EXISTS idx_scoped_resources_updated ON scoped_resources(updated_at DESC);

-- Row Level Security
ALTER TABLE memory_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoped_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for memory_scopes (read-only for all users)
CREATE POLICY "Users can view memory scopes"
    ON memory_scopes FOR SELECT
    USING (true);

-- RLS Policies for scoped_resources
CREATE POLICY "Users can view their own scoped resources"
    ON scoped_resources FOR SELECT
    USING (auth.uid() = owner_user_id);

CREATE POLICY "Users can insert their own scoped resources"
    ON scoped_resources FOR INSERT
    WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Users can update their own scoped resources"
    ON scoped_resources FOR UPDATE
    USING (auth.uid() = owner_user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scoped_resource_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_scoped_resources_updated_at
    BEFORE UPDATE ON scoped_resources
    FOR EACH ROW
    EXECUTE FUNCTION update_scoped_resource_updated_at();

-- Initialize default scopes
INSERT INTO memory_scopes (scope_type, description) VALUES
    ('PRIVATE', 'Only visible to the owner, default scope'),
    ('SHARED', 'Explicitly shared with others'),
    ('ANONYMOUS', 'De-identified data'),
    ('ARCHIVED', 'Inactive but retained'),
    ('DELETED', 'Tombstoned, non-recoverable')
ON CONFLICT DO NOTHING;

-- Function to get scope by type
CREATE OR REPLACE FUNCTION get_scope_by_type(scope_type_param TEXT)
RETURNS UUID AS $$
DECLARE
    scope_id_result UUID;
BEGIN
    SELECT id INTO scope_id_result
    FROM memory_scopes
    WHERE scope_type = scope_type_param
    LIMIT 1;

    RETURN scope_id_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

