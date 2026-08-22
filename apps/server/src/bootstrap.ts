// Load .env before Supabase URL resolution — resolveSupabaseUrlAtBoot reads process.env
// and must not run with an empty SUPABASE_URL (dotenv lives in config.ts side effects).
import './config';
import { initErrorTracking } from './lib/monitoring';
import { resolveSupabaseUrlAtBoot } from './lib/supabaseUrlResolution';

// Initialize before anything else so module-load-time failures in later
// imports (including index.ts's own route/service wiring) are still caught.
initErrorTracking();

void resolveSupabaseUrlAtBoot()
  .then(() => import('./index'))
  .catch((error) => {
    console.error('Failed to resolve Supabase URL at boot:', error);
    process.exit(1);
  });
