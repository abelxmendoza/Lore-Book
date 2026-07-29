-- Household relation category: lets a pet<->owner link live in
-- character_relationships the same way every other relation already does,
-- so pets can be derived into a household alongside spouse/kids.
insert into public.relationship_type_ontology
  (id, category, role, display_name, inverse_role, hierarchy, generation_delta, aliases)
values
  ('household:pet', 'household', 'pet', 'Pet', 'owner', 'lateral', 0, array['dog','cat','pet']),
  ('household:owner', 'household', 'owner', 'Owner', 'pet', 'lateral', 0, array[]::text[])
on conflict (id) do nothing;
