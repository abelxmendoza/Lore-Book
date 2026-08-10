-- Allow care_team / support_network group types (social-worker support networks, etc.)

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE NOTICE 'organizations_care_team_types: organizations missing; skip';
    RETURN;
  END IF;

  ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_type_check
      CHECK (type IN (
        'friend_group','band','sports_team','company','club','nonprofit',
        'family','household','martial_arts','scene','crew','collective',
        'community','institution','public_entity','brand','vendor',
        'team','project','event_group','affiliation','care_team','support_network','other'
      ));
END $$;
