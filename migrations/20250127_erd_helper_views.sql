-- =====================================================
-- ERD HELPER VIEWS AND FUNCTIONS
-- Purpose: Provide easy-to-use views and functions
-- for querying entity relationships documented in ERD
-- =====================================================

-- =====================================================
-- 1. CHARACTER RELATIONSHIP VIEWS
-- =====================================================

-- View: All characters with their locations (via journal entries)
CREATE OR REPLACE VIEW character_locations AS
SELECT DISTINCT
  c.id AS character_id,
  c.name AS character_name,
  l.id AS location_id,
  l.name AS location_name,
  l.type AS location_type,
  COUNT(DISTINCT cm.journal_entry_id) AS shared_entries_count,
  MIN(je.date) AS first_shared_date,
  MAX(je.date) AS last_shared_date
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
JOIN locations l ON lm.location_id = l.id
JOIN journal_entries je ON cm.journal_entry_id = je.id
GROUP BY c.id, c.name, l.id, l.name, l.type;

COMMENT ON VIEW character_locations IS 'Shows all location-character relationships via journal entries. Part of ERD implementation.';

-- View: All characters with their events (via journal entries)
CREATE OR REPLACE VIEW character_events AS
SELECT DISTINCT
  c.id AS character_id,
  c.name AS character_name,
  re.id AS event_id,
  re.title AS event_title,
  re.type AS event_type,
  re.start_time AS event_start_time,
  COUNT(DISTINCT cm.journal_entry_id) AS shared_entries_count
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN event_mentions em ON cm.journal_entry_id = em.memory_id
JOIN resolved_events re ON em.event_id = re.id
GROUP BY c.id, c.name, re.id, re.title, re.type, re.start_time;

COMMENT ON VIEW character_events IS 'Shows all event-character relationships via journal entries. Part of ERD implementation.';

-- View: All characters with their timelines
CREATE OR REPLACE VIEW character_timelines AS
SELECT DISTINCT
  c.id AS character_id,
  c.name AS character_name,
  t.id AS timeline_id,
  t.title AS timeline_title,
  t.timeline_type AS timeline_type,
  COUNT(DISTINCT cm.journal_entry_id) AS shared_entries_count
FROM characters c
JOIN character_memories cm ON c.id = cm.character_id
JOIN timeline_memberships tm ON cm.journal_entry_id = tm.journal_entry_id
JOIN timelines t ON tm.timeline_id = t.id
GROUP BY c.id, c.name, t.id, t.title, t.timeline_type;

COMMENT ON VIEW character_timelines IS 'Shows all timeline-character relationships via journal entries. Part of ERD implementation.';

-- =====================================================
-- 2. LOCATION RELATIONSHIP VIEWS
-- =====================================================

-- View: All locations with their events
CREATE OR REPLACE VIEW location_events AS
SELECT DISTINCT
  l.id AS location_id,
  l.name AS location_name,
  re.id AS event_id,
  re.title AS event_title,
  re.type AS event_type,
  re.start_time AS event_start_time
FROM locations l
JOIN resolved_events re ON l.id = ANY(re.locations)
UNION
SELECT DISTINCT
  l.id AS location_id,
  l.name AS location_name,
  re.id AS event_id,
  re.title AS event_title,
  re.type AS event_type,
  re.start_time AS event_start_time
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN event_mentions em ON lm.memory_id = em.memory_id
JOIN resolved_events re ON em.event_id = re.id;

COMMENT ON VIEW location_events IS 'Shows all event-location relationships (direct via resolved_events.locations and indirect via journal entries). Part of ERD implementation.';

-- View: All locations with their characters
CREATE OR REPLACE VIEW location_characters AS
SELECT DISTINCT
  l.id AS location_id,
  l.name AS location_name,
  c.id AS character_id,
  c.name AS character_name,
  COUNT(DISTINCT lm.memory_id) AS shared_entries_count
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN character_memories cm ON lm.memory_id = cm.journal_entry_id
JOIN characters c ON cm.character_id = c.id
GROUP BY l.id, l.name, c.id, c.name;

COMMENT ON VIEW location_characters IS 'Shows all character-location relationships via journal entries. Part of ERD implementation.';

-- View: All locations with their timelines
CREATE OR REPLACE VIEW location_timelines AS
SELECT DISTINCT
  l.id AS location_id,
  l.name AS location_name,
  t.id AS timeline_id,
  t.title AS timeline_title,
  t.timeline_type AS timeline_type,
  COUNT(DISTINCT lm.memory_id) AS shared_entries_count
FROM locations l
JOIN location_mentions lm ON l.id = lm.location_id
JOIN timeline_memberships tm ON lm.memory_id = tm.journal_entry_id
JOIN timelines t ON tm.timeline_id = t.id
GROUP BY l.id, l.name, t.id, t.title, t.timeline_type;

COMMENT ON VIEW location_timelines IS 'Shows all timeline-location relationships via journal entries. Part of ERD implementation.';

-- =====================================================
-- 3. EVENT RELATIONSHIP VIEWS
-- =====================================================

-- View: All events with their characters (direct via resolved_events.people)
CREATE OR REPLACE VIEW event_characters_direct AS
SELECT
  re.id AS event_id,
  re.title AS event_title,
  c.id AS character_id,
  c.name AS character_name
FROM resolved_events re
CROSS JOIN LATERAL unnest(re.people) AS character_uuid
JOIN characters c ON c.id = character_uuid;

COMMENT ON VIEW event_characters_direct IS 'Shows direct event-character relationships via resolved_events.people array. Part of ERD implementation.';

-- View: All events with their locations (direct via resolved_events.locations)
CREATE OR REPLACE VIEW event_locations_direct AS
SELECT
  re.id AS event_id,
  re.title AS event_title,
  l.id AS location_id,
  l.name AS location_name
FROM resolved_events re
CROSS JOIN LATERAL unnest(re.locations) AS location_uuid
JOIN locations l ON l.id = location_uuid;

COMMENT ON VIEW event_locations_direct IS 'Shows direct event-location relationships via resolved_events.locations array. Part of ERD implementation.';

-- View: All events with their journal entries
CREATE OR REPLACE VIEW event_journal_entries AS
SELECT
  re.id AS event_id,
  re.title AS event_title,
  em.memory_id AS journal_entry_id,
  je.date AS entry_date,
  je.content AS entry_content
FROM resolved_events re
JOIN event_mentions em ON re.id = em.event_id
JOIN journal_entries je ON em.memory_id = je.id
UNION
SELECT
  te.id AS event_id,
  te.title AS event_title,
  tmb.journal_entry_id,
  je.date AS entry_date,
  je.content AS entry_content
FROM timeline_events te
JOIN task_memory_bridges tmb ON te.id = tmb.timeline_event_id
JOIN journal_entries je ON tmb.journal_entry_id = je.id;

COMMENT ON VIEW event_journal_entries IS 'Shows all event-journal entry relationships (via event_mentions and task_memory_bridges). Part of ERD implementation.';

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function: Get all characters for a location
CREATE OR REPLACE FUNCTION get_characters_for_location(location_uuid UUID)
RETURNS TABLE (
  character_id UUID,
  character_name TEXT,
  shared_entries_count BIGINT,
  first_shared_date TIMESTAMPTZ,
  last_shared_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    c.id,
    c.name,
    COUNT(DISTINCT cm.journal_entry_id)::BIGINT,
    MIN(je.date),
    MAX(je.date)
  FROM characters c
  JOIN character_memories cm ON c.id = cm.character_id
  JOIN location_mentions lm ON cm.journal_entry_id = lm.memory_id
  JOIN journal_entries je ON cm.journal_entry_id = je.id
  WHERE lm.location_id = location_uuid
  GROUP BY c.id, c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_characters_for_location IS 'Returns all characters associated with a location via journal entries. Part of ERD implementation.';

-- Function: Get all locations for a character
CREATE OR REPLACE FUNCTION get_locations_for_character(character_uuid UUID)
RETURNS TABLE (
  location_id UUID,
  location_name TEXT,
  location_type TEXT,
  shared_entries_count BIGINT,
  first_shared_date TIMESTAMPTZ,
  last_shared_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    l.id,
    l.name,
    l.type,
    COUNT(DISTINCT cm.journal_entry_id)::BIGINT,
    MIN(je.date),
    MAX(je.date)
  FROM locations l
  JOIN location_mentions lm ON l.id = lm.location_id
  JOIN character_memories cm ON lm.memory_id = cm.journal_entry_id
  JOIN journal_entries je ON cm.journal_entry_id = je.id
  WHERE cm.character_id = character_uuid
  GROUP BY l.id, l.name, l.type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_locations_for_character IS 'Returns all locations associated with a character via journal entries. Part of ERD implementation.';

-- Function: Get all events for a character
CREATE OR REPLACE FUNCTION get_events_for_character(character_uuid UUID)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  event_type TEXT,
  event_start_time TIMESTAMPTZ,
  relationship_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Direct relationship via resolved_events.people
  SELECT
    re.id,
    re.title,
    re.type,
    re.start_time,
    'direct'::TEXT
  FROM resolved_events re
  WHERE character_uuid = ANY(re.people)
  
  UNION
  
  -- Indirect relationship via journal entries
  SELECT DISTINCT
    re.id,
    re.title,
    re.type,
    re.start_time,
    'indirect'::TEXT
  FROM resolved_events re
  JOIN event_mentions em ON re.id = em.event_id
  JOIN character_memories cm ON em.memory_id = cm.journal_entry_id
  WHERE cm.character_id = character_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_events_for_character IS 'Returns all events associated with a character (direct via resolved_events.people and indirect via journal entries). Part of ERD implementation.';

-- Function: Get all characters for an event
CREATE OR REPLACE FUNCTION get_characters_for_event(event_uuid UUID)
RETURNS TABLE (
  character_id UUID,
  character_name TEXT,
  relationship_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Direct relationship via resolved_events.people
  SELECT
    c.id,
    c.name,
    'direct'::TEXT
  FROM resolved_events re
  CROSS JOIN LATERAL unnest(re.people) AS character_uuid
  JOIN characters c ON c.id = character_uuid
  WHERE re.id = event_uuid
  
  UNION
  
  -- Indirect relationship via journal entries
  SELECT DISTINCT
    c.id,
    c.name,
    'indirect'::TEXT
  FROM characters c
  JOIN character_memories cm ON c.id = cm.character_id
  JOIN event_mentions em ON cm.journal_entry_id = em.memory_id
  WHERE em.event_id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_characters_for_event IS 'Returns all characters associated with an event (direct via resolved_events.people and indirect via journal entries). Part of ERD implementation.';

-- Function: Get all locations for an event
CREATE OR REPLACE FUNCTION get_locations_for_event(event_uuid UUID)
RETURNS TABLE (
  location_id UUID,
  location_name TEXT,
  location_type TEXT,
  relationship_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Direct relationship via resolved_events.locations
  SELECT
    l.id,
    l.name,
    l.type,
    'direct'::TEXT
  FROM resolved_events re
  CROSS JOIN LATERAL unnest(re.locations) AS location_uuid
  JOIN locations l ON l.id = location_uuid
  WHERE re.id = event_uuid
  
  UNION
  
  -- Indirect relationship via journal entries
  SELECT DISTINCT
    l.id,
    l.name,
    l.type,
    'indirect'::TEXT
  FROM locations l
  JOIN location_mentions lm ON l.id = lm.location_id
  JOIN event_mentions em ON lm.memory_id = em.memory_id
  WHERE em.event_id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_locations_for_event IS 'Returns all locations associated with an event (direct via resolved_events.locations and indirect via journal entries). Part of ERD implementation.';

-- Function: Get all timelines for a character
CREATE OR REPLACE FUNCTION get_timelines_for_character(character_uuid UUID)
RETURNS TABLE (
  timeline_id UUID,
  timeline_title TEXT,
  timeline_type TEXT,
  shared_entries_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    t.id,
    t.title,
    t.timeline_type,
    COUNT(DISTINCT cm.journal_entry_id)::BIGINT
  FROM timelines t
  JOIN timeline_memberships tm ON t.id = tm.timeline_id
  JOIN character_memories cm ON tm.journal_entry_id = cm.journal_entry_id
  WHERE cm.character_id = character_uuid
  GROUP BY t.id, t.title, t.timeline_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_timelines_for_character IS 'Returns all timelines associated with a character via journal entries. Part of ERD implementation.';

-- Function: Get all timelines for a location
CREATE OR REPLACE FUNCTION get_timelines_for_location(location_uuid UUID)
RETURNS TABLE (
  timeline_id UUID,
  timeline_title TEXT,
  timeline_type TEXT,
  shared_entries_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    t.id,
    t.title,
    t.timeline_type,
    COUNT(DISTINCT lm.memory_id)::BIGINT
  FROM timelines t
  JOIN timeline_memberships tm ON t.id = tm.timeline_id
  JOIN location_mentions lm ON tm.journal_entry_id = lm.memory_id
  WHERE lm.location_id = location_uuid
  GROUP BY t.id, t.title, t.timeline_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_timelines_for_location IS 'Returns all timelines associated with a location via journal entries. Part of ERD implementation.';

-- Function: Get all timelines for an event
CREATE OR REPLACE FUNCTION get_timelines_for_event(event_uuid UUID)
RETURNS TABLE (
  timeline_id UUID,
  timeline_title TEXT,
  timeline_type TEXT,
  relationship_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  -- Via task_memory_bridges
  SELECT DISTINCT
    t.id,
    t.title,
    t.timeline_type,
    'via_task_bridge'::TEXT
  FROM timelines t
  JOIN timeline_memberships tm ON t.id = tm.timeline_id
  JOIN task_memory_bridges tmb ON tm.journal_entry_id = tmb.journal_entry_id
  WHERE tmb.timeline_event_id = event_uuid
  
  UNION
  
  -- Via event_mentions
  SELECT DISTINCT
    t.id,
    t.title,
    t.timeline_type,
    'via_event_mention'::TEXT
  FROM timelines t
  JOIN timeline_memberships tm ON t.id = tm.timeline_id
  JOIN event_mentions em ON tm.journal_entry_id = em.memory_id
  WHERE em.event_id = event_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_timelines_for_event IS 'Returns all timelines associated with an event (via task_memory_bridges and event_mentions). Part of ERD implementation.';

-- =====================================================
-- 5. RLS POLICIES FOR VIEWS
-- =====================================================

-- Note: Views inherit RLS from underlying tables, but we should ensure
-- users can only see their own data. The functions use SECURITY DEFINER
-- so they run with the privileges of the function creator, but should
-- still respect user_id filtering in the queries.

-- Grant access to views
GRANT SELECT ON character_locations TO authenticated;
GRANT SELECT ON character_events TO authenticated;
GRANT SELECT ON character_timelines TO authenticated;
GRANT SELECT ON location_events TO authenticated;
GRANT SELECT ON location_characters TO authenticated;
GRANT SELECT ON location_timelines TO authenticated;
GRANT SELECT ON event_characters_direct TO authenticated;
GRANT SELECT ON event_locations_direct TO authenticated;
GRANT SELECT ON event_journal_entries TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_characters_for_location TO authenticated;
GRANT EXECUTE ON FUNCTION get_locations_for_character TO authenticated;
GRANT EXECUTE ON FUNCTION get_events_for_character TO authenticated;
GRANT EXECUTE ON FUNCTION get_characters_for_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_locations_for_event TO authenticated;
GRANT EXECUTE ON FUNCTION get_timelines_for_character TO authenticated;
GRANT EXECUTE ON FUNCTION get_timelines_for_location TO authenticated;
GRANT EXECUTE ON FUNCTION get_timelines_for_event TO authenticated;
