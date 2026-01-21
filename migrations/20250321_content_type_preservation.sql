-- Content Type and Original Language Preservation
-- Adds support for testimonies, advice, messages to readers, and other special content types
-- that require original language preservation

-- Add content_type field to journal_entries
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'standard' 
  CHECK (content_type IN (
    'standard',
    'testimony',
    'advice',
    'message_to_reader',
    'dedication',
    'acknowledgment',
    'preface',
    'epilogue',
    'manifesto',
    'vow',
    'promise',
    'declaration'
  ));

-- Add original_content field to preserve exact wording
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS original_content TEXT;

-- Add flag to prevent AI rewriting/summarization
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS preserve_original_language BOOLEAN DEFAULT FALSE;

-- Create index for filtering by content type
CREATE INDEX IF NOT EXISTS idx_journal_entries_content_type 
  ON public.journal_entries(user_id, content_type) 
  WHERE content_type != 'standard';

-- Create index for finding preserved content
CREATE INDEX IF NOT EXISTS idx_journal_entries_preserve_original 
  ON public.journal_entries(user_id, preserve_original_language) 
  WHERE preserve_original_language = true;

-- Add comments for documentation
COMMENT ON COLUMN public.journal_entries.content_type IS 'Type of content: standard, testimony, advice, message_to_reader, dedication, etc. Special types preserve original language.';
COMMENT ON COLUMN public.journal_entries.original_content IS 'Exact original text for content types that require preservation. Used when content may be processed but original must be retained.';
COMMENT ON COLUMN public.journal_entries.preserve_original_language IS 'Flag indicating this entry should preserve original wording - no AI summarization or rewriting allowed.';

-- Update existing entries: if original_content is NULL, set it to content
UPDATE public.journal_entries
SET original_content = content
WHERE original_content IS NULL;
