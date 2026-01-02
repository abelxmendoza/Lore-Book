-- Quick script to check if extensions are enabled
-- Run this in Supabase SQL Editor first

SELECT 
  extname as extension_name,
  extversion as version
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgvector', 'pg_trgm', 'vector')
ORDER BY extname;

-- If pgvector is not listed, you need to enable it in Supabase Dashboard
-- Dashboard > Database > Extensions > Enable "vector"

