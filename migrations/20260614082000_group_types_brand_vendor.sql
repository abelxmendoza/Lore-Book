-- Extend canonical group_type enum with brand, vendor, and community (used in app code).

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_group_type_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_group_type_check
    CHECK (group_type IN (
      'friend_group','band','sports_team','company','club','nonprofit',
      'family','martial_arts','scene','crew','collective','community',
      'institution','public_entity','brand','vendor','other'
    ));

ALTER TABLE group_candidates DROP CONSTRAINT IF EXISTS group_candidates_group_type_check;
ALTER TABLE group_candidates
  ADD CONSTRAINT group_candidates_group_type_check
    CHECK (suggested_group_type IN (
      'friend_group','band','sports_team','company','club','nonprofit',
      'family','martial_arts','scene','crew','collective','community',
      'institution','public_entity','brand','vendor','other'
    ));
