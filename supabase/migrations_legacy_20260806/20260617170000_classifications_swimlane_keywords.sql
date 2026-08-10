-- Enrich swimlane classifications with keyword patterns for rule-based lane detection.

UPDATE public.classifications
SET metadata = metadata || jsonb_build_object('keywords', '["robot","robotics","ai","machine learning","automation","sensor","actuator","arduino","raspberry pi","ros","ros2"]'::jsonb, 'isDefault', false)
WHERE user_id IS NULL AND root_type = 'CONCEPT' AND label = 'robotics';

UPDATE public.classifications
SET metadata = metadata || jsonb_build_object('keywords', '["mma","fighting","martial arts","training","gym","sparring","fight","jiu jitsu","boxing","wrestling","muay thai","bjj"]'::jsonb)
WHERE user_id IS NULL AND root_type = 'CONCEPT' AND label = 'mma';

UPDATE public.classifications
SET metadata = metadata || jsonb_build_object('keywords', '["work","meeting","project","deadline","office","colleague","boss","client","presentation","onboarding","interview"]'::jsonb)
WHERE user_id IS NULL AND root_type = 'CONCEPT' AND label = 'work';

UPDATE public.classifications
SET metadata = metadata || jsonb_build_object('keywords', '["art","creative","design","music","writing","drawing","painting","photography","film","band","show","concert"]'::jsonb)
WHERE user_id IS NULL AND root_type = 'CONCEPT' AND label = 'creative';

UPDATE public.classifications
SET metadata = metadata || jsonb_build_object('keywords', '[]'::jsonb, 'isDefault', true)
WHERE user_id IS NULL AND root_type = 'CONCEPT' AND label = 'life';

-- Seed supplemental venue/group labels referenced by entityClassifier
INSERT INTO public.classifications (user_id, root_type, label, status, confidence, created_by, metadata)
SELECT NULL, 'LOCATION', v.label, 'active', 0.9, 'system', v.metadata::jsonb
FROM (VALUES
  ('neon lounge', '{"category":"VENUE","subcategory":"NIGHTCLUB"}'),
  ('blue room', '{"category":"VENUE","subcategory":"MUSIC_VENUE"}')
) AS v(label, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM public.classifications c
  WHERE c.user_id IS NULL AND c.root_type = 'LOCATION' AND lower(c.label) = v.label
);

INSERT INTO public.classifications (user_id, root_type, label, status, confidence, created_by, metadata)
SELECT NULL, 'GROUP', g.label, 'active', 0.88, 'system', g.metadata::jsonb
FROM (VALUES
  ('prayers', '{"category":"MUSIC_GROUP","subcategory":"BAND"}'),
  ('ex lover', '{"category":"MUSIC_GROUP","subcategory":"BAND"}')
) AS g(label, metadata)
WHERE NOT EXISTS (
  SELECT 1 FROM public.classifications c
  WHERE c.user_id IS NULL AND c.root_type = 'GROUP' AND lower(c.label) = g.label
);
