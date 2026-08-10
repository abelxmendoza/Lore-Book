-- Spatial ontology columns for the Places Book knowledge graph.
-- Classifies locations into geographic/property/room/venue/business/landmark
-- and links rooms to parent households via parent_location_id.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS root_type TEXT NOT NULL DEFAULT 'PLACE',
  ADD COLUMN IF NOT EXISTS spatial_category TEXT,
  ADD COLUMN IF NOT EXISTS spatial_subcategory TEXT,
  ADD COLUMN IF NOT EXISTS parent_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_locations_parent
  ON public.locations(parent_location_id)
  WHERE parent_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_spatial_category
  ON public.locations(user_id, spatial_category);

COMMENT ON COLUMN public.locations.root_type IS 'PLACE or EVENT — events masquerading as places are flagged EVENT';
COMMENT ON COLUMN public.locations.spatial_category IS 'HOUSEHOLD, ROOM, PROPERTY, VENUE, BUSINESS, CITY, REGION, EVENT_LOCATION, LANDMARK, UNKNOWN';
COMMENT ON COLUMN public.locations.spatial_subcategory IS 'Finer grain: KITCHEN, NIGHTCLUB, HOUSE, etc.';
COMMENT ON COLUMN public.locations.parent_location_id IS 'Rooms and nested places link to their parent household or container';
