-- Extend canonical group_type enum with brand, vendor, and community (used in app code).

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_group_type_check;
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_group_type_check
        CHECK (group_type IN (
          'friend_group','band','sports_team','company','club','nonprofit',
          'family','martial_arts','scene','crew','collective','community',
          'institution','public_entity','brand','vendor','other'
        ));
  ELSE
    RAISE NOTICE 'group_types_brand_vendor: organizations missing; skip';
  END IF;

  IF to_regclass('public.group_candidates') IS NOT NULL THEN
    ALTER TABLE public.group_candidates DROP CONSTRAINT IF EXISTS group_candidates_group_type_check;
    ALTER TABLE public.group_candidates
      ADD CONSTRAINT group_candidates_group_type_check
        CHECK (suggested_group_type IN (
          'friend_group','band','sports_team','company','club','nonprofit',
          'family','martial_arts','scene','crew','collective','community',
          'institution','public_entity','brand','vendor','other'
        ));
  ELSE
    RAISE NOTICE 'group_types_brand_vendor: group_candidates missing; skip';
  END IF;
END $$;
