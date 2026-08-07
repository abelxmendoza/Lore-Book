-- Relationship scope classifications for grouping and enrichment metadata.

INSERT INTO public.classifications (user_id, root_type, label, status, confidence, created_by, metadata)
SELECT NULL, 'CONCEPT', r.label, 'active', 0.9, 'system', r.metadata::jsonb
FROM (VALUES
  ('family', '{"axis":"relationship_scope","scope":"FAMILY"}'),
  ('romantic', '{"axis":"relationship_scope","scope":"ROMANTIC"}'),
  ('professional', '{"axis":"relationship_scope","scope":"PROFESSIONAL"}'),
  ('social', '{"axis":"relationship_scope","scope":"SOCIAL"}'),
  ('adversarial', '{"axis":"relationship_scope","scope":"ADVERSARIAL"}'),
  ('circumstantial', '{"axis":"relationship_scope","scope":"CIRCUMSTANTIAL"}')
) AS r(label, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM public.classifications c
  WHERE c.user_id IS NULL AND c.root_type = 'CONCEPT' AND c.metadata->>'axis' = 'relationship_scope' AND lower(c.label) = r.label
);
