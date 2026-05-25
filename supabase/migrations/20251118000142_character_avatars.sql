-- Add avatar_url column to characters table for DiceBear-generated avatars

ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.characters.avatar_url IS 'URL to character avatar image (DiceBear or cached Supabase storage)';
