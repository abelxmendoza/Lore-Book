-- Align legacy organizations.type CHECK with group_type vocabulary.
-- Normalization writes group_type + ontology columns; type must accept the same values.

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE NOTICE 'organizations_type_check: organizations missing; skip';
    RETURN;
  END IF;

  ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_type_check
      CHECK (type IN (
        'friend_group','band','sports_team','company','club','nonprofit',
        'family','household','martial_arts','scene','crew','collective',
        'community','institution','public_entity','brand','vendor',
        'team','project','event_group','affiliation','other'
      ));
END $$;
