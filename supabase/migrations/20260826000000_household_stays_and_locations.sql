-- Household residency and location history.
--
-- A household is an `organizations` row (type = 'family') that already
-- exists as the household's stable identity — no new "households" table.
-- What's missing is history: `organization_members` holds exactly one
-- current row per (organization, character), so it can't represent someone
-- living there, moving out, and moving back in later as two separate,
-- dated stays. And a household's location today is a single freeform
-- `metadata.residence_name` string with no record of where it used to be.
--
-- These two tables are deliberately "one row per period" (a start, an
-- optional end, a reason for each) rather than a point-in-time event ledger
-- like character_relationship_history — household residency/location changes
-- are rare, deliberate, user-asserted facts, not high-churn AI-inferred ones,
-- so the heavier append-only+authority+corrections-chain machinery that
-- table uses would be over-engineering here. See householdWriteService.ts.

CREATE TABLE public.household_stays (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    character_id uuid REFERENCES public.characters(id) ON DELETE CASCADE,
    character_name text NOT NULL,

    joined_at timestamptz NOT NULL DEFAULT now(),
    -- NULL = this stay is still ongoing (the person currently lives there).
    left_at timestamptz,

    join_reason text,
    leave_reason text,

    -- Where this stay was recorded from, for provenance (e.g. 'chat',
    -- 'household_ui', 'household_edit_ui').
    source text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX household_stays_org_idx
  ON public.household_stays (organization_id, joined_at DESC);

CREATE INDEX household_stays_character_idx
  ON public.household_stays (character_id);

CREATE INDEX household_stays_user_idx
  ON public.household_stays (user_id);

-- At most one OPEN (left_at IS NULL) stay per character per household —
-- prevents accidentally recording two concurrent "currently living there"
-- stays for the same person at the same place.
CREATE UNIQUE INDEX household_stays_one_open_per_character_uidx
  ON public.household_stays (organization_id, character_id)
  WHERE left_at IS NULL AND character_id IS NOT NULL;

ALTER TABLE public.household_stays ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_stays_user_isolation
  ON public.household_stays
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE public.household_stays IS
  'One row per continuous stay of a character at a household (organizations row). left_at NULL means the stay is ongoing. See householdWriteService.ts.';


CREATE TABLE public.household_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    location_name text NOT NULL,

    moved_in_at timestamptz NOT NULL DEFAULT now(),
    -- NULL = this is the household's current location.
    moved_out_at timestamptz,

    reason text,
    source text,

    created_at timestamptz DEFAULT now()
);

CREATE INDEX household_locations_org_idx
  ON public.household_locations (organization_id, moved_in_at DESC);

CREATE INDEX household_locations_user_idx
  ON public.household_locations (user_id);

-- At most one current (moved_out_at IS NULL) location per household — a
-- household is only in one place at a time.
CREATE UNIQUE INDEX household_locations_one_current_uidx
  ON public.household_locations (organization_id)
  WHERE moved_out_at IS NULL;

ALTER TABLE public.household_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY household_locations_user_isolation
  ON public.household_locations
  FOR ALL
  USING (user_id = auth.uid());

COMMENT ON TABLE public.household_locations IS
  'One row per period a household (organizations row) was at a given location. moved_out_at NULL means it is the current location. See householdWriteService.ts.';
