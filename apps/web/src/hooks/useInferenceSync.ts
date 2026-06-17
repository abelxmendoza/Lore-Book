import { useEffect } from 'react';
import { inferenceApi } from '../api/inference';
import { apiCache } from '../lib/cache';
import { useAuth } from '../lib/supabase';
import { useShouldUseMockData } from './useShouldUseMockData';
import { selfCharacterApi } from '../api/selfCharacter';

const SESSION_KEY = 'lk:inference-sync-v1';

/**
 * Runs orchestrated lore inference once per browser session after auth.
 * T2 on first-ever sync (no prior T2), T1 on return visits.
 */
export function useInferenceSync(): void {
  const { user } = useAuth();
  const isMock = useShouldUseMockData();

  useEffect(() => {
    if (!user?.id || isMock) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, 'true');

    let cancelled = false;

    (async () => {
      try {
        await selfCharacterApi.repairIdentity().catch(() => {});
        await selfCharacterApi.ensureSelf().catch(() => {});

        const status = await inferenceApi.status().catch(() => null);
        const needsT2 = !status?.state?.last_t2_run_at;
        const report = await inferenceApi.sync({ tier: needsT2 ? 't2' : 't1' });
        if (cancelled) return;

        apiCache.deletePattern(/\/api\/(characters|locations|organizations|knowledge|family)/);
        window.dispatchEvent(
          new CustomEvent('lk:inference-complete', { detail: report.report })
        );
      } catch {
        /* non-blocking */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isMock]);
}

/** Reload lore books when inference completes (any tab). */
export function useOnInferenceComplete(handler: () => void): void {
  useEffect(() => {
    const onComplete = () => handler();
    window.addEventListener('lk:inference-complete', onComplete);
    return () => window.removeEventListener('lk:inference-complete', onComplete);
  }, [handler]);
}
