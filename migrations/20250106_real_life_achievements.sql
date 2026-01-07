-- Real Life Achievements Support
-- Adds fields for real-life achievements with auto-rarity calculation

-- Add real-life achievement fields to achievements table
ALTER TABLE public.achievements 
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('app_usage', 'real_life')) DEFAULT 'app_usage',
  ADD COLUMN IF NOT EXISTS achievement_date TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS life_category TEXT CHECK (life_category IN (
    'career', 'education', 'health', 'relationships', 'creative', 
    'financial', 'personal_growth', 'travel', 'hobby', 'other'
  )) NULL,
  ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS significance_score NUMERIC(3,2) CHECK (significance_score BETWEEN 0 AND 1) NULL,
  ADD COLUMN IF NOT EXISTS impact_description TEXT NULL;

-- Indexes for category filtering
CREATE INDEX IF NOT EXISTS achievements_category_idx ON public.achievements(user_id, category);
CREATE INDEX IF NOT EXISTS achievements_life_category_idx ON public.achievements(user_id, life_category) WHERE category = 'real_life';
CREATE INDEX IF NOT EXISTS achievements_verified_idx ON public.achievements(user_id, verified) WHERE category = 'real_life' AND verified = TRUE;

-- Comments
COMMENT ON COLUMN public.achievements.category IS 'Category: app_usage (gamification) or real_life (actual accomplishments)';
COMMENT ON COLUMN public.achievements.achievement_date IS 'When the achievement actually happened in real life (for real_life category)';
COMMENT ON COLUMN public.achievements.life_category IS 'Life category for real-life achievements (career, health, etc.)';
COMMENT ON COLUMN public.achievements.evidence IS 'Evidence supporting the achievement (quotes, linked memories, etc.)';
COMMENT ON COLUMN public.achievements.verified IS 'Whether the achievement has been verified';
COMMENT ON COLUMN public.achievements.significance_score IS 'User-provided significance score (0.0 - 1.0)';
COMMENT ON COLUMN public.achievements.impact_description IS 'Description of the impact this achievement had on life';

