-- =====================================================
-- WORKOUT TRACKING SYSTEM
-- Purpose: Track workouts, biometrics, and gym social interactions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workout Events Table
CREATE TABLE IF NOT EXISTS public.workout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.resolved_events(id) ON DELETE CASCADE,
  
  workout_type TEXT NOT NULL CHECK (workout_type IN ('weightlifting', 'cardio', 'mixed', 'other')),
  location_id UUID REFERENCES public.locations(id),
  
  -- Stats (stored as JSONB for flexibility)
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Photos
  photo_ids UUID[] DEFAULT '{}',
  
  -- Significance
  significance_score FLOAT DEFAULT 0.5 CHECK (significance_score >= 0 AND significance_score <= 1),
  
  -- Social interactions
  social_interactions JSONB DEFAULT '[]'::jsonb,
  
  -- Skills practiced
  skills_practiced TEXT[] DEFAULT '{}',
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Biometric Measurements Table
CREATE TABLE IF NOT EXISTS public.biometric_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  measurement_date TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('smart_scale', 'manual', 'fitness_tracker', 'other')),
  
  -- Measurements
  weight FLOAT, -- in lbs or kg
  body_fat_percentage FLOAT,
  muscle_mass FLOAT,
  bmi FLOAT,
  hydration_percentage FLOAT,
  bone_mass FLOAT,
  visceral_fat FLOAT,
  metabolic_age INTEGER,
  
  -- Other metrics
  measurements JSONB DEFAULT '{}'::jsonb,
  
  source_entry_id UUID REFERENCES public.journal_entries(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for workout_events
CREATE INDEX IF NOT EXISTS workout_events_user_id_idx ON public.workout_events(user_id);
CREATE INDEX IF NOT EXISTS workout_events_event_id_idx ON public.workout_events(event_id);
CREATE INDEX IF NOT EXISTS workout_events_workout_type_idx ON public.workout_events(workout_type);
CREATE INDEX IF NOT EXISTS workout_events_significance_idx ON public.workout_events(significance_score);
CREATE INDEX IF NOT EXISTS workout_events_created_at_idx ON public.workout_events(created_at);

-- Indexes for biometric_measurements
CREATE INDEX IF NOT EXISTS biometric_measurements_user_id_idx ON public.biometric_measurements(user_id);
CREATE INDEX IF NOT EXISTS biometric_measurements_date_idx ON public.biometric_measurements(measurement_date);
CREATE INDEX IF NOT EXISTS biometric_measurements_source_idx ON public.biometric_measurements(source);
CREATE INDEX IF NOT EXISTS biometric_measurements_source_entry_idx ON public.biometric_measurements(source_entry_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workout_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for workout_events
CREATE TRIGGER workout_events_updated_at
  BEFORE UPDATE ON public.workout_events
  FOR EACH ROW
  EXECUTE FUNCTION update_workout_events_updated_at();
