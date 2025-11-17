-- Seed comprehensive dummy data for development
-- This creates a rich dataset for the dev-user-id
-- Note: This uses 'dev-user-id' as text (not UUID) to match the dev auth middleware

-- Insert Chapters
INSERT INTO public.chapters (id, user_id, title, start_date, end_date, description, summary) VALUES
('ch1-dev-user-id', 'dev-user-id', 'The Awakening: Discovering Purpose', '2023-01-01 00:00:00+00', '2024-05-30 23:59:59+00', 
 'A period of self-discovery, learning what truly matters, and finding my path forward. This was when I first started documenting my journey seriously.',
 'A transformative period where I discovered my true passions and began building the foundation for my future.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chapters (id, user_id, title, start_date, end_date, description, summary) VALUES
('ch2-dev-user-id', 'dev-user-id', 'Building Foundations: Growth & Learning', '2024-06-01 00:00:00+00', '2024-11-30 23:59:59+00',
 'Focusing on building skills, deepening relationships, and establishing routines that support my goals. A time of steady progress.',
 'A period of consistent growth, learning new skills, and strengthening relationships with key people in my life.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chapters (id, user_id, title, start_date, end_date, description, summary) VALUES
('ch3-dev-user-id', 'dev-user-id', 'Current Chapter: Living Intentionally', '2024-12-01 00:00:00+00', NULL,
 'The ongoing journey of living with intention, pursuing meaningful goals, and building a life aligned with my values.',
 'The current phase of my life, focused on intentional living and pursuing goals that matter.')
ON CONFLICT (id) DO NOTHING;

-- Insert Characters
INSERT INTO public.characters (id, user_id, name, alias, pronouns, archetype, role, summary, tags, metadata) VALUES
('char1-dev-user-id', 'dev-user-id', 'Sarah Chen', ARRAY['Sarah', 'Sara'], 'she/her', 'ally', 'Best Friend',
 'My closest friend and confidante. We met in college and have been inseparable ever since. Sarah is incredibly supportive, honest, and always knows how to make me laugh.',
 ARRAY['friendship', 'support', 'honesty', 'loyalty'],
 '{"relationship_type": "friend", "closeness_score": 95, "first_met": "2018-09-15", "social_media": {"email": "sarah.chen@example.com"}}'::jsonb),
('char2-dev-user-id', 'dev-user-id', 'Marcus Johnson', ARRAY['Marcus', 'Marc'], 'he/him', 'mentor', 'Mentor & Coach',
 'A wise mentor who has guided me through many career and life decisions. Marcus has decades of experience and always provides thoughtful, nuanced advice.',
 ARRAY['mentorship', 'wisdom', 'career', 'guidance'],
 '{"relationship_type": "coach", "closeness_score": 85, "first_met": "2020-03-10"}'::jsonb),
('char3-dev-user-id', 'dev-user-id', 'Alex Rivera', ARRAY['Alex', 'A.R.'], 'they/them', 'collaborator', 'Creative Collaborator',
 'A talented creative collaborator I''ve worked with on several projects. Alex brings fresh perspectives and we complement each other''s skills well.',
 ARRAY['collaboration', 'creativity', 'professional', 'innovation'],
 '{"relationship_type": "professional", "closeness_score": 75, "first_met": "2021-07-20"}'::jsonb),
('char4-dev-user-id', 'dev-user-id', 'Jordan Kim', ARRAY['Jordan', 'J'], 'they/them', 'family', 'Sibling',
 'My sibling and one of the most important people in my life. We''ve grown closer over the years and now have deep, meaningful conversations about life, dreams, and everything in between.',
 ARRAY['family', 'sibling', 'support', 'connection'],
 '{"relationship_type": "family", "closeness_score": 90, "first_met": "1995-06-15"}'::jsonb),
('char5-dev-user-id', 'dev-user-id', 'Dr. Maya Patel', ARRAY['Maya', 'Dr. Patel'], 'she/her', 'mentor', 'Life Coach',
 'A life coach who has helped me navigate personal challenges and develop better self-awareness. Her coaching style is gentle but direct, and she has a gift for asking the right questions.',
 ARRAY['coaching', 'growth', 'self-awareness', 'wellness'],
 '{"relationship_type": "coach", "closeness_score": 80, "first_met": "2022-01-15"}'::jsonb),
('char6-dev-user-id', 'dev-user-id', 'The Coffee Shop', ARRAY['Coffee Shop', 'The Shop'], 'it/its', 'place', 'Workspace',
 'My favorite place to work and think. The atmosphere is perfect for creativity - not too quiet, not too loud. I''ve written some of my best work here and had many meaningful conversations.',
 ARRAY['workspace', 'creativity', 'routine', 'comfort'],
 '{"relationship_type": "place", "visit_frequency": "weekly"}'::jsonb),
('char7-dev-user-id', 'dev-user-id', 'Central Park', ARRAY['The Park'], 'it/its', 'place', 'Reflection Space',
 'A peaceful place for walks and reflection. I come here when I need to clear my mind, process thoughts, or simply enjoy nature. It''s become a sanctuary for me.',
 ARRAY['nature', 'peace', 'reflection', 'walking'],
 '{"relationship_type": "place", "visit_frequency": "bi-weekly"}'::jsonb),
('char8-dev-user-id', 'dev-user-id', 'Emma Thompson', ARRAY['Emma'], 'she/her', 'ally', 'Friend',
 'A friend from my writing group. We share a passion for storytelling and often exchange feedback on each other''s work. Her perspective is always valuable.',
 ARRAY['friendship', 'writing', 'creativity', 'community'],
 '{"relationship_type": "friend", "closeness_score": 70, "first_met": "2021-11-05"}'::jsonb),
('char9-dev-user-id', 'dev-user-id', 'River Brooks', ARRAY['River'], 'they/them', 'ally', 'Friend',
 'A friend I met through a mutual interest in mindfulness and meditation. River has introduced me to many practices that have enriched my life.',
 ARRAY['friendship', 'mindfulness', 'wellness', 'spirituality'],
 '{"relationship_type": "friend", "closeness_score": 65, "first_met": "2022-04-12"}'::jsonb),
('char10-dev-user-id', 'dev-user-id', 'The Library', ARRAY['Library', 'Main Library'], 'it/its', 'place', 'Learning Space',
 'A quiet space for deep work and research. I come here when I need to focus intensely or explore new topics. The atmosphere of learning is inspiring.',
 ARRAY['workspace', 'learning', 'focus', 'research'],
 '{"relationship_type": "place", "visit_frequency": "monthly"}'::jsonb)
ON CONFLICT (user_id, name) DO NOTHING;

-- Insert Character Relationships
INSERT INTO public.character_relationships (user_id, source_character_id, target_character_id, relationship_type, closeness_score, summary) VALUES
('dev-user-id', 'char1-dev-user-id', 'char4-dev-user-id', 'friend_of_family', 8, 'Sarah and Jordan get along well and often hang out together.')
ON CONFLICT (user_id, source_character_id, target_character_id, relationship_type) DO NOTHING;

INSERT INTO public.character_relationships (user_id, source_character_id, target_character_id, relationship_type, closeness_score, summary) VALUES
('dev-user-id', 'char1-dev-user-id', 'char3-dev-user-id', 'mutual_friend', 7, 'Both Sarah and Alex are part of my creative circle.')
ON CONFLICT (user_id, source_character_id, target_character_id, relationship_type) DO NOTHING;

INSERT INTO public.character_relationships (user_id, source_character_id, target_character_id, relationship_type, closeness_score, summary) VALUES
('dev-user-id', 'char2-dev-user-id', 'char5-dev-user-id', 'professional_connection', 6, 'Marcus and Maya both provide guidance in different areas of my life.')
ON CONFLICT (user_id, source_character_id, target_character_id, relationship_type) DO NOTHING;

-- Insert Journal Entries
INSERT INTO public.journal_entries (id, user_id, date, content, tags, chapter_id, mood, summary, source) VALUES
(gen_random_uuid(), 'dev-user-id', '2024-11-16 10:00:00+00', 
 'Just had an amazing conversation with Sarah about our future plans. We discussed starting a creative project together - a podcast about personal growth and storytelling. The energy was incredible, and this feels like the beginning of something special. We''re both excited to dive in.',
 ARRAY['friendship', 'creativity', 'collaboration', 'excitement', 'project'], 'ch3-dev-user-id', 'excited', 'Planning a creative podcast project with Sarah', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-15 14:30:00+00',
 'Finished reading ''The Creative Process'' by Marcus''s recommendation. The book challenged everything I thought I knew about creativity. Key insight: creativity isn''t about waiting for inspiration, it''s about showing up consistently and doing the work. This resonates deeply with my own experience.',
 ARRAY['reading', 'creativity', 'learning', 'insight', 'books'], 'ch3-dev-user-id', 'thoughtful', 'Finished reading about creativity and process', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-14 16:00:00+00',
 'Spent the afternoon at The Coffee Shop working on my novel. Wrote 2,000 words - a personal best! The environment there really helps me focus. Met Alex there and we discussed our respective projects. Their enthusiasm is contagious.',
 ARRAY['writing', 'creativity', 'achievement', 'focus', 'novel'], 'ch3-dev-user-id', 'accomplished', 'Productive writing session at the coffee shop', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-13 11:00:00+00',
 'Had a coaching session with Maya today. We talked about setting boundaries and saying no without guilt. This has been a challenge for me, but I''m making progress. Her gentle but direct approach really helps me see things clearly.',
 ARRAY['coaching', 'growth', 'boundaries', 'self-care'], 'ch3-dev-user-id', 'reflective', 'Coaching session about boundaries', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-12 09:00:00+00',
 'Went for a long walk in Central Park today. The weather was perfect - crisp autumn air, golden leaves everywhere. I felt a sense of peace I haven''t felt in a while. Sometimes the simplest moments are the most meaningful. Processed a lot of thoughts during that walk.',
 ARRAY['nature', 'peace', 'reflection', 'walking', 'autumn'], 'ch3-dev-user-id', 'peaceful', 'Peaceful walk in Central Park', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-11 15:00:00+00',
 'Attended a workshop on mindfulness and meditation today. Learned new techniques for staying present and managing stress. The instructor was fantastic, and I''m excited to practice these methods daily. River recommended this workshop - so glad I went!',
 ARRAY['mindfulness', 'workshop', 'growth', 'wellness'], 'ch3-dev-user-id', 'calm', 'Attended mindfulness workshop', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-10 19:00:00+00',
 'Celebrated Jordan''s birthday today. We had a great time together - dinner, conversation, lots of laughter. I''m grateful for our relationship and how it''s deepened over the years. These moments remind me what''s truly important in life.',
 ARRAY['family', 'celebration', 'gratitude', 'connection'], 'ch3-dev-user-id', 'joyful', 'Celebrated Jordan''s birthday', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-09 13:00:00+00',
 'Met with my writing group today. Emma shared a beautiful piece she''s been working on, and we all provided feedback. The community of writers I''ve found is so supportive and inspiring. I''m grateful to be part of it.',
 ARRAY['writing', 'community', 'friendship', 'creativity'], 'ch3-dev-user-id', 'inspired', 'Writing group meeting', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-08 10:00:00+00',
 'Spent the day at The Library researching for my novel. Found some fascinating historical details that will add depth to the story. The quiet atmosphere there is perfect for deep work. Lost track of time completely.',
 ARRAY['research', 'writing', 'learning', 'focus'], 'ch3-dev-user-id', 'curious', 'Research session at the library', 'manual'),
(gen_random_uuid(), 'dev-user-id', '2024-11-07 16:00:00+00',
 'Had a video call with Marcus today. We discussed my career trajectory and potential opportunities. His perspective is always valuable, and I appreciate how he helps me think through decisions without pushing me in any direction.',
 ARRAY['mentorship', 'career', 'guidance', 'planning'], 'ch3-dev-user-id', 'thoughtful', 'Career discussion with Marcus', 'manual')
ON CONFLICT DO NOTHING;

-- Insert Tasks
INSERT INTO public.tasks (id, user_id, title, description, category, status, priority, due_date, source) VALUES
(gen_random_uuid(), 'dev-user-id', 'Finish novel first draft', 'Complete the remaining chapters and do initial review', 'creative', 'in_progress', 5, '2024-12-31 23:59:59+00', 'manual'),
(gen_random_uuid(), 'dev-user-id', 'Plan podcast launch', 'Research equipment, outline first episodes, set up hosting', 'project', 'incomplete', 4, '2025-01-15 23:59:59+00', 'manual'),
(gen_random_uuid(), 'dev-user-id', 'Schedule coffee with Sarah', 'Catch up and discuss podcast ideas', 'social', 'incomplete', 3, '2024-11-25 18:00:00+00', 'manual'),
(gen_random_uuid(), 'dev-user-id', 'Read next book recommendation', 'Marcus suggested ''The Art of Focus''', 'learning', 'incomplete', 2, NULL, 'manual'),
(gen_random_uuid(), 'dev-user-id', 'Update memoir outline', 'Reflect on recent entries and update structure', 'reflection', 'incomplete', 3, NULL, 'manual')
ON CONFLICT DO NOTHING;

-- Insert Character Memories (linking characters to entries)
-- Note: This creates relationships based on character names appearing in entry content
INSERT INTO public.character_memories (user_id, character_id, journal_entry_id, role, emotion, summary)
SELECT 
  'dev-user-id',
  c.id,
  e.id,
  CASE 
    WHEN c.name = 'Sarah Chen' THEN 'friend'
    WHEN c.name = 'Marcus Johnson' THEN 'mentor'
    WHEN c.name = 'Alex Rivera' THEN 'collaborator'
    WHEN c.name = 'Jordan Kim' THEN 'family'
    WHEN c.name = 'Dr. Maya Patel' THEN 'coach'
    WHEN c.name = 'Emma Thompson' THEN 'friend'
    WHEN c.name = 'River Brooks' THEN 'friend'
    ELSE 'other'
  END,
  e.mood,
  e.summary
FROM public.characters c
CROSS JOIN public.journal_entries e
WHERE c.user_id = 'dev-user-id' 
  AND e.user_id = 'dev-user-id'
  AND (
    (c.name = 'Sarah Chen' AND e.content LIKE '%Sarah%')
    OR (c.name = 'Marcus Johnson' AND e.content LIKE '%Marcus%')
    OR (c.name = 'Alex Rivera' AND e.content LIKE '%Alex%')
    OR (c.name = 'Jordan Kim' AND e.content LIKE '%Jordan%')
    OR (c.name = 'Dr. Maya Patel' AND e.content LIKE '%Maya%')
    OR (c.name = 'Emma Thompson' AND e.content LIKE '%Emma%')
    OR (c.name = 'River Brooks' AND e.content LIKE '%River%')
  )
ON CONFLICT (user_id, character_id, journal_entry_id) DO NOTHING;

-- Insert Daily Summary
INSERT INTO public.daily_summaries (user_id, date, summary, tags) VALUES
('dev-user-id', '2024-11-16', 'Productive day focused on creative projects and meaningful conversations. Feeling energized about upcoming podcast collaboration.', ARRAY['creativity', 'collaboration', 'productivity'])
ON CONFLICT (user_id, date) DO UPDATE SET summary = EXCLUDED.summary, tags = EXCLUDED.tags;

-- Insert Memoir Outline
INSERT INTO public.memoir_outlines (user_id, title, structure, language_style) VALUES
('dev-user-id', 'My Life Story', 
 '{"chapters": ["The Awakening", "Building Foundations", "Current Chapter"], "themes": ["growth", "relationships", "creativity"]}'::jsonb,
 '{"tone": "reflective", "voice": "first-person", "style": "narrative"}'::jsonb)
ON CONFLICT (user_id) DO UPDATE SET structure = EXCLUDED.structure, language_style = EXCLUDED.language_style;
