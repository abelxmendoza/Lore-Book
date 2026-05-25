-- =====================================================
-- IMPLEMENT ERD RELATIONSHIPS
-- Purpose: Ensure all documented entity relationships are
-- actually implemented in the database schema
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- =====================================================
-- 1. EVENT RELATIONSHIPS
-- =====================================================

-- Ensure event_mentions has proper foreign key to resolved_events
-- (This should already exist, but we'll verify and add if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_mentions_event_id_fkey'
    AND table_name = 'event_mentions'
  ) THEN
    ALTER TABLE public.event_mentions
    ADD CONSTRAINT event_mentions_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.resolved_events(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure event_mentions has proper foreign key to journal_entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'event_mentions_memory_id_fkey'
    AND table_name = 'event_mentions'
  ) THEN
    ALTER TABLE public.event_mentions
    ADD CONSTRAINT event_mentions_memory_id_fkey
    FOREIGN KEY (memory_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for event-character queries (via resolved_events.people array)
CREATE INDEX IF NOT EXISTS idx_resolved_events_people_character_lookup 
ON public.resolved_events USING GIN(people);

-- Add index for event-location queries (via resolved_events.locations array)
CREATE INDEX IF NOT EXISTS idx_resolved_events_locations_location_lookup 
ON public.resolved_events USING GIN(locations);

-- =====================================================
-- 2. LOCATION RELATIONSHIPS
-- =====================================================

-- Ensure location_mentions has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'location_mentions_location_id_fkey'
    AND table_name = 'location_mentions'
  ) THEN
    ALTER TABLE public.location_mentions
    ADD CONSTRAINT location_mentions_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'location_mentions_memory_id_fkey'
    AND table_name = 'location_mentions'
  ) THEN
    ALTER TABLE public.location_mentions
    ADD CONSTRAINT location_mentions_memory_id_fkey
    FOREIGN KEY (memory_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure photo_location_links has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'photo_location_links_location_id_fkey'
    AND table_name = 'photo_location_links'
  ) THEN
    ALTER TABLE public.photo_location_links
    ADD CONSTRAINT photo_location_links_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'photo_location_links_journal_entry_id_fkey'
    AND table_name = 'photo_location_links'
  ) THEN
    ALTER TABLE public.photo_location_links
    ADD CONSTRAINT photo_location_links_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================
-- 3. CHARACTER RELATIONSHIPS
-- =====================================================

-- Ensure character_memories has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'character_memories_character_id_fkey'
    AND table_name = 'character_memories'
  ) THEN
    ALTER TABLE public.character_memories
    ADD CONSTRAINT character_memories_character_id_fkey
    FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'character_memories_journal_entry_id_fkey'
    AND table_name = 'character_memories'
  ) THEN
    ALTER TABLE public.character_memories
    ADD CONSTRAINT character_memories_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure character_relationships has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'character_relationships_source_character_id_fkey'
    AND table_name = 'character_relationships'
  ) THEN
    ALTER TABLE public.character_relationships
    ADD CONSTRAINT character_relationships_source_character_id_fkey
    FOREIGN KEY (source_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'character_relationships_target_character_id_fkey'
    AND table_name = 'character_relationships'
  ) THEN
    ALTER TABLE public.character_relationships
    ADD CONSTRAINT character_relationships_target_character_id_fkey
    FOREIGN KEY (target_character_id) REFERENCES public.characters(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================
-- 4. PERCEPTION RELATIONSHIPS
-- =====================================================

-- Ensure perception_entries has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'perception_entries_subject_person_id_fkey'
    AND table_name = 'perception_entries'
  ) THEN
    ALTER TABLE public.perception_entries
    ADD CONSTRAINT perception_entries_subject_person_id_fkey
    FOREIGN KEY (subject_person_id) REFERENCES public.characters(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'perception_entries_source_character_id_fkey'
    AND table_name = 'perception_entries'
  ) THEN
    ALTER TABLE public.perception_entries
    ADD CONSTRAINT perception_entries_source_character_id_fkey
    FOREIGN KEY (source_character_id) REFERENCES public.characters(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'perception_entries_related_memory_id_fkey'
    AND table_name = 'perception_entries'
  ) THEN
    ALTER TABLE public.perception_entries
    ADD CONSTRAINT perception_entries_related_memory_id_fkey
    FOREIGN KEY (related_memory_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- 5. TIMELINE RELATIONSHIPS
-- =====================================================

-- Ensure timeline_memberships has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'timeline_memberships_timeline_id_fkey'
    AND table_name = 'timeline_memberships'
  ) THEN
    ALTER TABLE public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_timeline_id_fkey
    FOREIGN KEY (timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'timeline_memberships_journal_entry_id_fkey'
    AND table_name = 'timeline_memberships'
  ) THEN
    ALTER TABLE public.timeline_memberships
    ADD CONSTRAINT timeline_memberships_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure timeline_relationships has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'timeline_relationships_source_timeline_id_fkey'
    AND table_name = 'timeline_relationships'
  ) THEN
    ALTER TABLE public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_source_timeline_id_fkey
    FOREIGN KEY (source_timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'timeline_relationships_target_timeline_id_fkey'
    AND table_name = 'timeline_relationships'
  ) THEN
    ALTER TABLE public.timeline_relationships
    ADD CONSTRAINT timeline_relationships_target_timeline_id_fkey
    FOREIGN KEY (target_timeline_id) REFERENCES public.timelines(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================
-- 6. SKILL RELATIONSHIPS
-- =====================================================

-- Ensure skill_progress has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'skill_progress_skill_id_fkey'
    AND table_name = 'skill_progress'
  ) THEN
    ALTER TABLE public.skill_progress
    ADD CONSTRAINT skill_progress_skill_id_fkey
    FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add foreign key constraint for skill_progress.source_id to journal_entries
-- (if source_type is 'memory')
DO $$
BEGIN
  -- Add check constraint to ensure source_id references journal_entries when source_type is 'memory'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'skill_progress_source_id_check'
  ) THEN
    -- Note: We can't add a direct FK here since source_id can reference different tables
    -- But we can add an index for performance
    CREATE INDEX IF NOT EXISTS idx_skill_progress_source_id 
    ON public.skill_progress(source_id) 
    WHERE source_type = 'memory' AND source_id IS NOT NULL;
  END IF;
END $$;

-- =====================================================
-- 7. TASK MEMORY BRIDGES (Event-Journal Entry Links)
-- =====================================================

-- Ensure task_memory_bridges has proper foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'task_memory_bridges_timeline_event_id_fkey'
    AND table_name = 'task_memory_bridges'
  ) THEN
    ALTER TABLE public.task_memory_bridges
    ADD CONSTRAINT task_memory_bridges_timeline_event_id_fkey
    FOREIGN KEY (timeline_event_id) REFERENCES public.timeline_events(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'task_memory_bridges_journal_entry_id_fkey'
    AND table_name = 'task_memory_bridges'
  ) THEN
    ALTER TABLE public.task_memory_bridges
    ADD CONSTRAINT task_memory_bridges_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =====================================================
-- 8. PERFORMANCE INDEXES FOR COMMON QUERIES
-- =====================================================

-- Index for character-location queries
CREATE INDEX IF NOT EXISTS idx_character_location_via_memories
ON public.character_memories(character_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_location_character_via_mentions
ON public.location_mentions(location_id, memory_id);

-- Index for event-character queries (via journal entries)
CREATE INDEX IF NOT EXISTS idx_event_character_via_mentions
ON public.event_mentions(event_id, memory_id);

CREATE INDEX IF NOT EXISTS idx_character_event_via_memories
ON public.character_memories(character_id, journal_entry_id);

-- Index for event-location queries (via journal entries)
CREATE INDEX IF NOT EXISTS idx_event_location_via_mentions
ON public.event_mentions(event_id, memory_id);

CREATE INDEX IF NOT EXISTS idx_location_event_via_mentions
ON public.location_mentions(location_id, memory_id);

-- Index for perception-location queries
CREATE INDEX IF NOT EXISTS idx_perception_location_via_memory
ON public.perception_entries(related_memory_id)
WHERE related_memory_id IS NOT NULL;

-- Index for timeline-location queries
CREATE INDEX IF NOT EXISTS idx_timeline_location_via_memberships
ON public.timeline_memberships(timeline_id, journal_entry_id);

-- Index for skill-location queries
CREATE INDEX IF NOT EXISTS idx_skill_location_via_progress
ON public.skill_progress(skill_id, source_id)
WHERE source_type = 'memory' AND source_id IS NOT NULL;

-- Index for group-location queries (via characters)
CREATE INDEX IF NOT EXISTS idx_group_character_via_communities
ON public.social_communities USING GIN(members);

-- =====================================================
-- 9. COMPOSITE INDEXES FOR COMMON JOIN PATTERNS
-- =====================================================

-- Character-Event-Location query pattern
CREATE INDEX IF NOT EXISTS idx_character_memories_entry_character
ON public.character_memories(journal_entry_id, character_id);

CREATE INDEX IF NOT EXISTS idx_event_mentions_entry_event
ON public.event_mentions(memory_id, event_id);

CREATE INDEX IF NOT EXISTS idx_location_mentions_entry_location
ON public.location_mentions(memory_id, location_id);

-- Timeline-Character-Event query pattern
CREATE INDEX IF NOT EXISTS idx_timeline_memberships_entry_timeline
ON public.timeline_memberships(journal_entry_id, timeline_id);

-- =====================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.event_mentions IS 'Direct link between resolved_events and journal_entries. Part of ERD implementation.';
COMMENT ON TABLE public.location_mentions IS 'Direct link between locations and journal_entries. Part of ERD implementation.';
COMMENT ON TABLE public.character_memories IS 'Direct link between characters and journal_entries. Part of ERD implementation.';
COMMENT ON TABLE public.task_memory_bridges IS 'Bridge table linking timeline_events to journal_entries. Part of ERD implementation.';
COMMENT ON TABLE public.timeline_memberships IS 'Many-to-many relationship between timelines and journal_entries. Part of ERD implementation.';
COMMENT ON TABLE public.event_continuity_links IS 'Event-to-event relationships for continuity tracking. Part of ERD implementation.';

COMMENT ON COLUMN public.resolved_events.people IS 'Array of character UUIDs directly linked to this event. Part of ERD implementation.';
COMMENT ON COLUMN public.resolved_events.locations IS 'Array of location UUIDs directly linked to this event. Part of ERD implementation.';
COMMENT ON COLUMN public.social_communities.members IS 'Array of character names in this group. Part of ERD implementation.';

-- =====================================================
-- 11. VERIFICATION QUERIES (for testing)
-- =====================================================

-- These are commented out but can be used to verify relationships exist
/*
-- Verify event-character relationship
SELECT COUNT(*) FROM resolved_events WHERE array_length(people, 1) > 0;

-- Verify event-location relationship  
SELECT COUNT(*) FROM resolved_events WHERE array_length(locations, 1) > 0;

-- Verify character-journal entry relationship
SELECT COUNT(*) FROM character_memories;

-- Verify location-journal entry relationship
SELECT COUNT(*) FROM location_mentions;

-- Verify event-journal entry relationship
SELECT COUNT(*) FROM event_mentions;
*/
