-- Create chapters table
CREATE TABLE IF NOT EXISTS public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  description text,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add chapter relationship to journal entries
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id);
