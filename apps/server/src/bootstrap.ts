import { resolveSupabaseUrlAtBoot } from './lib/supabaseUrlResolution';

void resolveSupabaseUrlAtBoot()
  .then(() => import('./index'))
  .catch((error) => {
    console.error('Failed to resolve Supabase URL at boot:', error);
    process.exit(1);
  });
