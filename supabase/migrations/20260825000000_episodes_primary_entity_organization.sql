-- Extend episodes.primary_entity_type to allow 'organization'.
-- The original Phase 6 migration excluded organizations because episode
-- segmentation had no organization-mention tracking. Text-based attribution
-- still deliberately never treats an organization mention as canonical
-- participation (classifyOrganizationAttribution always rejects it, by
-- design — "mention is not participation"). Instead, an episode's primary
-- organization is resolved by roster overlap: when two or more of an
-- episode's real character participants are active members of the same
-- organization (organization_members), that organization is grounded
-- evidence the scene is "about" that org, without relying on the org's
-- name being mentioned in text at all.

ALTER TABLE public.episodes
  DROP CONSTRAINT episodes_primary_entity_type_check;

ALTER TABLE public.episodes
  ADD CONSTRAINT episodes_primary_entity_type_check
  CHECK (primary_entity_type IN ('character', 'location', 'organization'));
